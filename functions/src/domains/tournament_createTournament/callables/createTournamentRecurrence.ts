import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { logger } from "firebase-functions";
import { logOpsError } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from "../../../shared/logging/functionCustomError";
import { getCallerDeviceByUid, hasRequiredOption, isActive } from "../../../shared/devices";
import { validateStoreTenantForProduction } from "../../../shared/runtime";
import { calcBusinessDate } from "../../bills/repos/calcBusinessDate";
import { runEnqueueTournamentTasks } from "../services/enqueueTournamentTasksCore";

// 入力スキーマの定義
const createTournamentRecurrenceSchema = z.object({
  templateId: z.string().min(1, "テンプレートIDは必須です"),
  startOn: z.string().refine((val) => {
    try {
      new Date(val);
      return true;
    } catch {
      return false;
    }
  }, "開始日は有効な日付文字列である必要があります"),
  interval: z.enum(["1week", "2weeks", "3weeks", "4weeks", "5weeks"], {
    errorMap: () => ({ message: "間隔は1週間ごと、2週間ごと、3週間ごと、4週間ごと、5週間ごとのいずれかである必要があります" })
  }),
  byWeekday: z.array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])).min(1, "少なくとも1つの曜日を選択してください"),
  endsOn: z.string().optional().nullable(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "開始時刻はHH:MM形式である必要があります"),
  isActive: z.boolean().default(true),
  // Phase0A D-13: default 削除。本番では default-store/default-tenant 禁止
  storeId: z.string().min(1, "店舗IDは必須です").optional(),
  tenantId: z.string().min(1, "テナントIDは必須です").optional(),
});

export const createTournamentRecurrence = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  // デバイス権限の確認（role: admin または options.tournament: true）
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
  }

  const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
  if (!hasPermission) {
    throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
  }

  try {
    console.log('=== 定期開催トーナメント作成開始 ===');
    console.log('受信データ:', JSON.stringify(request.data, null, 2));
    
    // 入力検証
    const validatedData = createTournamentRecurrenceSchema.parse(request.data);
    validateStoreTenantForProduction(validatedData.storeId, validatedData.tenantId);
    const storeId = validatedData.storeId ?? "default-store"; // emulator のみ（本番は上で throw 済み）
    const tenantId = validatedData.tenantId ?? "default-tenant";
    const { templateId, startOn, interval, byWeekday, endsOn, startTime, isActive } = validatedData;

    const db = getFirestore();
    const now = new Date();
    const startOnDate = new Date(startOn);

    // テンプレートの存在確認
    const templateDoc = await db.collection('tournamentTemplates').doc(templateId).get();
    if (!templateDoc.exists) {
      throw new HttpsError('not-found', '指定されたテンプレートが見つかりません');
    }

    const templateData = templateDoc.data()!;
    console.log('テンプレートデータ:', templateData);

    // 間隔を週数に変換
    const intervalWeeks = parseInt(interval.replace('weeks', '').replace('week', ''));
    console.log('間隔週数:', intervalWeeks);

    // 定期開催データを作成
    const recurrenceData = {
      templateId,
      storeId,
      tenantId,
      startOn: Timestamp.fromDate(startOnDate),
      interval,
      byWeekday,
      endsOn: endsOn ? Timestamp.fromDate(new Date(endsOn)) : null,
      startTime,
      isActive,
      templateVersion: templateData.updatedAt || templateData.createdAt,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    };

    console.log('定期開催データ:', recurrenceData);

    // tournamentRecurrencesコレクションに保存
    const recurrenceRef = await db.collection('tournamentRecurrences').add(recurrenceData);
    console.log('定期開催データ保存完了:', recurrenceRef.id);

    // 3ヶ月後までのトーナメントを自動生成
    const generatedTournaments = await generateRecurringTournaments(
      db,
      recurrenceRef.id,
      templateId,
      templateData,
      startOnDate,
      intervalWeeks,
      byWeekday,
      endsOn || null,
      startTime,
      storeId,
      tenantId
    );

    // 作成完了後、enqueue を 1 回呼び出し（Step 5）。storeId/tenantId で対象を絞る
    try {
      await runEnqueueTournamentTasks({ storeId, tenantId });
    } catch (enqueueError) {
      logOpsError({
        message: 'enqueue 呼び出しエラー',
        failureType: 'business',
        functionEntry: 'createTournamentRecurrence',
        operation: 'enqueueAfterCreate',
        cause: enqueueError,
        context: {
          recurrenceId: recurrenceRef.id,
          storeId,
          tenantId,
        },
      });
    }

    console.log('生成されたトーナメント数:', generatedTournaments.length);

    return {
      success: true,
      recurrenceId: recurrenceRef.id,
      generatedTournaments: generatedTournaments.length,
      message: `定期開催トーナメントを作成し、${generatedTournaments.length}件のトーナメントを生成しました`
    };

  } catch (error) {
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: '定期開催トーナメント作成エラー:',
        failureType: 'business',
        functionEntry: 'createTournamentRecurrence',
        operation: 'createTournamentRecurrenceCatch',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }
    logOpsError({
      message: '定期開催トーナメント作成エラー:',
      failureType: 'business',
      functionEntry: 'createTournamentRecurrence',
      cause: error,
    });
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `定期開催トーナメントの作成に失敗しました: ${error}`);
  }
});

