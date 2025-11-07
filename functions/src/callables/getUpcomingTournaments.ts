import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * LIFF用：当日以降のトーナメント一覧を取得するCloud Function
 * 
 * When: LIFFのトーナメント一覧画面の初期表示時
 * Where: functions/src/callables/getUpcomingTournaments.ts
 * What: Firestoreから当日以降のscheduledTournamentsを取得
 * How: 既存のgetScheduledTournaments関数を流用して当日以降を取得
 */
export const getUpcomingTournaments = onCall(async (request) => {
  try {
    const { includeAll = false } = request.data || {};
    console.log('getUpcomingTournaments called for LIFF, includeAll:', includeAll);
    
    // 既存のgetScheduledTournaments関数のロジックを流用
    // const { period = 'all' } = request.data || {};
    
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
    
    console.log('=== 当日以降トーナメントフィルタリング ===');
    console.log('jstToday:', jstToday.toISOString());
    console.log('jstTodayUTC:', jstTodayUTC.toISOString());
    
    // 当日以降のトーナメントを取得
    const todayTimestamp = admin.firestore.Timestamp.fromDate(jstTodayUTC);
    
    if (!includeAll) {
      // 1週間先まで（既存ロジック）
      const jstNext7Days = new Date(jstToday);
      jstNext7Days.setDate(jstNext7Days.getDate() + 7);
      const jstNext7DaysUTC = new Date(jstNext7Days.getTime() - jstOffset * 60 * 1000);
      const next7DaysTimestamp = admin.firestore.Timestamp.fromDate(jstNext7DaysUTC);
      
      console.log('=== 1週間先フィルタリング ===');
      console.log('今日:', jstToday.toISOString());
      console.log('7日後:', jstNext7Days.toISOString());
      console.log('todayTimestamp:', todayTimestamp);
      console.log('next7DaysTimestamp:', next7DaysTimestamp);
      
      query = query
        .where('startAt', '>=', todayTimestamp)
        .where('startAt', '<', next7DaysTimestamp);
    } else {
      // 全件（新規）
      console.log('=== 全トーナメント取得モード ===');
      query = query.where('startAt', '>=', todayTimestamp);
    }
    
    console.log('=== 当日以降フィルタリング ===');
    console.log('todayTimestamp:', todayTimestamp);
    console.log('startAt >=', jstTodayUTC.toISOString());
    
    // 開始時刻で昇順ソート
    query = query.orderBy('startAt', 'asc');
    
    // 最大件数の制限
    if (!includeAll) {
      // 1週間先まで: 100件まで
      query = query.limit(100);
    } else {
      // 全件: 500件まで（実用上十分な数）
      query = query.limit(500);
    }
    
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
    
    // 結果を昇順でソート（メモリ上でソート）
    tournaments.sort((a, b) => {
      const dateA = new Date(a.startAt);
      const dateB = new Date(b.startAt);
      return dateA.getTime() - dateB.getTime();
    });
    
    const message = includeAll 
      ? `${tournaments.length}件の全トーナメントを取得しました` 
      : `${tournaments.length}件の開催予定トーナメント（1週間先まで）を取得しました`;
    
    console.log(message);
    
    return {
      success: true,
      tournaments: tournaments, // LIFF用の形式（"data"から"tournaments"に変更）
      count: tournaments.length,
      message: message
    };
    
  } catch (error) {
    console.error('Error in getUpcomingTournaments:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      tournaments: [],
      count: 0,
      message: '開催予定トーナメントの取得に失敗しました'
    };
  }
});
