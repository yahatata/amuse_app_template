import 'package:amuse_app_template/Accounting/payment_split_calculator.dart';
import 'package:amuse_app_template/user/point_conversion.dart';
import 'package:amuse_app_template/user/validate_point_config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final balancePaymentSettings = <String, BalancePaymentSetting>{
    'pointA': const BalancePaymentSetting(
      conversion: BalanceConversion(referenceUnits: 1, balanceUnits: 1),
      usageUnit: 1,
    ),
    'pointB': const BalancePaymentSetting(
      conversion: BalanceConversion(referenceUnits: 1, balanceUnits: 1),
      usageUnit: 1,
    ),
    'sideGameChip': const BalancePaymentSetting(
      conversion: BalanceConversion(referenceUnits: 100, balanceUnits: 1),
      usageUnit: 100,
    ),
  };

  final categoryPaymentMethods = <String, List<String>>{
    'extraCost': ['cash', 'credit_card', 'electronic_money'],
    'sideGameChip': ['cash', 'credit_card', 'electronic_money'],
    'tournaments': [
      'cash',
      'credit_card',
      'electronic_money',
      'pointA',
      'pointB',
      'sideGameChip',
    ],
    'items': [
      'cash',
      'credit_card',
      'electronic_money',
      'pointA',
      'pointB',
      'sideGameChip',
    ],
  };

  const categoryOrder = [
    'extraCost',
    'sideGameChip',
    'tournaments',
    'items',
  ];

  test('pointPriority 順で充当し ByCategory/ByAmount を生成する', () {
    final result = calculateA7PaymentSplit(
      selectedBaseMethod: 'cash',
      bill: {
        'extraCost': 0,
        'sideGameChip': 0,
        'tournaments': 0,
        'items': 1000,
      },
      balances: {
        'pointA': 300,
        'pointB': 500,
        'sideGameChip': 0,
      },
      pointPriority: const ['pointA', 'pointB'],
      categoryPaymentMethods: categoryPaymentMethods,
      categoryOrder: categoryOrder,
      balancePaymentSettings: balancePaymentSettings,
    );

    expect(result.usedPointsReference['pointA'], 300);
    expect(result.usedPointsReference['pointB'], 500);
    expect(result.usedBalanceAmounts['pointA'], 300);
    expect(result.cashLikeAmount, 200);
    expect(result.paymentMethodsByAmount['cash'], 200);
    expect(result.paymentMethodsByCategoryForRequest()['items'], isA<List>());
  });

  test('priority にない残高は自動使用しない', () {
    final result = calculateA7PaymentSplit(
      selectedBaseMethod: 'cash',
      bill: {
        'extraCost': 0,
        'sideGameChip': 0,
        'tournaments': 0,
        'items': 500,
      },
      balances: {
        'pointA': 0,
        'pointB': 0,
        'pointC': 1000,
        'sideGameChip': 0,
      },
      pointPriority: const ['pointA', 'pointB'],
      categoryPaymentMethods: {
        ...categoryPaymentMethods,
        'items': [...categoryPaymentMethods['items']!, 'pointC'],
      },
      categoryOrder: categoryOrder,
      balancePaymentSettings: {
        ...balancePaymentSettings,
        'pointC': const BalancePaymentSetting(
          conversion: BalanceConversion(referenceUnits: 1, balanceUnits: 1),
          usageUnit: 1,
        ),
      },
    );

    expect(result.usedPointsReference['pointC'], isNull);
    expect(result.cashLikeAmount, 500);
    expect(result.paymentMethodsByCategory['items'], 'cash');
  });

  test('categoryOrder 空はエラー', () {
    expect(
      () => calculateA7PaymentSplit(
        selectedBaseMethod: 'cash',
        bill: {'items': 100},
        balances: const {},
        pointPriority: const [],
        categoryPaymentMethods: categoryPaymentMethods,
        categoryOrder: const [],
        balancePaymentSettings: balancePaymentSettings,
      ),
      throwsA(isA<CategoryOrderMissingError>()),
    );
  });
}
