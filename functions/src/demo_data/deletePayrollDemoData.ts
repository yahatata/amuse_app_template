/**
 * isPayrollDemoSeed 付きの attendances（breaks 含む）と staffs を一括削除する。
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

import { requireAdmin } from "../shared/devices";
import { PAYROLL_DEMO_FLAG_FIELD } from "./demoFlags";

export const deletePayrollDemoData = onCall(
  { timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }
    const adminId = request.auth.uid;
    const db = getFirestore();
    await requireAdmin(db, adminId);

    const attSnap = await db
      .collection("attendances")
      .where(PAYROLL_DEMO_FLAG_FIELD, "==", true)
      .get();

    let deletedAttendances = 0;
    let deletedBreaks = 0;

    for (const doc of attSnap.docs) {
      const breaksSnap = await doc.ref.collection("breaks").get();
      const batch = db.batch();
      for (const b of breaksSnap.docs) {
        batch.delete(b.ref);
        deletedBreaks += 1;
      }
      batch.delete(doc.ref);
      await batch.commit();
      deletedAttendances += 1;
    }

    const staffSnap = await db
      .collection("staffs")
      .where(PAYROLL_DEMO_FLAG_FIELD, "==", true)
      .get();

    let deletedStaff = 0;
    if (!staffSnap.empty) {
      const batch = db.batch();
      for (const d of staffSnap.docs) {
        batch.delete(d.ref);
        deletedStaff += 1;
      }
      await batch.commit();
    }

    return {
      success: true,
      message: `給与デモデータを削除しました（attendances ${deletedAttendances} 件・breaks ${deletedBreaks} 件・staffs ${deletedStaff} 件）。`,
      deletedAttendances,
      deletedBreaks,
      deletedStaff,
    };
  }
);
