import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  late String src;

  setUpAll(() {
    src = File('lib/user_actions/side_game_chip_withdraw_popup.dart')
        .readAsStringSync();
  });

  test('CLN-B2 new withdraw labels are shown', () {
    expect(src.contains("labelText: '引き出すchip額'"), isTrue);
    expect(src.contains("hintText: '引き出すchip額を入力'"), isTrue);
    expect(src.contains("child: const Text('引き出す')"), isTrue);
    expect(src.contains('chipを引き出しますか？'), isTrue);
  });

  test('CLN-B2 old unnatural withdraw wording is gone', () {
    expect(src.contains('引き出し確定'), isFalse);
    expect(src.contains('引き出しするchip額'), isFalse);
    expect(src.contains('引き出し処理を開始してよろしいですか'), isFalse);
  });

  test('CLN-B2 withdrawChip wiring is unchanged', () {
    expect(src.contains("httpsCallable('withdrawChip')"), isTrue);
    expect(src.contains("'userId': widget.userId"), isTrue);
    expect(src.contains("'amount': amount"), isTrue);
    expect(src.contains("'clientNonce': _clientNonce"), isTrue);
  });

  test('CLN-B2 menu noun and failure copy stay', () {
    final home = File('lib/user_actions/user_action_home.dart').readAsStringSync();
    final errors =
        File('lib/user_actions/user_action_load_errors.dart').readAsStringSync();
    expect(home.contains("label: 'chipの引き出し'"), isTrue);
    expect(errors.contains('引き出し処理に失敗しました'), isTrue);
  });
}
