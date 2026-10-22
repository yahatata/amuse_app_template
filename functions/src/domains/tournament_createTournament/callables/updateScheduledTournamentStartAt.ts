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
import {
  FunctionCustomError,
  mapFunctionCustomErrorToHttpsCode,
} from "../../../shared/logging/functionCustomError";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

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

  try {
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
      throw new FunctionCustomError({
        errorKey: "TOURNAMENT_INVALID_STATE",
        message: `scheduled のみ開始時刻を編集できます (status=${status})`,
        context: { tournamentId, status, op: "updateScheduledTournamentStartAt" },
      });
    }
    if (data.isArchived === true) {
      throw new FunctionCustomError({
        errorKey: "TOURNAMENT_INVALID_STATE",
        message: "アーカイブ済みトーナメントは操作できません",
        context: { tournamentId, op: "updateScheduledTournamentStartAt" },
      });
    }

    const startAtDate = new Date(startAt);
    const businessDateResult = await calcBusinessDate(startAtDate);
    let businessDate: string;

    if (typeof businessDateResult === "string") {
      // Legacy compatibility for tests/helpers that still return plain date keys.
      businessDate = businessDateResult;
    } else if (businessDateResult.status === "NONE") {
      throw new FunctionCustomError({
        errorKey: "TOURNAMENT_SCHEDULE_NO_BUSINESS_DAY",
        message: `The start time ${startAt} does not belong to any business day.`,
        context: { startAt, tournamentId, op: "updateScheduledTournamentStartAt" },
      });
    } else if (businessDateResult.status === "AMBIGUOUS") {
      if (
        !selectedBusinessDateKey ||
        !businessDateResult.candidates.includes(selectedBusinessDateKey)
      ) {
        throw new FunctionCustomError({
          errorKey: "TOURNAMENT_SCHEDULE_AMBIGUOUS",
          message: `The start time ${startAt} is ambiguous. Please select from: ${businessDateResult.candidates.join(", ")}`,
          context: {
            candidates: businessDateResult.candidates,
            startAt,
            tournamentId,
            op: "updateScheduledTournamentStartAt",
          },
        });
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
    logOpsSuccess({
      message: 'updateScheduledTournamentStartAt 成功',
      functionEntry: 'updateScheduledTournamentStartAt',
      operation: 'validateStartAtUpdatePreconditions',
      context: {
        tournamentId,
        businessDate,
        startAt: startAtDate.toISOString(),
        regEndAt: regEndAtDate.toISOString(),
      },
    });

    return {
      success: true,
      tournamentId,
      businessDate,
      startAt: startAtDate.toISOString(),
      regEndAt: regEndAtDate.toISOString(),
      message: "開始時刻を更新しました",
    };
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new HttpsError(
        "invalid-argument",
        `入力検証エラー: ${e.errors.map((err) => err.message).join(", ")}`
      );
    }
    if (e instanceof FunctionCustomError) {
      logOpsError({
        message: "updateScheduledTournamentStartAt: business validation failed",
        functionEntry: "updateScheduledTournamentStartAt",
        operation: "validateStartAtUpdatePreconditions",
        cause: e,
        context: { errorKey: e.errorKey, ...(e.context ?? {}) },
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(e.errorKey), e.message);
    }
    throw e;
  }
});
