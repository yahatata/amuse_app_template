import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { normalizeDeviceStatus } from "./deviceStatus";

const db = getFirestore();

export type DeviceDoc = {
  id: string;
  role: string;
  /** デバイス表示名。operationLogs の実行者表示に使用 */
  name?: string;
  options?: Record<string, boolean>;
  optionParams?: Record<string, Record<string, unknown>>;
  status?: string;
};

export async function getCallerDeviceByUid(uid: string): Promise<DeviceDoc | null> {
  const snap = await db.collection("devices").where("uid", "==", uid).get();
  if (snap.empty) return null;

  const activeDoc = snap.docs.find(
    (doc) =>
      normalizeDeviceStatus(doc.data().status as string | undefined) === "active"
  );
  const doc = activeDoc ?? snap.docs[0];
  const data = doc.data() as Record<string, unknown> | undefined;
  const name = typeof data?.name === "string" && data.name.length > 0 ? data.name : undefined;
  if (!name) {
    logger.warn("[getCallerDeviceByUid] device has no name", { deviceId: doc.id, uid });
  }
  return {
    id: doc.id,
    role: (data?.role as string) ?? "terminal",
    name,
    options: (data?.options as Record<string, boolean>) ?? {},
    optionParams:
      (data?.optionParams as Record<string, Record<string, unknown>>) ?? {},
    status: (data?.status as string) ?? "active",
  };
}

export function hasRequiredOption(options: Record<string, boolean> | undefined, requiredKey: string): boolean {
  if (!options) return false;
  return options[requiredKey] === true;
}

/**
 * Phase6.5: 営業管理可能かどうか（権限のみ。有効性 status は呼び出し元で isActive を参照すること）。
 */
export function hasStoreManagementPermission(device: DeviceDoc): boolean {
  if (device.role === "admin") return true;
  if (device.role === "terminal") return hasRequiredOption(device.options, "store_management");
  return false;
}

export { isActive } from "./deviceStatus";