// 定期開催トーナメントを生成する関数
async function generateRecurringTournaments(
  db: FirebaseFirestore.Firestore,
  recurrenceId: string,
  templateId: string,
  templateData: any,
  startOnDate: Date,
  intervalWeeks: number,
  byWeekday: string[],
  endsOn: string | null,
  startTime: string,
  storeId: string,
  tenantId: string
): Promise<string[]> {
  const generatedTournaments: string[] = [];
  const endDate = endsOn ? new Date(endsOn) : new Date(Date.now() + 3 * 30 * 24 * 60 * 60 * 1000); // 3ヶ月後
  const currentDate = new Date(startOnDate);

  console.log('生成期間:', startOnDate.toISOString(), '〜', endDate.toISOString());
  console.log('開始日の曜日:', startOnDate.getDay());
  console.log('指定された曜日:', byWeekday);

  // 曜日の数値マッピング
  const weekdayMap: { [key: string]: number } = {
    'SU': 0, 'MO': 1, 'TU': 2, 'WE': 3, 'TH': 4, 'FR': 5, 'SA': 6
  };

  // 開始日が指定された曜日でない場合、最初の指定曜日まで移動
  const startDayOfWeek = currentDate.getDay();
  const targetWeekdays = byWeekday.map(day => weekdayMap[day]).sort();
  const nextTargetDay = targetWeekdays.find(day => day >= startDayOfWeek) || targetWeekdays[0];
  
  if (startDayOfWeek !== nextTargetDay) {
    const daysToAdd = nextTargetDay > startDayOfWeek 
      ? nextTargetDay - startDayOfWeek 
      : (7 - startDayOfWeek) + nextTargetDay;
    currentDate.setDate(currentDate.getDate() + daysToAdd);
    console.log(`開始日を最初の指定曜日まで移動: ${currentDate.toISOString()}`);
  }

      while (currentDate <= endDate) {
        console.log(`処理中の日付: ${currentDate.toISOString()}, 曜日: ${currentDate.getDay()}`);
        
        // 現在の週の指定された曜日をチェック
        for (const weekday of byWeekday) {
          const targetWeekday = weekdayMap[weekday];
          const dayOfWeek = currentDate.getDay();
          
          console.log(`チェック中の曜日: ${weekday} (${targetWeekday}), 現在の曜日: ${dayOfWeek}`);
          
          if (dayOfWeek === targetWeekday) {
        // 重複チェック
        // JST時刻を明示的に作成し、UTCに変換
        const [hours, minutes] = (startTime || '19:00').split(':').map(Number);
        const jstDate = new Date(currentDate);
        jstDate.setHours(hours, minutes, 0, 0);
        
        // JSTからUTCに変換（-9時間）
        const startAt = new Date(jstDate.getTime() - (9 * 60 * 60 * 1000));
        
        const isDuplicate = await checkDuplicateTournament(
          db,
          templateId,
          startAt,
          storeId,
          tenantId
        );

        if (!isDuplicate) {
          // トーナメントを作成
          const tournamentId = await createScheduledTournamentFromRecurrence(
            db,
            recurrenceId,
            templateId,
            templateData,
            startAt,
            storeId,
            tenantId
          );
          
          if (tournamentId) {
            generatedTournaments.push(tournamentId);
            console.log('トーナメント作成完了:', tournamentId, startAt.toISOString());
          }
        } else {
          console.log('重複トーナメントをスキップ:', startAt.toISOString());
        }
      }
    }

    // 次の週に移動
    currentDate.setDate(currentDate.getDate() + (7 * intervalWeeks));
  }

  return generatedTournaments;
}

// 重複トーナメントをチェックする関数
async function checkDuplicateTournament(
  db: FirebaseFirestore.Firestore,
  templateId: string,
  startAt: Date,
  storeId: string,
  tenantId: string
): Promise<boolean> {
  const startAtTimestamp = Timestamp.fromDate(startAt);
  
  const query = await db.collection('scheduledTournaments')
    .where('templateId', '==', templateId)
    .where('startAt', '==', startAtTimestamp)
    .where('storeId', '==', storeId)
    .where('tenantId', '==', tenantId)
    .where('status', '==', 'scheduled')
    .limit(1)
    .get();

  return !query.empty;
}

