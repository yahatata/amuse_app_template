import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { logOpsError, logOpsSuccess } from "../../logging/logOpsError";
import {
  assertNotRemovingLastActiveAdmin,
  assertNotSelfOperation,
  countActiveAdminDevicesInTx,
  isActiveAdminDevice,
  requireActiveAdminCaller,
} from "../deviceAdminAuth";
import {
  DEVICE_STATUS_ARCHIVED,
  isArchivedStatus,
  normalizeDeviceStatus,
} from "../deviceStatus";

const db = getFirestore();

const payloadSchema = z.object({
  deviceId: z.string().min(1),
});

const LAST_ADMIN_ARCHIVE_MESSAGE = "最後の管理者端末は削除できません";

/**
 * 管理者用: デバイスをアーカイブ（店舗UI上の「削除」）
 */
export const archiveDevice = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { deviceId } = payloadSchema.parse(request.data);
    const callerUid = request.auth.uid;

    const caller = await requireActiveAdminCaller(db, callerUid);
    assertNotSelfOperation(caller.callerDeviceId, deviceId, "削除");

    const targetRef = db.collection("devices").doc(deviceId);

    const result = await db.runTransaction(async (tx) => {
      const targetDoc = await tx.get(targetRef);
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
          "このデバイスは既に削除済みです"
        );
      }

      if (isActiveAdminDevice(targetData)) {
        const activeAdminCount = await countActiveAdminDevicesInTx(db, tx);
        assertNotRemovingLastActiveAdmin(
          targetData,
          activeAdminCount,
          LAST_ADMIN_ARCHIVE_MESSAGE
        );
      }

      const currentUid =
        typeof targetData.uid === "string" && targetData.uid.length > 0
          ? targetData.uid
          : undefined;

      const updateData: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
        status: DEVICE_STATUS_ARCHIVED,
        archivedAt: FieldValue.serverTimestamp(),
        archivedBy: caller.callerDeviceId,
        updatedAt: FieldValue.serverTimestamp(),
        options: {},
        optionParams: {},
        uid: FieldValue.delete(),
      };

      if (currentUid) {
        updateData.previousUid = currentUid;
      }

      tx.update(targetRef, updateData);

      return {
        currentStatus,
        previousUid: currentUid ?? null,
      };
    });

    logOpsSuccess({
      message: "archiveDevice 成功",
      functionEntry: "archiveDevice",
      context: {
        targetDeviceId: deviceId,
        callerDeviceId: caller.callerDeviceId,
        callerUid,
        previousStatus: result.currentStatus,
        previousUid: result.previousUid,
      },
    });

    return {
      success: true,
      deviceId,
      status: DEVICE_STATUS_ARCHIVED,
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
      ? { deviceId: parsed.data.deviceId, callerUid: request.auth?.uid }
      : { callerUid: request.auth?.uid, inputParseFailed: true as const };

    logOpsError({
      message: "archiveDevice failed",
      functionEntry: "archiveDevice",
      cause: error,
      sourceProductHint: "firestore",
      context: errContext,
    });
    throw new HttpsError("internal", "デバイス削除に失敗しました");
  }
});
