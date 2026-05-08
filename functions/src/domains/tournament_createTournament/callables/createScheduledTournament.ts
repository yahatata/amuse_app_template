import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { getCallerDeviceByUid, hasRequiredOption, isActive } from "../../../shared/devices";
import { isSingleStorePerProjectMode, validateStoreTenantForProduction } from "../../../shared/runtime";
import {
  LEGACY_DEFAULT_STORE_ID,
  LEGACY_DEFAULT_TENANT_ID,
  resolveStoreTenantForWrite,
} from "../../../shared/runtime/storeTenantIdentity";
import { calcBusinessDate } from "../../bills/repos/calcBusinessDate";
import { logger } from "firebase-functions";
import { logOpsError } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import { runEnqueueTournamentTasks } from "../services/enqueueTournamentTasksCore";

// 入力スキーマの定義
const createScheduledTournamentSchema = z.object({
  templateId: z.string().min(1, "テンプレートIDは必須です"),
  startAt: z.string().refine((val) => {
    try {
      new Date(val);
      return true;
    } catch {
      return false;
    }
  }, "開始時刻は有効な日時文字列である必要があります"),
  regEndAt: z.string().refine((val) => {
    try {
      new Date(val);
      return true;
    } catch {
      return false;
    }
  }, "レジスト終了時刻は有効な日時文字列である必要があります"),
  freeze: z.boolean().optional().default(false),
  // Phase0A D-13: default 削除。本番では default-store/default-tenant 禁止
  storeId: z.string().min(1, "店舗IDは必須です").optional(),
  tenantId: z.string().min(1, "テナントIDは必須です").optional(),
});

// type CreateScheduledTournamentInput = z.infer<typeof createScheduledTournamentSchema>;

