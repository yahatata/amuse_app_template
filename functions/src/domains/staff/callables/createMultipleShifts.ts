import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getStoreConfig } from "../../../shared/config/configLoader";
import { DEFAULT_SHIFT_SCHEDULING_START_DAY } from "../../../shared/config/defaults";
import { assertStaffExists, assertHourStep, getYearMonthFromDateKey, isInShiftSchedulingPeriod, isInsufficientDaysNotificationSent, isInsufficientDayOrTimeSlot } from "../../shift/services/helpers";
import { logOpsError } from "../../../shared/logging/logOpsError";

const db = admin.firestore();

interface ShiftData {
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
}

interface CreateMultipleShiftsRequest {
  shifts: ShiftData[];
}

interface CreateMultipleShiftsResponse {
  success: boolean;
  requestIds?: string[];
  error?: string;
}

/**
 * HH:MM形式の時刻を分（minutes）に変換
 * 24:00は1440分として扱う（他の箇所と同様）
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  
  // 24:00の場合は1440分として扱う
  if (hours === 24 && minutes === 0) {
    return 1440;
  }
  
  return hours * 60 + minutes;
}

/**
 * 複数シフト一括申請関数（新しいシステム対応）
 * 
 * リクエスト:
 * - shifts: シフトデータの配列
 *   - date: シフト日付 (YYYY-MM-DD)
 *   - start: 開始時刻 (HH:MM)
 *   - end: 終了時刻 (HH:MM)
 * 
 * レスポンス:
 * - success: 成功フラグ
 * - requestIds: 作成された申請のID配列
 * - error: エラーメッセージ
 * 
 * 動作:
 * - shiftRequestsコレクションに申請を保存
 * - shifts/{yearMonth}/days/{dateKey}.pendingRequestCount を増加
 */
