import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { assertAdminDevice, assertHourStep, getYearMonthFromDateKey } from "./helpers";

const db = admin.firestore();

interface TimeSlot {
  startMinute: number;
  endMinute: number;
}

interface RecruitmentItem {
  dateKey: string; // YYYY-MM-DD
  timeSlots: TimeSlot[];
}

interface CreateRecruitmentsRequest {
  yearMonth: string; // YYYY-MM
  items: RecruitmentItem[];
  installationId: string;
}

/**
 * 募集時間帯を作成
 * - adminDeviceのみ
 * - items: [{ dateKey, timeSlots:[{startMinute,endMinute}...] }]
 * - 検証：
 *   - shifts/day が存在
 *   - isClosed==false
 *   - isFinalized==false
 *   - timeSlots は1時間刻み、start<end、営業時間内
 *   - timeSlots は同一日内で重複/交差禁止
 * - shiftRecruitments/{YYYY-MM}/days/{dateKey} を upsert
 */
export const createRecruitments = onCall(
  async (request): Promise<{ success: boolean; message: string; createdCount: number }> => {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { yearMonth, items, installationId } = request.data as CreateRecruitmentsRequest;

    // バリデーション
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      throw new HttpsError("invalid-argument", "yearMonth must be in YYYY-MM format");
    }

    if (!installationId) {
      throw new HttpsError("invalid-argument", "installationId is required");
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new HttpsError("invalid-argument", "items array is required and must not be empty");
    }

    // 管理者デバイス権限確認
    await assertAdminDevice(installationId, request.auth.uid);

    // デバイス情報を取得（createdByDeviceId用）
    const deviceDoc = await db
      .collection("devices")
      .where("installationId", "==", installationId)
      .limit(1)
      .get();

    if (deviceDoc.empty) {
      throw new HttpsError("permission-denied", "Device not found");
    }

    const deviceId = deviceDoc.docs[0].id;

    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();
    let createdCount = 0;

    // 各アイテムを検証・作成
    for (const item of items) {
      const { dateKey, timeSlots } = item;

      // dateKeyのバリデーション
      if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        throw new HttpsError("invalid-argument", `Invalid dateKey: ${dateKey}`);
      }

      // yearMonthとdateKeyの整合性チェック
      const itemYearMonth = getYearMonthFromDateKey(dateKey);
      if (itemYearMonth !== yearMonth) {
        throw new HttpsError(
          "invalid-argument",
          `dateKey ${dateKey} does not match yearMonth ${yearMonth}`
        );
      }

      // shifts/day の存在確認
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

      // isClosed==false チェック
      if (businessHours.isClosed) {
        throw new HttpsError("failed-precondition", `Date ${dateKey} is closed`);
      }

      // isFinalized==false チェック
      if (dayData.isFinalized === true) {
        throw new HttpsError("failed-precondition", `Date ${dateKey} is already finalized`);
      }

      // timeSlots のバリデーション
      if (!Array.isArray(timeSlots) || timeSlots.length === 0) {
        throw new HttpsError("invalid-argument", `timeSlots for ${dateKey} must be a non-empty array`);
      }

      // 1時間刻み、start<end、営業時間内、重複/交差チェック
      const validatedSlots: TimeSlot[] = [];

      for (const slot of timeSlots) {
        // 1時間刻み検証
        assertHourStep(slot.startMinute);
        assertHourStep(slot.endMinute);

        // start<end 検証
        if (slot.startMinute >= slot.endMinute) {
          throw new HttpsError(
            "invalid-argument",
            `Invalid time slot: startMinute (${slot.startMinute}) must be less than endMinute (${slot.endMinute})`
          );
        }

        // 営業時間内制約
        // 終了時刻が1440分（24:00）の場合は、closeMinuteが1440以上であれば許可
        const isEndTime24 = slot.endMinute === 1440;
        const isCloseTime24 = businessHours.closeMinute >= 1440;
        
        if (slot.startMinute < businessHours.openMinute) {
          throw new HttpsError(
            "failed-precondition",
            `Time slot start (${slot.startMinute}) is outside business hours (open: ${businessHours.openMinute})`
          );
        }
        
        if (isEndTime24 && !isCloseTime24) {
          throw new HttpsError(
            "failed-precondition",
            `Time slot end 24:00 (1440) is outside business hours (close: ${businessHours.closeMinute})`
          );
        }
        
        if (!isEndTime24 && slot.endMinute > businessHours.closeMinute) {
          throw new HttpsError(
            "failed-precondition",
            `Time slot end (${slot.endMinute}) is outside business hours (close: ${businessHours.closeMinute})`
          );
        }

        // 重複/交差チェック（既に追加されたスロットと比較）
        for (const existingSlot of validatedSlots) {
          // 重複: 完全一致
          if (
            existingSlot.startMinute === slot.startMinute &&
            existingSlot.endMinute === slot.endMinute
          ) {
            throw new HttpsError(
              "invalid-argument",
              `Duplicate time slot: ${slot.startMinute}-${slot.endMinute}`
            );
          }

          // 交差: 重なりがある
          if (
            (slot.startMinute < existingSlot.endMinute && slot.endMinute > existingSlot.startMinute)
          ) {
            throw new HttpsError(
              "invalid-argument",
              `Overlapping time slots: ${slot.startMinute}-${slot.endMinute} overlaps with ${existingSlot.startMinute}-${existingSlot.endMinute}`
            );
          }
        }

        validatedSlots.push(slot);
      }

      // shiftRecruitments/{YYYY-MM}/days/{dateKey} を upsert
      const recruitmentRef = db
        .collection("shiftRecruitments")
        .doc(yearMonth)
        .collection("days")
        .doc(dateKey);

      batch.set(
        recruitmentRef,
        {
          yearMonth,
          dateKey,
          timeSlots: validatedSlots,
          createdByDeviceId: deviceId,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      createdCount++;
    }

    await batch.commit();

    return {
      success: true,
      message: `${createdCount} recruitment(s) created`,
      createdCount,
    };
  }
);
