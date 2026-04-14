import * as admin from "firebase-admin";
import { logOpsError } from "../../logging/logOpsError";
import {
  upsertBusinessHoursForMonth,
  syncBusinessHoursToShifts,
} from "../services/businessHoursCore";
import { determineStyleId } from "../services/holidayHelper";
import { getBusinessHoursByStyleId } from "../services/styles";

const db = admin.firestore();

export interface ScheduleGenerateNextYearBusinessHoursTaskInput {
  targetYear: number;
}

export interface ScheduleGenerateNextYearBusinessHoursTaskResult {
  generatedMonthCount: number;
  skippedMonthCount: number;
}

export async function runScheduleGenerateNextYearBusinessHoursTask(
  input: ScheduleGenerateNextYearBusinessHoursTaskInput
): Promise<ScheduleGenerateNextYearBusinessHoursTaskResult> {
  let generatedMonthCount = 0;
  let skippedMonthCount = 0;

  try {
    const targetYear = input.targetYear;
    if (
      typeof targetYear !== "number" ||
      !Number.isInteger(targetYear) ||
      targetYear < 2000 ||
      targetYear > 3000
    ) {
      throw new Error(`Invalid targetYear: ${targetYear}`);
    }

    for (let month = 1; month <= 12; month++) {
      const yearMonth = `${targetYear}-${String(month).padStart(2, "0")}`;
      try {
        const daysInMonth = new Date(targetYear, month, 0).getDate();
        const mapDoc = await db.collection("businessHoursMonthlyMap").doc(yearMonth).get();
        const existingDaysMap = mapDoc.exists && mapDoc.data()?.days ?
          mapDoc.data()!.days as Record<string, {source?: "auto" | "manual"}> :
          {};

        const days: Array<{
          day: number;
          openMinute: number;
          closeMinute: number;
          isClosed: boolean;
          styleId: string;
          source: "auto";
        }> = [];

        for (let day = 1; day <= daysInMonth; day++) {
          const dayStr = day.toString().padStart(2, "0");
          const existingDay = existingDaysMap[dayStr];
          if (existingDay?.source === "manual") {
            continue;
          }

          const date = new Date(Date.UTC(targetYear, month - 1, day, 0, 0, 0));
          const styleId = determineStyleId(date);
          const style = await getBusinessHoursByStyleId(styleId);

          days.push({
            day,
            openMinute: style.openMinute,
            closeMinute: style.closeMinute,
            isClosed: style.isClosed,
            styleId: style.styleId,
            source: "auto",
          });
        }

        if (days.length === 0) {
          skippedMonthCount += 1;
          continue;
        }

        const batch = await upsertBusinessHoursForMonth(db, yearMonth, days);
        await batch.commit();

        const syncBatch = await syncBusinessHoursToShifts(db, yearMonth);
        await syncBatch.commit();
        generatedMonthCount += 1;
      } catch (monthError) {
        logOpsError({
          message: `scheduleGenerateNextYearBusinessHours month failed: ${yearMonth}`,
          functionEntry: "scheduleGenerateNextYearBusinessHours",
          operation: "generateMonthFailed",
          cause: monthError,
        });
      }
    }

    return {generatedMonthCount, skippedMonthCount};
  } catch (error) {
    logOpsError({
      message: "scheduleGenerateNextYearBusinessHours task execution failed",
      functionEntry: "scheduleGenerateNextYearBusinessHours",
      operation: "taskOuterCatch",
      cause: error,
    });
    throw error;
  }
}
