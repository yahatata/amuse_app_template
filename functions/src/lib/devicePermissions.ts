import { getFirestore } from "firebase-admin/firestore";

const db = getFirestore();

export type DeviceDoc = {
  id: string;
  role: string;
  options?: Record<string, boolean>;
  status?: string;
};

export async function getCallerDeviceByUid(uid: string): Promise<DeviceDoc | null> {
  const snap = await db.collection("devices").where("uid", "==", uid).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data() as any;
  return {
    id: doc.id,
    role: data?.role ?? "terminal",
    options: data?.options ?? {},
    status: data?.status ?? "active",
  };
}

export function hasRequiredOption(options: Record<string, boolean> | undefined, requiredKey: string): boolean {
  if (!options) return false;
  return options[requiredKey] === true;
}

export function isActive(status?: string): boolean {
  return (status ?? "active") === "active";
}