// 定期開催からトーナメントを作成する関数
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

    // トーナメントIDを生成（一意性を保証）
    const tournamentRef = db.collection('scheduledTournaments').doc();

    // blindTemplateからstagesを生成し、plannedRegistAtを計算
    const blindStructureId = templateData.blindStructure || templateData.blindStructureId;
    let stages: any[] = [];
    let lateRegUntilLev = 0;
    let breakDuration = 0;
    let plannedRegistAt: Date;
    
    if (blindStructureId) {
      const blindTemplateDoc = await db.collection('blindTemplates').doc(blindStructureId).get();
      if (blindTemplateDoc.exists) {
        const blindTemplateData = blindTemplateDoc.data()!;
        const levels = blindTemplateData.levels || [];
        lateRegUntilLev = blindTemplateData.lateRegUntilLev || 0;
        breakDuration = blindTemplateData.breakDuration || 0;
        
        // levelsからstagesを生成
        stages = levels.map((level: any) => {
          const stage = {
            type: 'level',
            lev: level.level,
            durationSec: (level.duration || 0) * 60,
          };
          
          if (level.hasBreakAfter) {
            return [stage, {
              type: 'break',
              durationSec: breakDuration * 60,
            }];
          }
          
          return stage;
        }).flat();
        
        // lateRegUntilLev+1のレベル直前にregistステージを追加
        if (lateRegUntilLev > 0) {
          const newStages: any[] = [];
          
          for (let i = 0; i < stages.length; i++) {
            const stage = stages[i];
            
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

    // plannedRegistAtを計算
    if (lateRegUntilLev > 0 && stages.length > 0) {
      let totalDurationSec = 0;
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        if (stage.type === 'level' && stage.lev === lateRegUntilLev + 1) {
          break;
        }
        totalDurationSec += stage.durationSec;
      }
      plannedRegistAt = new Date(startAtDate.getTime() + (totalDurationSec * 1000));
    } else {
      plannedRegistAt = startAtDate;
    }

    const plannedStartAt = Timestamp.fromDate(startAtDate);

    // startAtから営業日を計算（createScheduledTournament.tsと同様）
    const businessDateResult = await calcBusinessDate(startAtDate);
    let businessDate: string;
    if (businessDateResult.status === 'NONE') {
      console.log('スキップ: 営業日に該当しない時刻のため', startAtDate.toISOString());
      return null;
    }
    if (businessDateResult.status === 'AMBIGUOUS') {
      businessDate = businessDateResult.candidates[0];
      logger.warn('calcBusinessDate returned AMBIGUOUS, using first candidate', {
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
          businessDate: businessDate,
        });
        return null;
      }
    }

    // scheduledTournaments ドキュメント作成
    const scheduledTournamentData = {
      templateId,
      recurrenceId, // 定期開催IDを追加
      storeId,
      tenantId,
      status: 'scheduled',
      businessDate,
      startAt: plannedStartAt,
      regEndAt: Timestamp.fromDate(plannedRegistAt), // 正確なregEndAt
      freeze: false,
      isPrizeConfirmed: false,
      isArchived: false,
      regular: true, // 定期開催から生成
      generateBy: recurrenceId, // 定期開催IDを格納
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

    // views/main を初期化
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

    // tablesSeat/waiting を初期化
    const waitingListData = {
      waiting: {},
      count: 0,
      updatedAt: Timestamp.fromDate(now),
    };

    // views/usersList を初期化
    const usersListData = {
      users: {},
      updatedAt: Timestamp.fromDate(now),
    };

    // views/runtime を初期化
    const runtimeData = {
      status: 'scheduled',
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

    // トランザクションで一括作成
    await db.runTransaction(async (transaction) => {
      // scheduledTournaments を作成
      transaction.set(tournamentRef, scheduledTournamentData);
      
      // views/main を作成
      const mainViewRef = tournamentRef.collection('views').doc('main');
      transaction.set(mainViewRef, mainViewData);
      
      // views/usersList を作成
      const usersListRef = tournamentRef.collection('views').doc('usersList');
      transaction.set(usersListRef, usersListData);
      
      // tablesSeat/waiting を作成
      const waitingRef = tournamentRef.collection('tablesSeat').doc('waiting');
      transaction.set(waitingRef, waitingListData);
      
      // tablesSeat/busted を作成
      const bustedRef = tournamentRef.collection('tablesSeat').doc('busted');
      transaction.set(bustedRef, { bustedUser: {} });
      
      // views/runtime を作成
      const runtimeRef = tournamentRef.collection('views').doc('runtime');
      transaction.set(runtimeRef, runtimeData);
    });

    console.log('定期開催トーナメント作成完了:', tournamentRef.id);
    return tournamentRef.id;
  } catch (error) {
    logOpsError({
      message: '定期開催トーナメント作成エラー:',
      failureType: 'business',
      functionEntry: 'createTournamentRecurrence',
      cause: error,
    });
    return null;
  }
}
