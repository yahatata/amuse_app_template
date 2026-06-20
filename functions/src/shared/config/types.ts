/**
 * storeMeta/config の型定義
 *
 * 参照: docs/config_migration/phase1/PHASE1_CONFIG_SCHEMA.md
 */

export interface BusinessHoursStyle {
  styleId: string;
  openMinute: number;
  closeMinute: number;
  isClosed: boolean;
}

export interface RequiredStaffByTimeSlot {
  startHour: number;
  endHour: number;
  requiredCount: number;
}

/** 詳細仕様書 §14.15: storeMeta/config.okibake.loginPromptMode（フラット構成） */
export type OkibakeLoginPromptMode = 'none' | 'notice_only' | 'link_prompt';

export interface OkibakeConfig {
  loginPromptMode: OkibakeLoginPromptMode;
}

export interface TableDeviceConfig {
  forceClearPasscode?: string;
  tournamentSeatAssignmentEnabled?: boolean;
  actionHistoryViewEnabled?: boolean;
  actionHistoryRollbackEnabled?: boolean;
}

export interface StoreConfig {
  features?: {
    dualWriteEnabled?: boolean;
    enqueueSchedulerEnabled?: boolean;
    templateBusinessDateCheck?: boolean;
    settlementAggregatorEnabled?: boolean;
    tableDeviceRegistrationEnabled?: boolean;
    createAttendanceByManual?: boolean;
    reportingAggregatorEnabled?: boolean;
  };
  attendanceTimeAdjustment?: {
    enabled?: boolean;
    maxFutureMinutes?: number | null;
    maxPastMinutes?: number | null;
  };
  autoOpenClose?: {
    enabled?: boolean;
    taskCloseOffsetMinutes?: number;
    taskOpenOffsetMinutes?: number;
    alreadyRunningDifferentDateRecheckMinutes?: number;
  };
  businessDay?: {
    calcBufferMinutes?: number;
  };
  businessHoursStyles?: Record<string, BusinessHoursStyle>;
  billing?: {
    entranceFee?: number;
    entranceFeeDescription?: string;
    chargeEntranceFeeOnReentry?: boolean;
    sideGameChipRate?: number;
    paymentPolicy?: {
      categoryPaymentMethods?: Record<string, string[]>;
      pointPriority?: string[];
      categoryOrder?: string[];
      roundingUnits?: {
        pointAB?: number;
        sideGameChip?: number;
      };
    };
  };
  linePlan?: string;
  shift?: {
    submissionStartDay?: number;
    submissionEndDay?: number;
    schedulingStartDay?: number;
  };
  payroll?: {
    startDay?: number;
    endDay?: number;
  };
  attendance?: {
    nightWorkStartHour?: number;
    nightWorkEndHour?: number;
  };
  menuCategories?: string[];
  sideGameTypes?: string[];
  tournament?: TournamentConfig;
  okibake?: OkibakeConfig;
  tableDevice?: TableDeviceConfig;
}

/** B-04: トーナメント設定（賞金・プライズ） */
export interface TournamentConfig {
  defaultPrizeRatio?: number;
  prizeReceiverPercentage?: number;
  prizeRoundingMethod?: string;
  /** 賞金額の丸め単位（円）。1, 10, 100, 1000 のいずれか */
  prizeRoundingUnit?: number;
  prizeDistribution?: Record<string, number[]>;  // キー "1"〜"10"
  /** LIFF ミニアプリ: 本日トーナメントへの参加登録を許可するか */
  liffRegistrationEnabled?: boolean;
  /** LIFF ミニアプリ: カレンダータブを表示するか */
  liffCalendarEnabled?: boolean;
}

export type StoreConfigRaw = Record<string, unknown>;
