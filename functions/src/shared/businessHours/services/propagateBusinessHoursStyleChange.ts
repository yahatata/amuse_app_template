import type { Firestore } from "firebase-admin/firestore";
import type { BusinessHoursStyle } from "../../config/types";
import { generateJstDateKey } from "../../time/generateJstDateKey";
import {
  assertEligibleMonthsDataConsistency,
  listEligibleYearMonths,
} from "../../../domains/shift/services/recalculateIsSufficient";
import {
  BusinessHoursDayData,
  syncBusinessHoursToShifts,
  upsertBusinessHoursForMonth,
} from "./businessHoursCore";

/**
 * 変更された営業スタイルを、JST 今日以降かつ該当 styleId の日へ反映する
 */
export async function propagateBusinessHoursStyleChange(
  db: Firestore,
  changedStyles: Record<string, BusinessHoursStyle>,
  options?: { todayJst?: string }
): Promise<string[]> {
  const todayJst = options?.todayJst ?? generateJstDateKey();
  const changedStyleIds = new Set(Object.keys(changedStyles));

  await assertEligibleMonthsDataConsistency(db, todayJst);

  const yearMonths = await listEligibleYearMonths(db, todayJst);
  const affectedMonths: string[] = [];

  for (const yearMonth of yearMonths) {
    const mapDoc = await db.collection("businessHoursMonthlyMap").doc(yearMonth).get();
    if (!mapDoc.exists) {
      continue;
    }

    const daysMap = mapDoc.data()?.days as
      | Record<
          string,
          {
            styleId?: string | null;
            source?: "auto" | "manual";
          }
        >
      | undefined;

    if (!daysMap) {
      continue;
    }

    const daysToUpdate: BusinessHoursDayData[] = [];

    for (const [dayStr, dayInfo] of Object.entries(daysMap)) {
      const dateKey = `${yearMonth}-${dayStr}`;
      if (dateKey < todayJst) {
        continue;
      }

      const styleId = dayInfo.styleId;
      if (!styleId || !changedStyleIds.has(styleId)) {
        continue;
      }

      const newStyle = changedStyles[styleId];
      const day = parseInt(dayStr, 10);

      daysToUpdate.push({
        day,
        openMinute: newStyle.openMinute,
        closeMinute: newStyle.closeMinute,
        isClosed: newStyle.isClosed,
        styleId,
        source: dayInfo.source || "auto",
      });
    }

    if (daysToUpdate.length > 0) {
      const batch = await upsertBusinessHoursForMonth(db, yearMonth, daysToUpdate);
      await batch.commit();
      affectedMonths.push(yearMonth);
    }
  }

  for (const yearMonth of affectedMonths) {
    const syncBatch = await syncBusinessHoursToShifts(db, yearMonth);
    await syncBatch.commit();
  }

  return affectedMonths;
}
