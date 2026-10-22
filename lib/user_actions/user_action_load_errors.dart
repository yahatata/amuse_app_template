import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/user_actions/action_feedback_dialogs.dart';

/// UserAction の Firestore / Stream 読込失敗・部分成功向け固定文言（Phase 6）。
///
/// Callable hard-fail は [buildAsyncActionErrorMessage] / [mapCallableError] へ委譲。
/// raw message / toString / snapshot.error / UID / path は表示しない。

// --- Firestore / Stream 読込 ---

/// Addon 回数表示の読込失敗（USER-14）。回数 0 とは別。
const String kUserActionAddonCountLoadFailedMessage =
    'Addon回数を取得できませんでした。再読み込みしてください。';

/// メニュー一覧読込失敗（USER-22）。0件とは別。
const String kUserActionMenuLoadFailedMessage =
    'メニューを取得できませんでした。再読み込みしてください。';

/// トーナメント情報読込失敗（USER-28 / USER-47）。不在とは別。
const String kUserActionTournamentLoadFailedMessage =
    'トーナメント情報を取得できませんでした。再度お試しください。';

/// 卓座席読込失敗（USER-34）。
const String kUserActionTableLoadFailedMessage =
    '卓情報を取得できませんでした。再度お試しください。';

/// ユーザー Document Stream 失敗（USER-55 / USER-58 / USER-61）。
const String kUserActionUserDocLoadFailedMessage =
    'ユーザー情報を取得できませんでした。画面を閉じて再度お試しください。';

/// 伝票 Document Stream 失敗（USER-64 / USER-67）。
const String kUserActionBillLoadFailedMessage =
    '伝票情報を取得できませんでした。画面を閉じて再度お試しください。';

/// 伝票サブコレクション更新失敗バナー（USER-69）。伝票本体は維持。
const String kUserActionBillDetailsUpdateFailedMessage =
    '明細の最新情報を取得できませんでした。画面を更新して再度お試しください。';

/// 注文履歴 Stream 失敗（USER-71）。空履歴とは別。
const String kUserActionOrderHistoryLoadFailedMessage =
    '注文履歴を取得できませんでした。画面を閉じて再度お試しください。';

/// トーナメント履歴 Stream 失敗（USER-73）。空履歴とは別。
const String kUserActionTournamentHistoryLoadFailedMessage =
    'トーナメント履歴を取得できませんでした。画面を閉じて再度お試しください。';

/// チップ・ポイント履歴読込失敗（USER-74 / USER-75）。空履歴とは別。
const String kUserActionHistoryLoadFailedMessage =
    '履歴を取得できませんでした。再読み込みしてください。';

// --- Callable 操作文脈の defaultMessage ---

const String kUserActionLeaveSeatFailedMessage = '退席処理に失敗しました';

const String kUserActionChipPurchaseFailedMessage = 'Chip購入処理に失敗しました';

const String kUserActionDepositFailedMessage = '預入処理に失敗しました';

const String kUserActionWithdrawFailedMessage = '引き出し処理に失敗しました';

const String kUserActionAddExtraFailedMessage = '追加料金の登録に失敗しました';

const String kUserActionBulkAddonOuterFailedMessage = 'エラーが発生しました';

const String kUserActionLeaveSeatMissingInfoMessage =
    '退席処理に必要な情報が不足しています';

/// USER-51: 預入は成功・退席のみ失敗（ロールバックなし）。
const String kUserActionDepositSucceededLeaveFailedMessage =
    'chipの預入は完了しましたが、退席処理に失敗しました。'
    '退席はホームの退席操作から再度お試しください。';

/// USER-51: depositChip → leaveSeat の結果。
enum DepositLeaveOutcome {
  /// 預入自体が失敗（退席未実施）
  depositFailed,

  /// 預入成功・退席失敗（部分成功。再預入不要）
  depositSucceededLeaveFailed,

  /// 両方成功（退席なしの預入のみも含む）
  bothSucceeded,
}

