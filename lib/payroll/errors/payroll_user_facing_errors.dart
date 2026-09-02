import 'package:amuse_app_template/core/errors/errors.dart';

/// Phase 8 Payroll 管理者向けの安全な固定文言・薄い helper。
///
/// raw exception / UID / path / runId / attendanceId は表示しない。
///
/// ## Callable 成功判定の契約
///
/// Functions production の Payroll Callable は **soft-fail の `success` フラグを返さない**。
/// 失敗時は [FirebaseFunctionsException] を throw し、成功時はドメイン固有の Map を返す。
/// そのため Flutter 側は:
/// 1. `success` キーがある → [isCallableSuccessResponse]（`success == true` のみ）
/// 2. `success` キーがない → **Callable ごとの厳密な shape 検証**（フィールド存在＋型）
///
/// `message` / `status` 文字列 / 「例外なし」だけで成功とはしない。
/// `legacyValidator: (_) => true` のような無条件成功は禁止。

const String kPayrollContextLoadFailedMessage =
    '給与計算に必要な情報を取得できませんでした。画面を更新して再度お試しください。';

const String kPayrollCandidatesLoadFailedMessage =
    '給与計算の候補を取得できませんでした。画面を更新して再度お試しください。';

const String kPayrollCandidatesEmptyMessage = '計算対象の候補がありません';

const String kPayrollExecuteFailedMessage =
    '給与計算を開始できませんでした。画面を更新して再度お試しください。';

const String kPayrollHourlyWageMissingMessage =
    '時給が未設定のスタッフがいます。'
    'スタッフ情報から時給を設定して、再度給与計算を実行してください。';

const String kPayrollRetryFailedMessage =
    '失敗したスタッフの再計算を開始できませんでした。画面を更新して再度お試しください。';

const String kPayrollCancelFailedMessage =
    '給与計算の中止に失敗しました。画面を更新して再度お試しください。';

const String kPayrollConfirmFailedMessage =
    '給与計算の確定に失敗しました。画面を更新して再度お試しください。';

const String kPayrollPaymentRegisterFailedMessage =
    '支払登録に失敗しました。画面を更新して再度お試しください。';

const String kPayrollCsvGenerateFailedMessage =
    'CSVの作成に失敗しました。再度お試しください。';

const String kPayrollCsvShareFailedMessage =
    'CSVの共有に失敗しました。再度お試しください。';

const String kPayrollNotificationsLoadFailedMessage =
    '通知を取得できませんでした。画面を更新して再度お試しください。';

const String kPayrollNotificationsStaleUpdateFailedMessage =
    '最新の通知を取得できませんでした。表示内容が古い可能性があります。';

const String kGetPayrollCalcDisplayContextOperation =
    'getPayrollCalcDisplayContext';
const String kGetPayrollCandidatesOperation = 'getPayrollCandidates';
const String kExecuteMonthlyPayrollOperation = 'executeMonthlyPayroll';
const String kRetryFailedStaffTasksOperation = 'retryFailedStaffTasks';
const String kCancelPayrollRunOperation = 'cancelPayrollRun';
const String kConfirmPayrollRunOperation = 'confirmPayrollRun';
const String kRegisterPaymentStatusOperation = 'registerPaymentStatus';

const ErrorMessageCatalog kPayrollErrorMessageCatalog = ErrorMessageCatalog(
  byErrorKey: {
    'PAYROLL_HOURLY_WAGE_MISSING': kPayrollHourlyWageMissingMessage,
  },
  byErrorKeyAndOperation: {
    'PAYROLL_HOURLY_WAGE_MISSING': {
      kExecuteMonthlyPayrollOperation: kPayrollHourlyWageMissingMessage,
    },
  },
);

String mapPayrollCallableError(Object exception, {String? operation}) {
  return mapCallableError(
    exception,
    operation: operation,
    extraCatalogs: [kPayrollErrorMessageCatalog],
  ).message;
}

String mapPayrollSoftFail(Object? data, {String? operation}) {
  return mapCallableSoftFailMessage(data, operation: operation);
}

