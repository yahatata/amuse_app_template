import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logOpsError } from "../../../shared/logging/logOpsError";

/**
 * LIFF用：本日開催のトーナメント一覧を取得するCloud Function
 * 
 * When: LIFFの本日開催トーナメント一覧画面の初期表示時
 * Where: functions/src/callables/getTodayTournaments.ts
 * What: Firestoreから本日開催のscheduledTournamentsを取得
 * How: 既存のgetScheduledTournaments関数を流用して本日分のみ取得
 */
export const getTodayTournaments = onCall(async (request) => {
  try {
    console.log('getTodayTournaments called for LIFF');
    
    // 既存のgetScheduledTournaments関数のロジックを流用
    // const { period = 'today' } = request.data || {};
    
    // FirestoreからscheduledTournamentsコレクションを取得
    let query = admin.firestore()
      .collection('scheduledTournaments')
      .where('isArchived', '==', false); // アーカイブされていないもののみ
    
    // 期間に応じたフィルタリング（UTC+9基準）
    const jstOffset = 9 * 60; // UTC+9の分単位でのオフセット
    const now = new Date();
    const jstNow = new Date(now.getTime() + jstOffset * 60 * 1000);
    
    // 日本時間での今日の開始（00:00:00）
    const jstToday = new Date(jstNow.getFullYear(), jstNow.getMonth(), jstNow.getDate());
    const jstTodayUTC = new Date(jstToday.getTime() - jstOffset * 60 * 1000);
    
    console.log('=== 本日開催トーナメントフィルタリング ===');
    console.log('jstToday:', jstToday.toISOString());
    console.log('jstTodayUTC:', jstTodayUTC.toISOString());
    
    // 本日開催のトーナメントのみを取得
    const jstTomorrow = new Date(jstToday);
    jstTomorrow.setDate(jstTomorrow.getDate() + 1);
    const jstTomorrowUTC = new Date(jstTomorrow.getTime() - jstOffset * 60 * 1000);
    
    console.log('jstTomorrow:', jstTomorrow.toISOString());
    console.log('jstTomorrowUTC:', jstTomorrowUTC.toISOString());
    
    // Timestampオブジェクトでのクエリ
    const startTimestamp = admin.firestore.Timestamp.fromDate(jstTodayUTC);
    const endTimestamp = admin.firestore.Timestamp.fromDate(jstTomorrowUTC);
    
    query = query
      .where('startAt', '>=', startTimestamp)
      .where('startAt', '<', endTimestamp);
    
    // 開始時刻で昇順ソート
    query = query.orderBy('startAt', 'asc');
    
    // 最大50件まで取得（LIFF用なので少なめに）
    query = query.limit(50);
    
    console.log('=== クエリ実行 ===');
    const snapshot = await query.get();
    
    console.log('取得件数:', snapshot.docs.length);
    
    // templateIdからtournamentTemplateの詳細情報を取得
    const templateIds = snapshot.docs
      .map(doc => doc.data().templateId)
      .filter(id => id) // null/undefinedを除外
      .filter((id, index, arr) => arr.indexOf(id) === index); // 重複を除外
    
    console.log('Unique template IDs found:', templateIds);
    
    // tournamentTemplatesから詳細情報を一括取得
    const templateSnapshots = new Map();
    if (templateIds.length > 0) {
      const templateQuery = admin.firestore()
        .collection('tournamentTemplates')
        .where(admin.firestore.FieldPath.documentId(), 'in', templateIds);
      
      const templateDocs = await templateQuery.get();
      templateDocs.docs.forEach(doc => {
        templateSnapshots.set(doc.id, doc.data());
      });
      
      console.log(`Retrieved ${templateSnapshots.size} template snapshots`);
    }
    
    const tournaments = await Promise.all(snapshot.docs.map(async (doc) => {
      const data = doc.data();
      
      // サブコレクションから参加者数を取得
      let participantCount = 0;
      try {
        const viewsDoc = await admin.firestore()
          .collection('scheduledTournaments')
          .doc(doc.id)
          .collection('views')
          .doc('main')
          .get();
        
        if (viewsDoc.exists) {
          participantCount = viewsDoc.data()?.entries || 0;
        }
      } catch (error) {
        console.log(`Failed to fetch views data for tournament ${doc.id}:`, error);
      }
      
      // templateSnapshotまたはtemplateIdからtournamentTemplateの詳細情報を取得
      let tournamentName = '無名トーナメント';
      let maxEntrants = 0;
      let entryFee = 0;
      let description = '';
      let category = 'regular';
      let isReentry = false;
      let reentryFee = 0;
      let startStack = 0;
      let addonFee = 0;
      let addonStack = 0;
      let isAddon = false;
      let prizeRateBps = 0;
      let entriesPerPayout = 8;
      
      // 1. まず、doc.data()のtemplateSnapshotを確認
      if (data.templateSnapshot && data.templateSnapshot.name) {
        const template = data.templateSnapshot;
        tournamentName = template.name;
        maxEntrants = template.maxEntrants || 0;
        entryFee = template.entryFee || 0;
        description = template.description || '';
        category = template.category || 'regular';
        isReentry = template.isReentry || false;
        reentryFee = template.reentryFee || 0;
        startStack = template.startStack || 0;
        addonFee = template.addonFee || 0;
        addonStack = template.addonStack || 0;
        isAddon = template.isAddon || false;
        prizeRateBps = template.prizeRateBps || 0;
        entriesPerPayout = template.entriesPerPayout || 8;
        console.log(`Using doc templateSnapshot for ${doc.id}: ${tournamentName}`);
      }
      // 2. 次に、templateIdから取得したtemplateSnapshotを確認
      else if (data.templateId && templateSnapshots.has(data.templateId)) {
        const templateData = templateSnapshots.get(data.templateId);
        tournamentName = templateData.name || '無名トーナメント';
        maxEntrants = templateData.maxEntrants || 0;
        entryFee = templateData.entryFee || 0;
        description = templateData.description || '';
        category = templateData.category || 'regular';
        isReentry = templateData.isReentry || false;
        reentryFee = templateData.reentryFee || 0;
        startStack = templateData.startStack || 0;
        addonFee = templateData.addonFee || 0;
        addonStack = templateData.addonStack || 0;
        isAddon = templateData.isAddon || false;
        prizeRateBps = templateData.prizeRateBps || 0;
        entriesPerPayout = templateData.entriesPerPayout || 8;
        console.log(`Using fetched templateSnapshot for ${doc.id}: ${tournamentName}`);
      }
      // 3. どちらも存在しない場合
      else if (data.templateId) {
        console.log(`Template data not found for tournament ${doc.id}, templateId: ${data.templateId}`);
      } else {
        console.log(`No templateId found for tournament ${doc.id}`);
      }
      
      // TimestampをUTCのISO文字列に変換するヘルパー関数
      const convertTimestampToUTC = (timestamp: any): string => {
        if (!timestamp) return '';
        
        let date: Date;
        
        // Firestore Timestampの場合
        if (timestamp.toDate && typeof timestamp.toDate === 'function') {
          date = timestamp.toDate();
        }
        // 既に文字列の場合
        else if (typeof timestamp === 'string') {
          date = new Date(timestamp);
        }
        // 数値の場合（Unix timestamp）
        else if (typeof timestamp === 'number') {
          date = new Date(timestamp * 1000);
        }
        // その他の場合は空文字を返す
        else {
          console.log(`Unknown timestamp format for ${doc.id}:`, timestamp);
          return '';
        }
        
        // UTCのISO文字列として返す（一般的な形式）
        return date.toISOString();
      };
      
      return {
        id: doc.id,
        name: tournamentName,
        templateId: data.templateId,
        startAt: convertTimestampToUTC(data.startAt),
        regEndAt: convertTimestampToUTC(data.regEndAt),
        status: data.freeze ? 'frozen' : 'scheduled',
        entries: data.views?.main?.entries || 0,
        maxEntrants: maxEntrants,
        entryFee: entryFee,
        description: description,
        category: category,
        isReentry: isReentry,
        reentryFee: reentryFee,
        startStack: startStack,
        addonFee: addonFee,
        addonStack: addonStack,
        isAddon: isAddon,
        prizeRateBps: prizeRateBps,
        entriesPerPayout: entriesPerPayout,
        currentLevel: data.views?.main?.currentLevel || 1,
        seatedCount: data.views?.main?.seatedCount || 0,
        waitingCount: data.views?.main?.waitingCount || 0,
        participantCount: participantCount, // LIFF用の別名
        createdAt: convertTimestampToUTC(data.createdAt),
        updatedAt: convertTimestampToUTC(data.updatedAt),
      };
    }));
    
    console.log(`Retrieved ${tournaments.length} tournaments for today`);
    
    return {
      success: true,
      data: tournaments, // LIFF用の形式
      count: tournaments.length,
      message: `${tournaments.length}件の本日開催トーナメントを取得しました`
    };
    
  } catch (error) {
    logOpsError({
      message: 'Error in getTodayTournaments:',
      functionEntry: 'getTodayTournaments',
      cause: error,
    });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      data: [],
      count: 0,
      message: '本日開催トーナメントの取得に失敗しました'
    };
  }
});
