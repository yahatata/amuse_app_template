import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { assertAdminDevice, calculateIsSufficient } from "../services/helpers";

const db = admin.firestore();

interface FinalizeMonthRequest {
  yearMonth: string; // YYYY-MM
  installationId: string;
  idempotencyKey?: string; // 冪等性キー（オプション）
}

/**
 * 時間帯別の必要人数設定を取得（デフォルト値）
 */
async function getRequiredStaffByTimeSlot(): Promise<
  Array<{ startHour: number; endHour: number; requiredCount: number }>
> {
  return [
    { startHour: 19, endHour: 22, requiredCount: 2 },
    { startHour: 10, endHour: 12, requiredCount: 3 },
  ];
}

/**
 * 1日を最終確定する内部関数（finalizeDayと同じロジック）
 */
async function finalizeDayInternal(
  dateKey: string,
  yearMonth: string,
  requiredStaffByTimeSlot: Array<{ startHour: number; endHour: number; requiredCount: number }>
): Promise<void> {
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

    if (dayData.isFinalized === true) {
      // 既に最終確定済みの場合はスキップ（冪等性）
      return;
    }

    const businessHours = dayData.businessHours as {
      openMinute: number;
      closeMinute: number;
      isClosed: boolean;
    } | undefined;

    // businessHoursが存在しない場合はエラー
    if (!businessHours) {
      throw new HttpsError(
        "failed-precondition",
        `Business hours for ${dateKey} is not set. Please initialize business hours first.`
      );
    }

    // 店休日の場合は最終確定をスキップ（店休日は最終確定の対象外）
    if (businessHours.isClosed === true) {
      return;
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

    const sufficientOverride = dayData.sufficientOverride;

    if (sufficientOverride === null) {
      const finalAssignments = (dayData.assignments as Array<{
        startMinute: number;
        endMinute: number;
      }>) || [];

      // 店休日の場合はisSufficientをtrueに設定（計算不要）
      if (businessHours.isClosed) {
        transaction.update(dayDocRef, {
          isSufficient: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        const isSufficient = calculateIsSufficient(
          businessHours.openMinute,
          businessHours.closeMinute,
          finalAssignments,
          requiredStaffByTimeSlot
        );

        transaction.update(dayDocRef, {
          isSufficient,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  });
}

/**
 * 月内の全日を最終確定（一括処理）
 * - adminDeviceのみ
 * - 月内の全日を finalizeDay 相当で一括（バッチ/分割、冪等）
 */
export const finalizeMonth = onCall(
  async (request): Promise<{ success: boolean; message: string; finalizedCount: number }> => {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { yearMonth, installationId } = request.data as FinalizeMonthRequest;

    // バリデーション
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      throw new HttpsError("invalid-argument", "yearMonth must be in YYYY-MM format");
    }

    if (!installationId) {
      throw new HttpsError("invalid-argument", "installationId is required");
    }

    // 管理者デバイス権限確認
    await assertAdminDevice(installationId, request.auth.uid);

    // 年月の日数を計算
    const [year, month] = yearMonth.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    const requiredStaffByTimeSlot = await getRequiredStaffByTimeSlot();
    let finalizedCount = 0;

    // 各日を順次処理（トランザクション制限を考慮）
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = day.toString().padStart(2, "0");
      const dateKey = `${yearMonth}-${dayStr}`;

      try {
        await finalizeDayInternal(dateKey, yearMonth, requiredStaffByTimeSlot);
        finalizedCount++;
      } catch (error: any) {
        // 既に最終確定済みの場合はスキップ（冪等性）
        if (error.code === "failed-precondition" && error.message?.includes("already finalized")) {
          finalizedCount++;
          continue;
        }
        // その他のエラーは再スロー
        throw error;
      }
    }

    // 月全体が最終確定されたことを示すフラグを設定
    const monthDocRef = db.collection("shifts").doc(yearMonth);
    await monthDocRef.set(
      {
        allDaysFinalized: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      success: true,
      message: `Month ${yearMonth} finalized (${finalizedCount} days)`,
      finalizedCount,
    };
  }
);
