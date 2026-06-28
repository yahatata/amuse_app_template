import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/utils/blind_avg_stack_display_helpers.dart';

void main() {
  group('formatBlindAvgStack', () {
    test('avgStack が int のときカンマ付き表示', () {
      expect(formatBlindAvgStack(12345), '12,345');
    });

    test('avgStack が null のとき -', () {
      expect(formatBlindAvgStack(null), '-');
    });

    test('avgStack が未設定相当のとき -', () {
      expect(formatBlindAvgStack('invalid'), '-');
    });
  });
}
