/// 支払い分割計算のpure関数
/// 
/// 「できる限りポイントで払う」モードの計算ロジックを実装します。
library;

import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';

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

