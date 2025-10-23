/// カテゴリ詳細画面
/// 
/// 責務: カテゴリ別売上データの詳細表示
/// 参照フィールド: analyticsMonthly/{YYYY-MM}（月次Doc）、byCategory/summary（商品別）
/// 遅延ロード: あり（商品別データは初回ロード時）

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/repo/analytics_repository.dart';
import '../../data/models/analytics_models.dart';
import '../../core/utils/formatters.dart';
import '../widgets/horizontal_bar_chart.dart';
import '../../core/widgets/skeleton.dart';
import 'category_item_breakdown_page.dart';

// region Riverpod Providers

/// 月次データのProvider
final monthlyDataProvider = FutureProvider.family<MonthlyDoc?, String>((ref, yyyymm) async {
  final repository = AnalyticsRepository();
  return repository.fetchMonthlyDoc(yyyymm);
});

/// カテゴリサマリーのProvider
final categorySummaryProvider = FutureProvider.family<CategorySummaryDoc?, String>((ref, yyyymm) async {
  final repository = AnalyticsRepository();
  return repository.fetchCategorySummary(yyyymm);
});

// endregion

class CategoryOverviewPage extends ConsumerWidget {
  final String? month;
  
  const CategoryOverviewPage({
    super.key,
    this.month,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentMonth = month ?? AnalyticsRepository().getCurrentYearMonth();
    final monthlyDataAsync = ref.watch(monthlyDataProvider(currentMonth));
    final categorySummaryAsync = ref.watch(categorySummaryProvider(currentMonth));

    return Scaffold(
      appBar: AppBar(
        title: Text('カテゴリ詳細 - ${Formatters.formatYearMonth(currentMonth)}'),
        backgroundColor: Colors.blue[700],
        foregroundColor: Colors.white,
        centerTitle: true,
      ),
      body: monthlyDataAsync.when(
        data: (monthlyData) {
          if (monthlyData == null) {
            return const Center(
              child: Text('データが見つかりません'),
            );
          }
          return _buildCategoryContent(context, monthlyData, categorySummaryAsync);
        },
        loading: () => _buildSkeletonContent(context),
        error: (error, stack) => Center(
          child: Text('エラーが発生しました: $error'),
        ),
      ),
    );
  }

  Widget _buildSkeletonContent(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        children: [
          // カテゴリ別横棒グラフ（スケルトン）
          const SkeletonChart(width: double.infinity, height: 300),
          const SizedBox(height: 16),
          // 商品別詳細（スケルトン）
          const SkeletonChart(width: double.infinity, height: 400),
        ],
      ),
    );
  }

  Widget _buildCategoryContent(BuildContext context, MonthlyDoc monthlyData, AsyncValue<CategorySummaryDoc?> categorySummaryAsync) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        children: [
          // カテゴリ別横棒グラフ
          _buildCategoryChart(context, monthlyData),
          const SizedBox(height: 16),
          // 商品別詳細
          _buildItemBreakdown(context, categorySummaryAsync),
        ],
      ),
    );
  }

  Widget _buildCategoryChart(BuildContext context, MonthlyDoc monthlyData) {
    return Container(
      height: 300,
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16.0),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'カテゴリ別売上',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: HorizontalBarChart(
              categoryData: monthlyData.categorySales,
              showValues: true,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildItemBreakdown(BuildContext context, AsyncValue<CategorySummaryDoc?> categorySummaryAsync) {
    return Container(
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16.0),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                '商品別売上',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              TextButton(
                onPressed: () {
                  // 商品別詳細画面へ遷移
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => const CategoryItemBreakdownPage(),
                    ),
                  );
                },
                child: const Text('詳細を見る'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          categorySummaryAsync.when(
            data: (categorySummary) {
              if (categorySummary == null) {
                return const Center(
                  child: Text('商品データが見つかりません'),
                );
              }
              return _buildItemList(categorySummary);
            },
            loading: () => const Center(
              child: CircularProgressIndicator(),
            ),
            error: (error, stack) => Center(
              child: Text('エラーが発生しました: $error'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildItemList(CategorySummaryDoc categorySummary) {
    final topItems = categorySummary.topItems.take(10).toList();
    
    if (topItems.isEmpty) {
      return const Center(
        child: Text('商品データがありません'),
      );
    }

    return Column(
      children: topItems.asMap().entries.map((entry) {
        final index = entry.key;
        final item = entry.value;
        
        return Container(
          margin: const EdgeInsets.only(bottom: 8.0),
          padding: const EdgeInsets.all(12.0),
          decoration: BoxDecoration(
            color: Colors.grey[50],
            borderRadius: BorderRadius.circular(8.0),
            border: Border.all(color: Colors.grey[200]!),
          ),
          child: Row(
            children: [
              // 順位
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: _getRankColor(index + 1),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    '${index + 1}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              // 商品情報
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      Formatters.formatItemName(item.name),
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    Text(
                      '${Formatters.formatNumber(item.qty)}個',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ),
              ),
              // 売上
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    Formatters.formatCurrency(item.sales),
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: Colors.blue,
                    ),
                  ),
                  Text(
                    Formatters.getCategoryDisplayName(item.category),
                    style: TextStyle(
                      fontSize: 10,
                      color: Colors.grey[500],
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  Color _getRankColor(int rank) {
    switch (rank) {
      case 1:
        return Colors.amber;
      case 2:
        return Colors.grey[400]!;
      case 3:
        return Colors.orange[300]!;
      default:
        return Colors.blue;
    }
  }
}
