import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CLN-H1 SystemSettings isolation', () {
    test('Terminal home does not wire SystemSettings navigation', () {
      final src = File('lib/Home/terminalHomePage.dart').readAsStringSync();
      expect(src.contains('SystemSettingsPage'), isFalse);
      expect(src.contains('systemSettingsPage.dart'), isFalse);
      expect(src.contains("tooltip: 'システム設定'"), isFalse);
      expect(src.contains('Icons.settings'), isFalse);
    });

    test('Terminal home still has formal close/open and sales entries', () {
      final src = File('lib/Home/terminalHomePage.dart').readAsStringSync();
      expect(src.contains('closeStoreTerminal'), isTrue);
      expect(src.contains('openStoreTerminal'), isTrue);
      expect(src.contains("label: 'sideGame'"), isTrue);
      expect(src.contains("label: '卓ページ'"), isTrue);
      expect(src.contains('_startCloseFlow'), isTrue);
    });

    test('SystemSettings page class remains for non-sales use', () {
      expect(
        File('lib/Home/systemSettingsPage.dart').existsSync(),
        isTrue,
      );
      final src = File('lib/Home/systemSettingsPage.dart').readAsStringSync();
      expect(src.contains('class SystemSettingsPage'), isTrue);
      expect(src.contains('全テーブルリセット'), isTrue);
      expect(src.contains('全サイドゲームリセット'), isTrue);
    });
  });

  group('CLN-H4 temporary table placement', () {
    test('detail settings exposes 卓管理 and reuses CreateTemporaryTablePage', () {
      final src =
          File('lib/pages/admin_detail_settings_page.dart').readAsStringSync();
      expect(src.contains('卓管理'), isTrue);
      expect(src.contains('一時テーブル作成'), isTrue);
      expect(src.contains('CreateTemporaryTablePage'), isTrue);
      expect(src.contains('createTemporaryTablePage.dart'), isTrue);
    });

    test('Admin home still reaches 詳細設定', () {
      final src = File('lib/Home/adminHomePage.dart').readAsStringSync();
      expect(src.contains("label: '詳細設定'"), isTrue);
      expect(src.contains('AdminDetailSettingsPage'), isTrue);
    });

    test('SystemSettings no longer hosts temporary-table tile', () {
      final src = File('lib/Home/systemSettingsPage.dart').readAsStringSync();
      expect(src.contains('CreateTemporaryTablePage'), isFalse);
      expect(src.contains('createTemporaryTablePage.dart'), isFalse);
      expect(src.contains('一時テーブル作成'), isFalse);
    });

    test('temporary-table page still calls existing callable', () {
      final src =
          File('lib/Home/createTemporaryTablePage.dart').readAsStringSync();
      expect(src.contains("httpsCallable('createTemporaryTable')"), isTrue);
    });
  });
}