export const createMultipleShifts = onCall(
  async (request): Promise<CreateMultipleShiftsResponse> => {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const staffId = request.auth.uid; // LINE User ID
    const { shifts }: CreateMultipleShiftsRequest = request.data;

    // 入力バリデーション
    if (!shifts || !Array.isArray(shifts) || shifts.length === 0) {
      throw new HttpsError("invalid-argument", "シフトデータが正しく入力されていません。");
    }

    if (shifts.length > 31) {
      throw new HttpsError("invalid-argument", "一度に申請できるシフトは31日分までです。");
    }

    try {
      const config = await getStoreConfig();
      const schedulingStartDay = config.shift?.schedulingStartDay ?? DEFAULT_SHIFT_SCHEDULING_START_DAY;

      // スタッフ存在確認
      await assertStaffExists(staffId);

      // スタッフ情報を取得
      const staffDoc = await db.collection("staffs").doc(staffId).get();
      if (!staffDoc.exists) {
        throw new HttpsError("not-found", "スタッフ情報が見つかりません。");
      }

      const staffData = staffDoc.data()!;
      const staffName = staffData.fullName || staffData.fullNameKana || staffData.name || "不明";

      // 次月制約（JST基準）
      // JSTの現在時刻を取得して次月を計算
      const now = new Date();
      // JST = UTC + 9時間
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      // JST基準で次月の1日を文字列として作成（YYYY-MM-DD形式）
      let nextMonthYear = jstNow.getUTCFullYear();
      let nextMonthMonth = jstNow.getUTCMonth() + 1; // getUTCMonth()は0-11、+1で1-12
      if (nextMonthMonth > 12) {
        nextMonthMonth = 1;
        nextMonthYear++;
      }
      // nextMonthMonthは1-12の範囲なので、そのまま使用
      const nextMonthDateStr = `${nextMonthYear}-${String(nextMonthMonth).padStart(2, "0")}-01`;
      // JST時刻としてDateオブジェクトを作成
      const nextMonth = new Date(nextMonthDateStr + "T00:00:00+09:00");

      // 各シフトの妥当性チェックと変換
      const validatedRequests: Array<{
        dateKey: string;
        yearMonth: string;
        startMinute: number;
        endMinute: number;
      }> = [];

      for (const shift of shifts) {
        const { date, start, end } = shift;

        if (!date || !start || !end) {
          throw new HttpsError("invalid-argument", "すべてのシフトに日付、開始時刻、終了時刻が必要です。");
        }

        // 日付形式チェック
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          throw new HttpsError("invalid-argument", `日付形式が不正です: ${date}`);
        }

        // ②期間（シフトを組む期間）チェック
        const yearMonth = getYearMonthFromDateKey(date);
        const isInSchedulingPeriod = isInShiftSchedulingPeriod(date, schedulingStartDay);
        
        if (isInSchedulingPeriod) {
          // ②期間中: 管理者が不足日・不足時間を送信したかどうかを確認
          const notificationSent = await isInsufficientDaysNotificationSent(yearMonth);
          
          if (!notificationSent) {
            // 送信されていない場合: 提出・修正不可
            throw new HttpsError(
              "failed-precondition",
              `日付 ${date}: 現在はシフトを組む期間のため、提出・修正はできません。`
            );
          }
          
          // 送信済みの場合: 不足日・不足時間のみ提出可能
          const isInsufficient = await isInsufficientDayOrTimeSlot(date);
          if (!isInsufficient) {
            throw new HttpsError(
              "failed-precondition",
              `日付 ${date}: 不足日・不足時間のみ申請可能です。`
            );
          }
        }

        // 時刻を分に変換
        const startMinute = timeToMinutes(start);
        const endMinute = timeToMinutes(end);

        // 60分刻み検証
        assertHourStep(startMinute);
        assertHourStep(endMinute);

        // start < end 検証
        if (startMinute >= endMinute) {
          throw new HttpsError("invalid-argument", `日付 ${date}: 開始時刻は終了時刻より前である必要があります。`);
        }

        // 日付の妥当性チェック（次月以降のみ）
        const requestDate = new Date(date + "T00:00:00+09:00"); // JST
        if (requestDate < nextMonth) {
          throw new HttpsError("failed-precondition", `日付 ${date}: 次月分のシフトのみ申請可能です。`);
        }

        // 営業時間を取得
        const dayDoc = await db
          .collection("shifts")
          .doc(yearMonth)
          .collection("days")
          .doc(date)
          .get();

        if (!dayDoc.exists) {
          throw new HttpsError(
            "failed-precondition",
            `日付 ${date} のシフト日が初期化されていません。管理者が initShiftDaysForMonth を実行してください。`
          );
        }

        const dayData = dayDoc.data()!;
        const businessHours = dayData.businessHours as {
          openMinute: number;
          closeMinute: number;
          isClosed: boolean;
        };

        if (businessHours.isClosed) {
          throw new HttpsError("failed-precondition", `日付 ${date} は休業日です。`);
        }

        // 営業時間内制約
        // 終了時刻が1440分（24:00）の場合は、closeMinuteが1440以上であれば許可
        const isEndTime24 = endMinute === 1440;
        const isCloseTime24 = businessHours.closeMinute >= 1440;
        
        if (startMinute < businessHours.openMinute) {
          throw new HttpsError(
            "failed-precondition",
            `日付 ${date}: 開始時刻が営業時間外です（営業開始: ${businessHours.openMinute}分）`
          );
        }
        
        if (isEndTime24 && !isCloseTime24) {
          throw new HttpsError(
            "failed-precondition",
            `日付 ${date}: 終了時刻24:00は営業時間外です（営業終了: ${businessHours.closeMinute}分）`
          );
        }
        
        if (!isEndTime24 && endMinute > businessHours.closeMinute) {
          throw new HttpsError(
            "failed-precondition",
            `日付 ${date}: 終了時刻が営業時間外です（営業終了: ${businessHours.closeMinute}分）`
          );
        }

        validatedRequests.push({
          dateKey: date,
          yearMonth,
          startMinute,
          endMinute,
        });
      }

      // トランザクションで申請作成 + pendingRequestCount 増加
      const requestIds: string[] = [];
      const dayUpdates = new Map<string, number>(); // yearMonth_dateKey -> count increment

      // 日付ごとの申請数を集計
      for (const req of validatedRequests) {
        const dayKey = `${req.yearMonth}_${req.dateKey}`;
        const currentCount = dayUpdates.get(dayKey) || 0;
        dayUpdates.set(dayKey, currentCount + 1);
      }

      // 必要な日付の参照を準備
      const dayRefs = new Map<string, admin.firestore.DocumentReference>();
      for (const [dayKey] of dayUpdates.entries()) {
        const [yearMonth, dateKey] = dayKey.split("_");
        const dayRef = db.collection("shifts").doc(yearMonth).collection("days").doc(dateKey);
        dayRefs.set(dayKey, dayRef);
      }

      // 申請参照を準備（重複チェック用）
      const requestRefs = new Map<string, admin.firestore.DocumentReference>();
      const dateKeys = validatedRequests.map(r => r.dateKey);
      const uniqueDateKeys = [...new Set(dateKeys)];
      for (const dateKey of uniqueDateKeys) {
        const requestId = `${staffId}_${dateKey}`;
        const requestRef = db.collection("shiftRequests").doc(requestId);
        requestRefs.set(dateKey, requestRef);
      }

      await db.runTransaction(async (transaction) => {
        // まず、すべての読み取りを実行（トランザクション内で最新の値を取得）
        
        // 1. 既存の申請をチェック（提出期間中は上書き可能、期間②以降はエラー）
        const requestsToUpdate = new Set<string>();
        const requestsToCreate = new Set<string>();
        
        for (const dateKey of uniqueDateKeys) {
          const requestRef = requestRefs.get(dateKey)!;
          const existingRequest = await transaction.get(requestRef);
          
          if (existingRequest.exists) {
            // 既存の申請がある場合
            // 提出期間中（期間①）の場合は上書き可能、期間②以降はエラー
            const isInSchedulingPeriod = isInShiftSchedulingPeriod(dateKey, schedulingStartDay);
            
            if (isInSchedulingPeriod) {
              // 期間②以降: 既存の申請がある場合はエラー
              throw new HttpsError("already-exists", `日付 ${dateKey} には既に申請があります。期間②以降は修正できません。`);
            } else {
              // 提出期間中（期間①）: 既存の申請を上書き
              requestsToUpdate.add(dateKey);
            }
          } else {
            // 既存の申請がない場合: 新規作成
            requestsToCreate.add(dateKey);
          }
        }

        // 2. シフト日の存在確認とpendingRequestCount取得
        const dayCurrentCounts = new Map<string, number>();
        for (const [dayKey, dayRef] of dayRefs.entries()) {
          const daySnapshot = await transaction.get(dayRef);
          if (!daySnapshot.exists) {
            const dateKey = dayKey.split("_")[1];
            throw new HttpsError("failed-precondition", `Shift day ${dateKey} was deleted during transaction`);
          }
          dayCurrentCounts.set(dayKey, (daySnapshot.data()!.pendingRequestCount as number) || 0);
        }

        // 3. 申請作成または更新（書き込み）
        for (const req of validatedRequests) {
          const requestId = `${staffId}_${req.dateKey}`;
          requestIds.push(requestId);

          const requestRef = db.collection("shiftRequests").doc(requestId);
          
          if (requestsToUpdate.has(req.dateKey)) {
            // 既存の申請を更新（提出期間中のみ）
            transaction.update(requestRef, {
              startMinute: req.startMinute,
              endMinute: req.endMinute,
              originalStartMinute: req.startMinute,
              originalEndMinute: req.endMinute,
              status: "pending", // 更新時もpendingに戻す
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            // 新規申請を作成
            transaction.set(requestRef, {
              requestId,
              staffId,
              staffName,
              yearMonth: req.yearMonth,
              dateKey: req.dateKey,
              startMinute: req.startMinute,
              endMinute: req.endMinute,
              originalStartMinute: req.startMinute,
              originalEndMinute: req.endMinute,
              status: "pending",
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }

        // 4. 各日付のpendingRequestCountを更新（書き込み）
        // 既存の申請を更新する場合はpendingRequestCountは変更しない（既にカウントされているため）
        // 新規作成する場合のみpendingRequestCountを増やす
        for (const [dayKey, increment] of dayUpdates.entries()) {
          const dateKey = dayKey.split("_")[1];
          // 新規作成の場合のみincrementを適用
          if (requestsToCreate.has(dateKey)) {
            const dayRef = dayRefs.get(dayKey)!;
            const currentCount = dayCurrentCounts.get(dayKey)!;
            transaction.update(dayRef, {
              pendingRequestCount: currentCount + increment,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }
      });

      return {
        success: true,
        requestIds: requestIds,
      };

    } catch (error) {
      logOpsError({
      message: '複数シフト作成エラー:',
      functionEntry: 'createMultipleShifts',
      cause: error,
    });

      if (error instanceof HttpsError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new HttpsError("internal", `シフト申請に失敗しました: ${error.message}`);
      } else {
        throw new HttpsError("internal", "シフト申請に失敗しました。");
      }
    }
  }
);
