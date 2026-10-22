/// A-7: 標準残高・現金系支払い method の ID 定義（正本）
///
/// 通貨型ポイントと sideGameChip を混ぜない。
library;

const List<String> kCurrencyPointIds = [
  'pointA',
  'pointB',
  'pointC',
  'pointD',
  'pointE',
];

const String kSideGameChipId = 'sideGameChip';

const List<String> kAllBalanceIds = [
  ...kCurrencyPointIds,
  kSideGameChipId,
];

const List<String> kCashLikeMethods = [
  'cash',
  'credit_card',
  'electronic_money',
];

bool isCurrencyPointId(String? value) =>
    value != null && kCurrencyPointIds.contains(value);

bool isBalanceId(String? value) =>
    value != null && kAllBalanceIds.contains(value);

bool isCashLikeMethod(String? value) =>
    value != null && kCashLikeMethods.contains(value);

/// 表示・初期化の固定順（通貨型 → chip）
List<String> balanceDisplayOrder() => List<String>.unmodifiable(kAllBalanceIds);

/// 新規ユーザー作成時の 6 残高 0 初期化 map
Map<String, int> initialZeroBalanceFields() => {
      for (final id in kAllBalanceIds) id: 0,
    };
