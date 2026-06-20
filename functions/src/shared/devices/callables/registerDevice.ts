import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { logOpsError, logOpsSuccess } from "../../logging/logOpsError";
import {
  DEVICE_STATUS_ACTIVE,
  DEVICE_STATUS_BLOCKED,
  isArchivedStatus,
  isOperationalStatus,
  normalizeDeviceStatus,
} from "../deviceStatus";

const db = getFirestore();

// バリデーションスキーマ
const registerDeviceSchema = z.object({
  name: z.string().min(1).max(50),
  role: z.enum(["admin", "terminal", "table"]),
  uid: z.string().min(1),
  installationId: z.string().min(1),
  platform: z.string().min(1),
});

/**
 * レガシー: archived / retired に uid が残っている場合、再登録前に uid を退避して削除する
 */
async function clearUidOnLegacyArchivedDocs(
  docs: FirebaseFirestore.QueryDocumentSnapshot[]
): Promise<void> {
  const batch = db.batch();
  let pending = 0;

  for (const doc of docs) {
    const data = doc.data();
    const rawStatus = data.status as string | undefined;
    if (!isArchivedStatus(rawStatus)) {
      continue;
    }
    const uid = data.uid;
    if (typeof uid !== "string" || uid.length === 0) {
      continue;
    }
    batch.update(doc.ref, {
      uid: FieldValue.delete(),
      previousUid: data.previousUid ?? uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    pending += 1;
  }

  if (pending > 0) {
    await batch.commit();
  }
}

/**
 * デバイス登録
 * - active 既存 doc: 更新して同じ deviceId を返す
 * - blocked 既存 doc: 登録拒否
 * - archived / retired: active に戻さず新規 doc を作成
 */
export const registerDevice = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const validatedData = registerDeviceSchema.parse(request.data);
    const { name, role, uid, installationId, platform } = validatedData;

    if (request.auth.uid !== uid) {
      throw new HttpsError("permission-denied", "UIDが一致しません");
    }

    const existingDevices = await db
      .collection("devices")
      .where("uid", "==", uid)
      .get();

    const operationalDocs = existingDevices.docs.filter((doc) =>
      isOperationalStatus(doc.data().status as string | undefined)
    );

    const blockedDoc = operationalDocs.find(
      (doc) =>
        normalizeDeviceStatus(doc.data().status as string | undefined) ===
        DEVICE_STATUS_BLOCKED
    );
    if (blockedDoc) {
      throw new HttpsError(
        "failed-precondition",
        "この端末はブロックされています。管理者に連絡してください"
      );
    }

    const activeDoc = operationalDocs.find(
      (doc) =>
        normalizeDeviceStatus(doc.data().status as string | undefined) ===
        DEVICE_STATUS_ACTIVE
    );
    if (activeDoc) {
      await activeDoc.ref.update({
        name,
        role,
        installationId,
        platform,
        ...(role === "admin"
          ? {
              options: FieldValue.delete(),
              optionParams: FieldValue.delete(),
            }
          : {
              options: {},
              optionParams: {},
            }),
        updatedAt: FieldValue.serverTimestamp(),
        status: DEVICE_STATUS_ACTIVE,
      });

      logOpsSuccess({
        message: "registerDevice 成功",
        functionEntry: "registerDevice",
        context: {
          uid,
          deviceId: activeDoc.id,
          outcome: "updated",
          role,
          installationId,
        },
      });

      return {
        success: true,
        deviceId: activeDoc.id,
        message: "デバイス情報を更新しました",
      };
    }

    await clearUidOnLegacyArchivedDocs(existingDevices.docs);

    const deviceRef = await db.collection("devices").add({
      name,
      role,
      uid,
      installationId,
      platform,
      ...(role === "admin"
        ? {}
        : {
            options: {},
            optionParams: {},
          }),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      status: DEVICE_STATUS_ACTIVE,
    });

    logOpsSuccess({
      message: "registerDevice 成功",
      functionEntry: "registerDevice",
      context: {
        uid,
        deviceId: deviceRef.id,
        outcome: "created",
        role,
        installationId,
      },
    });

    return {
      success: true,
      deviceId: deviceRef.id,
      message: "デバイスを登録しました",
    };
  } catch (error) {
    const parsed = registerDeviceSchema.safeParse(request.data);
    const errContext = parsed.success
      ? {
          uid: parsed.data.uid,
          role: parsed.data.role,
          installationId: parsed.data.installationId,
        }
      : { inputParseFailed: true as const };

    logOpsError({
      message: "デバイス登録エラー:",
      functionEntry: "registerDevice",
      cause: error,
      context: errContext,
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
