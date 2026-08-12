import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { logOpsError, logOpsSuccess } from "../../logging/logOpsError";
import {
  assertNotRemovingLastActiveAdmin,
  countActiveAdminDevicesInTx,
  isActiveAdminDevice,
  requireActiveAdminCaller,
} from "../deviceAdminAuth";

const db = getFirestore();

const payloadSchema = z.object({
  deviceId: z.string().min(1),
  role: z.enum(["admin", "terminal", "table"]),
});

const SELF_ROLE_CHANGE_MESSAGE = "自分自身の端末ロールは変更できません";
const LAST_ADMIN_DEMOTE_MESSAGE = "最後の管理者端末のロールは変更できません";

/**
 * 管理者用：指定デバイスの role を変更する。
 * terminal / table の場合は options / optionParams を空で作成、admin の場合は削除する。
 */
export const updateDeviceRole = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { deviceId, role } = payloadSchema.parse(request.data);
    const callerUid = request.auth.uid;

    const caller = await requireActiveAdminCaller(db, callerUid);
    const targetRef = db.collection("devices").doc(deviceId);

    await db.runTransaction(async (tx) => {
      const targetDoc = await tx.get(targetRef);
      if (!targetDoc.exists) {
        throw new HttpsError("not-found", "対象デバイスが存在しません");
      }

      const targetData = targetDoc.data() ?? {};
      const demotingActiveAdmin =
        isActiveAdminDevice(targetData) && role !== "admin";

      // 最後の active admin 保護を自己操作より先に判定する。
      // sole admin が自分を demote する場合は「最後の管理者…」になる。
      if (demotingActiveAdmin) {
        const activeAdminCount = await countActiveAdminDevicesInTx(db, tx);
        assertNotRemovingLastActiveAdmin(
          targetData,
          activeAdminCount,
          LAST_ADMIN_DEMOTE_MESSAGE
        );
      }

      if (caller.callerDeviceId === deviceId) {
        throw new HttpsError("failed-precondition", SELF_ROLE_CHANGE_MESSAGE);
      }

      const updateData: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
        role,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (role === "terminal" || role === "table") {
        updateData.options = {};
        updateData.optionParams = {};
      } else if (role === "admin") {
        updateData.options = FieldValue.delete();
        updateData.optionParams = FieldValue.delete();
      }

      tx.update(targetRef, updateData);
    });

    logOpsSuccess({
      message: "updateDeviceRole 成功",
      functionEntry: "updateDeviceRole",
      operation: "updateDeviceRoleCatch",
      context: {
        targetDeviceId: deviceId,
        callerDeviceId: caller.callerDeviceId,
        callerUid,
        role,
      },
    });

    return { success: true, deviceId, role };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new HttpsError("invalid-argument", "入力データが無効です");
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    const parsed = payloadSchema.safeParse(request.data);
    const errContext = parsed.success
      ? { deviceId: parsed.data.deviceId, role: parsed.data.role, callerUid: request.auth?.uid }
      : { callerUid: request.auth?.uid, inputParseFailed: true as const };

    logOpsError({
      message: "updateDeviceRole failed",
      functionEntry: "updateDeviceRole",
      operation: "updateDeviceRoleCatch",
      cause: error,
      sourceProductHint: "firestore",
      context: errContext,
    });
    throw new HttpsError("internal", "デバイスrole更新に失敗しました");
  }
});
