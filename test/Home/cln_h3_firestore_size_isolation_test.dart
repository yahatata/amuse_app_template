import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CLN-H3 Firestore size isolation', () {
    test('Terminal home does not show Firestore size tile', () {
      final src = File('lib/Home/terminalHomePage.dart').readAsStringSync();
      expect(src.contains('Firestoreサイズ計算'), isFalse);
      expect(src.contains('FirestoreSizePage'), isFalse);
      expect(src.contains('firestore_size_page.dart'), isFalse);
    });

    test('Terminal home still has formal sales tiles', () {
      final src = File('lib/Home/terminalHomePage.dart').readAsStringSync();
      expect(src.contains("label: '注文画面'"), isTrue);
      expect(src.contains("label: 'ユーザーログイン'"), isTrue);
      expect(src.contains("label: '会計管理'"), isTrue);
      expect(src.contains("label: 'Tournament Home'"), isTrue);
      expect(src.contains("label: 'sideGame'"), isTrue);
      expect(src.contains('closeStoreTerminal'), isTrue);
      expect(src.contains('_startCloseFlow'), isTrue);
    });

    test('H1 SystemSettings entry stays removed', () {
      final src = File('lib/Home/terminalHomePage.dart').readAsStringSync();
      expect(src.contains('SystemSettingsPage'), isFalse);
      expect(src.contains('systemSettingsPage.dart'), isFalse);
      expect(src.contains("tooltip: 'システム設定'"), isFalse);
    });

    test('Firestore size page remains (not deleted this batch)', () {
      expect(File('lib/Utils/firestore_size_page.dart').existsSync(), isTrue);
      final src = File('lib/Utils/firestore_size_page.dart').readAsStringSync();
      expect(src.contains('class FirestoreSizePage'), isTrue);
      expect(src.contains('calculateFirestoreSize'), isTrue);
      expect(src.contains('サイズを計算'), isTrue);
    });
  });
}
