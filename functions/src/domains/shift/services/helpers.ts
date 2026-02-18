import { HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * 日付キー（YYYY-MM-DD）から年月（YYYY-MM）を取得
 */
export function getYearMonthFromDateKey(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new HttpsError("invalid-argument", "Invalid dateKey format. Expected YYYY-MM-DD");
  }
  return dateKey.substring(0, 7); // "YYYY-MM-DD" -> "YYYY-MM"
}

/**
 * 時刻が1時間刻み（60分の倍数）か検証
 */
export function assertHourStep(minutes: number): void {
  if (minutes % 60 !== 0) {
    throw new HttpsError(
      "invalid-argument",
      `Minutes must be a multiple of 60 (hour step). Got: ${minutes}`
    );
  }
}

/**
 * 開始時刻・終了時刻が営業時間内か検証
 * 24:00（1440分）の場合は、closeMinuteが1440以上であれば許可
 */
export function validateWithinBusinessHours(
  openMinute: number,
  closeMinute: number,
  startMinute: number,
  endMinute: number
): void {
  if (startMinute < openMinute) {
    throw new HttpsError(
      "failed-precondition",
      `Time slot start (${startMinute}) is outside business hours (open: ${openMinute})`
    );
  }
  
  // 終了時刻が1440分（24:00）の場合は、closeMinuteが1440以上であれば許可
  const isEndTime24 = endMinute === 1440;
  const isCloseTime24 = closeMinute >= 1440;
  
  if (isEndTime24 && !isCloseTime24) {
    throw new HttpsError(
      "failed-precondition",
      `Time slot end 24:00 (1440) is outside business hours (close: ${closeMinute})`
    );
  }
  
  if (!isEndTime24 && endMinute > closeMinute) {
    throw new HttpsError(
      "failed-precondition",
      `Time slot end (${endMinute}) is outside business hours (close: ${closeMinute})`
    );
  }
  if (startMinute >= endMinute) {
    throw new HttpsError(
      "invalid-argument",
      `Start time (${startMinute}) must be less than end time (${endMinute})`
    );
  }
}

/**
 * installationIdからデバイス情報を取得
 */
export async function resolveDeviceByInstallationId(
  installationId: string
): Promise<admin.firestore.DocumentSnapshot | null> {
  const snapshot = await db
    .collection("devices")
    .where("installationId", "==", installationId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0];
}

/**
 * 管理者デバイスの権限を確認
 * - device.status == "active"
 * - device.role == "admin"
 * - device.uid == authUid
 */
export async function assertAdminDevice(
  installationId: string,
  authUid: string
): Promise<void> {
  const deviceDoc = await resolveDeviceByInstallationId(installationId);

  if (!deviceDoc) {
    throw new HttpsError(
      "permission-denied",
      "Device not found or not registered"
    );
  }

  const deviceData = deviceDoc.data();

  if (!deviceData) {
    throw new HttpsError(
      "permission-denied",
      "Device data not found"
    );
  }

  if (deviceData.status !== "active") {
    throw new HttpsError(
      "permission-denied",
      "Device is not active"
    );
  }

  if (deviceData.role !== "admin") {
    throw new HttpsError(
      "permission-denied",
      "Device role is not admin"
    );
  }

  if (deviceData.uid !== authUid) {
    throw new HttpsError(
      "permission-denied",
      "Device UID does not match authenticated UID"
    );
  }
}

/**
 * スタッフが存在するか確認
 * staffs/{LINE_userId} が存在すること
 */
export async function assertStaffExists(authUidLineUserId: string): Promise<void> {
  const staffDoc = await db.collection("staffs").doc(authUidLineUserId).get();

  if (!staffDoc.exists) {
    throw new HttpsError(
      "permission-denied",
      "Staff not found. Staff document does not exist"
    );
  }
}

/**
 * 空き時間帯を検出（1時間刻み）
 * 営業時間内を60分刻みで走査し、その1時間に誰も割当がいない区間をgapとする
 */
