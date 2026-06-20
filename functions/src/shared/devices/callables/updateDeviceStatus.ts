import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { logOpsError, logOpsSuccess } from "../../logging/logOpsError";
import {
  assertNotSelfOperation,
  requireActiveAdminCaller,
} from "../deviceAdminAuth";
import {
  DEVICE_STATUS_ACTIVE,
  DEVICE_STATUS_BLOCKED,
  isArchivedStatus,
  normalizeDeviceStatus,
} from "../deviceStatus";

const db = getFirestore();

const payloadSchema = z.object({
  deviceId: z.string().min(1),
  status: z.enum([DEVICE_STATUS_ACTIVE, DEVICE_STATUS_BLOCKED]),
});

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  [DEVICE_STATUS_ACTIVE]: [DEVICE_STATUS_BLOCKED],
  [DEVICE_STATUS_BLOCKED]: [DEVICE_STATUS_ACTIVE],
};

/**
 * 管理者用: デバイスのブロック / アクティブ復帰
 */
export const updateDeviceStatus = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { deviceId, status: nextStatus } = payloadSchema.parse(request.data);
    const callerUid = request.auth.uid;

    const caller = await requireActiveAdminCaller(db, callerUid);
    assertNotSelfOperation(caller.callerDeviceId, deviceId, "ステータス変更");

    const targetRef = db.collection("devices").doc(deviceId);
    const targetDoc = await targetRef.get();
    if (!targetDoc.exists) {
      throw new HttpsError("not-found", "対象デバイスが存在しません");
    }

    const targetData = targetDoc.data() ?? {};
    const currentStatus = normalizeDeviceStatus(
      targetData.status as string | undefined
    );

    if (isArchivedStatus(targetData.status as string | undefined)) {
      throw new HttpsError(
        "failed-precondition",
        "アーカイブ済みデバイスのステータスは変更できません"
      );
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new HttpsError(
        "invalid-argument",
        `${currentStatus} から ${nextStatus} への変更はできません`
      );
    }

    await targetRef.update({
      status: nextStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

    logOpsSuccess({
      message: "updateDeviceStatus 成功",
      functionEntry: "updateDeviceStatus",
      context: {
        targetDeviceId: deviceId,
        callerDeviceId: caller.callerDeviceId,
        callerUid,
        previousStatus: currentStatus,
        nextStatus,
      },
    });

    return {
      success: true,
      deviceId,
      status: nextStatus,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new HttpsError("invalid-argument", "入力データが無効です");
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    const parsed = payloadSchema.safeParse(request.data);
    const errContext = parsed.success
      ? {
          deviceId: parsed.data.deviceId,
          status: parsed.data.status,
          callerUid: request.auth?.uid,
        }
      : { callerUid: request.auth?.uid, inputParseFailed: true as const };

    logOpsError({
      message: "updateDeviceStatus failed",
      functionEntry: "updateDeviceStatus",
      cause: error,
      sourceProductHint: "firestore",
      context: errContext,
    });
    throw new HttpsError("internal", "デバイスステータス更新に失敗しました");
  }
});
