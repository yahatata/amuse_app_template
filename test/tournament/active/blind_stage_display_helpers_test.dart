import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/utils/blind_stage_display_helpers.dart';

void main() {
  group('formatBlindValuesFromStage', () {
    test('sb / bb / ante がある level stage を表示する', () {
      expect(
        formatBlindValuesFromStage({
          'type': 'level',
          'lev': 1,
          'sb': 100,
          'bb': 200,
          'ante': 200,
        }),
        '100 / 200 / 200',
      );
    });

    test('ante が 0 でも表示する', () {
      expect(
        formatBlindValuesFromStage({
          'type': 'level',
          'sb': 100,
          'bb': 200,
          'ante': 0,
        }),
        '100 / 200 / 0',
      );
    });

    test('sb / bb が欠ける場合は仮値ではなく - を返す', () {
      expect(
        formatBlindValuesFromStage({
          'type': 'level',
          'lev': 3,
        }),
        '-',
      );
    });

    test('sb / bb があるが ante が欠ける場合は ante 部分のみ -', () {
      expect(
        formatBlindValuesFromStage({
          'type': 'level',
          'sb': 100,
          'bb': 200,
        }),
        '100 / 200 / -',
      );
    });

    test('break / regist / null は - 系表示', () {
      expect(formatBlindValuesFromStage({'type': 'break'}), '- / - / -');
      expect(formatBlindValuesFromStage({'type': 'regist'}), '-');
      expect(formatBlindValuesFromStage(null), '-');
    });
  });
}
