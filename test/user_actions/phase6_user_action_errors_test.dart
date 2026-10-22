import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/user_actions/action_feedback_dialogs.dart';
import 'package:amuse_app_template/user_actions/user_action_load_errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Phase 6 UserAction errors', () {
    test('USER-13 leave fail mapping: no UID/path/raw', () {
      const secret = 'secret-user-id';
      final msg = buildAsyncActionErrorMessage(
        FirebaseFunctionsException(
          code: 'permission-denied',
          message: 'uid=$secret path=/tables/t1/seats/1',
          details: {'errorKey': 'UNKNOWN_KEY'},
        ),
        defaultMessage: kUserActionLeaveSeatFailedMessage,
      );
      expect(msg, 'この操作の権限がありません。');
      expect(msg, isNot(contains(secret)));
      expect(msg, isNot(contains('/tables/')));
      expect(msg, isNot(contains('uid=')));
    });

    test('USER-26b success true/false/{}/string success', () {
      expect(isCallableSuccessResponse({'success': true}), isTrue);
      expect(isCallableSuccessResponse({'success': false}), isFalse);
      expect(isCallableSuccessResponse({}), isFalse);
      expect(isCallableSuccessResponse({'success': 'true'}), isFalse);
      expect(isCallableSuccessResponse(null), isFalse);
      expect(isCallableSuccessResponse('ok'), isFalse);
    });

    test('USER-51 partial success: deposit ok / leave fail', () {
      final outcome = resolveDepositLeaveOutcome(
        depositSucceeded: true,
        leaveRequested: true,
        leaveSucceeded: false,
      );
      expect(outcome, DepositLeaveOutcome.depositSucceededLeaveFailed);
      final msg = messageForDepositLeaveOutcome(outcome);
      expect(msg, kUserActionDepositSucceededLeaveFailedMessage);
      expect(msg, contains('預入は完了'));
      expect(msg, contains('退席'));
      expect(msg, isNot(contains('Exception')));
      expect(msg, isNot(contains('uid=')));
      expect(msg, isNot(contains('/')));
    });

    test('USER-51 deposit fail is not partial success', () {
      final outcome = resolveDepositLeaveOutcome(
        depositSucceeded: false,
        leaveRequested: true,
        leaveSucceeded: false,
      );
      expect(outcome, DepositLeaveOutcome.depositFailed);
      final msg = messageForDepositLeaveOutcome(
        outcome,
        depositOrLeaveError: Exception('secret path=/users/u1'),
      );
      expect(msg, kUserActionDepositFailedMessage);
      expect(msg, isNot(contains('secret')));
      expect(msg, isNot(contains('/users/')));
    });

    test('USER-51 both succeed / deposit-only', () {
      expect(
        resolveDepositLeaveOutcome(
          depositSucceeded: true,
          leaveRequested: false,
          leaveSucceeded: false,
        ),
        DepositLeaveOutcome.bothSucceeded,
      );
      expect(
        messageForDepositLeaveOutcome(DepositLeaveOutcome.bothSucceeded),
        isNull,
      );
    });

    test('CLN-B3 close menu only when leave succeeded', () {
      expect(
        shouldCloseUserActionMenuAfterLeave(
          operationSucceeded: true,
          leftSeat: true,
        ),
        isTrue,
      );
      expect(
        shouldCloseUserActionMenuAfterLeave(
          operationSucceeded: false,
          leftSeat: true,
        ),
        isFalse,
      );
      expect(
        shouldCloseUserActionMenuAfterLeave(
          operationSucceeded: true,
          leftSeat: false,
        ),
        isFalse,
      );
    });

    test('CLN-B3 deposit+leave vs deposit-only vs partial', () {
      final depositAndLeave = resolveDepositLeaveOutcome(
        depositSucceeded: true,
        leaveRequested: true,
        leaveSucceeded: true,
      );
      expect(depositAndLeave, DepositLeaveOutcome.bothSucceeded);
      expect(
        shouldCloseUserActionMenuAfterLeave(
          operationSucceeded: true,
          leftSeat: true,
        ),
        isTrue,
      );

      final depositOnly = resolveDepositLeaveOutcome(
        depositSucceeded: true,
        leaveRequested: false,
        leaveSucceeded: false,
      );
      expect(depositOnly, DepositLeaveOutcome.bothSucceeded);
      expect(
        shouldCloseUserActionMenuAfterLeave(
          operationSucceeded: true,
          leftSeat: false,
        ),
        isFalse,
      );

      final partial = resolveDepositLeaveOutcome(
        depositSucceeded: true,
        leaveRequested: true,
        leaveSucceeded: false,
      );
      expect(partial, DepositLeaveOutcome.depositSucceededLeaveFailed);
      expect(
        shouldCloseUserActionMenuAfterLeave(
          operationSucceeded: true,
          leftSeat: false,
        ),
        isFalse,
      );
    });

    test('USER-55 Stream error constant: no raw', () {
      final raw = Exception('PERMISSION_DENIED path=/users/abc');
      final msg = userActionStreamErrorMessage(
        kUserActionUserDocLoadFailedMessage,
        raw,
      );
      expect(msg, kUserActionUserDocLoadFailedMessage);
      expect(msg, isNot(contains('PERMISSION_DENIED')));
      expect(msg, isNot(contains('/users/')));
      expect(msg, isNot(contains('abc')));
    });

    test('USER-74/75 fail ≠ empty; partial load distinction', () {
      expect(
        resolveUserActionLogLoadStatus(hasError: true, itemCount: 0),
        UserActionLogLoadStatus.failed,
      );
      expect(
        resolveUserActionLogLoadStatus(hasError: false, itemCount: 0),
        UserActionLogLoadStatus.empty,
      );
      expect(
        resolveUserActionLogLoadStatus(hasError: false, itemCount: 3),
        UserActionLogLoadStatus.success,
      );

      final partial = UserActionPartialHistoryLoad(
        currencyPointStatus: UserActionLogLoadStatus.success,
        chipStatus: UserActionLogLoadStatus.failed,
      );
      expect(partial.isPartialFailure, isTrue);
      expect(partial.hasAnyFailure, isTrue);
      expect(partial.allEmpty, isFalse);

      final bothEmpty = UserActionPartialHistoryLoad(
        currencyPointStatus: UserActionLogLoadStatus.empty,
        chipStatus: UserActionLogLoadStatus.empty,
      );
      expect(bothEmpty.allEmpty, isTrue);
      expect(bothEmpty.isPartialFailure, isFalse);

      expect(kUserActionHistoryLoadFailedMessage, isNot(contains(r'$')));
      expect(kUserActionHistoryLoadFailedMessage, contains('履歴'));
    });

    test('mapUserActionCallableError delegates to D-1 helper', () {
      final msg = mapUserActionCallableError(
        FirebaseFunctionsException(
          code: 'unavailable',
          message: 'backend raw',
        ),
        defaultMessage: kUserActionLeaveSeatFailedMessage,
      );
      expect(msg, '通信できません。接続を確認して再度お試しください。');
      expect(msg, isNot(contains('backend raw')));
    });
  });
}
