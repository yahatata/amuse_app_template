import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import {
  getCallerDeviceByUid,
  hasRequiredOption,
  isActive,
} from "../../../shared/devices";

const updateScheduledTournamentStatusSchema = z.object({
  tournamentId: z.string().min(1, "tournamentId is required"),
  action: z.enum(["cancel", "restore"]),
});

export const updateScheduledTournamentStatus = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "認証が必要です");
  }

  const device = await getCallerDeviceByUid(request.auth.uid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError(
      "permission-denied",
      "デバイスが見つからないか、アクティブではありません"
    );
  }

  const hasPermission =
    device.role === "admin" || hasRequiredOption(device.options, "tournament");
  if (!hasPermission) {
    throw new HttpsError(
      "permission-denied",
      "トーナメント運営の権限がありません"
    );
  }

  const { tournamentId, action } = updateScheduledTournamentStatusSchema.parse(
    request.data
  );

  const db = getFirestore();
  const tournamentRef = db.collection("scheduledTournaments").doc(tournamentId);
  const snap = await tournamentRef.get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "対象トーナメントが見つかりません");
  }

  const data = snap.data()!;
  if (data.isArchived === true) {
    throw new HttpsError(
      "failed-precondition",
      "アーカイブ済みトーナメントは操作できません"
    );
  }

  const now = Timestamp.now();
  const currentStatus = data.status ?? "scheduled";

  if (action === "cancel") {
    if (currentStatus !== "scheduled") {
      throw new HttpsError(
        "failed-precondition",
        `scheduled 以外はキャンセルできません (status=${currentStatus})`
      );
    }

    await tournamentRef.update({
      status: "cancelled",
      taskSyncNeeded: false,
      taskSyncReason: ["cancelledByCalendarEdit"],
      updatedAt: now,
    });

    return {
      success: true,
      tournamentId,
      status: "cancelled",
      message: "トーナメントをキャンセルしました",
    };
  }

  if (currentStatus !== "cancelled") {
    throw new HttpsError(
      "failed-precondition",
      `cancelled 以外は復旧できません (status=${currentStatus})`
    );
  }

  const regEndAtTs = data.regEndAt;
  const regEndAt =
    regEndAtTs && typeof regEndAtTs.toDate === "function"
      ? regEndAtTs.toDate()
      : null;
  if (!regEndAt || !(regEndAt instanceof Date) || Number.isNaN(regEndAt.getTime())) {
    throw new HttpsError(
      "failed-precondition",
      "regEndAt が不正なため復旧できません"
    );
  }
  if (new Date() >= regEndAt) {
    throw new HttpsError(
      "failed-precondition",
      "regEndAt を過ぎているため復旧できません"
    );
  }

  await tournamentRef.update({
    status: "scheduled",
    taskSyncNeeded: true,
    taskSyncReason: ["restoredFromCancelled"],
    schedulePlanVersion: FieldValue.increment(1),
    schedulePlanUpdatedAt: now,
    updatedAt: now,
  });

  return {
    success: true,
    tournamentId,
    status: "scheduled",
    message: "トーナメントを復旧しました",
  };
});
