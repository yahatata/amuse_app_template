import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {
  assertAdminDevice,
  getYearMonthFromDateKey,
  calculateIsSufficient,
  ADMIN_CREATED_SHIFT_ID,
  getRequiredStaffByTimeSlot,
} from "../services/helpers";

const db = admin.firestore();

interface Assignment {
  staffId: string;
  staffName: string;
  startMinute: number;
  endMinute: number;
  sourceRequestId?: string;
}

interface UpdateDayAssignmentsRequest {
  dateKey: string; // YYYY-MM-DD
  assignments: Assignment[];
  installationId: string;
}


/**
 * シフト日の割当を更新
 * - adminDeviceのみ
 * - shifts/{yearMonth}/days/{dateKey}.assignments を更新
 * - 同一日の同一スタッフ重複は拒否
 * - isFinalized==true の場合は通常の編集は拒否するが、管理者による新規作成（追加のみ）は許可
 * - isSufficient を再計算して更新（override==null のときのみ）
 */
export const updateDayAssignments = onCall(
  async (request): Promise<{ success: boolean; message: string }> => {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { dateKey, assignments, installationId } =
      request.data as UpdateDayAssignmentsRequest;

    // バリデーション
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new HttpsError("invalid-argument", "dateKey must be in YYYY-MM-DD format");
    }

    if (!installationId) {
      throw new HttpsError("invalid-argument", "installationId is required");
    }

    if (!Array.isArray(assignments)) {
      throw new HttpsError("invalid-argument", "assignments must be an array");
    }

    // 管理者デバイス権限確認
    await assertAdminDevice(installationId, request.auth.uid);

    const yearMonth = getYearMonthFromDateKey(dateKey);

    // バリデーション: 各割当の時刻が60分刻みかチェック
    for (const assignment of assignments) {
      if (
        !assignment.staffId ||
        !assignment.staffName ||
        typeof assignment.startMinute !== "number" ||
        typeof assignment.endMinute !== "number"
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Each assignment must have staffId, staffName, startMinute, and endMinute"
        );
      }

      if (assignment.startMinute >= assignment.endMinute) {
        throw new HttpsError(
          "invalid-argument",
          `Start time (${assignment.startMinute}) must be less than end time (${assignment.endMinute})`
        );
      }
    }

    const requiredStaffByTimeSlot = await getRequiredStaffByTimeSlot();

    await db.runTransaction(async (transaction) => {
      // shifts dayDoc を取得
      const dayDocRef = db
        .collection("shifts")
        .doc(yearMonth)
        .collection("days")
        .doc(dateKey);
      const dayDoc = await transaction.get(dayDocRef);

      if (!dayDoc.exists) {
        throw new HttpsError(
          "failed-precondition",
          `Shift day ${dateKey} does not exist. Initialize shift days first.`
        );
      }

      const dayData = dayDoc.data()!;
      const currentAssignments = (dayData.assignments as Assignment[]) || [];
      const currentStaffIds = new Set(currentAssignments.map((a) => a.staffId));

      // 同一日の同一スタッフ重複は拒否（リクエスト内で重複、または既存と重複する新規は不可）
      const requestStaffIds = assignments.map((a) => a.staffId);
      if (requestStaffIds.length !== new Set(requestStaffIds).size) {
        throw new HttpsError(
          "failed-precondition",
          "その日には既に同一スタッフのシフトが存在するため追加できません"
        );
      }
      // isFinalized==true の場合は、管理者による新規追加（admin-created のみ）以外は拒否
      if (dayData.isFinalized === true) {
        for (const a of assignments) {
          if (currentStaffIds.has(a.staffId)) continue;
          const isAdminCreated =
            a.sourceRequestId === ADMIN_CREATED_SHIFT_ID || a.sourceRequestId == null;
          if (!isAdminCreated) {
            throw new HttpsError(
              "failed-precondition",
              `Shift day ${dateKey} is already finalized and cannot be edited`
            );
          }
        }
        const existingStaffIdsInRequest = new Set(
          assignments.filter((a) => currentStaffIds.has(a.staffId)).map((a) => a.staffId)
        );
        if (existingStaffIdsInRequest.size < currentStaffIds.size) {
          throw new HttpsError(
            "failed-precondition",
            `Shift day ${dateKey} is already finalized and cannot be edited (cannot remove assignments)`
          );
        }
      }

      const businessHours = dayData.businessHours as {
        openMinute: number;
        closeMinute: number;
        isClosed: boolean;
      };

      // 営業時間内制約チェック（管理者が直接作成したシフトの場合はスキップ）
      for (const assignment of assignments) {
        // sourceRequestIdが"admin-created"またはnullの場合は営業時間チェックをスキップ
        // nullは既存データとの互換性のため（以前はnullで管理者作成を識別していた）
        if (assignment.sourceRequestId === ADMIN_CREATED_SHIFT_ID || assignment.sourceRequestId == null) {
          continue;
        }

        // 終了時刻が1440分（24:00）の場合は、closeMinuteが1440以上であれば許可
        const isEndTime24 = assignment.endMinute === 1440;
        const isCloseTime24 = businessHours.closeMinute >= 1440;
        
        if (assignment.startMinute < businessHours.openMinute) {
          throw new HttpsError(
            "failed-precondition",
            `Assignment start (${assignment.startMinute}) is outside business hours (open: ${businessHours.openMinute})`
          );
        }
        
        if (isEndTime24 && !isCloseTime24) {
          throw new HttpsError(
            "failed-precondition",
            `Assignment end 24:00 (1440) is outside business hours (close: ${businessHours.closeMinute})`
          );
        }
        
        if (!isEndTime24 && assignment.endMinute > businessHours.closeMinute) {
          throw new HttpsError(
            "failed-precondition",
            `Assignment end (${assignment.endMinute}) is outside business hours (close: ${businessHours.closeMinute})`
          );
        }
      }

      // isSufficient を再計算（override==null のときのみ）
      const sufficientOverride = dayData.sufficientOverride;
      let isSufficient: boolean | undefined;

      if (sufficientOverride === null) {
        isSufficient = calculateIsSufficient(
          businessHours.openMinute,
          businessHours.closeMinute,
          assignments,
          requiredStaffByTimeSlot
        );
      }

      // assignments を更新
      const updateData: any = {
        assignments: assignments,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (isSufficient !== undefined) {
        updateData.isSufficient = isSufficient;
      }

      transaction.update(dayDocRef, updateData);
    });

    return {
      success: true,
      message: `Assignments updated for ${dateKey}`,
    };
  }
);
