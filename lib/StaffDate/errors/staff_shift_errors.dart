import 'package:amuse_app_template/core/errors/errors.dart';

/// シフト日読込失敗（Firestore）。
const String kShiftDayLoadFailedMessage =
    'シフトデータを取得できませんでした。画面を更新して再度お試しください。';

/// 互換エイリアス（旧命名）。
const String kStaffShiftLoadFailedMessage = kShiftDayLoadFailedMessage;

/// スタッフ一覧取得失敗（Firestore）。
const String kStaffListLoadFailedMessage =
    'スタッフ一覧を取得できませんでした。画面を更新して再度お試しください。';

/// 下書き読込失敗（Firestore）。
const String kShiftDraftLoadFailedMessage =
    '下書きデータを取得できませんでした。画面を更新して再度お試しください。';

/// 互換エイリアス（旧命名）。
const String kStaffDraftLoadFailedMessage = kShiftDraftLoadFailedMessage;

/// 営業日・営業時間読込失敗（Firestore）。
const String kBusinessHoursLoadFailedMessage =
    '営業時間データを取得できませんでした。画面を更新して再度お試しください。';

/// 互換エイリアス（旧命名）。
const String kStaffBusinessDayLoadFailedMessage = kBusinessHoursLoadFailedMessage;

/// 必要人数設定保存失敗（固定。raw を付けない）。
const String kRequiredStaffSaveFailedMessage =
    '設定の保存または不足判定の再計算に失敗しました。\n時間をおいて再度保存してください。';

/// 営業時間は保存できたがシフト日初期化に失敗（STAFF-14 部分成功）。
///
/// 再試行対象は「シフト日の初期化」（営業時間の再保存ではない）。
const String kBusinessHoursSavedShiftInitFailedMessage =
    '営業時間は保存できましたが、シフト日の初期化に失敗しました。\n'
    '「シフト日を初期化」から再度お試しください。';

/// 互換エイリアス（旧命名）。
const String kStaffBusinessHoursSavedShiftInitFailedMessage =
    kBusinessHoursSavedShiftInitFailedMessage;

/// シフト日初期化のみ失敗。
const String kShiftDaysInitFailedMessage =
    'シフト日の初期化に失敗しました。再度お試しください。';

/// 十分フラグ更新失敗。
const String kSufficientOverrideFailedMessage =
    '設定の更新に失敗しました。再度お試しください。';

/// STAFF-14: 営業時間保存 → シフト日初期化の結果（ロールバックなし）。
enum BusinessHoursShiftInitOutcome {
  /// 営業時間保存自体が失敗
  hoursSaveFailed,

  /// 営業時間は保存できたがシフト日初期化が失敗（部分成功）
  hoursSavedShiftInitFailed,

  /// 両方成功
  bothSucceeded,
}

/// [hoursSaved] / [shiftInitSucceeded] から利用者向け結果を決める。
///
/// 再試行対象:
/// - [hoursSaveFailed] → 営業時間の保存をやり直す
/// - [hoursSavedShiftInitFailed] → シフト日初期化のみ再試行（営業時間の再保存は不要）
BusinessHoursShiftInitOutcome resolveBusinessHoursShiftInitOutcome({
  required bool hoursSaved,
  required bool shiftInitSucceeded,
}) {
  if (!hoursSaved) return BusinessHoursShiftInitOutcome.hoursSaveFailed;
  if (!shiftInitSucceeded) {
    return BusinessHoursShiftInitOutcome.hoursSavedShiftInitFailed;
  }
  return BusinessHoursShiftInitOutcome.bothSucceeded;
}

/// [BusinessHoursShiftInitOutcome] に対応する固定文言（失敗・部分成功のみ）。
String? messageForBusinessHoursShiftInitOutcome(
  BusinessHoursShiftInitOutcome outcome,
) {
  switch (outcome) {
    case BusinessHoursShiftInitOutcome.hoursSavedShiftInitFailed:
      return kBusinessHoursSavedShiftInitFailedMessage;
    case BusinessHoursShiftInitOutcome.hoursSaveFailed:
    case BusinessHoursShiftInitOutcome.bothSucceeded:
      return null;
  }
}

/// 利用者向けに解決済みの Staff/Shift 例外（soft-fail 等）。
class StaffShiftUserFacingException implements Exception {
  final String userMessage;

  const StaffShiftUserFacingException(this.userMessage);

  @override
  String toString() => userMessage;
}

/// Staff / Shift の Callable 例外 → 利用者向け文言（D-1）。
String mapStaffShiftCallableError(
  Object exception, {
  required String operation,
}) {
  if (exception is StaffShiftUserFacingException) {
    return exception.userMessage;
  }
  return mapCallableError(exception, operation: operation).message;
}

/// soft-fail Map の場合も同じ経路で解決する。
String mapStaffShiftSoftFailMessage(
  Object? data, {
  required String operation,
}) {
  return mapCallableSoftFailMessage(data, operation: operation);
}
