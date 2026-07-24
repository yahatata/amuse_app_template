import 'package:amuse_app_template/user/point_ids.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('通貨型 ID 一覧', () {
    expect(kCurrencyPointIds, [
      'pointA',
      'pointB',
      'pointC',
      'pointD',
      'pointE',
    ]);
  });

  test('sideGameChip は通貨型に含まれない', () {
    expect(kCurrencyPointIds.contains(kSideGameChipId), isFalse);
    expect(isCurrencyPointId(kSideGameChipId), isFalse);
  });

  test('全残高 ID', () {
    expect(kAllBalanceIds, [
      ...kCurrencyPointIds,
      kSideGameChipId,
    ]);
  });

  test('型ガードと表示順', () {
    expect(isBalanceId('pointA'), isTrue);
    expect(isBalanceId('cash'), isFalse);
    expect(isCashLikeMethod('cash'), isTrue);
    expect(balanceDisplayOrder(), kAllBalanceIds);
  });
}
