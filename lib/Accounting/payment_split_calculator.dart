/// A-7 支払い分割計算の pure 関数
///
/// 「できる限りポイントで払う」モードの自動充当ロジック（Functions 側と同一仕様）。
library;

import 'package:amuse_app_template/user/max_convertible_reference_amount.dart';
import 'package:amuse_app_template/user/point_ids.dart';
import 'package:amuse_app_template/user/user_balances.dart';
import 'package:amuse_app_template/user/validate_point_config.dart';

/// カテゴリごとの内訳
class CategoryBreakdown {
  final int pointsUsed; // ポイントで支払った額（円換算）
  final int baseMethodAmount; // 実決済手段で支払った額

  CategoryBreakdown({
    required this.pointsUsed,
    required this.baseMethodAmount,
  });

  Map<String, dynamic> toMap() {
    return {
      'pointsUsed': pointsUsed,
      'baseMethodAmount': baseMethodAmount,
    };
  }
}

/// A-7: categoryOrder 欠落時に throw する専用エラー。
/// ハードコード順への fallback は禁止（changeSpec §9.1.3 / §25）。
class CategoryOrderMissingError extends StateError {
  CategoryOrderMissingError()
      : super('CONFIG_POINT_INVALID: categoryOrder が未設定です');
}

/// A-7 会計 config 不備エラー（categoryOrder 以外の balancePaymentSettings 欠落等）。
class A7ConfigInvalidError extends StateError {
  A7ConfigInvalidError(String message) : super('CONFIG_POINT_INVALID: $message');
}

/// A-7: カテゴリ別支払い 1 分割（method / 基準値量）
class A7CategoryPaymentSplit {
  final String method;
  final int amount; // 基準値量（円等の bill 単位）

  const A7CategoryPaymentSplit({required this.method, required this.amount});

  Map<String, dynamic> toMap() => {'method': method, 'amount': amount};
}

/// A-7: `paymentMethodsByCategory[category]` の値。
/// 文字列（単一 method）または分割リストのいずれか。
typedef A7CategoryPaymentValue = Object; // String | List<A7CategoryPaymentSplit>

/// A-7 自動充当の計算結果
class A7PaymentSplitResult {
  final Map<String, int> usedPointsReference; // 残高種別ごとの基準値量合計
  final Map<String, int> usedBalanceAmounts; // 残高種別ごとの残高減算量合計
  final int cashLikeAmount; // 実決済手段（cash-like）の合計基準値量
  final Map<String, CategoryBreakdown> categoryBreakdown;
  final Map<String, A7CategoryPaymentValue> paymentMethodsByCategory;
  final Map<String, int> paymentMethodsByAmount;

  const A7PaymentSplitResult({
    required this.usedPointsReference,
    required this.usedBalanceAmounts,
    required this.cashLikeAmount,
    required this.categoryBreakdown,
    required this.paymentMethodsByCategory,
    required this.paymentMethodsByAmount,
  });

  /// startAccounting へ送る `paymentMethodsByCategory` の JSON 化可能な形。
  Map<String, dynamic> paymentMethodsByCategoryForRequest() {
    return paymentMethodsByCategory.map((category, value) {
      if (value is String) return MapEntry(category, value);
      final splits = value as List<A7CategoryPaymentSplit>;
      return MapEntry(category, splits.map((s) => s.toMap()).toList());
    });
  }
}

