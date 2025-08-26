import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * スケジュール済みトーナメント一覧を取得するCloud Function
 * 
 * When: トーナメント一覧画面の初期表示時、期間切り替え時
 * Where: functions/src/callables/getScheduledTournaments.ts
 * What: FirestoreからscheduledTournamentsコレクションを取得
 * How: 期間フィルタリングとソートを適用して返却
 */
export const getScheduledTournaments = onCall(async (request) => {
  try {
    console.log('getScheduledTournaments called with data:', JSON.stringify(request.data, null, 2));
    
    const { period = 'all' } = request.data || {};
    
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
    
    console.log('=== 期間フィルタリング開始 ===');
    console.log('選択された期間:', period);
    console.log('jstToday:', jstToday.toISOString());
    console.log('jstTodayUTC:', jstTodayUTC.toISOString());
    
    switch (period) {
      case 'yesterday':
        const jstYesterday = new Date(jstToday);
        jstYesterday.setDate(jstYesterday.getDate() - 1);
        const jstYesterdayUTC = new Date(jstYesterday.getTime() - jstOffset * 60 * 1000);
        const jstYesterdayEndUTC = new Date(jstTodayUTC.getTime());
        
        // TimestampオブジェクトでのクエリP
        const yesterdayStartTimestamp = admin.firestore.Timestamp.fromDate(jstYesterdayUTC);
        const yesterdayEndTimestamp = admin.firestore.Timestamp.fromDate(jstYesterdayEndUTC);
        
        query = query
          .where('startAt', '>=', yesterdayStartTimestamp)
          .where('startAt', '<', yesterdayEndTimestamp);
        break;
        
      case 'today':
        const jstTomorrowToday = new Date(jstToday);
        jstTomorrowToday.setDate(jstTomorrowToday.getDate() + 1);
        const jstTomorrowTodayUTC = new Date(jstTomorrowToday.getTime() - jstOffset * 60 * 1000);
        
        console.log('=== 今日のフィルタリング (Cloud Functions) ===');
        console.log('jstToday:', jstToday.toISOString());
        console.log('jstTomorrowToday:', jstTomorrowToday.toISOString());
        console.log('jstTodayUTC:', jstTodayUTC.toISOString());
        console.log('jstTomorrowTodayUTC:', jstTomorrowTodayUTC.toISOString());
        
        // TimestampオブジェクトでのクエリPC
        const startTimestamp = admin.firestore.Timestamp.fromDate(jstTodayUTC);
        const endTimestamp = admin.firestore.Timestamp.fromDate(jstTomorrowTodayUTC);
        
        query = query
          .where('startAt', '>=', startTimestamp)
          .where('startAt', '<', endTimestamp);
        
        console.log('=== 今日のクエリ条件 ===');
        console.log('startAt >= (Timestamp)', jstTodayUTC.toISOString());
        console.log('startAt < (Timestamp)', jstTomorrowTodayUTC.toISOString());
        console.log('startTimestamp:', startTimestamp);
        console.log('endTimestamp:', endTimestamp);
        break;
        
      case 'thisWeek':
        // 明日から7日間の範囲
        const jstTomorrowWeek = new Date(jstToday);
        jstTomorrowWeek.setDate(jstTomorrowWeek.getDate() + 1);
        const jstTomorrowWeekUTC = new Date(jstTomorrowWeek.getTime() - jstOffset * 60 * 1000);
        const jstNext7DaysEnd = new Date(jstTomorrowWeek);
        jstNext7DaysEnd.setDate(jstNext7DaysEnd.getDate() + 7);
        const jstNext7DaysEndUTC = new Date(jstNext7DaysEnd.getTime() - jstOffset * 60 * 1000);
        
        console.log('=== 今後7日のフィルタリング (Cloud Functions) ===');
        console.log('jstToday:', jstToday.toISOString());
        console.log('jstTomorrowWeek:', jstTomorrowWeek.toISOString());
        console.log('jstNext7DaysEnd:', jstNext7DaysEnd.toISOString());
        console.log('jstTomorrowWeekUTC:', jstTomorrowWeekUTC.toISOString());
        console.log('jstNext7DaysEndUTC:', jstNext7DaysEndUTC.toISOString());
        
        // TimestampオブジェクトでのクエリP
        const weekStartTimestamp = admin.firestore.Timestamp.fromDate(jstTomorrowWeekUTC);
        const weekEndTimestamp = admin.firestore.Timestamp.fromDate(jstNext7DaysEndUTC);
        
        query = query
          .where('startAt', '>=', weekStartTimestamp)
          .where('startAt', '<', weekEndTimestamp);
        break;
        
      case 'all':
      default:
        // 当日から7日前以降のトーナメントを取得
        const jst7DaysAgo = new Date(jstToday);
        jst7DaysAgo.setDate(jst7DaysAgo.getDate() - 7);
        const jst7DaysAgoUTC = new Date(jst7DaysAgo.getTime() - jstOffset * 60 * 1000);
        
        // TimestampオブジェクトでのクエリP
        const sevenDaysAgoTimestamp = admin.firestore.Timestamp.fromDate(jst7DaysAgoUTC);
        
        query = query.where('startAt', '>=', sevenDaysAgoTimestamp);
        
        console.log('=== 全期間フィルタリング（7日前以降）===');
        console.log('jst7DaysAgo:', jst7DaysAgo.toISOString());
        console.log('jst7DaysAgoUTC:', jst7DaysAgoUTC.toISOString());
        console.log('sevenDaysAgoTimestamp:', sevenDaysAgoTimestamp);
        console.log('startAt >=', jst7DaysAgoUTC.toISOString());
        break;
    }
    
    // 開始時刻で昇順ソート（インデックスに合わせる）
    query = query.orderBy('startAt', 'asc');
    
    // 最大100件まで取得（パフォーマンス考慮）
    query = query.limit(100);
    
    console.log('=== クエリ実行前 ===');
    console.log('クエリ条件:', {
      isArchived: false,
      period: period,
      orderBy: 'startAt asc',
      limit: 100
    });
    
    const snapshot = await query.get();
    
    console.log('=== クエリ結果 ===');
    console.log('取得件数:', snapshot.docs.length);
    if (snapshot.docs.length > 0) {
      console.log('最初のドキュメント:', {
        id: snapshot.docs[0].id,
        data: snapshot.docs[0].data()
      });
    }
    
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
    
    const tournaments = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // デバッグ用ログ
      console.log(`Tournament ${doc.id} data:`, {
        templateSnapshot: data.templateSnapshot,
        templateId: data.templateId,
        name: data.templateSnapshot?.name,
        hasTemplateSnapshot: !!data.templateSnapshot,
        templateSnapshotKeys: data.templateSnapshot ? Object.keys(data.templateSnapshot) : 'none'
      });
      
      // templateSnapshotまたはtemplateIdからtournamentTemplateの詳細情報を取得
      let tournamentName = '無名トーナメント';
      let maxEntrants = 0;
      let entryFee = 0;
      
      // 1. まず、doc.data()のtemplateSnapshotを確認
      if (data.templateSnapshot && data.templateSnapshot.name) {
        tournamentName = data.templateSnapshot.name;
        maxEntrants = data.templateSnapshot.maxEntrants || 0;
        entryFee = data.templateSnapshot.entryFee || 0;
        console.log(`Using doc templateSnapshot for ${doc.id}: ${tournamentName}`);
      }
      // 2. 次に、templateIdから取得したtemplateSnapshotを確認
      else if (data.templateId && templateSnapshots.has(data.templateId)) {
        const templateData = templateSnapshots.get(data.templateId);
        tournamentName = templateData.name || '無名トーナメント';
        maxEntrants = templateData.maxEntrants || 0;
        entryFee = templateData.entryFee || 0;
        console.log(`Using fetched templateSnapshot for ${doc.id}: ${tournamentName}`);
      }
      // 3. どちらも存在しない場合
      else if (data.templateId) {
        console.log(`Template data not found for tournament ${doc.id}, templateId: ${data.templateId}`);
      } else {
        console.log(`No templateId found for tournament ${doc.id}`);
      }
      
      // Timestampを日本時間のISO文字列に変換するヘルパー関数
      const convertTimestampToJST = (timestamp: any): string => {
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
        
        // UTCから日本時間（UTC+9）に変換
        const jstOffset = 9 * 60 * 60 * 1000; // UTC+9のミリ秒単位でのオフセット
        const jstDate = new Date(date.getTime() + jstOffset);
        
        return jstDate.toISOString();
      };
      
      return {
        id: doc.id,
        name: tournamentName,
        templateId: data.templateId, // templateIdも返却
        startAt: convertTimestampToJST(data.startAt),
        regEndAt: convertTimestampToJST(data.regEndAt),
        status: data.freeze ? 'frozen' : 'scheduled',
        entries: data.views?.main?.entries || 0,
        maxEntrants: maxEntrants,
        entryFee: entryFee,
        currentLevel: data.views?.main?.currentLevel || 1,
        playersIn: data.views?.main?.playersIn || 0,
        seatedCount: data.views?.main?.seatedCount || 0,
        waitingCount: data.views?.main?.waitingCount || 0,
        createdAt: convertTimestampToJST(data.createdAt),
        updatedAt: convertTimestampToJST(data.updatedAt),
      };
    });
    
    // 結果を降順でソート（メモリ上でソート）
    tournaments.sort((a, b) => {
      const dateA = new Date(a.startAt);
      const dateB = new Date(b.startAt);
      return dateB.getTime() - dateA.getTime();
    });
    
    console.log(`Retrieved ${tournaments.length} tournaments for period: ${period}`);
    
    return {
      success: true,
      scheduledTournaments: tournaments,
      count: tournaments.length,
      period: period,
    };
    
  } catch (error) {
    console.error('Error in getScheduledTournaments:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      count: 0,
      period: request.data?.period || 'all',
    };
  }
});
