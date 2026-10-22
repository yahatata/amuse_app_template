/**
 * 定期開催トーナメント自動生成のコアロジック
 *
 * Callable（generateRecurringTournaments）および
 * Scheduler（generateRecurringTournamentsByScheduler）から共用される。
 *
 * 処理内容:
 * - 有効な tournamentRecurrences を取得
 * - 各 recurrence について、最後に生成されたトーナメント以降〜3ヶ月先までを生成
 * - scheduledTournaments を作成（Cloud Tasks 投入は enqueue 専用 function に委譲）
 */

import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError } from "../../../shared/logging/functionCustomError";
import {
  isProductionRuntime,
  isSingleStorePerProjectMode,
  validateStoreTenantForProduction,
} from "../../../shared/runtime";
import {
  LEGACY_DEFAULT_STORE_ID,
  LEGACY_DEFAULT_TENANT_ID,
  resolveStoreTenantForWrite,
} from "../../../shared/runtime/storeTenantIdentity";
import { calcBusinessDate } from "../../bills/repos/calcBusinessDate";
import { runEnqueueTournamentTasks } from "./enqueueTournamentTasksCore";
import { resolveAddonLimitPerPlayer } from "../../../shared/tournament/resolveAddonLimitPerPlayer";
import { buildRuntimeStagesFromBlindLevels } from "../../../shared/tournament/buildRuntimeStagesFromBlindLevels";

const ENQUEUE_AFTER_GENERATE_THRESHOLD = 50;

export interface GenerateRecurringTournamentsResult {
  success: boolean;
  generatedCount: number;
  message: string;
  error?: string;
}

export interface RunGenerateRecurringTournamentsOptions {
  evaluationDate?: string;
  windowEndDate?: string;
  now?: Date;
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseJstDateKeyStart(dateKey: string, fieldName: string): Date {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    throw new FunctionCustomError({
      errorKey: 'TOURNAMENT_INVALID_STATE',
      message: `Invalid ${fieldName}: ${dateKey}`,
      context: { fieldName, dateKey, phase: 'recurring_generate', reason: 'invalid_date_key' },
    });
  }
  return new Date(`${dateKey}T00:00:00+09:00`);
}

function parseJstDateKeyEnd(dateKey: string, fieldName: string): Date {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    throw new FunctionCustomError({
      errorKey: 'TOURNAMENT_INVALID_STATE',
      message: `Invalid ${fieldName}: ${dateKey}`,
      context: { fieldName, dateKey, phase: 'recurring_generate', reason: 'invalid_date_key' },
    });
  }
  return new Date(`${dateKey}T23:59:59.999+09:00`);
}

/**
 * 定期開催トーナメントを自動生成する
 * @returns 生成結果
 */
