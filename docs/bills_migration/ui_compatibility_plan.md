# UI互換アダプタ層設計

_最終更新: 2025-11-10 (JST)_

## 目的
- 既存の Flutter UI が `analyticsMonthly` を読み取って表示している箇所を、新スキーマ（sales/events/cashflow/net 4層）に移行する際の互換性を保つ。
- 過渡期はアダプタ層で旧フィールド名を新スキーマから合成して返し、段階的に新スキーマ直読みへ切替可能にする。

## 既存参照箇所の調査結果

### Flutter 側
1. **lib/data/models/analytics_models.dart**
   - `MonthlyDoc`: `grossSales`, `itemsSales`, `sideGameChipSales`, `tournamentsSales`, `extraCostSales`, `paymentTotals`, `dailySales`, `orderCount`, `avgOrderValue`
   - `DailyDoc`: `grossSales`, `itemsSales`, `sideGameChipSales`, `extraCostSales`, `tournamentsSales`, `byPaymentMethod`, `orderCount`
   - `CategorySummaryDoc`: `totals`, `orderCounts`, `itemSales`

2. **lib/data/repo/analytics_repository.dart**
   - `fetchMonthlyDoc(yyyymm)`: 月次Doc取得
   - `fetchYearlyMonthlyDocs(yyyy)`: 年間12ヶ月分取得
   - `fetchMonthlyDays(yyyymm)`: 日次データ一覧
   - `fetchCategorySummary(yyyymm)`: カテゴリサマリー
   - `fetchTemplateTournamentDocs(yyyymm)`: トーナメントテンプレート一覧

3. **UI 画面**
   - `lib/dashboard/home/dashboard_home_page.dart`: 月次総売上、カテゴリ別、支払方法別表示
   - `lib/dashboard/daily/daily_trend_page.dart`: 日次推移グラフ
   - `lib/dashboard/yearly/yearly_overview_page.dart`: 年間比較
   - `lib/dashboard/payments/payment_breakdown_page.dart`: 支払方法詳細
   - `lib/dashboard/category/category_overview_page.dart`: カテゴリ詳細

### Functions 側
- `functions/src/analytics/addToMonthlyIndex.ts`: 旧スキーマへの書き込み（Phase1 で新スキーマへ切替）

## マッピング表（旧 → 新）

| 旧フィールド | 新フィールド | 変換ロジック |
| --- | --- | --- |
| `grossSales` | `sales.grossIncl` | そのまま |
| `itemsSales` | `sales.category.items` | そのまま |
| `sideGameChipSales` | `sales.category.sideGameChips` | そのまま |
| `tournamentsSales` | `sales.category.tournaments` | そのまま |
| `extraCostSales` | `sales.category.extraCost` | そのまま |
| `paymentTotals[method]` | `cashflow.paymentTotals[method]` | そのまま |
| `dailySales[date]` | `days/{date}.sales.grossIncl` | 日次コレクションから取得 |
| `orderCount` | （新スキーマには無い） | 既存値を維持 or 0 |
| `avgOrderValue` | `grossSales / orderCount` | 計算 |

## 互換アダプタ実装案

### 1. Flutter 側アダプタ（推奨）
**ファイル**: `lib/data/repo/analytics_repository_v2_adapter.dart`

```dart
class AnalyticsRepositoryV2Adapter {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final bool useV2Reads; // Feature Flag: USE_ANALYTICS_V2_READS

  /// 旧 MonthlyDoc 形式で返す（新スキーマから合成）
  Future<MonthlyDoc?> fetchMonthlyDoc(String yyyymm) async {
    if (useV2Reads) {
      // 新スキーマ直読み（将来の実装）
      return _fetchMonthlyDocV2(yyyymm);
    }

    // 旧スキーマ読み取り（現状維持）
    final doc = await _firestore
        .collection('analyticsMonthly')
        .doc(yyyymm)
        .get();
    
    if (!doc.exists) return null;
    final data = doc.data()!;

    // 新スキーマが存在する場合は合成
    if (data['sales'] != null) {
      return MonthlyDoc(
        monthId: yyyymm,
        grossSales: data['sales']['grossIncl'] ?? 0,
        itemsSales: data['sales']['category']['items'] ?? 0,
        sideGameChipSales: data['sales']['category']['sideGameChips'] ?? 0,
        tournamentsSales: data['sales']['category']['tournaments'] ?? 0,
        extraCostSales: data['sales']['category']['extraCost'] ?? 0,
        paymentTotals: Map<String, int>.from(data['cashflow']?['paymentTotals'] ?? {}),
        dailySales: _buildDailySalesFromDays(yyyymm), // days コレクションから合成
        orderCount: data['orderCount'] ?? 0, // 既存値維持
        avgOrderValue: (data['sales']['grossIncl'] ?? 0) / (data['orderCount'] ?? 1),
        createdAt: (data['createdAt'] as Timestamp).toDate(),
        updatedAt: (data['updatedAt'] as Timestamp).toDate(),
      );
    }

    // 旧スキーマのみの場合は既存ロジック
    return MonthlyDoc.fromFirestore(doc);
  }

  Future<Map<String, int>> _buildDailySalesFromDays(String yyyymm) async {
    final snapshot = await _firestore
        .collection('analyticsMonthly')
        .doc(yyyymm)
        .collection('days')
        .get();
    
    final dailySales = <String, int>{};
    for (final dayDoc in snapshot.docs) {
      final data = dayDoc.data();
      dailySales[dayDoc.id] = data['sales']?['grossIncl'] ?? 0;
    }
    return dailySales;
  }
}
```

### 2. Feature Flag 導入
**ファイル**: `lib/app_config/dashboard_config.dart` に追加

```dart
class DashboardConfig {
  static const bool useAnalyticsV2Reads = 
    bool.fromEnvironment('USE_ANALYTICS_V2_READS', defaultValue: false);
}
```

### 3. 段階的切替計画
- Phase1: アダプタ層を導入し、旧スキーマ読み取りを維持。新スキーマが存在する場合は合成して返す。
- Phase1 後半: `USE_ANALYTICS_V2_READS=true` で新スキーマ直読みをテスト。
- Phase2: 全UIを新スキーマ直読みに切替後、アダプタ層を削除。

## 修正箇所一覧

### 最小改修案
1. `lib/data/repo/analytics_repository.dart`
   - `fetchMonthlyDoc` 内で新スキーマ存在チェック → 合成ロジック追加
   - `fetchMonthlyDays` 内で新スキーマ `days/{date}` から取得

2. `lib/data/models/analytics_models.dart`
   - `MonthlyDoc.fromFirestore` に新スキーマ対応の分岐を追加（後方互換維持）

### テスト観点
- 旧スキーマのみ: 既存表示が維持されること
- 新スキーマのみ: アダプタで合成した値が正しいこと
- 新旧混在: 新スキーマを優先し、旧はフォールバック
- Feature Flag ON: 新スキーマ直読みで表示が一致すること

## 注意事項
- `orderCount` は新スキーマに無いため、既存値を維持するか 0 を返す（要確認）。
- `avgOrderValue` は `grossSales / orderCount` で計算（orderCount=0 の場合は 0）。
- `dailySales` は `days` コレクションから動的に構築する必要がある。
