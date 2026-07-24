/// 支払い分割計算のpure関数
/// 
/// 「できる限りポイントで払う」モードの計算ロジックを実装します。
library;

import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/user/max_convertible_reference_amount.dart';
import 'package:amuse_app_template/user/point_ids.dart';
import 'package:amuse_app_template/user/user_balances.dart';
import 'package:amuse_app_template/user/validate_point_config.dart';

/// 計算結果の型定義
class PaymentSplitResult {
  final Map<String, int> usedPoints; // 使用したポイント（円換算値、sideGameChipも含む）
  final int cashLikeAmount; // 実決済手段で支払う合計額
  final Map<String, CategoryBreakdown> categoryBreakdown; // カテゴリごとの内訳
  final CalculationMetadata calculationMetadata; // 計算に使ったパラメータ

  PaymentSplitResult({
    required this.usedPoints,
    required this.cashLikeAmount,
    required this.categoryBreakdown,
    required this.calculationMetadata,
  });

  Map<String, dynamic> toMap() {
    return {
      'usedPoints': usedPoints,
      'cashLikeAmount': cashLikeAmount,
      'categoryBreakdown': categoryBreakdown.map(
        (key, value) => MapEntry(key, value.toMap()),
      ),
      'calculationMetadata': calculationMetadata.toMap(),
    };
  }
}

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

/// 計算に使ったパラメータ
class CalculationMetadata {
  final List<String> pointPriority; // ポイント優先順位
  final String selectedBaseMethod; // 選択された実決済手段
  final Map<String, List<String>> categoryPaymentMethods; // カテゴリ別支払い方法

  CalculationMetadata({
    required this.pointPriority,
    required this.selectedBaseMethod,
    required this.categoryPaymentMethods,
  });

  Map<String, dynamic> toMap() {
    return {
      'pointPriority': pointPriority,
      'selectedBaseMethod': selectedBaseMethod,
      'categoryPaymentMethods': categoryPaymentMethods,
    };
  }
}

