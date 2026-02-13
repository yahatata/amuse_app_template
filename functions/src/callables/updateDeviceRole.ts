import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

const db = getFirestore();

const payloadSchema = z.object({
  deviceId: z.string().min(1),
  role: z.enum(["admin", "terminal"]),
});

/**
 * 管理者用：指定デバイスの role を変更する。
 * terminal の場合は options / optionParams を空で作成、admin の場合は削除する。
 */
export const updateDeviceRole = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { deviceId, role } = payloadSchema.parse(request.data);

    // 呼び出し元が admin 端末か検証
    const callerUid = request.auth.uid;
    const callerSnap = await db
      .collection("devices")
      .where("uid", "==", callerUid)
      .limit(1)
      .get();

    if (callerSnap.empty) {
      throw new HttpsError("permission-denied", "呼び出し元デバイスが見つかりません");
    }
    const caller = callerSnap.docs[0].data();
    if (caller.role !== "admin") {
      throw new HttpsError("permission-denied", "管理者のみが実行できます");
    }

    const targetRef = db.collection("devices").doc(deviceId);
    const targetDoc = await targetRef.get();
    if (!targetDoc.exists) {
      throw new HttpsError("not-found", "対象デバイスが存在しません");
    }

    const updateData: Record<string, unknown> = {
      role,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (role === "terminal") {
      updateData.options = {};
      updateData.optionParams = {};
    } else if (role === "admin") {
      updateData.options = FieldValue.delete();
      updateData.optionParams = FieldValue.delete();
    }

    await targetRef.update(updateData);

    return { success: true, deviceId, role };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new HttpsError("invalid-argument", "入力データが無効です");
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "デバイスrole更新に失敗しました");
  }
});
