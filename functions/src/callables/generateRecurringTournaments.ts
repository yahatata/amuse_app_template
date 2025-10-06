import { onCall } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

export const generateRecurringTournaments = onCall(async (request) => {
  try {
    console.log('=== 定期開催トーナメント自動生成開始 ===');
    
    const db = getFirestore();
    const now = new Date();
    
    // 有効な定期開催を取得
    const recurrencesSnapshot = await db.collection('tournamentRecurrences')
      .where('isActive', '==', true)
      .get();

    console.log('有効な定期開催数:', recurrencesSnapshot.docs.length);

    let totalGenerated = 0;

    for (const recurrenceDoc of recurrencesSnapshot.docs) {
      const recurrenceData = recurrenceDoc.data();
      const recurrenceId = recurrenceDoc.id;
      
      console.log(`処理中の定期開催: ${recurrenceId}`);

      // テンプレート情報を取得
      const templateDoc = await db.collection('tournamentTemplates')
        .doc(recurrenceData.templateId)
        .get();

      if (!templateDoc.exists) {
        console.log(`テンプレートが見つかりません: ${recurrenceData.templateId}`);
        continue;
      }

      const templateData = templateDoc.data()!;
      
      // 間隔を週数に変換
      const intervalWeeks = parseInt(recurrenceData.interval.replace('weeks', '').replace('week', ''));
      
      // 終了日を設定（3ヶ月後）
      const endDate = new Date(now.getTime() + 3 * 30 * 24 * 60 * 60 * 1000);
      
      // 最後に生成されたトーナメントの日付を取得
      const lastGeneratedQuery = await db.collection('scheduledTournaments')
        .where('recurrenceId', '==', recurrenceId)
        .orderBy('startAt', 'desc')
        .limit(1)
        .get();

      let startDate = new Date(recurrenceData.startOn.toDate());
      
      if (!lastGeneratedQuery.empty) {
        const lastGenerated = lastGeneratedQuery.docs[0].data();
        const lastStartAt = lastGenerated.startAt.toDate();
        startDate = new Date(lastStartAt.getTime() + (intervalWeeks * 7 * 24 * 60 * 60 * 1000));
      }

      console.log(`生成開始日: ${startDate.toISOString()}`);
      console.log(`生成終了日: ${endDate.toISOString()}`);

      // 曜日の数値マッピング
      const weekdayMap: { [key: string]: number } = {
        'SU': 0, 'MO': 1, 'TU': 2, 'WE': 3, 'TH': 4, 'FR': 5, 'SA': 6
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
            const [hours, minutes] = (recurrenceData.startTime || '19:00').split(':').map(Number);
            const jstDate = new Date(currentDate);
            jstDate.setHours(hours, minutes, 0, 0);
            
            // JSTからUTCに変換（-9時間）
            const startAt = new Date(jstDate.getTime() - (9 * 60 * 60 * 1000));
            
            const isDuplicate = await checkDuplicateTournament(
              db,
              recurrenceData.templateId,
              startAt,
              recurrenceData.storeId,
              recurrenceData.tenantId
            );

            if (!isDuplicate) {
              // トーナメントを作成
              const tournamentId = await createScheduledTournamentFromRecurrence(
                db,
                recurrenceId,
                recurrenceData.templateId,
                templateData,
                startAt,
                recurrenceData.storeId,
                recurrenceData.tenantId
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

      totalGenerated += generatedTournaments.length;
      console.log(`定期開催 ${recurrenceId} で ${generatedTournaments.length} 件のトーナメントを生成`);
    }

    console.log(`合計 ${totalGenerated} 件のトーナメントを生成しました`);

    return {
      success: true,
      generatedCount: totalGenerated,
      message: `${totalGenerated}件の定期開催トーナメントを生成しました`
    };

  } catch (error) {
    console.error('定期開催トーナメント自動生成エラー:', error);
    return { 
      success: false, 
      error: '定期開催トーナメントの自動生成に失敗しました' 
    };
  }
});

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
    const regEndAt = new Date(startAt.getTime() - 30 * 60 * 1000); // 30分前

    const scheduledTournamentData = {
      templateId,
      recurrenceId, // 定期開催IDを追加
      storeId,
      tenantId,
      status: 'scheduled',
      startAt: Timestamp.fromDate(startAt),
      regEndAt: Timestamp.fromDate(regEndAt),
      freeze: false,
      isPrizeConfirmed: false,
      isArchived: false,
      regular: true, // 定期開催から生成
      generateBy: recurrenceId, // 定期開催IDを格納
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
      
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

    const tournamentRef = await db.collection('scheduledTournaments').add(scheduledTournamentData);
    console.log('定期開催トーナメント作成完了:', tournamentRef.id);

    return tournamentRef.id;
  } catch (error) {
    console.error('定期開催トーナメント作成エラー:', error);
    return null;
  }
}
