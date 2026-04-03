import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import {
  getCallerDeviceByUid,
  hasRequiredOption,
  isActive,
} from "../../../shared/devices";
import { calcBusinessDate } from "../../bills/repos/calcBusinessDate";
import { computeRegEndAt } from "../services/enqueueTournamentTasksCore";

const updateScheduledTournamentStartAtSchema = z.object({
  tournamentId: z.string().min(1, "tournamentId is required"),
  startAt: z
    .string()
    .min(1, "startAt is required")
    .refine((val) => !Number.isNaN(new Date(val).getTime()), "startAt must be valid ISO datetime"),
  selectedBusinessDateKey: z.string().optional(),
});

export const updateScheduledTournamentStartAt = onCall(async (request) => {
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

  const { tournamentId, startAt, selectedBusinessDateKey } =
    updateScheduledTournamentStartAtSchema.parse(request.data);

  const db = getFirestore();
  const tournamentRef = db.collection("scheduledTournaments").doc(tournamentId);
  const snap = await tournamentRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "対象トーナメントが見つかりません");
  }

  const data = snap.data()!;
  const status = data.status ?? "scheduled";
  if (status !== "scheduled") {
    throw new HttpsError(
      "failed-precondition",
      `scheduled のみ開始時刻を編集できます (status=${status})`
    );
  }
  if (data.isArchived === true) {
    throw new HttpsError(
      "failed-precondition",
      "アーカイブ済みトーナメントは操作できません"
    );
  }

  const startAtDate = new Date(startAt);
  const businessDateResult = await calcBusinessDate(startAtDate);
  let businessDate: string;
  if (typeof businessDateResult === "string") {
    // Legacy compatibility for tests/helpers that still return plain date keys.
    businessDate = businessDateResult;
  } else if (businessDateResult.status === "NONE") {
    throw new HttpsError(
      "failed-precondition",
      `The start time ${startAt} does not belong to any business day.`
    );
  } else if (businessDateResult.status === "AMBIGUOUS") {
    if (
      !selectedBusinessDateKey ||
      !businessDateResult.candidates.includes(selectedBusinessDateKey)
    ) {
      throw new HttpsError(
        "failed-precondition",
        `The start time ${startAt} is ambiguous. Please select from: ${businessDateResult.candidates.join(", ")}`,
        { candidates: businessDateResult.candidates }
      );
    }
    businessDate = selectedBusinessDateKey;
  } else if (businessDateResult.businessDateKey) {
    businessDate = businessDateResult.businessDateKey;
  } else {
    throw new HttpsError("internal", "calcBusinessDate returned OK without businessDateKey");
  }

  const snapshot = data.snapshot || {};
  const blindStructureId = snapshot.blindStructure || snapshot.blindStructureId;
  const computedRegEndAt = await computeRegEndAt(db, startAtDate, blindStructureId);
  const regEndAtDate = computedRegEndAt ?? startAtDate;

  const now = Timestamp.now();
  await tournamentRef.update({
    startAt: Timestamp.fromDate(startAtDate),
    regEndAt: Timestamp.fromDate(regEndAtDate),
    businessDate,
    schedulePlanVersion: FieldValue.increment(1),
    schedulePlanUpdatedAt: now,
    taskSyncNeeded: true,
    taskSyncReason: ["startAtChangedByCalendarEdit"],
    updatedAt: now,
  });

  return {
    success: true,
    tournamentId,
    businessDate,
    startAt: startAtDate.toISOString(),
    regEndAt: regEndAtDate.toISOString(),
    message: "開始時刻を更新しました",
  };
});