String payrollNotificationsStreamMessage({
  required bool hasStaleData,
  Object? error,
}) {
  return hasStaleData
      ? kPayrollNotificationsStaleUpdateFailedMessage
      : kPayrollNotificationsLoadFailedMessage;
}

bool _nonEmptyString(Object? value) =>
    value is String && value.trim().isNotEmpty;

/// getPayrollCalcDisplayContext 成功 shape（`success` なし）。
/// 根拠: functions/.../getPayrollCalcDisplayContext.ts は displayContext + isConfirmed。
bool isPayrollCalcDisplayContextShape(Map<dynamic, dynamic> map) {
  return _nonEmptyString(map['paymentPeriodKey']) &&
      _nonEmptyString(map['asOfDateJst']) &&
      _nonEmptyString(map['periodStart']) &&
      _nonEmptyString(map['periodEnd']) &&
      map.containsKey('isConfirmed') &&
      map['isConfirmed'] is bool;
}

/// getPayrollCandidates 成功 shape。
/// 根拠: GetPayrollCandidatesResponse = periodStart/End + group1/2/3 + wageMissingStaff + displayContext + isConfirmed。
bool isPayrollCandidatesShape(Map<dynamic, dynamic> map) {
  return map['group1'] is List &&
      map['group2'] is List &&
      map['group3'] is List &&
      (map['wageMissingStaff'] is List || !map.containsKey('wageMissingStaff')) &&
      _nonEmptyString(map['periodStart']) &&
      _nonEmptyString(map['periodEnd']) &&
      map.containsKey('isConfirmed') &&
      map['isConfirmed'] is bool;
}

/// executeMonthlyPayroll 成功 shape。
/// 根拠: { runId, paymentPeriodKey, targetStaffCount, ..., status: 'processing' }。
/// `status` 単独では判定しない（runId 必須）。非同期 run 開始の証左は runId。
bool isExecuteMonthlyPayrollShape(Map<dynamic, dynamic> map) {
  return _nonEmptyString(map['runId']) &&
      _nonEmptyString(map['paymentPeriodKey']);
}

/// retryFailedStaffTasks 成功 shape。
/// 根拠: { retriedCount, failedStaffIds }。0件再試行も合法（空 List + 0）。
bool isRetryFailedStaffTasksShape(Map<dynamic, dynamic> map) {
  return map['retriedCount'] is num && map['failedStaffIds'] is List;
}

/// cancelPayrollRun 成功 shape。
/// 根拠: { runId, cancelledAt }。
bool isCancelPayrollRunShape(Map<dynamic, dynamic> map) {
  return _nonEmptyString(map['runId']) && _nonEmptyString(map['cancelledAt']);
}

/// confirmPayrollRun 成功 shape。
/// 根拠: { paymentPeriodKey, runId, confirmedAt, ... }。
bool isConfirmPayrollRunShape(Map<dynamic, dynamic> map) {
  return _nonEmptyString(map['paymentPeriodKey']) &&
      _nonEmptyString(map['runId']) &&
      _nonEmptyString(map['confirmedAt']);
}

/// registerPaymentStatus 成功 shape。
/// 根拠: { updatedCount, monthlyPayrollStatus }。
bool isRegisterPaymentStatusShape(Map<dynamic, dynamic> map) {
  return map['updatedCount'] is num &&
      _nonEmptyString(map['monthlyPayrollStatus']);
}

/// Payroll Callable 応答の成功判定。
///
/// - `success` キーがある → [isCallableSuccessResponse] のみ（`true` 以外は失敗）
/// - ない → [shapeValidator] 必須。未指定なら失敗
/// - Map 以外 / null → 失敗
bool isPayrollCallableSuccess(
  Object? data, {
  bool Function(Map<dynamic, dynamic> map)? shapeValidator,
}) {
  if (data is! Map) return false;
  if (data.containsKey('success')) {
    return isCallableSuccessResponse(data);
  }
  if (shapeValidator == null) return false;
  return shapeValidator(Map<dynamic, dynamic>.from(data));
}
