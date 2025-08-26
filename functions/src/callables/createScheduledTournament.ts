import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

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
      startAt: Timestamp.fromDate(startAtDate),
      regEndAt: Timestamp.fromDate(regEndAtDate),
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
    });

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
