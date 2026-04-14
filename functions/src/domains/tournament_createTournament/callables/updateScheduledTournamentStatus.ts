import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import {
  getCallerDeviceByUid,
  hasRequiredOption,
  isActive,
} from "../../../shared/devices";
import {
  FunctionCustomError,
  mapFunctionCustomErrorToHttpsCode,
} from "../../../shared/logging/functionCustomError";
import { logOpsError } from "../../../shared/logging/logOpsError";

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

  try {
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
      throw new FunctionCustomError({
        errorKey: "TOURNAMENT_INVALID_STATE",
        message: "アーカイブ済みトーナメントは操作できません",
        context: { tournamentId, op: "updateScheduledTournamentStatus" },
      });
    }

    const now = Timestamp.now();
    const currentStatus = data.status ?? "scheduled";

    if (action === "cancel") {
      if (currentStatus !== "scheduled") {
        throw new FunctionCustomError({
          errorKey: "TOURNAMENT_INVALID_STATE",
          message: `scheduled 以外はキャンセルできません (status=${currentStatus})`,
          context: { tournamentId, currentStatus, op: "updateScheduledTournamentStatus" },
        });
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
      throw new FunctionCustomError({
        errorKey: "TOURNAMENT_INVALID_STATE",
        message: `cancelled 以外は復旧できません (status=${currentStatus})`,
        context: { tournamentId, currentStatus, op: "updateScheduledTournamentStatus" },
      });
    }

    const regEndAtTs = data.regEndAt;
    const regEndAt =
      regEndAtTs && typeof regEndAtTs.toDate === "function"
        ? regEndAtTs.toDate()
        : null;
    if (!regEndAt || !(regEndAt instanceof Date) || Number.isNaN(regEndAt.getTime())) {
      throw new FunctionCustomError({
        errorKey: "TOURNAMENT_INVALID_STATE",
        message: "regEndAt が不正なため復旧できません",
        context: { tournamentId, op: "updateScheduledTournamentStatus" },
      });
    }
    if (new Date() >= regEndAt) {
      throw new FunctionCustomError({
        errorKey: "TOURNAMENT_INVALID_STATE",
        message: "regEndAt を過ぎているため復旧できません",
        context: { tournamentId, regEndAt: regEndAt.toISOString(), op: "updateScheduledTournamentStatus" },
      });
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
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new HttpsError(
        "invalid-argument",
        `入力検証エラー: ${e.errors.map((err) => err.message).join(", ")}`
      );
    }
    if (e instanceof FunctionCustomError) {
      logOpsError({
        message: "updateScheduledTournamentStatus: status transition validation failed",
        functionEntry: "updateScheduledTournamentStatus",
        operation: "validateStatusTransition",
        cause: e,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(e.errorKey), e.message);
    }
    throw e;
  }
});
