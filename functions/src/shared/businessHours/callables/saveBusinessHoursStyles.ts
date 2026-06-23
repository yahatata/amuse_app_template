/**
 * 営業スタイル設定を保存し、該当日の営業時間を反映して isSufficient を再計算
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { assertAdminDevice } from "../../../domains/shift/services/helpers";
import { recalculateIsSufficientForEligibleDays } from "../../../domains/shift/services/recalculateIsSufficient";
import { getStoreConfig } from "../../config/configLoader";
import { logOpsError, logOpsSuccess } from "../../logging/logOpsError";
import { propagateBusinessHoursStyleChange } from "../services/propagateBusinessHoursStyleChange";
import {
  buildChangedStylesMap,
  detectChangedBusinessHoursStyleIds,
  validateBusinessHoursStylesPayload,
} from "../services/validateShiftSettings";
import { assertEligibleMonthsDataConsistency } from "../../../domains/shift/services/recalculateIsSufficient";
import { generateJstDateKey } from "../../time/generateJstDateKey";

const db = getFirestore();

interface SaveBusinessHoursStylesRequest {
  installationId: string;
  businessHoursStyles: Record<string, unknown>;
}

export const saveBusinessHoursStyles = onCall(
  { region: "asia-northeast1" },
  async (request): Promise<{ success: boolean; message: string }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { installationId, businessHoursStyles } = request.data as SaveBusinessHoursStylesRequest;

    if (!installationId) {
      throw new HttpsError("invalid-argument", "installationId is required");
    }

    try {
      await assertAdminDevice(installationId, request.auth.uid);

      const validatedStyles = validateBusinessHoursStylesPayload(businessHoursStyles);
      const todayJst = generateJstDateKey();

      await assertEligibleMonthsDataConsistency(db, todayJst);

      const existingConfig = await getStoreConfig();
      const changedStyleIds = detectChangedBusinessHoursStyleIds(
        existingConfig.businessHoursStyles,
        validatedStyles
      );

      await db.collection("storeMeta").doc("config").set(
        {
          businessHoursStyles: validatedStyles,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (changedStyleIds.length > 0) {
        const changedStyles = buildChangedStylesMap(validatedStyles, changedStyleIds);
        await propagateBusinessHoursStyleChange(db, changedStyles, { todayJst });
      }

      await recalculateIsSufficientForEligibleDays(db, { todayJst });

      logOpsSuccess({
        message: "saveBusinessHoursStyles 成功",
        functionEntry: "saveBusinessHoursStyles",
        context: { changedStyleIds },
      });

      return {
        success: true,
        message: "営業スタイルを保存しました",
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logOpsError({
        message: "saveBusinessHoursStyles 失敗",
        functionEntry: "saveBusinessHoursStyles",
        cause: error,
      });

      throw new HttpsError(
        "internal",
        "設定の保存または不足判定の再計算に失敗しました。時間をおいて再度保存してください。"
      );
    }
  }
);