export async function runGenerateRecurringTournaments(
  options: RunGenerateRecurringTournamentsOptions = {}
): Promise<GenerateRecurringTournamentsResult> {
  try {
    console.log("=== 定期開催トーナメント自動生成開始 ===");

    const db = getFirestore();
    const now = options.now ??
      (options.evaluationDate ?
        parseJstDateKeyStart(options.evaluationDate, "evaluationDate") :
        new Date());
    const planningWindowEndDate = options.windowEndDate ?
      parseJstDateKeyEnd(options.windowEndDate, "windowEndDate") :
      new Date(now.getTime() + 3 * 30 * 24 * 60 * 60 * 1000);

    // 有効な定期開催を取得
    const recurrencesSnapshot = await db
      .collection("tournamentRecurrences")
      .where("isActive", "==", true)
      .get();

    console.log("有効な定期開催数:", recurrencesSnapshot.docs.length);

    let totalGenerated = 0;

    for (const recurrenceDoc of recurrencesSnapshot.docs) {
      const recurrenceData = recurrenceDoc.data();
      const recurrenceId = recurrenceDoc.id;

      // Phase0A D-13:
      // - multi-store 運用時は本番で storeId/tenantId 欠損・default を skip
      // - single-store 運用時は互換許容（後続フェーズで段階置換）
      if (isProductionRuntime()) {
        try {
          validateStoreTenantForProduction(recurrenceData.storeId, recurrenceData.tenantId);
        } catch (validationError) {
          logOpsError({
            message: "generateRecurringTournaments: skipping recurrence with missing/invalid storeId/tenantId",
            functionEntry: "runGenerateRecurringTournaments",
            operation: "validateRecurringStoreTenant",
            cause: validationError,
            errorKey: "TOURNAMENT_RECURRING_INVALID_STORE_TENANT",
            context: { recurrenceId },
          });
          continue;
        }
      }

      console.log(`処理中の定期開催: ${recurrenceId}`);

      const { storeId, tenantId } = resolveStoreTenantForWrite(
        recurrenceData.storeId,
        recurrenceData.tenantId
      );

      // テンプレート情報を取得
      const templateDoc = await db
        .collection("tournamentTemplates")
        .doc(recurrenceData.templateId)
        .get();

      if (!templateDoc.exists) {
        console.log(`テンプレートが見つかりません: ${recurrenceData.templateId}`);
        continue;
      }

      const templateData = templateDoc.data()!;

      // 間隔を週数に変換（Firestore: 数値 1〜5 または 文字列 "1week"/"2weeks" の両対応）
      let intervalWeeks: number;
      const intervalRaw = recurrenceData.interval;
      if (typeof intervalRaw === "number" && intervalRaw >= 1 && intervalRaw <= 5) {
        intervalWeeks = intervalRaw;
      } else if (typeof intervalRaw === "string") {
        const n = parseInt(intervalRaw.replace("weeks", "").replace("week", ""), 10);
        if (Number.isNaN(n)) {
          logOpsError({
            message: "generateRecurringTournaments: invalid interval on recurrence",
            functionEntry: "runGenerateRecurringTournaments",
            operation: "parseRecurrenceInterval",
            cause: new Error(`invalid interval: ${String(intervalRaw)}`),
            errorKey: "TOURNAMENT_RECURRING_INVALID_INTERVAL",
            context: {
              recurrenceId,
              intervalRaw: String(intervalRaw),
            },
          });
          continue;
        }
        intervalWeeks = n;
      } else {
        logOpsError({
          message: "generateRecurringTournaments: invalid interval type on recurrence",
          functionEntry: "runGenerateRecurringTournaments",
          operation: "parseRecurrenceIntervalWrongType",
            cause: new Error(`invalid interval type: ${typeof intervalRaw}`),
            errorKey: "TOURNAMENT_RECURRING_INVALID_INTERVAL",
          context: {
            recurrenceId,
            intervalRawType: typeof intervalRaw,
          },
        });
        continue;
      }

      // 終了日を設定（targetScope 指定があればその値、未指定時は評価日+3ヶ月）
      const endDate = new Date(planningWindowEndDate.getTime());

      // 最後に生成されたトーナメントの日付を取得
      const lastGeneratedQuery = await db
        .collection("scheduledTournaments")
        .where("recurrenceId", "==", recurrenceId)
        .orderBy("startAt", "desc")
        .limit(1)
        .get();

      let startDate = new Date(recurrenceData.startOn.toDate());

      if (!lastGeneratedQuery.empty) {
        const lastGenerated = lastGeneratedQuery.docs[0].data();
        const lastStartAt = lastGenerated.startAt.toDate();
        startDate = new Date(
          lastStartAt.getTime() +
            intervalWeeks * 7 * 24 * 60 * 60 * 1000
        );
      }

      console.log(`生成開始日: ${startDate.toISOString()}`);
      console.log(`生成終了日: ${endDate.toISOString()}`);

      // 曜日の数値マッピング
      const weekdayMap: { [key: string]: number } = {
        SU: 0,
        MO: 1,
        TU: 2,
        WE: 3,
        TH: 4,
        FR: 5,
        SA: 6,
      };

      const generatedTournaments: string[] = [];
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        // 現在の週の指定された曜日をチェック
        for (const weekday of recurrenceData.byWeekday) {
          const targetWeekday = weekdayMap[weekday];
          const dayOfWeek = currentDate.getDay();

          if (dayOfWeek === targetWeekday) {
            // 重複チェック
            // JST時刻を明示的に作成し、UTCに変換
            const [hours, minutes] = (
              recurrenceData.startTime || "19:00"
            )
              .split(":")
              .map(Number);
            const jstDate = new Date(currentDate);
            jstDate.setHours(hours, minutes, 0, 0);

            // JSTからUTCに変換（-9時間）
            const startAt = new Date(
              jstDate.getTime() - 9 * 60 * 60 * 1000
            );

            const isDuplicate = await checkDuplicateTournament(
              db,
              recurrenceData.templateId,
              startAt,
              storeId,
              tenantId
            );

            if (!isDuplicate) {
              // トーナメントを作成
              const tournamentId = await createScheduledTournamentFromRecurrence(
                db,
                recurrenceId,
                recurrenceData.templateId,
                templateData,
                startAt,
                storeId,
                tenantId
              );

              if (tournamentId) {
                generatedTournaments.push(tournamentId);
                console.log(
                  "トーナメント作成完了:",
                  tournamentId,
                  startAt.toISOString()
                );
              }
            } else {
              console.log("重複トーナメントをスキップ:", startAt.toISOString());
            }
          }
        }

        // 次の週に移動
        currentDate.setDate(currentDate.getDate() + 7 * intervalWeeks);
      }

      totalGenerated += generatedTournaments.length;
      console.log(
        `定期開催 ${recurrenceId} で ${generatedTournaments.length} 件のトーナメントを生成`
      );
    }

    console.log(`合計 ${totalGenerated} 件のトーナメントを生成しました`);

    // 閾値以下かつ Step 5 経路の場合のみ enqueue を呼び出し。閾値超えは Scheduler に任せる
    if (totalGenerated <= ENQUEUE_AFTER_GENERATE_THRESHOLD) {
      try {
        // Phase0A D-13:
        // - single-store 運用では projectId ベースに正規化
        // - multi-store 運用のみ strict に skip
        const storeIds = new Set(
          recurrencesSnapshot.docs
            .map((d) => {
              const rawStoreId = d.data().storeId;
              const rawTenantId = d.data().tenantId;
              if (isProductionRuntime() && !isSingleStorePerProjectMode()) {
                try {
                  validateStoreTenantForProduction(rawStoreId, rawTenantId);
                } catch {
                  logger.warn("generateRecurringTournaments: skipping recurrence with missing/invalid storeId", {
                    recurrenceId: d.id,
                  });
                  return null;
                }
              }
              return resolveStoreTenantForWrite(rawStoreId, rawTenantId).storeId;
            })
            .filter((s): s is string => s !== null)
        );
        const opts = storeIds.size === 1 ? { storeId: Array.from(storeIds)[0] } : {};
        await runEnqueueTournamentTasks(opts);
      } catch (enqueueError) {
        logOpsError({
          message: "enqueue 呼び出しエラー（定期生成後）",
          functionEntry: "runGenerateRecurringTournaments",
          operation: "enqueueAfterGenerate",
          cause: enqueueError,
          context: { totalGenerated },
        });
      }
    } else {
      console.log(
        `enqueue スキップ: 生成数 ${totalGenerated} が閾値 ${ENQUEUE_AFTER_GENERATE_THRESHOLD} を超えたため Scheduler に任せる`
      );
    }

    return {
      success: true,
      generatedCount: totalGenerated,
      message: `${totalGenerated}件の定期開催トーナメントを生成しました`,
    };
  } catch (error) {
    logOpsError({
      message: "定期開催トーナメント自動生成エラー:",
      functionEntry: "runGenerateRecurringTournaments",
      operation: "runGenerateRecurringTournamentsOuterCatch",
      cause: error,
      context: {
        evaluationDate: options.evaluationDate,
        windowEndDate: options.windowEndDate,
      },
    });
    return {
      success: false,
      generatedCount: 0,
      message: "定期開催トーナメントの自動生成に失敗しました",
      error: String(error),
    };
  }
}

