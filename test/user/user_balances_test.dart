import 'package:amuse_app_template/user/user_balances.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('フィールド欠損 → missing 0', () {
    final r = readBalanceField({}, 'pointA');
    expect(r.kind, BalanceReadKind.missing);
    expect(r.value, 0);
  });

  test('明示 null → corrupt', () {
    final r = readBalanceField({'pointA': null}, 'pointA');
    expect(r.kind, BalanceReadKind.corrupt);
    expect(r.displayValue, isNull);
  });

  test('正常な 0 / 正整数', () {
    expect(readBalanceField({'pointA': 0}, 'pointA').kind, BalanceReadKind.ok);
    expect(readBalanceField({'pointA': 10}, 'pointA').value, 10);
  });

  test('負数・小数・string', () {
    expect(readBalanceField({'pointA': -1}, 'pointA').kind, BalanceReadKind.corrupt);
    expect(
      readBalanceField({'pointA': 1.5}, 'pointA').kind,
      BalanceReadKind.corrupt,
    );
    expect(
      readBalanceField({'pointA': '1'}, 'pointA').kind,
      BalanceReadKind.corrupt,
    );
  });

  test('全 6 残高読取', () {
    expect(readAllStandardBalancesForMigration({}), {
      'pointA': 0,
      'pointB': 0,
      'pointC': 0,
      'pointD': 0,
      'pointE': 0,
      'sideGameChip': 0,
    });
  });

  test('unknown id', () {
    expect(readBalanceField({}, 'pointZ').kind, BalanceReadKind.corrupt);
    expect(() => balanceField('pointZ'), throwsArgumentError);
  });
}
