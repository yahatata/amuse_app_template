import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CLN-H2 logOps sample isolation', () {
    test('Admin home does not show logOpsError sample tile', () {
      final src = File('lib/Home/adminHomePage.dart').readAsStringSync();
      expect(src.contains('logOpsError 代表サンプル'), isFalse);
      expect(src.contains('LogOpsErrorSamplePage'), isFalse);
      expect(src.contains('log_ops_error_sample_page.dart'), isFalse);
    });

    test('Admin home still has formal sales tiles', () {
      final src = File('lib/Home/adminHomePage.dart').readAsStringSync();
      expect(src.contains("label: '詳細設定'"), isTrue);
      expect(src.contains('AdminDetailSettingsPage'), isTrue);
      expect(src.contains("label: 'デバイス管理'"), isTrue);
      expect(src.contains('DeviceManagementPage'), isTrue);
      expect(src.contains("label: 'シフト'"), isTrue);
      expect(src.contains("label: '給与計算'"), isTrue);
      expect(src.contains("label: '全スタッフ勤怠'"), isTrue);
    });

    test('sample page and logOps callable remain (not deleted this batch)', () {
      expect(
        File('lib/pages/log_ops_error_sample_page.dart').existsSync(),
        isTrue,
      );
      final src =
          File('lib/pages/log_ops_error_sample_page.dart').readAsStringSync();
      expect(src.contains('class LogOpsErrorSamplePage'), isTrue);
      expect(src.contains('emitLogOpsErrorSamples'), isTrue);
    });
  });
}
