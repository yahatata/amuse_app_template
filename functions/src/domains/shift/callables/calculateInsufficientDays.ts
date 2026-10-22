import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { assertAdminDevice } from "../services/helpers";

const db = admin.firestore();

interface CalculateInsufficientDaysRequest {
  yearMonth: string; // YYYY-MM
  installationId: string;
}

/**
 * 不足日を集計
 * - adminDeviceのみ
 * - 条件: !isFinalized && !isClosed && isSufficient==false
 * - dateKey配列を返す
 */
export const calculateInsufficientDays = onCall(
  async (request): Promise<{ success: boolean; dateKeys: string[] }> => {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { yearMonth, installationId } = request.data as CalculateInsufficientDaysRequest;

    // バリデーション
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      throw new HttpsError("invalid-argument", "yearMonth must be in YYYY-MM format");
    }

    if (!installationId) {
      throw new HttpsError("invalid-argument", "installationId is required");
    }

    // 管理者デバイス権限確認
    await assertAdminDevice(installationId, request.auth.uid);

    // shifts/{YYYY-MM}/days を取得
    const daysSnapshot = await db
      .collection("shifts")
      .doc(yearMonth)
      .collection("days")
      .get();

    const insufficientDateKeys: string[] = [];

    for (const doc of daysSnapshot.docs) {
      const data = doc.data();
      const businessHours = data.businessHours as {
        openMinute: number;
        closeMinute: number;
        isClosed: boolean;
      };

      // 条件: !isFinalized && !isClosed && isSufficient==false
      if (
        data.isFinalized !== true &&
        businessHours.isClosed !== true &&
        data.isSufficient === false
      ) {
        insufficientDateKeys.push(data.dateKey as string);
      }
    }

    // 日付順にソート
    insufficientDateKeys.sort();

    return {
      success: true,
      dateKeys: insufficientDateKeys,
    };
  }
);
