import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { assertAdminDevice } from "../services/helpers";
import { syncBusinessHoursToShifts } from "../../../shared/businessHours/services/businessHoursCore";

const db = admin.firestore();

interface InitShiftDaysForMonthRequest {
  yearMonth: string; // YYYY-MM
  installationId: string;
}

/**
 * シフト日を月単位で初期化
 * - businessHoursMonthlyMap を参照し shifts/{YYYY-MM}/days/{YYYY-MM-DD} を月全日作成（空日含む）
 * - 既存がある場合は businessHours のみ更新（assignments等を破壊しない）
 */
export const initShiftDaysForMonth = onCall(
  async (request): Promise<{ success: boolean; message: string; createdCount: number; updatedCount: number }> => {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { yearMonth, installationId } = request.data as InitShiftDaysForMonthRequest;

    // バリデーション
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      throw new HttpsError("invalid-argument", "yearMonth must be in YYYY-MM format");
    }

    if (!installationId) {
      throw new HttpsError("invalid-argument", "installationId is required");
    }

    // 管理者デバイス権限確認
    await assertAdminDevice(installationId, request.auth.uid);

    // 共通ロジックを使用してshiftsに営業時間を同期
    // ⚠️ 重要: syncBusinessHoursToShifts は businessHours のみ更新し、シフト運用データは破壊しない
    const batch = await syncBusinessHoursToShifts(db, yearMonth);
    
    // 作成数・更新数をカウントするため、実際のバッチ操作前にドキュメントを確認
    const mapDoc = await db.collection("businessHoursMonthlyMap").doc(yearMonth).get();
    if (!mapDoc.exists) {
      throw new HttpsError(
        "failed-precondition",
        `Business hours for ${yearMonth} must be initialized first. Call initBusinessHoursForMonth first.`
      );
    }
    
    const [year, month] = yearMonth.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    // 既存ドキュメントの数を事前に確認（カウント用）
    const dayDocRefs = Array.from({ length: daysInMonth }, (_, i) => {
      const dayStr = (i + 1).toString().padStart(2, "0");
      const dateKey = `${yearMonth}-${dayStr}`;
      return db.collection("shifts").doc(yearMonth).collection("days").doc(dateKey);
    });
    const existingDocs = await db.getAll(...dayDocRefs);
    
    let createdCount = 0;
    let updatedCount = 0;
    for (const doc of existingDocs) {
      if (doc.exists) {
        updatedCount++;
      } else {
        createdCount++;
      }
    }
    
    await batch.commit();

    return {
      success: true,
      message: `Shift days initialized for ${yearMonth}`,
      createdCount,
      updatedCount,
    };
  }
);
