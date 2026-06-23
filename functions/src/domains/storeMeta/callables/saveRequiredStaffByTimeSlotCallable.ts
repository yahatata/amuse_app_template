/**
 * 必要人数設定（v2 byStyle）を保存し、isSufficient を再計算
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { assertAdminDevice } from "../../shift/services/helpers";
import {
  assertEligibleMonthsDataConsistency,
  recalculateIsSufficientForEligibleDays,
} from "../../shift/services/recalculateIsSufficient";
import { validateRequiredStaffByTimeSlotV2 } from "../../../shared/businessHours/services/validateShiftSettings";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { generateJstDateKey } from "../../../shared/time/generateJstDateKey";

const db = getFirestore();

interface SaveRequiredStaffByTimeSlotRequest {
  installationId: string;
  requiredStaffByTimeSlot: Record<string, unknown>;
}

export const saveRequiredStaffByTimeSlotCallable = onCall(
  { region: "asia-northeast1" },
  async (request): Promise<{ success: boolean; message: string }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { installationId, requiredStaffByTimeSlot } =
      request.data as SaveRequiredStaffByTimeSlotRequest;

    if (!installationId) {
      throw new HttpsError("invalid-argument", "installationId is required");
    }

    try {
      await assertAdminDevice(installationId, request.auth.uid);

      const validated = validateRequiredStaffByTimeSlotV2(requiredStaffByTimeSlot);
      const todayJst = generateJstDateKey();

      await assertEligibleMonthsDataConsistency(db, todayJst);

      await db.collection("storeMeta").doc("requiredStaffByTimeSlot").set({
        version: validated.version,
        byStyle: validated.byStyle,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const updatedCount = await recalculateIsSufficientForEligibleDays(db, { todayJst });

      logOpsSuccess({
        message: "saveRequiredStaffByTimeSlotCallable 成功",
        functionEntry: "saveRequiredStaffByTimeSlotCallable",
        context: { updatedCount },
      });

      return {
        success: true,
        message: "必要人数設定を保存しました",
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logOpsError({
        message: "saveRequiredStaffByTimeSlotCallable 失敗",
        functionEntry: "saveRequiredStaffByTimeSlotCallable",
        cause: error,
      });

      throw new HttpsError(
        "internal",
        "設定の保存または不足判定の再計算に失敗しました。時間をおいて再度保存してください。"
      );
    }
  }
);
