import * as admin from "firebase-admin";
import { logOpsError } from "../../../shared/logging/logOpsError";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ScheduledCleanupTaskInput {
  cutoffDate: string;
}

export interface ScheduledCleanupTaskResult {
  deletedShiftCount: number;
}

function parseCutoffDateEndOfDayJst(cutoffDate: string): Date {
  if (!DATE_KEY_PATTERN.test(cutoffDate)) {
    throw new Error(`Invalid cutoffDate: ${cutoffDate}`);
  }
  return new Date(`${cutoffDate}T23:59:59.999+09:00`);
}

export async function runScheduledCleanupTask(
  input: ScheduledCleanupTaskInput
): Promise<ScheduledCleanupTaskResult> {
  try {
    const db = admin.firestore();
    const cutoffDate = parseCutoffDateEndOfDayJst(input.cutoffDate);

    const rejectedShiftsSnapshot = await db
      .collection("shifts")
      .where("confirmed", "==", false)
      .where("rejectedAt", "<=", cutoffDate)
      .get();

    if (rejectedShiftsSnapshot.empty) {
      return {deletedShiftCount: 0};
    }

    const batch = db.batch();
    rejectedShiftsSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    return {deletedShiftCount: rejectedShiftsSnapshot.size};
  } catch (error) {
    logOpsError({
      message: "scheduledCleanup task execution failed",
      functionEntry: "scheduledCleanup",
      cause: error,
    });
    throw error;
  }
}
