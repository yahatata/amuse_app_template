import { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { normalizeDeviceStatus } from "./deviceStatus";

export type AdminCallerDevice = {
  callerDeviceId: string;
  callerUid: string;
  callerData: FirebaseFirestore.DocumentData;
};

/**
 * 呼び出し元が active な admin 端末であることを検証する。
 */
export async function requireActiveAdminCaller(
  db: Firestore,
  callerUid: string
): Promise<AdminCallerDevice> {
  const callerSnap = await db
    .collection("devices")
    .where("uid", "==", callerUid)
    .get();

  const activeAdmin = callerSnap.docs.find((doc) => {
    const data = doc.data();
    return (
      data.role === "admin" &&
      normalizeDeviceStatus(data.status as string | undefined) === "active"
    );
  });

  if (!activeAdmin) {
    throw new HttpsError("permission-denied", "管理者のみが実行できます");
  }

  return {
    callerDeviceId: activeAdmin.id,
    callerUid,
    callerData: activeAdmin.data(),
  };
}

export function assertNotSelfOperation(
  callerDeviceId: string,
  targetDeviceId: string,
  actionLabel: string
): void {
  if (callerDeviceId === targetDeviceId) {
    throw new HttpsError(
      "failed-precondition",
      `操作中の管理端末自身に対して${actionLabel}はできません`
    );
  }
}

/**
 * active な admin 端末が他に存在するか（最後の admin アーカイブ防止用）
 */
export async function countActiveAdminDevices(db: Firestore): Promise<number> {
  const snap = await db.collection("devices").where("role", "==", "admin").get();
  return snap.docs.filter(
    (doc) =>
      normalizeDeviceStatus(doc.data().status as string | undefined) === "active"
  ).length;
}