/** 重複トーナメントをチェック */
async function checkDuplicateTournament(
  db: FirebaseFirestore.Firestore,
  templateId: string,
  startAt: Date,
  storeId: string,
  tenantId: string
): Promise<boolean> {
  const startAtTimestamp = Timestamp.fromDate(startAt);

  const findByStoreTenant = async (candidateStoreId: string, candidateTenantId: string) =>
    db
      .collection("scheduledTournaments")
      .where("templateId", "==", templateId)
      .where("startAt", "==", startAtTimestamp)
      .where("storeId", "==", candidateStoreId)
      .where("tenantId", "==", candidateTenantId)
      .where("status", "==", "scheduled")
      .limit(1)
      .get();

  const primary = await findByStoreTenant(storeId, tenantId);
  if (!primary.empty) return true;

  if (
    isSingleStorePerProjectMode() &&
    (storeId !== LEGACY_DEFAULT_STORE_ID || tenantId !== LEGACY_DEFAULT_TENANT_ID)
  ) {
    // 既存データ互換: legacy default で残っている旧データも重複判定に含める
    const legacy = await findByStoreTenant(
      LEGACY_DEFAULT_STORE_ID,
      LEGACY_DEFAULT_TENANT_ID
    );
    return !legacy.empty;
  }

  return false;
}

