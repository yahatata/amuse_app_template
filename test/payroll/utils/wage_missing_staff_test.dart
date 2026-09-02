import 'package:amuse_app_template/payroll/utils/wage_missing_staff.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('parseWageMissingStaff', () {
    test('list を WageMissingStaffEntry に変換', () {
      final parsed = parseWageMissingStaff([
        {'staffId': 's1', 'staffName': 'A'},
        {'staffId': 's2', 'staffName': 'B'},
      ]);
      expect(parsed, hasLength(2));
      expect(parsed[0].staffName, 'A');
    });

    test('空 / 不正は空リスト', () {
      expect(parseWageMissingStaff(null), isEmpty);
      expect(parseWageMissingStaff('x'), isEmpty);
    });
  });

  group('formatWageMissingStaffNames', () {
    test('2名はそのまま表示', () {
      final names = formatWageMissingStaffNames(const [
        WageMissingStaffEntry(staffId: 's1', staffName: '河合　祐弥'),
        WageMissingStaffEntry(staffId: 's2', staffName: '矢羽田　悠生'),
      ]);
      expect(names, '河合　祐弥、矢羽田　悠生');
    });

    test('4名は先頭3名 + ほかN名', () {
      final names = formatWageMissingStaffNames(const [
        WageMissingStaffEntry(staffId: 's1', staffName: 'A'),
        WageMissingStaffEntry(staffId: 's2', staffName: 'B'),
        WageMissingStaffEntry(staffId: 's3', staffName: 'C'),
        WageMissingStaffEntry(staffId: 's4', staffName: 'D'),
      ]);
      expect(names, 'A、B、C、ほか1名');
    });
  });

  group('shouldBlockPayrollExecuteForMissingWage', () {
    test('1人以上で block', () {
      expect(
        shouldBlockPayrollExecuteForMissingWage(const [
          WageMissingStaffEntry(staffId: 's1', staffName: 'A'),
        ]),
        isTrue,
      );
    });

    test('0人で block しない', () {
      expect(shouldBlockPayrollExecuteForMissingWage(const []), isFalse);
    });
  });
}
