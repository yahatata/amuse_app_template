/// 売上ダッシュボード用データモデル
/// 
/// 責務: Firestore analyticsMonthly スキーマに対応するDTO
/// 参照フィールド: analyticsMonthly/{YYYY-MM} およびそのサブコレクション
/// 遅延ロード: なし（Repository層で完全取得）

import 'package:cloud_firestore/cloud_firestore.dart';

/// 月次ドキュメント
/// 参照パス: analyticsMonthly/{YYYY-MM}
/// 使用フィールド: grossSales, orderCount, avgOrderValue, itemsSales, sideGameChipSales, tournamentsSales, extraCostSales, dailySales, paymentTotals
class MonthlyDoc {
  final int grossSales;
  final int orderCount;
  final double avgOrderValue;
  final int itemsSales;
  final int sideGameChipSales;
  final int tournamentsSales;
  final int extraCostSales;
  final Map<String, int> dailySales;
  final Map<String, int> paymentTotals;
  final DateTime createdAt;
  final DateTime updatedAt;

  MonthlyDoc({
    required this.grossSales,
    required this.orderCount,
    required this.avgOrderValue,
    required this.itemsSales,
    required this.sideGameChipSales,
    required this.tournamentsSales,
    required this.extraCostSales,
    required this.dailySales,
    required this.paymentTotals,
    required this.createdAt,
    required this.updatedAt,
  });

  factory MonthlyDoc.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return MonthlyDoc(
      grossSales: data['grossSales'] ?? 0,
      orderCount: data['orderCount'] ?? 0,
      avgOrderValue: (data['avgOrderValue'] ?? 0).toDouble(),
      itemsSales: data['itemsSales'] ?? 0,
      sideGameChipSales: data['sideGameChipSales'] ?? 0,
      tournamentsSales: data['tournamentsSales'] ?? 0,
      extraCostSales: data['extraCostSales'] ?? 0,
      dailySales: Map<String, int>.from(data['dailySales'] ?? {}),
      paymentTotals: Map<String, int>.from(data['paymentTotals'] ?? {}),
      createdAt: (data['createdAt'] as Timestamp).toDate(),
      updatedAt: (data['updatedAt'] as Timestamp).toDate(),
    );
  }

  /// カテゴリ別売上データを配列で取得
  List<CategorySales> get categorySales => [
    CategorySales('items', itemsSales),
    CategorySales('sideGameChip', sideGameChipSales),
    CategorySales('tournaments', tournamentsSales),
    CategorySales('extraCost', extraCostSales),
  ];

  /// 支払い方法別データを配列で取得
  List<PaymentMethodSales> get paymentMethodSales => [
    PaymentMethodSales('現金', paymentTotals['cash'] ?? 0),
    PaymentMethodSales('クレカ', paymentTotals['credit_card'] ?? 0),
    PaymentMethodSales('電子', paymentTotals['electronic_money'] ?? 0),
    PaymentMethodSales('PointA', paymentTotals['pointA'] ?? 0),
    PaymentMethodSales('PointB', paymentTotals['pointB'] ?? 0),
    PaymentMethodSales('SGChip', paymentTotals['sideGameChip'] ?? 0),
  ];

  /// 日次売上データを日付昇順で取得
  List<DailySales> get dailySalesList {
    final entries = dailySales.entries.toList();
    entries.sort((a, b) => a.key.compareTo(b.key));
    return entries.map((e) => DailySales(e.key, e.value)).toList();
  }

  /// ベスト日・ワースト日を取得
  ({String? bestDate, int? bestAmount, String? worstDate, int? worstAmount}) get bestWorstDays {
    if (dailySales.isEmpty) return (bestDate: null, bestAmount: null, worstDate: null, worstAmount: null);
    
    final entries = dailySales.entries.toList();
    entries.sort((a, b) => b.value.compareTo(a.value)); // 降順
    
    final best = entries.first;
    final worst = entries.last;
    
    return (
      bestDate: best.key,
      bestAmount: best.value,
      worstDate: worst.key,
      worstAmount: worst.value,
    );
  }
}

/// 日次ドキュメント
/// 参照パス: analyticsMonthly/{YYYY-MM}/days/{YYYY-MM-DD}
/// 使用フィールド: byPaymentMethod, itemsSales, sideGameChipSales, extraCostSales, tournamentsSales, grossSales, orderCount
class DailyDoc {
  final String date; // YYYY-MM-DD
  final Map<String, int> byPaymentMethod;
  final int itemsSales;
  final int sideGameChipSales;
  final int extraCostSales;
  final int tournamentsSales;
  final int grossSales;
  final int orderCount;
  final DateTime createdAt;
  final DateTime updatedAt;

