import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

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
  storeId: z.string().min(1, "店舗IDは必須です").optional().default("default-store"),
  tenantId: z.string().min(1, "テナントIDは必須です").optional().default("default-tenant"),
});

export const createTournamentRecurrence = onCall(async (request) => {
  try {
    console.log('=== 定期開催トーナメント作成開始 ===');
    console.log('受信データ:', JSON.stringify(request.data, null, 2));
    
    // 入力検証
    const validatedData = createTournamentRecurrenceSchema.parse(request.data);
    const { templateId, startOn, interval, byWeekday, endsOn, startTime, isActive, storeId, tenantId } = validatedData;

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

    console.log('生成されたトーナメント数:', generatedTournaments.length);

    return {
      success: true,
      recurrenceId: recurrenceRef.id,
      generatedTournaments: generatedTournaments.length,
      message: `定期開催トーナメントを作成し、${generatedTournaments.length}件のトーナメントを生成しました`
    };

  } catch (error) {
    console.error('定期開催トーナメント作成エラー:', error);
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