export function findGapTimeSlots(
  openMinute: number,
  closeMinute: number,
  assignments: Array<{ startMinute: number; endMinute: number }>
): Array<{ start: number; end: number }> {
  if (openMinute >= closeMinute || assignments.length === 0) {
    return [];
  }

  const gapSlots: Array<{ start: number; end: number }> = [];

  // 60分刻みで走査
  for (let hourStart = openMinute; hourStart < closeMinute; hourStart += 60) {
    const hourEnd = hourStart + 60;

    // この1時間に勤務しているスタッフがいるかチェック
    let hasStaff = false;
    for (const assignment of assignments) {
      if (assignment.startMinute < hourEnd && assignment.endMinute > hourStart) {
        hasStaff = true;
        break;
      }
    }

    // スタッフがいない時間帯を記録
    if (!hasStaff) {
      gapSlots.push({ start: hourStart, end: hourEnd });
    }
  }

  return gapSlots;
}

/**
 * スタッフ不足時間帯を検出（1時間刻み）
 * GlobalConstants.requiredStaffByTimeSlot を使用
 */
export function findInsufficientTimeSlots(
  openMinute: number,
  closeMinute: number,
  assignments: Array<{ startMinute: number; endMinute: number }>,
  requiredStaffByTimeSlot: Array<{ startHour: number; endHour: number; requiredCount: number }>
): Array<{ start: number; end: number; required: number; current: number }> {
  if (openMinute >= closeMinute || requiredStaffByTimeSlot.length === 0) {
    return [];
  }

  const insufficientSlots: Array<{ start: number; end: number; required: number; current: number }> = [];

  // 各設定された時間帯についてチェック
  for (const slot of requiredStaffByTimeSlot) {
    const slotStartMinutes = slot.startHour * 60;
    const slotEndMinutes = slot.endHour * 60;

    // 営業時間と重ならない場合はスキップ
    if (slotEndMinutes <= openMinute || slotStartMinutes >= closeMinute) {
      continue;
    }

    // この時間帯に勤務しているスタッフ数をカウント（1時間単位でチェック）
    for (let hour = slot.startHour; hour < slot.endHour; hour++) {
      const hourStartMinutes = hour * 60;
      const hourEndMinutes = (hour + 1) * 60;

      // 営業時間と重なる部分を計算
      const hourCheckStart = hourStartMinutes > openMinute ? hourStartMinutes : openMinute;
      const hourCheckEnd = hourEndMinutes < closeMinute ? hourEndMinutes : closeMinute;

      // 営業時間と重ならない場合はスキップ
      if (hourCheckStart >= hourCheckEnd) {
        continue;
      }

      // この1時間に勤務しているスタッフ数をカウント
      let currentCount = 0;
      for (const assignment of assignments) {
        if (assignment.startMinute < hourEndMinutes && assignment.endMinute > hourStartMinutes) {
          currentCount++;
        }
      }

      // 必要人数に足りない場合は不足時間帯として記録
      if (currentCount < slot.requiredCount) {
        insufficientSlots.push({
          start: hourStartMinutes,
          end: hourEndMinutes,
          required: slot.requiredCount,
          current: currentCount,
        });
      }
    }
  }

  // 時刻順にソート
  insufficientSlots.sort((a, b) => a.start - b.start);

  return insufficientSlots;
}

/**
 * isSufficient を自動判定
 * - gapSlots empty && insufficientSlots empty なら true、そうでなければ false
 */
export function calculateIsSufficient(
  openMinute: number,
  closeMinute: number,
  assignments: Array<{ startMinute: number; endMinute: number }>,
  requiredStaffByTimeSlot: Array<{ startHour: number; endHour: number; requiredCount: number }>
): boolean {
  const gapSlots = findGapTimeSlots(openMinute, closeMinute, assignments);
  const insufficientSlots = findInsufficientTimeSlots(
    openMinute,
    closeMinute,
    assignments,
    requiredStaffByTimeSlot
  );

  return gapSlots.length === 0 && insufficientSlots.length === 0;
}