  DailyDoc({
    required this.date,
    required this.byPaymentMethod,
    required this.itemsSales,
    required this.sideGameChipSales,
    required this.extraCostSales,
    required this.tournamentsSales,
    required this.grossSales,
    required this.orderCount,
    required this.createdAt,
    required this.updatedAt,
  });

  factory DailyDoc.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return DailyDoc(
      date: doc.id,
      byPaymentMethod: Map<String, int>.from(data['byPaymentMethod'] ?? {}),
      itemsSales: data['itemsSales'] ?? 0,
      sideGameChipSales: data['sideGameChipSales'] ?? 0,
      extraCostSales: data['extraCostSales'] ?? 0,
      tournamentsSales: data['tournamentsSales'] ?? 0,
      grossSales: data['grossSales'] ?? 0,
      orderCount: data['orderCount'] ?? 0,
      createdAt: (data['createdAt'] as Timestamp).toDate(),
      updatedAt: (data['updatedAt'] as Timestamp).toDate(),
    );
  }
}

/// カテゴリサマリードキュメント
/// 参照パス: analyticsMonthly/{YYYY-MM}/byCategory/summary
/// 使用フィールド: totals, orderCounts, itemSales
class CategorySummaryDoc {
  final Map<String, int> totals;
  final Map<String, int> orderCounts;
  final Map<String, ItemSalesData> itemSales;
  final DateTime createdAt;
  final DateTime updatedAt;

  CategorySummaryDoc({
    required this.totals,
    required this.orderCounts,
    required this.itemSales,
    required this.createdAt,
    required this.updatedAt,
  });

  factory CategorySummaryDoc.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    final itemSalesData = <String, ItemSalesData>{};
    
    if (data['itemSales'] != null) {
      final itemSales = data['itemSales'] as Map<String, dynamic>;
      for (final entry in itemSales.entries) {
        final itemData = entry.value as Map<String, dynamic>;
        itemSalesData[entry.key] = ItemSalesData(
          qty: itemData['qty'] ?? 0,
          sales: itemData['sales'] ?? 0,
          name: itemData['name'] ?? '',
          category: itemData['category'] ?? '',
        );
      }
    }

    return CategorySummaryDoc(
      totals: Map<String, int>.from(data['totals'] ?? {}),
      orderCounts: Map<String, int>.from(data['orderCounts'] ?? {}),
      itemSales: itemSalesData,
      createdAt: (data['createdAt'] as Timestamp).toDate(),
      updatedAt: (data['updatedAt'] as Timestamp).toDate(),
    );
  }

  /// 商品別売上データを売上降順で取得
  List<ItemSalesData> get topItems {
    final items = itemSales.values.toList();
    items.sort((a, b) => b.sales.compareTo(a.sales));
    return items;
  }
}

/// トーナメントテンプレートドキュメント
/// 参照パス: analyticsMonthly/{YYYY-MM}/byTemplateTournaments/{templateId}
/// 使用フィールド: templateName, totals, daily
class TemplateTournamentDoc {
  final String templateId;
  final String templateName;
  final Map<String, int> totals;
  final Map<String, Map<String, int>> daily;
  final DateTime createdAt;
  final DateTime updatedAt;

  TemplateTournamentDoc({
    required this.templateId,
    required this.templateName,
    required this.totals,
    required this.daily,
    required this.createdAt,
    required this.updatedAt,
  });

  factory TemplateTournamentDoc.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    final dailyData = <String, Map<String, int>>{};
    
    if (data['daily'] != null) {
      final daily = data['daily'] as Map<String, dynamic>;
      for (final entry in daily.entries) {
        dailyData[entry.key] = Map<String, int>.from(entry.value as Map<String, dynamic>);
      }
    }

    return TemplateTournamentDoc(
      templateId: doc.id,
      templateName: data['templateName'] ?? '',
      totals: Map<String, int>.from(data['totals'] ?? {}),
      daily: dailyData,
      createdAt: (data['createdAt'] as Timestamp).toDate(),
      updatedAt: (data['updatedAt'] as Timestamp).toDate(),
    );
  }
}

// region ヘルパークラス

/// カテゴリ別売上データ
class CategorySales {
  final String category;
  final int sales;

  CategorySales(this.category, this.sales);
}

/// 支払い方法別売上データ
class PaymentMethodSales {
  final String method;
  final int sales;

  PaymentMethodSales(this.method, this.sales);
}

/// 日次売上データ
class DailySales {
  final String date;
  final int sales;

  DailySales(this.date, this.sales);
}

/// 商品別売上データ
class ItemSalesData {
  final int qty;
  final int sales;
  final String name;
  final String category;

  ItemSalesData({
    required this.qty,
    required this.sales,
    required this.name,
    required this.category,
  });
}

// endregion
