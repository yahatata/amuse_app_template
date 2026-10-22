import { Firestore, Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { normalizeDeviceStatus } from "./deviceStatus";

export type AdminCallerDevice = {
  callerDeviceId: string;
  callerUid: string;
  callerData: FirebaseFirestore.DocumentData;
};

/** role==admin かつ status 正規化後 active */
export function isActiveAdminDevice(data: FirebaseFirestore.DocumentData): boolean {
  return (
    data.role === "admin" &&
    normalizeDeviceStatus(data.status as string | undefined) === "active"
  );
}

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

  const activeAdmin = callerSnap.docs.find((doc) =>
    isActiveAdminDevice(doc.data())
  );

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
 * active な admin 端末数を数える（最後の admin 保護用）。
 * blocked / archived / retired は含まない。
 */
export async function countActiveAdminDevices(db: Firestore): Promise<number> {
  const snap = await db.collection("devices").where("role", "==", "admin").get();
  return snap.docs.filter((doc) => isActiveAdminDevice(doc.data())).length;
}

/**
 * transaction 内で active admin 数を数える。
 * Query を tx に載せて同時更新との競合を検出する。
 */
export async function countActiveAdminDevicesInTx(
  db: Firestore,
  tx: Transaction
): Promise<number> {
  const snap = await tx.get(db.collection("devices").where("role", "==", "admin"));
  return snap.docs.filter((doc) => isActiveAdminDevice(doc.data())).length;
}

/**
 * 対象が「最後の active admin」を利用不可にする操作なら failed-precondition。
 */
export function assertNotRemovingLastActiveAdmin(
  targetData: FirebaseFirestore.DocumentData,
  activeAdminCount: number,
  message: string
): void {
  if (!isActiveAdminDevice(targetData)) {
    return;
  }
  if (activeAdminCount <= 1) {
    throw new HttpsError("failed-precondition", message);
  }
}