/**
 * businessHoursMonthlyMapから営業時間を取得
 * @param yearMonth YYYY-MM形式
 * @param dateKey YYYY-MM-DD形式
 * @returns 営業時間（デフォルト値: 09:00-22:00, 営業中）
 */
export async function getBusinessHoursFromMap(
  yearMonth: string,
  dateKey: string
): Promise<{ openMinute: number; closeMinute: number; isClosed: boolean }> {
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
    { openMinute: number; closeMinute: number; isClosed: boolean }
  >;

  // dateKeyから日を抽出（例: "2026-02-17" -> "17"）
  const dayStr = dateKey.split("-")[2];

  const dayData = daysMap[dayStr];
  if (!dayData) {
    // デフォルト値
    return {
      openMinute: 540, // 09:00
      closeMinute: 1320, // 22:00
      isClosed: false,
    };
  }

  return dayData;
}

// ========================================
// シフト管理フロー期間設定
// ========================================
// ⚠️ 重要: この定義を変更する場合は、Flutter側（lib/globalConstant.dart）にも必ず同期すること
// Flutter側: lib/globalConstant.dart の SHIFT_*_DAY と値が一致している必要があります

/**
 * シフト管理フロー期間の定数
 * 対象月の前月の何日から何日まで、という形で設定します
 * ⚠️ 重要: この定義を変更する場合は、Flutter側（lib/globalConstant.dart）にも必ず同期すること
 */
export const SHIFT_SUBMISSION_START_DAY = 1; // ①提出期間の開始日（前月の何日から）
export const SHIFT_SUBMISSION_END_DAY = 15; // ①提出期間の終了日（前月の何日まで）
export const SHIFT_SCHEDULING_START_DAY = 16; // ②シフトを組む期間の開始日（前月の何日から、以降は管理者の裁量で最終確定可能）

// 管理者が直接作成したシフトのsourceRequestIdに使用する識別子
export const ADMIN_CREATED_SHIFT_ID = "admin-created";

/**
 * 対象日のシフトが②期間（シフトを組む期間）以降かどうかを判定
 * @param dateKey シフト日付（YYYY-MM-DD形式）
 * @returns true: ②期間以降（基本的に提出・修正不可）、false: ②期間前
 * 
 * 例: 2月シフト（2026-02-XX）の場合、前月（1月）の16日以降が②期間
 * この期間中は基本的に提出・修正不可。管理者が不足日・不足時間を送信したタイミングで、不足日・不足時間のみ提出可能になる
 * 16日以降は管理者の裁量で最終確定可能（isFinalized=true）
 */
export function isInShiftSchedulingPeriod(dateKey: string): boolean {
  // dateKeyから年月を抽出
  const [yearStr, monthStr] = dateKey.split("-");
  const targetYear = parseInt(yearStr, 10);
  const targetMonth = parseInt(monthStr, 10);
  
  // 対象月の前月を計算
  let prevMonthYear = targetYear;
  let prevMonth = targetMonth - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevMonthYear--;
  }
  
  // JSTの現在日付を取得
  const now = new Date();
  // JST = UTC + 9時間
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const currentYear = jstNow.getUTCFullYear();
  const currentMonth = jstNow.getUTCMonth() + 1; // getUTCMonth()は0-11、+1で1-12
  const currentDay = jstNow.getUTCDate();
  
  // 現在の日付が前月の16日以降かどうかを判定
  if (currentYear === prevMonthYear && currentMonth === prevMonth) {
    return currentDay >= SHIFT_SCHEDULING_START_DAY;
  }
  
  return false;
}

/**
 * 月内のすべての日が最終確定されているかをチェックし、すべて最終確定されていればallDaysFinalizedフラグを設定
 * @param yearMonth 年月（YYYY-MM形式）
 */
