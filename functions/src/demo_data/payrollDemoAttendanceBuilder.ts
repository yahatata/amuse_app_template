import type { Timestamp } from "firebase-admin/firestore";
import type { StoreConfig } from "../shared/config/types";
import {
  DEFAULT_NIGHT_WORK_END_HOUR,
  DEFAULT_NIGHT_WORK_START_HOUR,
} from "../shared/config/defaults";
import { calculateNightWorkMinutes } from "../domains/attendance/helpers/nightWorkMinutes";

export type BreakSpec = { startedAt: Timestamp; endedAt: Timestamp | null };

export type BuiltClosedAttendance = {
  parent: Record<string, unknown>;
  breaks: BreakSpec[];
};

function nightHours(config: StoreConfig): { start: number; end: number } {
  return {
    start: config.attendance?.nightWorkStartHour ?? DEFAULT_NIGHT_WORK_START_HOUR,
    end: config.attendance?.nightWorkEndHour ?? DEFAULT_NIGHT_WORK_END_HOUR,
  };
}

/**
 * clockIn →（休憩）→ clockOut の結果と整合する親フィールド・breaks を構築する。
 * recalculateAttendanceFromBreaks と同じ集計ロジック。
 */
export function buildClosedAttendanceFromSchedule(
  params: {
    staffId: string;
    staffsFullName: string;
    date: string;
    clockIn: Timestamp;
    clockOut: Timestamp;
    breaks: BreakSpec[];
    demoFlags: Record<string, unknown>;
    config: StoreConfig;
  }
): BuiltClosedAttendance {
  const { staffId, staffsFullName, date, clockIn, clockOut, breaks, demoFlags, config } =
    params;
  const { start: nightWorkStartHour, end: nightWorkEndHour } = nightHours(config);

  let breakMinutes = 0;
  for (const b of breaks) {
    if (!b.endedAt) continue;
    breakMinutes += Math.floor(
      (b.endedAt.toMillis() - b.startedAt.toMillis()) / (1000 * 60)
    );
  }

  const totalMinutes = Math.floor(
    (clockOut.toDate().getTime() - clockIn.toDate().getTime()) / (1000 * 60)
  );
  const actualWorkMinutes = Math.max(0, totalMinutes - breakMinutes);

  const grossNight = calculateNightWorkMinutes(
    clockIn,
    clockOut,
    nightWorkStartHour,
    nightWorkEndHour
  );
  let nightBreakMinutes = 0;
  for (const b of breaks) {
    if (!b.endedAt) continue;
    nightBreakMinutes += calculateNightWorkMinutes(
      b.startedAt,
      b.endedAt,
      nightWorkStartHour,
      nightWorkEndHour
    );
  }
  const nightWorkMinutes = Math.max(0, grossNight - nightBreakMinutes);

  const completedBreaks = breaks.filter((b) => b.endedAt != null);
  const openBreak = breaks.find((b) => b.endedAt == null);

  const parent: Record<string, unknown> = {
    staffId,
    staffsFullName,
    date,
    clockIn,
    clockOut,
    closedStoreWithoutClockOut: false,
    isManual: false,
    nightMinutes: nightWorkMinutes,
    totalMinutes,
    breakMinutes,
    actualWorkMinutes,
    nightWorkMinutes,
    isOnBreak: false,
    currentBreakStartedAt: null,
    breakCount: completedBreaks.length + (openBreak ? 1 : 0),
    lastActionType: "clock_out",
    lastActionAt: clockOut,
    lastActionByDeviceId: null,
    manualReason: null,
    payrollReflectedAt: null,
    payrollStatus: "unreflected",
    reflectedPayrollRunId: null,
    reflectedAt: null,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    ...demoFlags,
  };

  return { parent, breaks };
}

export function buildOpenAttendanceOnlyClockIn(params: {
  staffId: string;
  staffsFullName: string;
  date: string;
  clockIn: Timestamp;
  demoFlags: Record<string, unknown>;
}): Record<string, unknown> {
  const { staffId, staffsFullName, date, clockIn, demoFlags } = params;
  return {
    staffId,
    staffsFullName,
    date,
    clockIn,
    clockOut: null,
    closedStoreWithoutClockOut: false,
    isManual: false,
    nightMinutes: 0,
    totalMinutes: 0,
    breakMinutes: 0,
    actualWorkMinutes: null,
    nightWorkMinutes: 0,
    isOnBreak: false,
    currentBreakStartedAt: null,
    breakCount: 0,
    lastActionType: "clock_in",
    lastActionAt: clockIn,
    lastActionByDeviceId: null,
    manualReason: null,
    payrollReflectedAt: null,
    payrollStatus: "unreflected",
    reflectedPayrollRunId: null,
    reflectedAt: null,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    ...demoFlags,
  };
}

/**
 * startBreak 後・退勤前（休憩中）の状態: 未終了 break 1 件を持つ。
 */
export function buildOpenAttendanceOnBreak(params: {
  staffId: string;
  staffsFullName: string;
  date: string;
  clockIn: Timestamp;
  breakStartedAt: Timestamp;
  demoFlags: Record<string, unknown>;
}): { parent: Record<string, unknown>; breaks: BreakSpec[] } {
  const { staffId, staffsFullName, date, clockIn, breakStartedAt, demoFlags } = params;
  const parent: Record<string, unknown> = {
    staffId,
    staffsFullName,
    date,
    clockIn,
    clockOut: null,
    closedStoreWithoutClockOut: false,
    isManual: false,
    nightMinutes: 0,
    totalMinutes: 0,
    breakMinutes: 0,
    actualWorkMinutes: null,
    nightWorkMinutes: 0,
    isOnBreak: true,
    currentBreakStartedAt: breakStartedAt,
    breakCount: 1,
    lastActionType: "break_start",
    lastActionAt: breakStartedAt,
    lastActionByDeviceId: null,
    manualReason: null,
    payrollReflectedAt: null,
    payrollStatus: "unreflected",
    reflectedPayrollRunId: null,
    reflectedAt: null,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    ...demoFlags,
  };
  const breaks: BreakSpec[] = [{ startedAt: breakStartedAt, endedAt: null }];
  return { parent, breaks };
}