/// A-7 自動充当（categoryOrder ループ + 整数比最大充当）。
///
/// Functions `calculateA7PaymentSplit`（a7PaymentSplit.ts）と同一仕様。
/// 旧 sideGameChipRate / roundingUnits は使わない。
/// [categoryOrder] は呼び出し元が config 正本から渡す必須引数（fallback 禁止）。
A7PaymentSplitResult calculateA7PaymentSplit({
  required String selectedBaseMethod,
  required Map<String, int> bill,
  required Map<String, int> balances,
  required List<String> pointPriority,
  required Map<String, List<String>> categoryPaymentMethods,
  required List<String> categoryOrder,
  required Map<String, BalancePaymentSetting> balancePaymentSettings,
}) {
  if (!isCashLikeMethod(selectedBaseMethod)) {
    throw ArgumentError(
      'selectedBaseMethod must be one of: cash, credit_card, electronic_money',
    );
  }
  if (categoryOrder.isEmpty) {
    throw CategoryOrderMissingError();
  }

  final remainingBalances = <String, int>{};
  for (final entry in balances.entries) {
    if (!isUsableBalanceValue(entry.value)) {
      throw StateError('INVALID_BALANCE: ${entry.key}');
    }
    remainingBalances[entry.key] = entry.value;
  }

  final usedPointsReference = <String, int>{};
  final usedBalanceAmounts = <String, int>{};
  final categoryBreakdown = <String, CategoryBreakdown>{};
  final paymentMethodsByCategory = <String, A7CategoryPaymentValue>{};
  int totalCashLikeAmount = 0;

  for (final category in categoryOrder) {
    final categoryTotal = bill[category] ?? 0;
    if (categoryTotal <= 0) {
      categoryBreakdown[category] = CategoryBreakdown(
        pointsUsed: 0,
        baseMethodAmount: 0,
      );
      continue;
    }

    final allowedMethods = categoryPaymentMethods[category] ?? [];
    int remainingAmount = categoryTotal;
    int categoryPointsUsed = 0;
    final splits = <A7CategoryPaymentSplit>[];

    for (final pointType in pointPriority) {
      if (remainingAmount <= 0) break;
      if (!allowedMethods.contains(pointType)) continue;
      if (!isBalanceId(pointType)) continue;

      final setting = balancePaymentSettings[pointType];
      if (setting == null) {
        throw A7ConfigInvalidError(
          '$pointType の balancePaymentSettings がありません',
        );
      }

      final availableBalance = remainingBalances[pointType] ?? 0;
      final maxConv = computeMaxConvertibleReferenceAmount(
        remainingReferenceAmount: remainingAmount,
        availableBalance: availableBalance,
        conversion: setting.conversion,
        usageUnit: setting.usageUnit,
      );

      if (!maxConv.ok || maxConv.referenceAmount <= 0) continue;

      final referenceUse = maxConv.referenceAmount;
      final balanceUse = maxConv.balanceAmount;

      splits.add(A7CategoryPaymentSplit(method: pointType, amount: referenceUse));
      categoryPointsUsed += referenceUse;
      remainingAmount -= referenceUse;
      usedPointsReference[pointType] =
          (usedPointsReference[pointType] ?? 0) + referenceUse;
      usedBalanceAmounts[pointType] =
          (usedBalanceAmounts[pointType] ?? 0) + balanceUse;
      remainingBalances[pointType] = availableBalance - balanceUse;
    }

    final baseMethodAmount = remainingAmount;
    totalCashLikeAmount += baseMethodAmount;
    categoryBreakdown[category] = CategoryBreakdown(
      pointsUsed: categoryPointsUsed,
      baseMethodAmount: baseMethodAmount,
    );

    if (categoryPointsUsed <= 0) {
      paymentMethodsByCategory[category] = selectedBaseMethod;
    } else {
      if (baseMethodAmount > 0) {
        splits.add(
          A7CategoryPaymentSplit(
            method: selectedBaseMethod,
            amount: baseMethodAmount,
          ),
        );
      }
      paymentMethodsByCategory[category] = splits;
    }
  }

  final paymentMethodsByAmount = <String, int>{};
  for (final entry in paymentMethodsByCategory.entries) {
    final categoryTotal = bill[entry.key] ?? 0;
    if (categoryTotal <= 0) continue;
    final paymentValue = entry.value;
    if (paymentValue is String) {
      paymentMethodsByAmount[paymentValue] =
          (paymentMethodsByAmount[paymentValue] ?? 0) + categoryTotal;
    } else if (paymentValue is List<A7CategoryPaymentSplit>) {
      for (final split in paymentValue) {
        if (split.amount <= 0) continue;
        paymentMethodsByAmount[split.method] =
            (paymentMethodsByAmount[split.method] ?? 0) + split.amount;
      }
    }
  }

  int totalBill = 0;
  int totalCalculated = 0;
  for (final category in categoryOrder) {
    totalBill += bill[category] ?? 0;
    final b = categoryBreakdown[category];
    if (b != null) totalCalculated += b.pointsUsed + b.baseMethodAmount;
  }
  if (totalCalculated != totalBill) {
    throw StateError(
      'ACCOUNTING_PAYMENT_TOTAL_MISMATCH: 計算結果の整合性エラー: '
      '計算合計($totalCalculated) != 元の合計($totalBill)',
    );
  }

  return A7PaymentSplitResult(
    usedPointsReference: usedPointsReference,
    usedBalanceAmounts: usedBalanceAmounts,
    cashLikeAmount: totalCashLikeAmount,
    categoryBreakdown: categoryBreakdown,
    paymentMethodsByCategory: paymentMethodsByCategory,
    paymentMethodsByAmount: paymentMethodsByAmount,
  );
}

/// config 断片から A-7 自動充当に必要な値を取り出すヘルパー。
/// 検証済み [ValidatedPointConfig] が既にあるなら [calculateA7PaymentSplit] に
/// 直接渡してよい。本関数は `StoreConfigService.instance.latestData` から
/// 素の設定を渡して呼び出したい場合の簡易ラッパー。
A7PaymentSplitResult calculateA7PaymentSplitFromValidatedConfig({
  required String selectedBaseMethod,
  required Map<String, int> bill,
  required Map<String, int> balances,
  required ValidatedPointConfig config,
}) {
  return calculateA7PaymentSplit(
    selectedBaseMethod: selectedBaseMethod,
    bill: bill,
    balances: balances,
    pointPriority: config.pointPriority,
    categoryPaymentMethods: config.categoryPaymentMethods,
    categoryOrder: config.categoryOrder,
    balancePaymentSettings: config.balancePaymentSettings,
  );
}
