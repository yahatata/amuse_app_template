import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

const db = getFirestore();

// optionParams の各エントリは { tableId?: string } などの形式
const optionParamsEntrySchema = z.object({
  tableId: z.string().optional(),
}).passthrough(); // 将来的に他のパラメータも許容

const payloadSchema = z.object({
  deviceId: z.string().min(1),
  options: z.record(z.boolean()),
  optionParams: z.record(optionParamsEntrySchema).optional(),
});

// 排他グループ: 同時にtrueにできないオプションのグループ
const EXCLUSIVE_GROUPS: string[][] = [
  ["tournament", "tournament_table"],
];

// 排他チェック
function validateExclusiveOptions(options: Record<string, boolean>): void {
  for (const group of EXCLUSIVE_GROUPS) {
    const enabledInGroup = group.filter((key) => options[key] === true);
    if (enabledInGroup.length > 1) {
      throw new HttpsError(
        "invalid-argument",
        `${enabledInGroup.join(" と ")} は同時に選択できません`
      );
    }
  }
}

export const updateDeviceOptions = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { deviceId, options, optionParams } = payloadSchema.parse(request.data);

    // 排他チェック
    validateExclusiveOptions(options);

    // 呼び出し元がadmin端末か検証（呼び出し元uidのdevicesドキュメントを参照）
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

    // 対象デバイスの存在確認
    const targetRef = db.collection("devices").doc(deviceId);
    const targetDoc = await targetRef.get();
    if (!targetDoc.exists) {
      throw new HttpsError("not-found", "対象デバイスが存在しません");
    }

    // 更新データを構築
    const updateData: Record<string, unknown> = {
      options,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // optionParams が渡された場合は更新
    if (optionParams !== undefined) {
      updateData.optionParams = optionParams;
    }

    await targetRef.update(updateData);

    return {
      success: true,
      deviceId,
      options,
      optionParams: optionParams ?? null,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new HttpsError("invalid-argument", "入力データが無効です");
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "デバイスオプション更新に失敗しました");
  }
});
