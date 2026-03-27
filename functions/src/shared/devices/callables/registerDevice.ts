import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { logOpsError } from "../../logging/logOpsError";

const db = getFirestore();

// バリデーションスキーマ
const registerDeviceSchema = z.object({
  name: z.string().min(1).max(50),
  role: z.enum(["admin", "terminal"]),
  uid: z.string().min(1),
  installationId: z.string().min(1),
  platform: z.string().min(1),
});

/**
 * デバイス登録（同一 uid に対して冪等: 1回目は作成、2回目以降は更新して同じ deviceId を返す）
 */
export const registerDevice = onCall(async (request) => {
  try {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    // バリデーション
    const validatedData = registerDeviceSchema.parse(request.data);

    const { name, role, uid, installationId, platform } = validatedData;

    // 呼び出し元のUIDと一致するかチェック
    if (request.auth.uid !== uid) {
      throw new HttpsError("permission-denied", "UIDが一致しません");
    }

    // 既存のデバイスをチェック（同じUIDまたはinstallationId）
    const existingDevices = await db
      .collection("devices")
      .where("uid", "==", uid)
      .get();

    if (!existingDevices.empty) {
      // 既存のデバイスがある場合は更新
      const existingDevice = existingDevices.docs[0];
      await existingDevice.ref.update({
        name,
        role,
        installationId,
        platform,
        updatedAt: FieldValue.serverTimestamp(),
        status: "active",
      });

      return {
        success: true,
        deviceId: existingDevice.id,
        message: "デバイス情報を更新しました",
      };
    }

    // 新しいデバイスを作成
    const deviceRef = await db.collection("devices").add({
      name,
      role,
      uid,
      installationId,
      platform,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      status: "active",
    });

    return {
      success: true,
      deviceId: deviceRef.id,
      message: "デバイスを登録しました",
    };
  } catch (error) {
    logOpsError({
      message: 'デバイス登録エラー:',
      failureType: 'business',
      functionEntry: 'registerDevice',
      cause: error,
    });

    if (error instanceof z.ZodError) {
      throw new HttpsError("invalid-argument", "入力データが無効です");
    }

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError("internal", "デバイス登録に失敗しました");
  }
});
