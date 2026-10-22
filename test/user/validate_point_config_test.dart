import 'package:amuse_app_template/user/validate_point_config.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, Object?> validInput([Map<String, Object?> overrides = const {}]) {
  return {
    'pointSettings': {
      'pointA': {'enabled': true, 'displayName': 'トーナメントポイント'},
      'pointB': {'enabled': true, 'displayName': '来店ポイント'},
      'pointC': {'enabled': false, 'displayName': 'ポイントC'},
      'pointD': {'enabled': false, 'displayName': 'ポイントD'},
      'pointE': {'enabled': false, 'displayName': 'ポイントE'},
    },
    'sideGameChipSettings': {
      'enabled': true,
      'displayName': 'サイドゲームチップ',
    },
    'rankingRewardPointTypes': ['pointA'],
    'categoryPaymentMethods': {
      'extraCost': ['cash', 'credit_card', 'electronic_money'],
      'sideGameChip': ['cash', 'credit_card', 'electronic_money'],
      'items': [
        'cash',
        'credit_card',
        'electronic_money',
        'pointA',
        'pointB',
        'sideGameChip',
      ],
      'tournaments': ['cash', 'pointA', 'pointB'],
    },
    'pointPriority': ['pointA', 'pointB', 'sideGameChip'],
    'balancePaymentSettings': {
      'pointA': {
        'conversion': {'referenceUnits': 1, 'balanceUnits': 1},
        'usageUnit': 1000,
      },
      'pointB': {
        'conversion': {'referenceUnits': 1, 'balanceUnits': 1},
        'usageUnit': 1000,
      },
      'sideGameChip': {
        'conversion': {'referenceUnits': 10, 'balanceUnits': 1},
        'usageUnit': 1000,
      },
    },
    'categoryOrder': ['extraCost', 'sideGameChip', 'tournaments', 'items'],
    ...overrides,
  };
}

PointConfigValidationResult validateFrom(Map<String, Object?> input) {
  return tryValidatePointConfig(
    pointSettings: input['pointSettings'],
    sideGameChipSettings: input['sideGameChipSettings'],
    rankingRewardPointTypes: input['rankingRewardPointTypes'],
    categoryPaymentMethods: input['categoryPaymentMethods'],
    pointPriority: input['pointPriority'],
    balancePaymentSettings: input['balancePaymentSettings'],
    categoryOrder: input['categoryOrder'],
  );
}

void main() {
  test('正常 config', () {
    final r = validateFrom(validInput());
    expect(r.ok, isTrue);
  });

  test('pointPriority 不完全一致を許容', () {
    final r = validateFrom(validInput({'pointPriority': ['pointA']}));
    expect(r.ok, isTrue);
    expect(r.value!.pointPriority, ['pointA']);
  });

  test('未設定は fallback せず失敗', () {
    final r = tryValidatePointConfig(
      pointSettings: null,
      sideGameChipSettings: null,
      rankingRewardPointTypes: null,
      categoryPaymentMethods: null,
      pointPriority: null,
      balancePaymentSettings: null,
      categoryOrder: null,
    );
    expect(r.ok, isFalse);
    expect(r.errorKey, kConfigPointInvalid);
  });

  test('sideGameChip 報酬禁止', () {
    final r = validateFrom(validInput({
      'rankingRewardPointTypes': ['sideGameChip'],
    }));
    expect(r.ok, isFalse);
  });

  test('categoryOrder 欠落は失敗', () {
    final input = validInput();
    input.remove('categoryOrder');
    final r = validateFrom(input);
    expect(r.ok, isFalse);
  });
}
