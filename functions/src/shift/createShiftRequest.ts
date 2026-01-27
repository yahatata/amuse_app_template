import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { assertStaffExists, assertHourStep, getYearMonthFromDateKey, isInShiftSchedulingPeriod, isInsufficientDaysNotificationSent, isInsufficientDayOrTimeSlot } from "./helpers";

const db = admin.firestore();

interface CreateShiftRequestRequest {
  dateKey: string; // YYYY-MM-DD
  startMinute: number;
  endMinute: number;
}

/**
 * シフト申請を作成
 * - staffのみ（auth必須）
 * - 次月制約（JST基準で検証）
 * - 営業時間内制約
 * - 60分刻み検証、start<end
 * - requestId = "{uid}_{dateKey}" のdocを create（存在なら ALREADY_EXISTS）
 * - 成功で shifts/{YYYY-MM}/days/{dateKey}.pendingRequestCount += 1
 */
export const createShiftRequest = onCall(
  async (request): Promise<{ success: boolean; requestId: string; message: string }> => {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const staffId = request.auth.uid; // LINE User ID
    const { dateKey, startMinute, endMinute } = request.data as CreateShiftRequestRequest;

    // バリデーション
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new HttpsError("invalid-argument", "dateKey must be in YYYY-MM-DD format");
    }

    if (typeof startMinute !== "number" || typeof endMinute !== "number") {
      throw new HttpsError("invalid-argument", "startMinute and endMinute must be numbers");
    }

    // スタッフ存在確認
    await assertStaffExists(staffId);

    // 60分刻み検証
    assertHourStep(startMinute);
    assertHourStep(endMinute);

    // start < end 検証
    if (startMinute >= endMinute) {
      throw new HttpsError(
        "invalid-argument",
        `startMinute (${startMinute}) must be less than endMinute (${endMinute})`
      );
    }

    // 次月制約（JST基準）
    const requestDate = new Date(dateKey + "T00:00:00+09:00"); // JST
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    if (requestDate < nextMonth) {
      throw new HttpsError(
        "failed-precondition",
        "Shift requests can only be created for next month or later"
      );
    }

    const yearMonth = getYearMonthFromDateKey(dateKey);

    // ②期間（シフトを組む期間）チェック
    const isInSchedulingPeriod = isInShiftSchedulingPeriod(dateKey);
    
    if (isInSchedulingPeriod) {
      // ②期間中: 管理者が不足日・不足時間を送信したかどうかを確認
      const notificationSent = await isInsufficientDaysNotificationSent(yearMonth);
      
      if (!notificationSent) {
        // 送信されていない場合: 提出・修正不可
        throw new HttpsError(
          "failed-precondition",
          `現在はシフトを組む期間のため、提出・修正はできません。`
        );
      }
      
      // 送信済みの場合: 不足日・不足時間のみ提出可能
      const isInsufficient = await isInsufficientDayOrTimeSlot(dateKey);
      if (!isInsufficient) {
        throw new HttpsError(
          "failed-precondition",
          `不足日・不足時間のみ申請可能です。`
        );
      }
    }

    // 営業時間を取得
    const dayDoc = await db
      .collection("shifts")
      .doc(yearMonth)
      .collection("days")
      .doc(dateKey)
      .get();

    if (!dayDoc.exists) {
      throw new HttpsError(
        "failed-precondition",
        `Shift day ${dateKey} does not exist. Initialize shift days first.`
      );
    }

    const dayData = dayDoc.data()!;
    const businessHours = dayData.businessHours as {
      openMinute: number;
      closeMinute: number;
      isClosed: boolean;
    };

    if (businessHours.isClosed) {
      throw new HttpsError("failed-precondition", `Date ${dateKey} is closed`);
    }

    // 営業時間内制約
    // 終了時刻が1440分（24:00）の場合は、closeMinuteが1440以上であれば許可
    const isEndTime24 = endMinute === 1440;
    const isCloseTime24 = businessHours.closeMinute >= 1440;
    
    if (startMinute < businessHours.openMinute) {
      throw new HttpsError(
        "failed-precondition",
        `Time slot start (${startMinute}) is outside business hours (open: ${businessHours.openMinute})`
      );
    }
    
    if (isEndTime24 && !isCloseTime24) {
      throw new HttpsError(
        "failed-precondition",
        `Time slot end 24:00 (1440) is outside business hours (close: ${businessHours.closeMinute})`
      );
    }
    
    if (!isEndTime24 && endMinute > businessHours.closeMinute) {
      throw new HttpsError(
        "failed-precondition",
        `Time slot end (${endMinute}) is outside business hours (close: ${businessHours.closeMinute})`
      );
    }

    // スタッフ情報を取得
    const staffDoc = await db.collection("staffs").doc(staffId).get();
    if (!staffDoc.exists) {
      throw new HttpsError("permission-denied", "Staff document not found");
    }

    const staffData = staffDoc.data()!;
    const staffName = staffData.fullName || staffData.fullNameKana || staffData.StaffName || "Unknown";

    // requestId = "{uid}_{dateKey}"
    const requestId = `${staffId}_${dateKey}`;

    // 重複チェック
    const existingRequest = await db.collection("shiftRequests").doc(requestId).get();
    if (existingRequest.exists) {
      throw new HttpsError("already-exists", "Shift request already exists for this date");
    }

    // トランザクションで申請作成 + pendingRequestCount 増加
    await db.runTransaction(async (transaction) => {
      // 申請作成
      const requestRef = db.collection("shiftRequests").doc(requestId);
      transaction.set(requestRef, {
        requestId,
        staffId,
        staffName,
        yearMonth,
        dateKey,
        startMinute,
        endMinute,
        originalStartMinute: startMinute,
        originalEndMinute: endMinute,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // pendingRequestCount 増加
      const dayRef = db.collection("shifts").doc(yearMonth).collection("days").doc(dateKey);
      const daySnapshot = await transaction.get(dayRef);
      if (!daySnapshot.exists) {
        throw new HttpsError("failed-precondition", "Shift day was deleted during transaction");
      }

      const currentCount = (daySnapshot.data()!.pendingRequestCount as number) || 0;
      transaction.update(dayRef, {
        pendingRequestCount: currentCount + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return {
      success: true,
      requestId,
      message: "Shift request created successfully",
    };
  }
);