/// [depositSucceeded] / [leaveSucceeded] から部分成功を判定する。
///
/// [leaveRequested] が false のときは退席を評価しない。
DepositLeaveOutcome resolveDepositLeaveOutcome({
  required bool depositSucceeded,
  required bool leaveRequested,
  required bool leaveSucceeded,
}) {
  if (!depositSucceeded) return DepositLeaveOutcome.depositFailed;
  if (leaveRequested && !leaveSucceeded) {
    return DepositLeaveOutcome.depositSucceededLeaveFailed;
  }
  return DepositLeaveOutcome.bothSucceeded;
}

/// 部分成功・失敗時の利用者向け文言。両方成功は null。
String? messageForDepositLeaveOutcome(
  DepositLeaveOutcome outcome, {
  Object? depositOrLeaveError,
}) {
  switch (outcome) {
    case DepositLeaveOutcome.depositSucceededLeaveFailed:
      return kUserActionDepositSucceededLeaveFailedMessage;
    case DepositLeaveOutcome.depositFailed:
      if (depositOrLeaveError != null) {
        return buildAsyncActionErrorMessage(
          depositOrLeaveError,
          defaultMessage: kUserActionDepositFailedMessage,
        );
      }
      return kUserActionDepositFailedMessage;
    case DepositLeaveOutcome.bothSucceeded:
      return null;
  }
}

/// CLN-B3: 退席を伴う成功時のみ、親のユーザー操作メニューを閉じる。
///
/// deposit のみ・失敗・預入成功+退席失敗では閉じない。
bool shouldCloseUserActionMenuAfterLeave({
  required bool operationSucceeded,
  required bool leftSeat,
}) {
  return operationSucceeded && leftSeat;
}

/// Stream / Future の hasError 向け固定文言（raw は使わない）。
String userActionStreamErrorMessage(
  String fallback, [
  Object? error,
]) {
  return fallback;
}

/// 履歴タブの読込状態（USER-74 / USER-75）。fail ≠ empty。
enum UserActionLogLoadStatus {
  success,
  empty,
  failed,
}

/// 単一ソースの履歴読込結果。
UserActionLogLoadStatus resolveUserActionLogLoadStatus({
  required bool hasError,
  required int itemCount,
}) {
  if (hasError) return UserActionLogLoadStatus.failed;
  if (itemCount <= 0) return UserActionLogLoadStatus.empty;
  return UserActionLogLoadStatus.success;
}

/// 複数タブ／ソースの部分失敗（全体を空扱いにしない）。
class UserActionPartialHistoryLoad {
  const UserActionPartialHistoryLoad({
    required this.currencyPointStatus,
    required this.chipStatus,
  });

  final UserActionLogLoadStatus currencyPointStatus;
  final UserActionLogLoadStatus chipStatus;

  bool get hasAnyFailure =>
      currencyPointStatus == UserActionLogLoadStatus.failed ||
      chipStatus == UserActionLogLoadStatus.failed;

  bool get allEmpty =>
      currencyPointStatus == UserActionLogLoadStatus.empty &&
      chipStatus == UserActionLogLoadStatus.empty;

  /// 片方成功・片方失敗など、部分表示が必要なとき。
  bool get isPartialFailure {
    final statuses = [currencyPointStatus, chipStatus];
    final hasSuccess = statuses.contains(UserActionLogLoadStatus.success);
    final hasFailed = statuses.contains(UserActionLogLoadStatus.failed);
    return hasSuccess && hasFailed;
  }
}

/// Callable catch → D-1 文言（USER-13 等）。
String mapUserActionCallableError(
  Object error, {
  required String defaultMessage,
}) {
  return buildAsyncActionErrorMessage(error, defaultMessage: defaultMessage);
}

/// soft-fail / 不正 shape（D-1）。
String mapUserActionCallableSoftFail(Object? data, {String? operation}) {
  return mapCallableSoftFailMessage(data, operation: operation);
}