export async function checkAndSetAllDaysFinalized(yearMonth: string): Promise<void> {
  // 月内のすべての日を取得
  const daysSnapshot = await db
    .collection("shifts")
    .doc(yearMonth)
    .collection("days")
    .get();
  
  // すべての日が最終確定されているかをチェック
  let allFinalized = true;
  for (const dayDoc of daysSnapshot.docs) {
    const dayData = dayDoc.data();
    const businessHours = dayData.businessHours as { isClosed?: boolean } | undefined;
    const isClosed = businessHours?.isClosed === true;
    
    // 店休日は最終確定の対象外
    if (isClosed) {
      continue;
    }
    
    // 店休日以外で最終確定されていない日があれば、allFinalized = false
    if (dayData.isFinalized !== true) {
      allFinalized = false;
      break;
    }
  }
  
  // すべて最終確定されていれば、allDaysFinalizedフラグを設定
  if (allFinalized) {
    const monthDocRef = db.collection("shifts").doc(yearMonth);
    await monthDocRef.set(
      {
        allDaysFinalized: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
}

/**
 * 管理者が不足日・不足時間を送信したかどうかを判定
 * @param yearMonth 年月（YYYY-MM形式）
 * @returns true: 送信済み（不足日・不足時間のみ提出可能）、false: 未送信（提出・修正不可）
 * 
 * shifts/{yearMonth} ドキュメントの insufficientDaysNotificationSent フラグを確認
 */
export async function isInsufficientDaysNotificationSent(yearMonth: string): Promise<boolean> {
  const monthDoc = await db.collection("shifts").doc(yearMonth).get();
  
  if (!monthDoc.exists) {
    return false;
  }
  
  const data = monthDoc.data();
  return data?.insufficientDaysNotificationSent === true;
}

/**
 * 指定日のシフトが不足日または不足時間かどうかを判定
 * @param dateKey シフト日付（YYYY-MM-DD形式）
 * @returns true: 不足日または不足時間、false: 不足ではない
 * 
 * 不足日の条件: !isFinalized && !isClosed && isSufficient==false
 * 不足時間の条件: gapSlots または insufficientSlots が存在する
 */
export async function isInsufficientDayOrTimeSlot(dateKey: string): Promise<boolean> {
  const yearMonth = getYearMonthFromDateKey(dateKey);
  
  const dayDoc = await db
    .collection("shifts")
    .doc(yearMonth)
    .collection("days")
    .doc(dateKey)
    .get();
  
  if (!dayDoc.exists) {
    return false;
  }
  
  const dayData = dayDoc.data()!;
  const businessHours = dayData.businessHours as {
    openMinute: number;
    closeMinute: number;
    isClosed: boolean;
  };
  
  // 不足日の条件: !isFinalized && !isClosed && isSufficient==false
  if (
    dayData.isFinalized !== true &&
    businessHours.isClosed !== true &&
    dayData.isSufficient === false
  ) {
    return true;
  }
  
  // 不足時間の条件: gapSlots または insufficientSlots が存在する
  const assignments = (dayData.assignments as Array<{ startMinute: number; endMinute: number }>) || [];
  
  // 時間帯別の必要人数設定を取得（デフォルト値）
  const requiredStaffByTimeSlot = [
    { startHour: 19, endHour: 22, requiredCount: 2 },
    { startHour: 10, endHour: 12, requiredCount: 3 },
  ];
  
  const gapSlots = findGapTimeSlots(
    businessHours.openMinute,
    businessHours.closeMinute,
    assignments
  );
  
  const insufficientSlots = findInsufficientTimeSlots(
    businessHours.openMinute,
    businessHours.closeMinute,
    assignments,
    requiredStaffByTimeSlot
  );
  
  return gapSlots.length > 0 || insufficientSlots.length > 0;
}
