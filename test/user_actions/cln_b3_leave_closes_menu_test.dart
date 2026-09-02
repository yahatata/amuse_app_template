import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('leave success pops the user action menu', () {
    final src = File('lib/user_actions/user_action_home.dart').readAsStringSync();
    expect(src.contains('ダイアログは閉じない'), isFalse);
    expect(src.contains('shouldCloseUserActionMenuAfterLeave'), isTrue);
    expect(src.contains("httpsCallable('leaveSeat')"), isTrue);
  });

  test('deposit+leave success can close parent menu; deposit-only does not', () {
    final home = File('lib/user_actions/user_action_home.dart').readAsStringSync();
    final deposit =
        File('lib/user_actions/side_game_chip_deposit_popup.dart').readAsStringSync();
    expect(home.contains('closeUserActionMenuOnLeaveSuccess: true'), isTrue);
    expect(
      deposit.contains('closeUserActionMenuOnLeaveSuccess'),
      isTrue,
    );
    expect(deposit.contains('result.leftSeat'), isTrue);
    expect(deposit.contains("httpsCallable('depositChip')"), isTrue);
  });
}
