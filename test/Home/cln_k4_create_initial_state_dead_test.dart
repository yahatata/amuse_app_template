import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CLN-K4 Terminal createInitialStateDoc dead wrapper', () {
    test('Terminal home に _callCreateInitialStateDoc が無い', () {
      final src = File('lib/Home/terminalHomePage.dart').readAsStringSync();
      expect(src.contains('_callCreateInitialStateDoc'), isFalse);
      expect(src.contains("httpsCallable('createInitialStateDocCallable')"), isFalse);
    });

    test('正式初期化は Admin 詳細設定に残る', () {
      final src =
          File('lib/pages/admin_detail_settings_page.dart').readAsStringSync();
      expect(src.contains('createInitialStateDocCallable'), isTrue);
      expect(src.contains('currentBusinessDay 初期化'), isTrue);
    });
  });
}