export const createScheduledTournament = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  try {
    // デバイス権限の確認（role: admin または options.tournament: true）
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
    }

    // デバッグ: 受信データをログ出力
    console.log('受信データ:', JSON.stringify(request.data, null, 2));
    
    // 入力検証
    const validatedData = createScheduledTournamentSchema.parse(request.data);
    validateStoreTenantForProduction(validatedData.storeId, validatedData.tenantId);
    const { storeId, tenantId } = resolveStoreTenantForWrite(
      validatedData.storeId,
      validatedData.tenantId
    );
    const { templateId, startAt, regEndAt, freeze } = validatedData;
    // selectedBusinessDateKeyはスキーマに含まれていないため、request.dataから直接取得
    const selectedBusinessDateKey = (request.data as any)?.selectedBusinessDateKey as string | undefined;

    const db = getFirestore();
    const now = new Date();
    const startAtDate = new Date(startAt);
    const regEndAtDate = new Date(regEndAt);

    // startAtから営業日を計算
    const businessDateResult = await calcBusinessDate(startAtDate);
    let businessDate: string;
    
    if (businessDateResult.status === 'NONE') {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_SCHEDULE_NO_BUSINESS_DAY',
        message: `The start time ${startAt} does not belong to any business day.`,
        context: { startAt, op: 'createScheduledTournament' },
      });
    }
    
    if (businessDateResult.status === 'AMBIGUOUS') {
      // AMBIGUOUSの場合は、UIでどちらの営業日に属するデータなのかを選択させる
      // リクエストにselectedBusinessDateKeyが含まれている場合はそれを使用
      if (!selectedBusinessDateKey || !businessDateResult.candidates.includes(selectedBusinessDateKey)) {
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_SCHEDULE_AMBIGUOUS',
          message: `The start time ${startAt} is ambiguous. Please select a business date from candidates: ${businessDateResult.candidates.join(', ')}`,
          context: { candidates: businessDateResult.candidates, startAt, op: 'createScheduledTournament' },
        });
      }
      businessDate = selectedBusinessDateKey;
      logger.warn('calcBusinessDate returned AMBIGUOUS, using selected candidate', {
        candidates: businessDateResult.candidates,
        selected: selectedBusinessDateKey,
        startAt,
      });
    } else {
      // OKの場合
      businessDate = businessDateResult.businessDateKey;
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
        throw new FunctionCustomError({
          errorKey: 'TOURNAMENT_SCHEDULE_DUPLICATE_TEMPLATE_SAME_DAY',
          message: '同一営業日に同じテンプレートのトーナメントは作成できません。',
          context: { templateId, businessDate, op: 'createScheduledTournament' },
        });
      }
    }

    // 冪等制御キー（templateId + startAt）
    // const idempotentKey = `${templateId}_${startAtDate.getTime()}`;
    
    // 既存のトーナメントが存在するかチェック
    const findExistingTournament = async (
      candidateStoreId: string,
      candidateTenantId: string
    ) => db.collection('scheduledTournaments')
      .where('templateId', '==', templateId)
      .where('startAt', '==', Timestamp.fromDate(startAtDate))
      .where('storeId', '==', candidateStoreId)
      .where('tenantId', '==', candidateTenantId)
      .limit(1)
      .get();

    let existingQuery = await findExistingTournament(storeId, tenantId);
    if (
      existingQuery.empty &&
      isSingleStorePerProjectMode() &&
      (storeId !== LEGACY_DEFAULT_STORE_ID || tenantId !== LEGACY_DEFAULT_TENANT_ID)
    ) {
      // 既存データ互換: legacy default で既に作成済みのレコードを重複扱いにする
      existingQuery = await findExistingTournament(
        LEGACY_DEFAULT_STORE_ID,
        LEGACY_DEFAULT_TENANT_ID
      );
    }

    if (!existingQuery.empty) {
      const existingDoc = existingQuery.docs[0];
      return {
        success: true,
        tournamentId: existingDoc.id,
        message: '既存のトーナメントが見つかりました（冪等処理）',
        isNew: false,
      };
    }

    // 1) tournamentTemplates/{templateId} を読み取り
    const templateDoc = await db.collection('tournamentTemplates').doc(templateId).get();
    if (!templateDoc.exists) {
      throw new HttpsError('not-found', `テンプレートID "${templateId}" が見つかりません`);
    }

    const templateData = templateDoc.data()!;
    
    // テンプレートが利用可能かチェック
    if (templateData.isArchived === true) {
      throw new FunctionCustomError({
        errorKey: 'TOURNAMENT_TEMPLATE_ARCHIVED',
        message: 'アーカイブされたテンプレートは使用できません',
        context: { templateId, phase: 'create_scheduled' },
      });
    }

    // トーナメントIDを生成（一意性を保証）
    const tournamentRef = db.collection('scheduledTournaments').doc();
    const tournamentId = tournamentRef.id;



    // 2) scheduledTournaments/{tmtId} を作成
    const scheduledTournamentData = {
      templateId,
      storeId,
      tenantId,
      status: 'scheduled',
      startAt: Timestamp.fromDate(startAtDate),
      regEndAt: Timestamp.fromDate(regEndAtDate),
      businessDate, // 追加: startAtから計算した営業日
      freeze: freeze || false,
      isPrizeConfirmed: false,
      isArchived: false,
      regular: false, // 通常のトーナメント作成
      generateBy: null, // 通常作成の場合はnull
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),

      // Cloud Tasks enqueue バッチ用管理フィールド（spec.md 1.1）
      schedulePlanVersion: 1,
      schedulePlanUpdatedAt: Timestamp.fromDate(now),
      taskSyncNeeded: true,
      taskSyncReason: ['created'],

      // スナップショット（テンプレート内容の不変コピー）
      snapshot: {
        name: templateData.name || '',
        entryFee: templateData.entryFee || 0,
        isReentry: templateData.isReentry || false,
        maxReentries: templateData.maxReentries || null,
        reentryFee: templateData.reentryFee || null,
        isAddon: templateData.isAddon || false,
        addonFee: templateData.addonFee || null,
        addonStack: templateData.addonStack || null,
        startStack: templateData.startStack || 0,
        blindStructure: templateData.blindStructure || templateData.blindStructureId || '',
        prizeRatio: templateData.prizeRatio || 0.7,
        color: templateData.color || '#2196F3', // デフォルト色
        pointType: templateData.pointType || 'pointA',
        isArchived: false,
        updatedAt: Timestamp.fromDate(now),
      },
    };

    // 3) /views/main を初期化
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

    // 4) /tablesSeat/waiting を初期化
    const waitingListData = {
      waiting: {},
      count: 0,
      updatedAt: Timestamp.fromDate(now),
    };

    // 5) /views/usersList を初期化
    const usersListData = {
      users: {},
      updatedAt: Timestamp.fromDate(now),
    };

    // 6) blindTemplateからstagesを生成
    const blindStructureId = templateData.blindStructure || templateData.blindStructureId;
    let stages = [];
    let lateRegUntilLev = 0;
    let breakDuration = 0;
    
    if (blindStructureId) {
      const blindTemplateDoc = await db.collection('blindTemplates').doc(blindStructureId).get();
      if (blindTemplateDoc.exists) {
        const blindTemplateData = blindTemplateDoc.data()!;
        const levels = blindTemplateData.levels || [];
        lateRegUntilLev = blindTemplateData.lateRegUntilLev || 0;
        breakDuration = blindTemplateData.breakDuration || 0;
        
        // levelsからstagesを生成（durationは分→秒に変換）
        stages = levels.map((level: any) => {
          const stage = {
            type: 'level',
            lev: level.level, // 数値のみ
            durationSec: (level.duration || 0) * 60, // 分を秒に変換
          };
          
          // hasBreakAfterがtrueの場合、breakステージを追加
          if (level.hasBreakAfter) {
            return [stage, {
              type: 'break',
              durationSec: breakDuration * 60, // 分を秒に変換
            }];
          }
          
          return stage;
        }).flat();
        
            // lateRegUntilLev+1のレベル直前にregistステージを追加
    if (lateRegUntilLev > 0) {
      const newStages: any[] = [];
      
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        
        // lateRegUntilLev+1のレベル直前にregistを挿入
        if (stage.type === 'level' && stage.lev === lateRegUntilLev + 1) {
          newStages.push({
            type: 'regist',
            durationSec: 0,
          });
        }
        
        newStages.push(stage);
      }
      
      stages = newStages;
    }
      }
    }

    // 7) plannedStartAtとplannedRegistAtを計算
    const plannedStartAt = Timestamp.fromDate(startAtDate);
    
    // plannedRegistAtを計算（lateRegUntilLev+1のレベルが始まるタイミング）
    let plannedRegistAt: Date;
    if (lateRegUntilLev > 0 && stages.length > 0) {
      let totalDurationSec = 0;
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        // lateRegUntilLev+1のレベルが始まる直前まで（registステージの前まで）の時間を計算
        if (stage.type === 'level' && stage.lev === lateRegUntilLev + 1) {
          break; // lateRegUntilLev+1のレベルが始まる前で停止
        }
        totalDurationSec += stage.durationSec;
      }
      plannedRegistAt = new Date(startAtDate.getTime() + (totalDurationSec * 1000));
    } else {
      plannedRegistAt = startAtDate; // デフォルトは開始時刻と同じ
    }

    // 8) /views/runtime を初期化（stages情報を含む）
    const runtimeData = {
      status: 'scheduled',
      startedAt: null, // Cloud Tasksから設定される
      pausedAt: null,
      shiftSec: 0,
      regClosedAt: null, // Cloud Tasksから設定される
      plannedStartAt: plannedStartAt,
      plannedRegistAt: Timestamp.fromDate(plannedRegistAt),
      stages: stages,
      lateRegUntilLev: lateRegUntilLev,
      breakDurationSec: breakDuration * 60, // 分を秒に変換
      startRev: 1, // 初期値1
      registRev: 1, // 初期値1
      updatedAt: Timestamp.fromDate(now),
    };

    // トランザクションで一括作成
    await db.runTransaction(async (transaction) => {
      // scheduledTournaments を作成（plannedRegistAtとstartAtを更新）
      const finalScheduledTournamentData = {
        ...scheduledTournamentData,
        startAt: plannedStartAt, // runtimeのplannedStartAtと同じ値
        regEndAt: Timestamp.fromDate(plannedRegistAt), // plannedRegistAtと同じ値
      };
      transaction.set(tournamentRef, finalScheduledTournamentData);
      
      // views/main を作成
      const mainViewRef = tournamentRef.collection('views').doc('main');
      transaction.set(mainViewRef, mainViewData);
      
      // views/usersList を作成
      const usersListRef = tournamentRef.collection('views').doc('usersList');
      transaction.set(usersListRef, usersListData);
      
      // tablesSeat/waiting を作成
      const waitingRef = tournamentRef.collection('tablesSeat').doc('waiting');
      transaction.set(waitingRef, waitingListData);
      
      // tablesSeat/busted を作成（空のbustedUserマップ）
      const bustedRef = tournamentRef.collection('tablesSeat').doc('busted');
      transaction.set(bustedRef, { bustedUser: {} });
      
      // views/runtime を作成
      const runtimeRef = tournamentRef.collection('views').doc('runtime');
      transaction.set(runtimeRef, runtimeData);
    });

    // 作成完了後、enqueue を即時呼び出し（Step 5）。storeId/tenantId で対象を絞る
    try {
      await runEnqueueTournamentTasks({ storeId, tenantId });
    } catch (enqueueError) {
      logOpsError({
        message: 'enqueue 呼び出しエラー',
        failureType: 'business',
        functionEntry: 'createScheduledTournament',
        operation: 'enqueueAfterCreate',
        cause: enqueueError,
        context: { tournamentId, storeId, tenantId },
      });
    }

    return {
      success: true,
      tournamentId,
      message: 'スケジュール済みトーナメントが正常に作成されました',
      isNew: true,
      data: {
        templateId,
        startAt: startAtDate.toISOString(),
        regEndAt: regEndAtDate.toISOString(),
        status: 'scheduled',
      },
    };

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', `入力検証エラー: ${error.errors.map(e => e.message).join(', ')}`);
    }

    if (error instanceof HttpsError) {
      throw error;
    }

    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'スケジュール済みトーナメント作成エラー:',
        failureType: 'business',
        functionEntry: 'createScheduledTournament',
        operation: 'createScheduledTournamentCatch',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }

    logOpsError({
      message: 'スケジュール済みトーナメント作成エラー:',
      failureType: 'business',
      functionEntry: 'createScheduledTournament',
      cause: error,
    });

    throw new HttpsError('internal', 'スケジュール済みトーナメントの作成に失敗しました');
  }
});