/** 定期開催からトーナメントを作成 */
async function createScheduledTournamentFromRecurrence(
  db: FirebaseFirestore.Firestore,
  recurrenceId: string,
  templateId: string,
  templateData: any,
  startAt: Date,
  storeId: string,
  tenantId: string
): Promise<string | null> {
  try {
    const now = new Date();
    const startAtDate = startAt;

    const tournamentRef = db.collection("scheduledTournaments").doc();

    const blindStructureId =
      templateData.blindStructure || templateData.blindStructureId;
    let stages: any[] = [];
    let lateRegUntilLev = 0;
    let breakDuration = 0;
    let plannedRegistAt: Date;

    if (blindStructureId) {
      const blindTemplateDoc = await db
        .collection("blindTemplates")
        .doc(blindStructureId)
        .get();
      if (blindTemplateDoc.exists) {
        const blindTemplateData = blindTemplateDoc.data()!;
        const levels = blindTemplateData.levels || [];
        lateRegUntilLev = blindTemplateData.lateRegUntilLev || 0;
        breakDuration = blindTemplateData.breakDuration || 0;

        stages = buildRuntimeStagesFromBlindLevels(levels, {
          lateRegUntilLev,
          breakDurationMin: breakDuration,
        });
      }
    }

    if (lateRegUntilLev > 0 && stages.length > 0) {
      let totalDurationSec = 0;
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        if (stage.type === "level" && stage.lev === lateRegUntilLev + 1) {
          break;
        }
        totalDurationSec += stage.durationSec;
      }
      plannedRegistAt = new Date(
        startAtDate.getTime() + totalDurationSec * 1000
      );
    } else {
      plannedRegistAt = startAtDate;
    }

    const plannedStartAt = Timestamp.fromDate(startAtDate);

    // startAtから営業日を計算（createScheduledTournament.tsと同様）
    const businessDateResult = await calcBusinessDate(startAtDate);
    let businessDate: string;
    if (businessDateResult.status === "NONE") {
      console.log("スキップ: 営業日に該当しない時刻のため", startAtDate.toISOString());
      return null;
    }
    if (businessDateResult.status === "AMBIGUOUS") {
      businessDate = businessDateResult.candidates[0];
      logger.warn("calcBusinessDate returned AMBIGUOUS, using first candidate", {
        candidates: businessDateResult.candidates,
        selected: businessDate,
        startAt: startAtDate.toISOString(),
      });
    } else {
      businessDate = businessDateResult.businessDateKey;
    }

    // 同一 recurrence・同一営業日の重複チェック（status=cancelled も含めて再生成を防止）
    const sameRecurrenceSameDayQuery = await db
      .collection("scheduledTournaments")
      .where("recurrenceId", "==", recurrenceId)
      .where("businessDate", "==", businessDate)
      .where("storeId", "==", storeId)
      .where("tenantId", "==", tenantId)
      .where("status", "in", ["scheduled", "running", "registered", "cancelled"])
      .limit(1)
      .get();
    if (!sameRecurrenceSameDayQuery.empty) {
      console.log("スキップ: 同一 recurrence・同一営業日のトーナメントが既に存在", {
        recurrenceId,
        businessDate,
      });
      return null;
    }

    const { getStoreConfig } = await import('../../../shared/config/configLoader');
    const storeConfig = await getStoreConfig();
    const templateBusinessDateCheck = storeConfig.features?.templateBusinessDateCheck ?? true;
    if (templateBusinessDateCheck) {
      const sameTemplateSameDayQuery = await db
        .collection("scheduledTournaments")
        .where("templateId", "==", templateId)
        .where("businessDate", "==", businessDate)
        .where("status", "==", "scheduled")
        .limit(1)
        .get();
      if (!sameTemplateSameDayQuery.empty) {
        console.log("スキップ: 同一営業日に同じテンプレートのトーナメントが既に存在", {
          templateId,
          businessDate,
        });
        return null;
      }
    }

    const scheduledTournamentData = {
      templateId,
      recurrenceId,
      storeId,
      tenantId,
      status: "scheduled",
      businessDate,
      startAt: plannedStartAt,
      regEndAt: Timestamp.fromDate(plannedRegistAt),
      isPrizeConfirmed: false,
      isArchived: false,
      regular: true,
      generateBy: recurrenceId,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),

      // Cloud Tasks enqueue バッチ用管理フィールド（spec.md 1.1）
      schedulePlanVersion: 1,
      schedulePlanUpdatedAt: Timestamp.fromDate(now),
      taskSyncNeeded: true,
      taskSyncReason: ['created'],

      snapshot: {
        name: templateData.name || "",
        entryFee: templateData.entryFee || 0,
        isReentry: templateData.isReentry || false,
        maxReentries: templateData.maxReentries || null,
        reentryFee: templateData.reentryFee || null,
        isAddon: templateData.isAddon || false,
        addonFee: templateData.addonFee || null,
        addonStack: templateData.addonStack || null,
        addonLimitPerPlayer: resolveAddonLimitPerPlayer({
          isAddon: templateData.isAddon,
          addonLimitPerPlayer: templateData.addonLimitPerPlayer,
        }),
        startStack: templateData.startStack || 0,
        blindStructure:
          templateData.blindStructure || templateData.blindStructureId || "",
        prizeRatio: templateData.prizeRatio || 0.7,
        color: templateData.color || "#2196F3",
        pointType: templateData.pointType || "pointA",
        isArchived: false,
        updatedAt: Timestamp.fromDate(now),
      },
    };

    const mainViewData = {
      entries: 0,
      reentries: 0,
      addons: 0,
      playersIn: 0,
      playersBusted: 0,
      seatedCount: 0,
      waitingCount: 0,
      currentLevel: 1,
      levelEndsAt: null,
      lastEventAt: Timestamp.fromDate(now),
    };

    const waitingListData = {
      waiting: {},
      count: 0,
      updatedAt: Timestamp.fromDate(now),
    };

    const usersListData = {
      users: {},
      updatedAt: Timestamp.fromDate(now),
    };

    const runtimeData = {
      status: "scheduled",
      startedAt: null,
      pausedAt: null,
      shiftSec: 0,
      regClosedAt: null,
      plannedStartAt: plannedStartAt,
      plannedRegistAt: Timestamp.fromDate(plannedRegistAt),
      stages: stages,
      lateRegUntilLev: lateRegUntilLev,
      breakDurationSec: breakDuration * 60,
      startRev: 1,
      registRev: 1,
      updatedAt: Timestamp.fromDate(now),
    };

    await db.runTransaction(async (transaction) => {
      transaction.set(tournamentRef, scheduledTournamentData);
      const mainViewRef = tournamentRef.collection("views").doc("main");
      transaction.set(mainViewRef, mainViewData);
      const usersListRef = tournamentRef.collection("views").doc("usersList");
      transaction.set(usersListRef, usersListData);
      const waitingRef = tournamentRef.collection("tablesSeat").doc("waiting");
      transaction.set(waitingRef, waitingListData);
      const bustedRef = tournamentRef.collection("tablesSeat").doc("busted");
      transaction.set(bustedRef, { bustedUser: {} });
      const runtimeRef = tournamentRef.collection("views").doc("runtime");
      transaction.set(runtimeRef, runtimeData);
    });
    logOpsSuccess({
      message: "createScheduledTournamentFromRecurrence 成功",
      functionEntry: "createScheduledTournamentFromRecurrence",
      context: {
        recurrenceId,
        templateId,
        storeId,
        tenantId,
        businessDate,
        scheduledTournamentId: tournamentRef.id,
        startAt: startAtDate.toISOString(),
      },
    });

    return tournamentRef.id;
  } catch (error) {
    logOpsError({
      message: "定期開催トーナメント作成エラー:",
      functionEntry: "createScheduledTournamentFromRecurrence",
      cause: error,
      context: {
        recurrenceId,
        templateId,
        storeId,
        tenantId,
        startAt: startAt.toISOString(),
      },
    });
    return null;
  }
}
