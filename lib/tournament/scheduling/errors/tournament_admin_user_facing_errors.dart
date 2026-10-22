import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_callable_error_formatter.dart';

/// Phase 7B Tournament 管理者向け（スケジュール・テンプレート・履歴）の安全な固定文言。
///
/// raw exception / snapshot.error / UID / path / recurrenceId / templateId は表示しない。

const String kTournamentAdminScheduleLoadFailedMessage =
    '開催予定を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentAdminTemplatesLoadFailedMessage =
    'テンプレートを取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentAdminTemplatesEmptyMessage =
    '利用可能なテンプレートがありません';

const String kTournamentAdminRecurrencesLoadFailedMessage =
    '定期開催一覧を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentAdminRecurrenceNotFoundMessage =
    '定期開催データが見つかりませんでした';

const String kTournamentAdminRecurrenceDetailLoadFailedMessage =
    '定期開催情報を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentAdminActionLogsLoadFailedMessage =
    '操作履歴を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentAdminCalendarLoadFailedMessage =
    '開催予定を取得できませんでした。画面を更新して再度お試しください。';

const String kTournamentAdminStaleUpdateFailedMessage =
    '最新の開催予定を取得できませんでした。表示内容が古い可能性があります。';

const String kUpdateScheduledTournamentStatusOperation =
    'updateScheduledTournamentStatus';
const String kUpdateScheduledTournamentStartAtOperation =
    'updateScheduledTournamentStartAt';
const String kCreateScheduledTournamentOperation = 'createScheduledTournament';
const String kCreateTournamentRecurrenceOperation = 'createTournamentRecurrence';
const String kDeleteTournamentRecurrenceOperation = 'deleteTournamentRecurrence';
const String kLoadTournamentActionLogsOperation = 'loadTournamentActionLogs';
const String kRollbackTournamentActionOperation = 'rollbackTournamentAction';

/// Callable hard-fail → 利用者文言（Tournament formatter / D-1）。
String mapTournamentAdminCallableError(Object exception, {String? operation}) {
  return formatTournamentCallableError(exception);
}

/// soft-fail Map → 利用者文言（backend message は辞書キーにしない）。
String mapTournamentAdminSoftFail(Object? data, {String? operation}) {
  return mapCallableSoftFailMessage(data, operation: operation);
}

/// Stream 初回失敗 vs 更新失敗（stale 保持時）。raw [error] は無視する。
String tournamentAdminScheduleStreamMessage({
  required bool hasStaleData,
  Object? error,
}) {
  return hasStaleData
      ? kTournamentAdminStaleUpdateFailedMessage
      : kTournamentAdminScheduleLoadFailedMessage;
}

/// テンプレート読込失敗時に作成を進めてよいか（失敗時は不可）。
bool canProceedWithTournamentTemplates({
  required bool loadFailed,
  required bool isEmpty,
}) {
  return !loadFailed && !isEmpty;
}
