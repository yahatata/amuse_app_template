/// storeMeta/config のデフォルト値
///
/// 読み取り優先度: ① storeMeta/config → ② 本ファイル
/// 参照: functions/src/shared/config/defaults.ts
///       docs/config_migration/phase1/PHASE1_CONFIG_SCHEMA.md

// features
const bool kDefaultDualWriteEnabled = false;
const bool kDefaultEnqueueSchedulerEnabled = true;
const bool kDefaultTemplateBusinessDateCheck = true;
const bool kDefaultSettlementAggregatorEnabled = true;
const bool kDefaultTableDeviceRegistrationEnabled = true;
const bool kDefaultCreateAttendanceByManual = false;
const bool kDefaultReportingAggregatorEnabled = false;
const String kDefaultTableDeviceForceClearPasscode = '0000';
const bool kDefaultTableDeviceTournamentSeatAssignmentEnabled = false;
const bool kDefaultTableDeviceActionHistoryViewEnabled = true;
const bool kDefaultTableDeviceActionHistoryRollbackEnabled = false;

// attendance time adjustment
const bool kDefaultAttendanceTimeAdjustmentEnabled = false;
const int? kDefaultAttendanceTimeAdjustmentMaxFutureMinutes = null;
const int? kDefaultAttendanceTimeAdjustmentMaxPastMinutes = null;

// autoOpenClose
const bool kDefaultAutoOpenCloseEnabled = true;
const int kDefaultTaskCloseOffsetMinutes = 120;
const int kDefaultTaskOpenOffsetMinutes = -30;
const int kDefaultAlreadyRunningDifferentDateRecheckMinutes = 15;

// businessDay
const int kDefaultCalcBufferMinutes = 70;

// billing
const int kDefaultEntranceFee = 1000;
const String kDefaultEntranceFeeDescription = '入店料';
const bool kDefaultChargeEntranceFeeOnReentry = false;
const double kDefaultSideGameChipRate = 10.0;
const int kDefaultPointABRoundingUnit = 1000;
const int kDefaultSideGameChipRoundingUnit = 100;
const List<String> kDefaultPointPriority = ['pointA', 'pointB', 'sideGameChip'];
const Map<String, List<String>> kDefaultCategoryPaymentMethods = {
  'extraCost': ['cash', 'credit_card', 'electronic_money'],
  'sideGameChip': ['cash', 'credit_card', 'electronic_money'],
  'items': [
    'cash',
    'credit_card',
    'electronic_money',
    'pointA',
    'pointB',
    'sideGameChip',
  ],
  'tournaments': [
    'cash',
    'credit_card',
    'electronic_money',
    'pointA',
    'pointB',
  ],
};

// businessHoursStyles
const Map<String, Map<String, dynamic>> kDefaultBusinessHoursStyles = {
  'weekday': {
    'styleId': 'weekday',
    'openMinute': 900,
    'closeMinute': 1500,
    'isClosed': false,
  },
  'weekendHoliday': {
    'styleId': 'weekendHoliday',
    'openMinute': 720,
    'closeMinute': 1500,
    'isClosed': false,
  },
  'event': {
    'styleId': 'event',
    'openMinute': 600,
    'closeMinute': 1500,
    'isClosed': false,
  },
  'allDay': {
    'styleId': 'allDay',
    'openMinute': 360,
    'closeMinute': 1500,
    'isClosed': false,
  },
  'closed': {
    'styleId': 'closed',
    'openMinute': 0,
    'closeMinute': 0,
    'isClosed': true,
  },
};

// linePlan
const String kDefaultLinePlan = 'communication';

// okibake (storeMeta/config.okibake、詳細仕様書 §14.15)
const String kOkibakeLoginPromptModeNone = 'none';
const String kOkibakeLoginPromptModeNoticeOnly = 'notice_only';
const String kOkibakeLoginPromptModeLinkPrompt = 'link_prompt';

const String kDefaultOkibakeLoginPromptMode = kOkibakeLoginPromptModeNoticeOnly;

// shift
const int kDefaultShiftSubmissionStartDay = 1;
const int kDefaultShiftSubmissionEndDay = 15;
const int kDefaultShiftSchedulingStartDay = 16;
const List<Map<String, int>> kDefaultRequiredStaffByTimeSlot = [
  {'startHour': 19, 'endHour': 22, 'requiredCount': 2},
  {'startHour': 10, 'endHour': 12, 'requiredCount': 3},
];

// payroll
const int kDefaultPayrollStartDay = 26;
const int kDefaultPayrollEndDay = 25;

// menuCategories (B-02)
const List<String> kDefaultMenuCategories = [
  'フード',
  'ノンアルコール',
  'アルコール',
  'Chip',
  'その他',
];

// sideGameTypes (B-03)
const List<String> kDefaultSideGameTypes = [
  'ブラックジャック',
  'ルーレット',
  'バカラ',
  'アルティメットポーカー',
];

// tournament (B-04)
const double kDefaultTournamentPrizeRatio = 0.7;
const int kDefaultTournamentPrizeReceiverPercentage = 10;
const String kDefaultTournamentPrizeRoundingMethod = 'floor';
const int kDefaultTournamentPrizeRoundingUnit = 100;
const Map<int, List<double>> kDefaultTournamentPrizeDistribution = {
  1: [100.0],
  2: [65.0, 35.0],
  3: [50.0, 30.0, 20.0],
  4: [45.0, 25.0, 18.0, 12.0],
  5: [40.0, 25.0, 15.0, 12.0, 8.0],
  6: [38.0, 23.0, 15.0, 10.0, 8.0, 6.0],
  7: [36.0, 22.0, 14.0, 9.0, 7.0, 6.0, 6.0],
  8: [35.0, 21.0, 13.0, 9.0, 7.0, 6.0, 5.0, 4.0],
  9: [34.0, 20.0, 12.0, 8.0, 7.0, 6.0, 5.0, 4.0, 4.0],
  10: [32.0, 19.0, 12.0, 8.0, 7.0, 6.0, 5.0, 4.0, 4.0, 3.0],
};

const bool kDefaultTournamentLiffRegistrationEnabled = true;
const bool kDefaultTournamentLiffCalendarEnabled = true;

/// 人数 N に対するデフォルトのプライズ配分比率を返す。
/// 1〜10 は kDefaultTournamentPrizeDistribution、11〜100 は均等配分。
List<double> getDefaultPrizeDistributionForCount(int n) {
  if (kDefaultTournamentPrizeDistribution.containsKey(n)) {
    return List<double>.from(kDefaultTournamentPrizeDistribution[n]!);
  }
  if (n >= 1 && n <= 100) {
    return List.filled(n, 100.0 / n);
  }
  return [100.0];
}
