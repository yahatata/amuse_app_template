import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {
  assertAdminDevice,
  assertHourStep,
  getYearMonthFromDateKey,
  calculateIsSufficient,
} from "../services/helpers";

const db = admin.firestore();

interface Selection {
  requestId: string;
  startMinute: number;
  endMinute: number;
}

interface InterimConfirmRequestsRequest {
  dateKey: string; // YYYY-MM-DD
  selections: Selection[];
  installationId: string;
}

/**
 * 時間帯別の必要人数設定を取得（デフォルト値）
 * TODO: 将来的に shiftSettings コレクションから取得する
 */
async function getRequiredStaffByTimeSlot(): Promise<
  Array<{ startHour: number; endHour: number; requiredCount: number }>
> {
  // デフォルト値（GlobalConstants.requiredStaffByTimeSlot と同期）
  return [
    { startHour: 19, endHour: 22, requiredCount: 2 },
    { startHour: 10, endHour: 12, requiredCount: 3 },
  ];
}

/**
 * 申請を中間確定
 * - adminDeviceのみ
 * - selections: [{ requestId, startMinute, endMinute }]
 * - shifts dayDoc が存在しない場合は FAILED_PRECONDITION
 * - isFinalized==true は拒否
 * - request: status pending -> interim_confirmed, start/end を selections で更新（originalは維持）
 * - shifts.assignments に upsert（sourceRequestId を入れる）
 * - pendingRequestCount -N
 * - isSufficient を再計算して更新（override==null のときのみ）
 */
