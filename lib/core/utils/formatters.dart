/// 売上ダッシュボード用フォーマッター
/// 
/// 責務: 金額・日付・数値の表示フォーマット
/// 参照フィールド: なし（純粋なユーティリティ）
/// 遅延ロード: なし

import 'package:intl/intl.dart';

class Formatters {
  /// 金額を3桁区切りでフォーマット（円記号付き）
  /// 例: 1234567 → "1,234,567円"
  static String formatCurrency(int amount) {
    if (amount < 0) return "0円";
    return NumberFormat('#,###').format(amount) + '円';
  }

  /// 金額を3桁区切りでフォーマット（円記号なし）
  /// 例: 1234567 → "1,234,567"
  static String formatNumber(int amount) {
    if (amount < 0) return "0";
    return NumberFormat('#,###').format(amount);
  }

  /// 金額を短縮形でフォーマット（万円単位）
  /// 例: 1234567 → "123.5万円"
  static String formatCurrencyShort(int amount) {
    if (amount < 0) return "0円";
    if (amount < 10000) return formatCurrency(amount);
    
    final man = amount / 10000;
    if (man < 100) {
      return '${(man * 10).round() / 10}万円';
    } else {
      return '${man.round()}万円';
    }
  }

  /// 日付を YYYY-MM-DD から M/D 形式にフォーマット
  /// 例: "2025-09-15" → "9/15"
  static String formatDateShort(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      return '${date.month}/${date.day}';
    } catch (e) {
      return dateStr;
    }
  }

  /// 日付を YYYY-MM-DD から M月D日 形式にフォーマット
  /// 例: "2025-09-15" → "9月15日"
  static String formatDateJapanese(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      return '${date.month}月${date.day}日';
    } catch (e) {
      return dateStr;
    }
  }

  /// 年月を YYYY-MM から YYYY年M月 形式にフォーマット
  /// 例: "2025-09" → "2025年9月"
  static String formatYearMonth(String yyyymm) {
    try {
      final parts = yyyymm.split('-');
      final year = int.parse(parts[0]);
      final month = int.parse(parts[1]);
      return '${year}年${month}月';
    } catch (e) {
      return yyyymm;
    }
  }

  /// 月番号を M月 形式にフォーマット
  /// 例: 9 → "9月"
  static String formatMonth(int month) {
    return '${month}月';
  }

  /// 比率をパーセント形式でフォーマット
  /// 例: 0.345 → "34.5%"
  static String formatPercentage(double ratio) {
    return '${(ratio * 100).toStringAsFixed(1)}%';
  }

  /// 平均客単価をフォーマット
  /// 例: 3616.5 → "3,617円"
  static String formatAvgOrderValue(double avgValue) {
    return formatCurrency(avgValue.round());
  }

  /// 来店回数をフォーマット
  /// 例: 1250 → "1,250回"
  static String formatOrderCount(int count) {
    return '${formatNumber(count)}回';
  }

  /// 商品名を省略表示用にフォーマット（最大12文字）
  /// 例: "とても長い商品名です" → "とても長い商品名..."
  static String formatItemName(String name, {int maxLength = 12}) {
    if (name.length <= maxLength) return name;
    return '${name.substring(0, maxLength - 3)}...';
  }

  /// カテゴリ名を日本語に変換
  static String getCategoryDisplayName(String category) {
    switch (category) {
      case 'items':
        return '商品';
      case 'sideGameChip':
        return 'サイドゲームチップ';
      case 'tournaments':
        return 'トーナメント';
      case 'extraCost':
        return 'その他料金';
      default:
        return category;
    }
  }

  /// 支払い方法名を日本語に変換
  static String getPaymentMethodDisplayName(String method) {
    switch (method) {
      case 'cash':
        return '現金';
      case 'credit_card':
        return 'クレジットカード';
      case 'electronic_money':
        return '電子マネー';
      case 'pointA':
        return 'ポイントA';
      case 'pointB':
        return 'ポイントB';
      case 'sideGameChip':
        return 'サイドゲームチップ';
      case 'sideGameTip':
        return 'サイドゲームチップ';
      default:
        return method;
    }
  }
}
