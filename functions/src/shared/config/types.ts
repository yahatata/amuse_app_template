/**
 * storeMeta/config の型定義
 *
 * 参照: docs/config_migration/phase1/PHASE1_CONFIG_SCHEMA.md
 * A-7: pointSettings / sideGameChipSettings / balancePaymentSettings 等を追加。
 * 旧 billing.sideGameChipRate / roundingUnits は後続フェーズで使用停止（Phase 1 では型に残す）。
 */

export interface BusinessHoursStyle {
  styleId: string;
  openMinute: number;
  closeMinute: number;
  isClosed: boolean;
}

export interface RequiredStaffSlot {
  startHour: number;
  endHour: number;
  requiredCount: number;
}

/** @deprecated v2 では RequiredStaffSlot を使用 */
export interface RequiredStaffByTimeSlot extends RequiredStaffSlot {}

export const REQUIRED_STAFF_STYLE_IDS = [
  'weekday',
  'weekendHoliday',
  'event',
  'allDay',
  'closed',
] as const;

export type RequiredStaffStyleId = (typeof REQUIRED_STAFF_STYLE_IDS)[number];

/** storeMeta/businessStyles の styleId（固定5種。RequiredStaffStyleId と同一） */
export type BusinessStyleId = RequiredStaffStyleId;

export interface BusinessStyleConfig {
  styleId: BusinessStyleId;
  openMinute: number;
  closeMinute: number;
  isClosed: boolean;
  requiredStaffByTimeSlot: RequiredStaffSlot[];
}

/** storeMeta/businessStyles v2 スキーマ */
export interface BusinessStylesConfigV2 {
  version: 2;
  styles: Record<BusinessStyleId, BusinessStyleConfig>;
  updatedAt?: FirebaseFirestore.Timestamp;
}

export interface RequiredStaffByTimeSlotV2 {
  version: 2;
  byStyle: Record<string, RequiredStaffSlot[]>;
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

/** A-7: 通貨型ポイント 1 スロット */
export interface PointSlotSetting {
  enabled: boolean;
  displayName: string;
}

/** A-7: pointA〜E（全キー必須が validation 正本） */
export type PointSettings = {
  pointA: PointSlotSetting;
  pointB: PointSlotSetting;
  pointC: PointSlotSetting;
  pointD: PointSlotSetting;
  pointE: PointSlotSetting;
};

/** A-7: sideGameChip 表示・有効 */
export interface SideGameChipSettings {
  enabled: boolean;
  displayName: string;
}

/** A-7: 残高種別ごとの換算比 */
export interface BalanceConversion {
  referenceUnits: number;
  balanceUnits: number;
}

/** A-7: 換算 + 基準値側利用単位 */
export interface BalancePaymentSetting {
  conversion: BalanceConversion;
  usageUnit: number;
}

export type BalancePaymentSettings = Partial<{
  pointA: BalancePaymentSetting;
  pointB: BalancePaymentSetting;
  pointC: BalancePaymentSetting;
  pointD: BalancePaymentSetting;
  pointE: BalancePaymentSetting;
  sideGameChip: BalancePaymentSetting;
}>;

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
  /** A-7: 通貨型ポイント設定（必須。未設定は validatePointConfig でエラー） */
  pointSettings?: PointSettings;
  /** A-7: chip 設定（必須。未設定は validatePointConfig でエラー） */
  sideGameChipSettings?: SideGameChipSettings;
  billing?: {
    entranceFee?: number;
    entranceFeeDescription?: string;
    chargeEntranceFeeOnReentry?: boolean;
    /**
     * @deprecated A-7 後続で使用停止。Phase 1 では旧会計経路互換のため残置。
     * 換算の正本は paymentPolicy.balancePaymentSettings。
     */
    sideGameChipRate?: number;
    paymentPolicy?: {
      categoryPaymentMethods?: Record<string, string[]>;
      pointPriority?: string[];
      categoryOrder?: string[];
      /** A-7: 残高種別ごとの換算・利用単位 */
      balancePaymentSettings?: BalancePaymentSettings;
      /**
       * @deprecated A-7 後続で使用停止。Phase 1 では旧会計経路互換のため残置。
       */
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
  /**
   * A-7: 順位報酬に使える通貨型ポイント許可一覧。
   * 空配列可。キー欠落は validatePointConfig でエラー。sideGameChip 不可。
   */
  rankingRewardPointTypes?: Array<
    'pointA' | 'pointB' | 'pointC' | 'pointD' | 'pointE'
  >;
}

export type StoreConfigRaw = Record<string, unknown>;