export const interimConfirmRequests = onCall(
  async (request): Promise<{ success: boolean; message: string; confirmedCount: number }> => {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { dateKey, selections, installationId } = request.data as InterimConfirmRequestsRequest;

    // バリデーション
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new HttpsError("invalid-argument", "dateKey must be in YYYY-MM-DD format");
    }

    if (!installationId) {
      throw new HttpsError("invalid-argument", "installationId is required");
    }

    if (!Array.isArray(selections) || selections.length === 0) {
      throw new HttpsError("invalid-argument", "selections array is required and must not be empty");
    }

    // 管理者デバイス権限確認
    await assertAdminDevice(installationId, request.auth.uid);

    const yearMonth = getYearMonthFromDateKey(dateKey);

    // shifts dayDoc を取得
    const dayDocRef = db.collection("shifts").doc(yearMonth).collection("days").doc(dateKey);
    const dayDoc = await dayDocRef.get();

    if (!dayDoc.exists) {
      throw new HttpsError(
        "failed-precondition",
        `Shift day ${dateKey} does not exist. Initialize shift days first.`
      );
    }

    const dayData = dayDoc.data()!;

    // isFinalized==true は拒否
    if (dayData.isFinalized === true) {
      throw new HttpsError("failed-precondition", `Shift day ${dateKey} is already finalized`);
    }

    const businessHours = dayData.businessHours as {
      openMinute: number;
      closeMinute: number;
      isClosed: boolean;
    };

    if (businessHours.isClosed) {
      throw new HttpsError("failed-precondition", `Date ${dateKey} is closed`);
    }

    // 60分刻み検証
    for (const selection of selections) {
      assertHourStep(selection.startMinute);
      assertHourStep(selection.endMinute);

      if (selection.startMinute >= selection.endMinute) {
        throw new HttpsError(
          "invalid-argument",
          `Invalid time slot: startMinute (${selection.startMinute}) must be less than endMinute (${selection.endMinute})`
        );
      }

      // 営業時間内制約
      // 終了時刻が1440分（24:00）の場合は、closeMinuteが1440以上であれば許可
      const isEndTime24 = selection.endMinute === 1440;
      const isCloseTime24 = businessHours.closeMinute >= 1440;
      
      if (selection.startMinute < businessHours.openMinute) {
        throw new HttpsError(
          "failed-precondition",
          `Time slot start (${selection.startMinute}) is outside business hours (open: ${businessHours.openMinute})`
        );
      }
      
      if (isEndTime24 && !isCloseTime24) {
        throw new HttpsError(
          "failed-precondition",
          `Time slot end 24:00 (1440) is outside business hours (close: ${businessHours.closeMinute})`
        );
      }
      
      if (!isEndTime24 && selection.endMinute > businessHours.closeMinute) {
        throw new HttpsError(
          "failed-precondition",
          `Time slot end (${selection.endMinute}) is outside business hours (close: ${businessHours.closeMinute})`
        );
      }
    }

    // 申請を取得して更新
    const requestUpdates: Array<{ requestId: string; startMinute: number; endMinute: number }> = [];
    const requestIds = selections.map((s) => s.requestId);

    for (const requestId of requestIds) {
      const requestDoc = await db.collection("shiftRequests").doc(requestId).get();

      if (!requestDoc.exists) {
        throw new HttpsError("not-found", `Shift request ${requestId} not found`);
      }

      const requestData = requestDoc.data()!;

      if (requestData.status !== "pending") {
        throw new HttpsError(
          "failed-precondition",
          `Shift request ${requestId} is not pending (status: ${requestData.status})`
        );
      }

      if (requestData.dateKey !== dateKey) {
        throw new HttpsError(
          "invalid-argument",
          `Shift request ${requestId} does not match dateKey ${dateKey}`
        );
      }

      const selection = selections.find((s) => s.requestId === requestId);
      if (!selection) {
        throw new HttpsError("invalid-argument", `Selection not found for requestId ${requestId}`);
      }

      requestUpdates.push({
        requestId,
        startMinute: selection.startMinute,
        endMinute: selection.endMinute,
      });
    }

    // トランザクションで更新
    const requiredStaffByTimeSlot = await getRequiredStaffByTimeSlot();
    let confirmedCount = 0;

    await db.runTransaction(async (transaction) => {
      // すべての読み取りを先に実行
      // 1. すべての申請ドキュメントを読み取る
      const requestSnapshots = await Promise.all(
        requestUpdates.map((update) =>
          transaction.get(db.collection("shiftRequests").doc(update.requestId))
        )
      );

      // 2. 日ドキュメントを読み取る
      const daySnapshot = await transaction.get(dayDocRef);
      if (!daySnapshot.exists) {
        throw new HttpsError("failed-precondition", "Shift day was deleted during transaction");
      }

      // バリデーションとデータ準備
      const requestDataMap = new Map<string, any>();
      const assignments: Array<{
        staffId: string;
        staffName: string;
        startMinute: number;
        endMinute: number;
        sourceRequestId: string;
      }> = [];

      for (let i = 0; i < requestSnapshots.length; i++) {
        const requestSnapshot = requestSnapshots[i];
        const update = requestUpdates[i];

        if (!requestSnapshot.exists) {
          throw new HttpsError("not-found", `Shift request ${update.requestId} not found`);
        }

        const requestData = requestSnapshot.data()!;
        requestDataMap.set(update.requestId, requestData);

        // 申請データのバリデーション
        if (requestData.status !== "pending") {
          throw new HttpsError(
            "failed-precondition",
            `Shift request ${update.requestId} is not pending (status: ${requestData.status})`
          );
        }

        if (requestData.dateKey !== dateKey) {
          throw new HttpsError(
            "invalid-argument",
            `Shift request ${update.requestId} does not match dateKey ${dateKey}`
          );
        }

        // assignmentsに追加するデータを準備
        assignments.push({
          staffId: requestData.staffId as string,
          staffName: requestData.staffName as string,
          startMinute: update.startMinute,
          endMinute: update.endMinute,
          sourceRequestId: update.requestId,
        });
      }

      // 既存のassignmentsを取得
      const currentAssignments = (daySnapshot.data()!.assignments as Array<{
        staffId: string;
        staffName: string;
        startMinute: number;
        endMinute: number;
        sourceRequestId?: string;
      }>) || [];

      // 既存の割当を削除（同じsourceRequestIdがあれば）
      const sourceRequestIds = new Set(requestUpdates.map((u) => u.requestId));
      const filteredAssignments = currentAssignments.filter(
        (a) => !a.sourceRequestId || !sourceRequestIds.has(a.sourceRequestId)
      );

      // 新しい割当を追加
      filteredAssignments.push(...assignments);

      // すべての書き込みを実行
      // 1. 申請ドキュメントを更新
      for (const update of requestUpdates) {
        const requestRef = db.collection("shiftRequests").doc(update.requestId);
        transaction.update(requestRef, {
          status: "interim_confirmed",
          startMinute: update.startMinute,
          endMinute: update.endMinute,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        confirmedCount++;
      }

      // 2. 日ドキュメントを更新（assignments と pendingRequestCount）
      const finalDayData = daySnapshot.data()!;
      const sufficientOverride = finalDayData.sufficientOverride;

      // isSufficient を再計算（override==null のときのみ）
      let isSufficient: boolean | undefined;
      if (sufficientOverride === null) {
        isSufficient = calculateIsSufficient(
          businessHours.openMinute,
          businessHours.closeMinute,
          filteredAssignments,
          requiredStaffByTimeSlot
        );
      }

      const updateData: any = {
        assignments: filteredAssignments,
        pendingRequestCount: admin.firestore.FieldValue.increment(-requestUpdates.length),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (isSufficient !== undefined) {
        updateData.isSufficient = isSufficient;
      }

      transaction.update(dayDocRef, updateData);
    });

    return {
      success: true,
      message: `${confirmedCount} shift request(s) confirmed`,
      confirmedCount,
    };
  }
);
