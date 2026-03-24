/// storeMeta/payrollConfig のデフォルト値（Flutter 側）
///
/// Functions 側の payrollConfigDefaults.ts と同一値を維持すること。
///
/// 参照: docs/config_migration/phase4_3/specs/02_CONFIG_SPEC.md

// phase4_2 から継承
const String? kDefaultPayrollConfigPaymentDate = null;
const bool kDefaultPayrollConfigBulkPaymentRegistrationEnabled = false;
const int kDefaultPayrollConfigMaxCandidatesCount = 1000;

// 計算制御
const int kDefaultPayrollConfigWeekStartDay = 0;
const int kDefaultPayrollConfigWeeklyLegalLimitMinutes = 2400;
const int? kDefaultPayrollConfigLegalHolidayWeekday = null;
const String kDefaultPayrollConfigCalcVersion = '1.0';

// 割増率
const double kDefaultPayrollConfigNightPremiumRate = 0.25;
const double kDefaultPayrollConfigOvertimePremiumRate = 0.25;
const double kDefaultPayrollConfigOver60PremiumRate = 0.25;
const double kDefaultPayrollConfigLegalHolidayPremiumRate = 0.35;

// 端数処理
const String kDefaultPayrollConfigRoundingMethod = 'floor';
const int kDefaultPayrollConfigRoundingPrecision = 1;

// 通知・スケジューラー
const int kDefaultPayrollConfigSchedulerNotificationHour = 10;
const int kDefaultPayrollConfigReminderStartDaysAfterPeriodEnd = 3;
