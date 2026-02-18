/**
 * 営業時間管理の共通ロジック（Callable間で共有）
 * ⚠️ 重要: Callable間の内部呼び出しを避けるため、純関数として実装
 */

import { HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

/**
 * 営業時間データの型定義
 */
export interface BusinessHoursDayData {
  day: number;
  openMinute: number;
  closeMinute: number;
  isClosed: boolean;
  styleId?: string;
  source?: "auto" | "manual";
}

/**
 * businessHoursMonthly と businessHoursMonthlyMap を更新する共通ロジック
 * @param db Firestore instance
 * @param yearMonth YYYY-MM形式
 * @param days 営業時間データの配列
 * @returns batch操作を含むPromise（呼び出し側でcommitする）
 */
export async function upsertBusinessHoursForMonth(
  db: admin.firestore.Firestore,
  yearMonth: string,
  days: BusinessHoursDayData[]
): Promise<admin.firestore.WriteBatch> {
  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();

  // SSoT: businessHoursMonthly/{YYYY-MM}/days/{DD} を upsert
  // 事前に既存ドキュメントを取得（createdAt保護のため）
  const dayDocRefs = days.map((day) => {
    const dayStr = day.day.toString().padStart(2, "0");
    return db
      .collection("businessHoursMonthly")
      .doc(yearMonth)
      .collection("days")
      .doc(dayStr);
  });
  const existingDocs = await db.getAll(...dayDocRefs);

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const dayStr = day.day.toString().padStart(2, "0"); // "1" -> "01"
    const dateKey = `${yearMonth}-${dayStr}`;
    const dayDocRef = dayDocRefs[i];
    const existingDoc = existingDocs[i];

    // createdAt保護: 新規作成時のみ設定
    const dayData: any = {
      dateKey,
      openMinute: day.openMinute,
      closeMinute: day.closeMinute,
      isClosed: day.isClosed,
      styleId: day.styleId ?? null,
      source: day.source || "auto", // デフォルトは"auto"
      updatedAt: now,
    };

    if (!existingDoc.exists) {
      dayData.createdAt = now;
    }

    batch.set(dayDocRef, dayData, { merge: true });
  }

  // キャッシュ: businessHoursMonthlyMap/{YYYY-MM} を該当日のみ差分更新
  // ドット記法は使わず、既存の days を読み取り該当キーだけ上書きしてから days を丸ごと set する
  const mapDocRef = db.collection("businessHoursMonthlyMap").doc(yearMonth);
  const existingMapDoc = await mapDocRef.get();

  const existingDays = existingMapDoc.exists && existingMapDoc.data()?.days
    ? (existingMapDoc.data()!.days as Record<string, unknown>)
    : {};
  const daysMap: Record<string, unknown> = { ...existingDays };

  for (const day of days) {
    const dayStr = day.day.toString().padStart(2, "0");
    daysMap[dayStr] = {
      openMinute: day.openMinute,
      closeMinute: day.closeMinute,
      isClosed: day.isClosed,
      styleId: day.styleId ?? null,
      source: day.source || "auto",
    };
  }

  const mapData: Record<string, unknown> = {
    days: daysMap,
    updatedAt: now,
  };
  if (!existingMapDoc.exists) {
    mapData.createdAt = now;
  }
  batch.set(mapDocRef, mapData, { merge: true });

  return batch;
}

/**
 * shifts/{yearMonth}/days/{dateKey} を更新する共通ロジック
 * ⚠️ 重要: businessHours のみ更新し、シフト運用データ（assignments, pendingRequestCount等）は絶対に破壊しない
 * @param db Firestore instance
 * @param yearMonth YYYY-MM形式
 * @returns batch操作を含むPromise（呼び出し側でcommitする）
 */
export async function syncBusinessHoursToShifts(
  db: admin.firestore.Firestore,
  yearMonth: string
): Promise<admin.firestore.WriteBatch> {
  // businessHoursMonthlyMap を取得
  const mapDoc = await db.collection("businessHoursMonthlyMap").doc(yearMonth).get();

  if (!mapDoc.exists) {
    throw new HttpsError(
      "failed-precondition",
      `Business hours for ${yearMonth} must be initialized first. Call initBusinessHoursForMonth first.`
    );
  }

  const mapData = mapDoc.data();
  if (!mapData || !mapData.days) {
    throw new HttpsError("failed-precondition", `Business hours map for ${yearMonth} is empty`);
  }

  const daysMap = mapData.days as Record<
    string,
    { 
      openMinute: number; 
      closeMinute: number; 
      isClosed: boolean;
      styleId?: string;
      source?: "auto" | "manual";
    }
  >;

  // 年月の日数を計算
  const [year, month] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate(); // 0日目 = 前月末日

  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();

  // 1日から月末まで処理
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = day.toString().padStart(2, "0");
    const dateKey = `${yearMonth}-${dayStr}`;

    // 営業時間を取得（デフォルト値）
    const dayData = daysMap[dayStr] || {
      openMinute: 540, // 09:00
      closeMinute: 1320, // 22:00
      isClosed: false,
      styleId: null,
      source: "auto",
    };

    const dayDocRef = db.collection("shifts").doc(yearMonth).collection("days").doc(dateKey);
    const existingDoc = await dayDocRef.get();

    if (existingDoc.exists) {
      // ⚠️ 既存ドキュメント: businessHours のみ更新（他のフィールドは絶対に触らない）
      // assignments, pendingRequestCount, isFinalized, sufficientOverride, isSufficient は保持
      batch.update(dayDocRef, {
        "businessHours": {
          openMinute: dayData.openMinute,
          closeMinute: dayData.closeMinute,
          isClosed: dayData.isClosed,
          styleId: dayData.styleId || null,
          source: dayData.source || "auto",
        },
        updatedAt: now,
      });
    } else {
      // 新規作成: 初期値でドキュメント作成
      batch.set(dayDocRef, {
        yearMonth,
        dateKey,
        businessHours: {
          openMinute: dayData.openMinute,
          closeMinute: dayData.closeMinute,
          isClosed: dayData.isClosed,
          styleId: dayData.styleId || null,
          source: dayData.source || "auto",
        },
        assignments: [],
        pendingRequestCount: 0,
        isFinalized: false,
        sufficientOverride: null,
        isSufficient: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return batch;
}
