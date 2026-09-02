import 'dart:io';

import 'package:amuse_app_template/sideGame/pages/side_game_table_home.dart';
import 'package:amuse_app_template/sideGame/side_game_user_facing_errors.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('SideGame table home has no debug caller or debug actions', () {
    final src = File('lib/sideGame/pages/side_game_table_home.dart')
        .readAsStringSync();
    expect(src.contains('debugSideGame'), isFalse);
    expect(src.contains('showDebugActions'), isFalse);
    expect(src.contains('ドキュメントを作成'), isFalse);
    expect(src.contains('デバッグ実行'), isFalse);
  });

  test('table device wrap does not re-enable debug actions', () {
    final src = File('lib/tableDevice/pages/table_device_side_game_page.dart')
        .readAsStringSync();
    expect(src.contains('showDebugActions'), isFalse);
    expect(src.contains('debugSideGame'), isFalse);
  });

  test('user-facing catalog has no debug success copy', () {
    expect(kSideGameTableLoadFailedMessage, isNot(contains('デバッグ')));
    expect(kSideGameTableLoadFailedMessage, isNot(contains('ドキュメントを作成')));
    const page = SideGameTableHomePage(tableId: 'T01', gameName: 'NLH');
    expect(page.tableId, 'T01');
  });
}
