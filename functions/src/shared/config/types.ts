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

export interface StoreConfig {
  features?: {
    dualWriteEnabled?: boolean;
    enqueueSchedulerEnabled?: boolean;
    templateBusinessDateCheck?: boolean;
    settlementAggregatorEnabled?: boolean;
    tableDeviceRegistrationEnabled?: boolean;
    createAttendanceByManual?: boolean;
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
  menuCategories?: string[];
  sideGameTypes?: string[];
  tournament?: TournamentConfig;
}

/** B-04: トーナメント設定（賞金・プライズ） */
export interface TournamentConfig {
  defaultPrizeRatio?: number;
  prizeReceiverPercentage?: number;
  prizeRoundingMethod?: string;
  /** 賞金額の丸め単位（円）。1, 10, 100, 1000 のいずれか */
  prizeRoundingUnit?: number;
  prizeDistribution?: Record<string, number[]>;  // キー "1"〜"10"
}

export type StoreConfigRaw = Record<string, unknown>;