/// 支払い分割を計算するpure関数
/// 
/// [selectedBaseMethod] ユーザーが最初に選んだ実決済手段（cash / credit_card / electronic_money）
/// [categoryPaymentMethods] カテゴリ別に使える支払い方法のマップ
/// [bill] カテゴリ別の金額（合計）
/// [balances] ユーザーのポイント残高（pointA, pointB, sideGameChip）
/// [pointPriority] ポイント使用優先順位の配列
/// [sideGameChipExchangeRate] サイドゲームチップの円換算レート（デフォルト: 10.0）
/// [categoryOrder] カテゴリの処理順序（デフォルト: extraCost → sideGameChip → items → tournaments）
/// 
/// 戻り値: 計算結果
PaymentSplitResult calculatePaymentSplit({
  required String selectedBaseMethod,
  required Map<String, List<String>> categoryPaymentMethods,
  required Map<String, int> bill,
  required Map<String, int> balances,
  required List<String> pointPriority,
  double? sideGameChipExchangeRate,
  List<String>? categoryOrder,
}) {
  final rate = sideGameChipExchangeRate ?? StoreConfigService.instance.latestData?.sideGameChipRate ?? kDefaultSideGameChipRate;
  // 入力検証
  if (!['cash', 'credit_card', 'electronic_money'].contains(selectedBaseMethod)) {
    throw ArgumentError(
      'selectedBaseMethod must be one of: cash, credit_card, electronic_money',
    );
  }

  // デフォルトのカテゴリ処理順序
  final order = categoryOrder ?? ['extraCost', 'sideGameChip', 'tournaments', 'items'];

  // ポイント残高のコピー（カテゴリ間で共有）
  final remainingBalances = Map<String, double>.from(
    balances.map((key, value) {
      // sideGameChipはチップ数として扱い、後で円換算する
      return MapEntry(key, value.toDouble());
    }),
  );

  // 結果用のマップ
  final usedPoints = <String, int>{};
  final categoryBreakdown = <String, CategoryBreakdown>{};
  int totalCashLikeAmount = 0;

  // カテゴリごとに処理
  for (final category in order) {
    final categoryTotal = bill[category] ?? 0;
    if (categoryTotal <= 0) {
      // 金額が0のカテゴリはスキップ
      categoryBreakdown[category] = CategoryBreakdown(
        pointsUsed: 0,
        baseMethodAmount: 0,
      );
      continue;
    }

    // このカテゴリで使える支払い手段を取得
    final allowedMethods = categoryPaymentMethods[category] ?? [];

    int remainingAmount = categoryTotal;
    int categoryPointsUsed = 0;

    // pointPriorityの順にポイントを使用
    for (final pointType in pointPriority) {
      if (remainingAmount <= 0) break;

      // このポイントがこのカテゴリで使えるか確認
      if (!allowedMethods.contains(pointType)) continue;

      // 残高を取得（円換算値）
      double availableBalance = remainingBalances[pointType] ?? 0.0;
      
      int pointAmountToUse = 0;
      
      if (pointType == 'sideGameChip') {
        // sideGameChipはチップ数を円に換算
        final availableBalanceInYen = availableBalance * rate;
        
        // 使用可能なポイント額を計算（残額と残高の小さい方）
        final maxUsableInYen = (availableBalanceInYen > remainingAmount)
            ? remainingAmount
            : availableBalanceInYen.toInt();
        
        // チップ単位で切り捨て（チップ数として）
        final maxUsableChips = (maxUsableInYen / rate).floor();
        final sideGameChipUnit = StoreConfigService.instance.latestData?.sideGameChipRoundingUnit ?? kDefaultSideGameChipRoundingUnit;
        final usableChipsRounded = (maxUsableChips / sideGameChipUnit).floor() * sideGameChipUnit;
        
        // 円換算
        pointAmountToUse = (usableChipsRounded * rate).toInt();
      } else {
        // pointA, pointBは円単位
        // 使用可能なポイント額を計算（残額と残高の小さい方）
        final maxUsable = (availableBalance > remainingAmount)
            ? remainingAmount
            : availableBalance.toInt();
        
        // 指定単位で切り捨て
        final pointABUnit = StoreConfigService.instance.latestData?.pointABRoundingUnit ?? kDefaultPointABRoundingUnit;
        pointAmountToUse = (maxUsable / pointABUnit).floor() * pointABUnit;
      }

      if (pointAmountToUse > 0) {
        categoryPointsUsed += pointAmountToUse;
        remainingAmount -= pointAmountToUse;

        // 使用したポイントを記録（円換算値）
        usedPoints[pointType] = (usedPoints[pointType] ?? 0) + pointAmountToUse;

        // 残高を更新
        if (pointType == 'sideGameChip') {
          // チップ数として減算
          remainingBalances[pointType] =
              (remainingBalances[pointType] ?? 0.0) - (pointAmountToUse / rate);
        } else {
          // 通常のポイントは円単位で減算
          remainingBalances[pointType] =
              (remainingBalances[pointType] ?? 0.0) - pointAmountToUse;
        }
      }
    }

    // 残った額はselectedBaseMethodで支払い
    final baseMethodAmount = remainingAmount;
    totalCashLikeAmount += baseMethodAmount;

    categoryBreakdown[category] = CategoryBreakdown(
      pointsUsed: categoryPointsUsed,
      baseMethodAmount: baseMethodAmount,
    );
  }

  // 計算メタデータを作成
  final metadata = CalculationMetadata(
    pointPriority: pointPriority,
    selectedBaseMethod: selectedBaseMethod,
    categoryPaymentMethods: categoryPaymentMethods,
  );

  final result = PaymentSplitResult(
    usedPoints: usedPoints,
    cashLikeAmount: totalCashLikeAmount,
    categoryBreakdown: categoryBreakdown,
    calculationMetadata: metadata,
  );

  // ガード: 計算結果の整合性チェック
  // 各カテゴリの合計（ポイント + 実決済手段）が元の金額と一致することを確認
  int totalBill = 0;
  int totalCalculated = 0;
  for (final category in order) {
    final categoryTotal = bill[category] ?? 0;
    totalBill += categoryTotal;
    
    final breakdown = categoryBreakdown[category]!;
    totalCalculated += breakdown.pointsUsed + breakdown.baseMethodAmount;
  }
  
  assert(
    totalCalculated == totalBill,
    '計算結果の整合性エラー: 計算合計($totalCalculated) != 元の合計($totalBill)',
  );

  return result;
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

