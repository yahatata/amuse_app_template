/**
 * Phase6 Step2 等で利用。Phase6.5 以降は「営業管理可能であること」（admin または terminal＋store_management）を要求する共通ヘルパー。
 * devices を uid で取得し、運用中（active / blocked）が 1 件のみのとき
 * isActive(device.status) かつ hasStoreManagementPermission(device) を満たせば通過。
 * archived / retired は uid 退避済みのため通常ヒットしない。
 */
import { HttpsError } from "firebase-functions/v2/https";
import { Firestore } from "firebase-admin/firestore";
import { hasStoreManagementPermission, isActive } from "./devicePermissions";
import { isOperationalStatus } from "./deviceStatus";

const PERMISSION_DENIED_MESSAGE = "営業管理の権限がありません";

export async function requireAdmin(db: Firestore, uid: string): Promise<void> {
  const snap = await db.collection("devices").where("uid", "==", uid).get();

  const operational = snap.docs.filter((doc) =>
    isOperationalStatus(doc.data().status as string | undefined)
  );

  if (operational.length !== 1) {
    throw new HttpsError("permission-denied", PERMISSION_DENIED_MESSAGE);
  }

  const doc = operational[0];
  const data = doc.data() as {
    role?: string;
    options?: Record<string, boolean>;
    status?: string;
  };
  const device = {
    id: doc.id,
    role: data?.role ?? "terminal",
    options: data?.options ?? {},
    status: data?.status ?? "active",
  };

  if (!isActive(device.status) || !hasStoreManagementPermission(device)) {
    throw new HttpsError("permission-denied", PERMISSION_DENIED_MESSAGE);
  }
}
