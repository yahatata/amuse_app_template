import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { enqueueStartTask, enqueueRegistTask } from "../lib/tasks";

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
  storeId: z.string().min(1, "店舗IDは必須です").optional().default("default-store"),
  tenantId: z.string().min(1, "テナントIDは必須です").optional().default("default-tenant"),
});

// type CreateScheduledTournamentInput = z.infer<typeof createScheduledTournamentSchema>;

export const createScheduledTournament = onCall(async (request) => {
  try {
    // デバッグ: 受信データをログ出力
    console.log('受信データ:', JSON.stringify(request.data, null, 2));
    
    // 入力検証
    const validatedData = createScheduledTournamentSchema.parse(request.data);
    const { templateId, startAt, regEndAt, freeze, storeId, tenantId } = validatedData;

    const db = getFirestore();
    const now = new Date();
    const startAtDate = new Date(startAt);
    const regEndAtDate = new Date(regEndAt);

    // 冪等制御キー（templateId + startAt）
    // const idempotentKey = `${templateId}_${startAtDate.getTime()}`;
    
    // 既存のトーナメントが存在するかチェック
    const existingQuery = await db.collection('scheduledTournaments')
      .where('templateId', '==', templateId)
      .where('startAt', '==', Timestamp.fromDate(startAtDate))
      .where('storeId', '==', storeId)
      .where('tenantId', '==', tenantId)
      .limit(1)
      .get();

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
      throw new HttpsError('failed-precondition', 'アーカイブされたテンプレートは使用できません');
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
      startAt: Timestamp.fromDate(startAtDate), // 一時的にstartAtDateを使用
      regEndAt: Timestamp.fromDate(regEndAtDate), // 一時的にregEndAtDateを使用un
      freeze: freeze || false,
      isPrizeConfirmed: false,
      isArchived: false,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
      
      // スナップショット（テンプレート内容の不変コピー）
      snapshot: {
        name: templateData.name || '',
        entryFee: templateData.entryFee || 0,
        isReentry: templateData.isReentry || false,
        maxReentriesPerPlayer: templateData.maxReentriesPerPlayer || null,
        reentryFee: templateData.reentryFee || null,
        isAddon: templateData.isAddon || false,
        addonFee: templateData.addonFee || null,
        addonStack: templateData.addonStack || null,
        startStack: templateData.startStack || 0,
        blindStructureId: templateData.blindStructure || templateData.blindStructureId || '',
        prizeRateBps: Math.round((templateData.prizeRatio || 0.7) * 10000), // パーセンテージをbpsに変換
        entriesPerPayout: templateData.entriesPerPayout || 8,
        maxEntrants: templateData.maxEntrants || null,
        category: templateData.tournamentCategory || templateData.category || 'regular',
        pointType: templateData.pointType || 'pointA', // テンプレートのpointTypeを継承
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

    // Cloud Tasks にタスクを投入
    try {
      console.log('=== Cloud Tasks 投入開始 ===');
      console.log('tournamentId:', tournamentId);
      console.log('plannedStartAt:', plannedStartAt.toDate().toISOString());
      console.log('plannedRegistAt:', plannedRegistAt.toISOString());

      // 開始タスクを投入（Rev=1で初期投入）
      // 過去時刻の場合は5秒後に丸める
      const now = new Date();
      const startTime = plannedStartAt.toDate() < now 
        ? new Date(now.getTime() + 5000) // 5秒後
        : plannedStartAt.toDate();
      
      const startTaskName = await enqueueStartTask(tournamentId, startTime, 1);
      console.log('開始タスク投入完了:', startTaskName);

      // レジスト確定タスクを投入（Rev=1で初期投入）
      const registTime = plannedRegistAt < now 
        ? new Date(now.getTime() + 10000) // 10秒後
        : plannedRegistAt;
        
      const registTaskName = await enqueueRegistTask(tournamentId, registTime, 1);
      console.log('レジスト確定タスク投入完了:', registTaskName);

      console.log('=== Cloud Tasks 投入完了 ===');
    } catch (taskError) {
      console.error('Cloud Tasks 投入エラー:', taskError);
      // タスク投入に失敗してもトーナメント作成は成功とする
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
    console.error('スケジュール済みトーナメント作成エラー:', error);
    
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', `入力検証エラー: ${error.errors.map(e => e.message).join(', ')}`);
    }
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', 'スケジュール済みトーナメントの作成に失敗しました');
  }
});
