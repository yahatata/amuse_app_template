import { HttpsError } from "firebase-functions/v2/https";
import type { Firestore } from "firebase-admin/firestore";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { generateJstDateKey } from "../../../shared/time/generateJstDateKey";
import {
  computeIsSufficientForDay,
  getRequiredStaffByTimeSlot,
  getYearMonthFromDateKey,
} from "./helpers";

const BATCH_LIMIT = 500;

/**
 * businessHoursMonthlyMap が無いのに shifts が存在する月はデータ不整合
 */
export async function assertMonthDataConsistency(
  db: Firestore,
  yearMonth: string
): Promise<void> {
  const [mapDoc, shiftsDoc] = await Promise.all([
    db.collection("businessHoursMonthlyMap").doc(yearMonth).get(),
    db.collection("shifts").doc(yearMonth).get(),
  ]);

  if (!mapDoc.exists && shiftsDoc.exists) {
    throw new HttpsError(
      "failed-precondition",
      `データ不整合: shifts/${yearMonth} は存在しますが businessHoursMonthlyMap/${yearMonth} がありません。営業日編集から営業時間を初期化してください。`
    );
  }
}

/**
 * JST 今日以降の yearMonth を map / shifts から列挙（和集合）
 */
export async function listEligibleYearMonths(
  db: Firestore,
  todayJst: string
): Promise<string[]> {
  const startYm = getYearMonthFromDateKey(todayJst);
  const yearMonths = new Set<string>();

  const [mapSnap, shiftsSnap] = await Promise.all([
    db
      .collection("businessHoursMonthlyMap")
      .where(FieldPath.documentId(), ">=", startYm)
      .get(),
    db.collection("shifts").where(FieldPath.documentId(), ">=", startYm).get(),
  ]);

  mapSnap.docs.forEach((doc) => yearMonths.add(doc.id));
  shiftsSnap.docs.forEach((doc) => yearMonths.add(doc.id));

  return [...yearMonths].sort();
}

export async function assertEligibleMonthsDataConsistency(
  db: Firestore,
  todayJst: string
): Promise<void> {
  const yearMonths = await listEligibleYearMonths(db, todayJst);
  for (const yearMonth of yearMonths) {
    await assertMonthDataConsistency(db, yearMonth);
  }
}

/**
 * JST 今日以降・未確定・override なしの日の isSufficient を再計算
 */
export async function recalculateIsSufficientForEligibleDays(
  db: Firestore,
  options?: { todayJst?: string }
): Promise<number> {
  const todayJst = options?.todayJst ?? generateJstDateKey();
  const yearMonths = await listEligibleYearMonths(db, todayJst);
  const requiredStaffConfig = await getRequiredStaffByTimeSlot(db);
  let updatedCount = 0;

  for (const yearMonth of yearMonths) {
    await assertMonthDataConsistency(db, yearMonth);

    const mapDoc = await db.collection("businessHoursMonthlyMap").doc(yearMonth).get();
    if (!mapDoc.exists) {
      continue;
    }

    const daysSnap = await db
      .collection("shifts")
      .doc(yearMonth)
      .collection("days")
      .get();

    let batch = db.batch();
    let batchCount = 0;

    for (const dayDoc of daysSnap.docs) {
      const dateKey = dayDoc.id;
      if (dateKey < todayJst) {
        continue;
      }

      const dayData = dayDoc.data();
      if (dayData.isFinalized === true) {
        continue;
      }
      if (dayData.sufficientOverride !== null && dayData.sufficientOverride !== undefined) {
        continue;
      }

      const businessHours = dayData.businessHours as
        | {
            openMinute: number;
            closeMinute: number;
            isClosed: boolean;
            styleId?: string | null;
          }
        | undefined;

      if (!businessHours) {
        continue;
      }

      const assignments =
        (dayData.assignments as Array<{ startMinute: number; endMinute: number }>) || [];

      const isSufficient = computeIsSufficientForDay(
        businessHours,
        assignments,
        requiredStaffConfig
      );

      batch.update(dayDoc.ref, {
        isSufficient,
        updatedAt: FieldValue.serverTimestamp(),
      });
      batchCount++;
      updatedCount++;

      if (batchCount >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
  }

  return updatedCount;
}
