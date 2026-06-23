import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {
  assertAdminDevice,
  getYearMonthFromDateKey,
  checkAndSetAllDaysFinalized,
  getRequiredStaffByTimeSlot,
  computeIsSufficientForDay,
} from "../services/helpers";

const db = admin.firestore();

interface FinalizeDayRequest {
  dateKey: string; // YYYY-MM-DD
  installationId: string;
}

/**
 * 1日のシフトを最終確定
 * - adminDeviceのみ
 * - shifts.isFinalized=true
 * - status==interim_confirmed を final_confirmed に更新
 * - isSufficient を再計算して更新（override==null のときのみ）
 */
export const finalizeDay = onCall(
  async (request): Promise<{ success: boolean; message: string }> => {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { dateKey, installationId } = request.data as FinalizeDayRequest;

    // バリデーション
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new HttpsError("invalid-argument", "dateKey must be in YYYY-MM-DD format");
    }

    if (!installationId) {
      throw new HttpsError("invalid-argument", "installationId is required");
    }

    // 管理者デバイス権限確認
    await assertAdminDevice(installationId, request.auth.uid);

    const yearMonth = getYearMonthFromDateKey(dateKey);

    // トランザクションで最終確定
    const requiredStaffConfig = await getRequiredStaffByTimeSlot();

    await db.runTransaction(async (transaction) => {
      // shifts dayDoc を取得
      const dayDocRef = db.collection("shifts").doc(yearMonth).collection("days").doc(dateKey);
      const dayDoc = await transaction.get(dayDocRef);

      if (!dayDoc.exists) {
        throw new HttpsError(
          "failed-precondition",
          `Shift day ${dateKey} does not exist. Initialize shift days first.`
        );
      }

      const dayData = dayDoc.data()!;

      // 既に最終確定済みの場合はエラー
      if (dayData.isFinalized === true) {
        throw new HttpsError("failed-precondition", `Shift day ${dateKey} is already finalized`);
      }

      const businessHours = dayData.businessHours as {
        openMinute: number;
        closeMinute: number;
        isClosed: boolean;
        styleId?: string | null;
      } | undefined;

      // businessHoursが存在しない場合はエラー
      if (!businessHours) {
        throw new HttpsError(
          "failed-precondition",
          `Business hours for ${dateKey} is not set. Please initialize business hours first.`
        );
      }

      // status==interim_confirmed を final_confirmed に更新
      // 注意: すべての読み取りを書き込みの前に実行する必要がある
      const assignments = (dayData.assignments as Array<{ sourceRequestId?: string }>) || [];
      const requestIds = assignments
        .map((a) => a.sourceRequestId)
        .filter((id): id is string => id !== undefined);

      // すべてのshiftRequestsドキュメントを読み取る（書き込みの前）
      const requestDocs = await Promise.all(
        requestIds.map((requestId) => {
          const requestRef = db.collection("shiftRequests").doc(requestId);
          return transaction.get(requestRef);
        })
      );

      // すべての読み取りが完了した後、書き込みを実行
      // isFinalized=true に設定
      transaction.update(dayDocRef, {
        isFinalized: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // shiftRequestsのstatusを更新
      for (let i = 0; i < requestIds.length; i++) {
        const requestDoc = requestDocs[i];
        if (requestDoc.exists) {
          const requestData = requestDoc.data()!;
          if (requestData.status === "interim_confirmed") {
            const requestRef = db.collection("shiftRequests").doc(requestIds[i]);
            transaction.update(requestRef, {
              status: "final_confirmed",
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }
      }

      // isSufficient を再計算（override==null のときのみ）
      const sufficientOverride = dayData.sufficientOverride;

      if (sufficientOverride === null) {
        const finalAssignments = (dayData.assignments as Array<{
          startMinute: number;
          endMinute: number;
        }>) || [];

        // 店休日の場合はisSufficientをtrueに設定（計算不要）
        if (businessHours.isClosed || businessHours.styleId === "closed") {
          transaction.update(dayDocRef, {
            isSufficient: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          const isSufficient = computeIsSufficientForDay(
            businessHours,
            finalAssignments,
            requiredStaffConfig
          );

          transaction.update(dayDocRef, {
            isSufficient,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    });

    // 月内のすべての日が最終確定されているかをチェックし、すべて最終確定されていればallDaysFinalizedフラグを設定
    await checkAndSetAllDaysFinalized(yearMonth);

    return {
      success: true,
      message: `Shift day ${dateKey} finalized successfully`,
    };
  }
);
