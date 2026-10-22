import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {
  assertAdminDevice,
  getYearMonthFromDateKey,
  computeIsSufficientForDay,
  getRequiredStaffByTimeSlot,
} from "../services/helpers";

const db = admin.firestore();

interface SetSufficientOverrideRequest {
  dateKey: string; // YYYY-MM-DD
  override: "on" | "off" | null;
  installationId: string;
}


/**
 * 必要十分フラグを手動設定
 * - adminDeviceのみ
 * - shifts.sufficientOverride 更新
 * - isSufficient 更新（override!=nullならそれ優先、nullなら自動再計算）
 */
export const setSufficientOverride = onCall(
  async (request): Promise<{ success: boolean; message: string }> => {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { dateKey, override, installationId } = request.data as SetSufficientOverrideRequest;

    // バリデーション
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new HttpsError("invalid-argument", "dateKey must be in YYYY-MM-DD format");
    }

    if (override !== "on" && override !== "off" && override !== null) {
      throw new HttpsError(
        "invalid-argument",
        "override must be 'on', 'off', or null"
      );
    }

    if (!installationId) {
      throw new HttpsError("invalid-argument", "installationId is required");
    }

    // 管理者デバイス権限確認
    await assertAdminDevice(installationId, request.auth.uid);

    const yearMonth = getYearMonthFromDateKey(dateKey);

    // トランザクションで更新
    const requiredStaffConfig = await getRequiredStaffByTimeSlot();

    await db.runTransaction(async (transaction) => {
      const dayDocRef = db.collection("shifts").doc(yearMonth).collection("days").doc(dateKey);
      const dayDoc = await transaction.get(dayDocRef);

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
        styleId?: string | null;
      };

      let isSufficient: boolean;

      if (override === "on") {
        isSufficient = true;
      } else if (override === "off") {
        isSufficient = false;
      } else {
        // override == null: 自動再計算
        const assignments = (dayData.assignments as Array<{
          startMinute: number;
          endMinute: number;
        }>) || [];

        isSufficient = computeIsSufficientForDay(
          businessHours,
          assignments,
          requiredStaffConfig
        );
      }

      transaction.update(dayDocRef, {
        sufficientOverride: override,
        isSufficient,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return {
      success: true,
      message: `Sufficient override set to ${override ?? "auto"} for ${dateKey}`,
    };
  }
);
