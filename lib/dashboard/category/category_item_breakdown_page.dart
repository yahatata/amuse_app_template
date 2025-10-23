/// 商品別詳細画面
/// 
/// 責務: 商品別売上データの詳細表示（売上・数量切り替え）
/// 参照フィールド: analyticsMonthly/{YYYY-MM}/byCategory/summary.itemSales
/// 遅延ロード: なし（データは既に取得済み）

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/repo/analytics_repository.dart';
import '../../data/models/analytics_models.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/skeleton.dart';

// region Riverpod Providers

/// カテゴリサマリーのProvider
final categorySummaryProvider = FutureProvider.family<CategorySummaryDoc?, String>((ref, yyyymm) async {
  final repository = AnalyticsRepository();
  return repository.fetchCategorySummary(yyyymm);
});

// endregion

class CategoryItemBreakdownPage extends ConsumerStatefulWidget {
  final String? month;
  
  const CategoryItemBreakdownPage({
    super.key,
    this.month,
  });

  @override
  ConsumerState<CategoryItemBreakdownPage> createState() => _CategoryItemBreakdownPageState();
}

class _CategoryItemBreakdownPageState extends ConsumerState<CategoryItemBreakdownPage> {
  String _sortBy = 'sales'; // 'sales' or 'qty'
  String _category = 'all'; // 'all', 'items', 'sideGameChip', 'extraCost', 'tournaments'
  
  final List<String> _sortOptions = ['売上', '数量'];
  final List<String> _categoryOptions = ['全て', '商品', 'サイドゲームチップ', '追加料金', 'トーナメント'];

  @override
  Widget build(BuildContext context) {
    final currentMonth = widget.month ?? AnalyticsRepository().getCurrentYearMonth();
    final categorySummaryAsync = ref.watch(categorySummaryProvider(currentMonth));

    return Scaffold(
      appBar: AppBar(
        title: Text('商品別詳細 - ${Formatters.formatYearMonth(currentMonth)}'),
        backgroundColor: Colors.blue[700],
        foregroundColor: Colors.white,
        centerTitle: true,
      ),
      body: categorySummaryAsync.when(
        data: (categorySummary) {
          if (categorySummary == null) {
            return const Center(
              child: Text('データが見つかりません'),
            );
          }
          return _buildItemBreakdownContent(context, categorySummary);
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
          // フィルター（スケルトン）
          const Skeleton(width: double.infinity, height: 60),
          const SizedBox(height: 16),
          // 商品リスト（スケルトン）
          const SkeletonChart(width: double.infinity, height: 400),
        ],
      ),
    );
  }

  Widget _buildItemBreakdownContent(BuildContext context, CategorySummaryDoc categorySummary) {
    final filteredItems = _getFilteredItems(categorySummary);
    
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        children: [
          // フィルター
          _buildFilters(context),
          const SizedBox(height: 16),
          // 商品リスト
          _buildItemList(context, filteredItems),
        ],
      ),
    );
  }

  Widget _buildFilters(BuildContext context) {
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
        children: [
          // 並び順
          Row(
            children: [
              const Text(
                '並び順: ',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: SegmentedButton<String>(
                  segments: _sortOptions.map((option) => 
                    ButtonSegment<String>(
                      value: option,
                      label: Text(option),
                    ),
                  ).toList(),
                  selected: {_sortBy == 'sales' ? '売上' : '数量'},
                  onSelectionChanged: (Set<String> selection) {
                    setState(() {
                      _sortBy = selection.first == '売上' ? 'sales' : 'qty';
                    });
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // カテゴリ
          Row(
            children: [
              const Text(
                'カテゴリ: ',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: SegmentedButton<String>(
                  segments: _categoryOptions.map((option) => 
                    ButtonSegment<String>(
                      value: option,
                      label: Text(option),
                    ),
                  ).toList(),
                  selected: {_getCategoryDisplayName(_category)},
                  onSelectionChanged: (Set<String> selection) {
                    setState(() {
                      _category = _getCategoryValue(selection.first);
                    });
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildItemList(BuildContext context, List<ItemSalesData> items) {
    if (items.isEmpty) {
      return Container(
        height: 200,
        child: const Center(
          child: Text('該当する商品がありません'),
        ),
      );
    }

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
          Text(
            '商品一覧 (${items.length}件)',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          ...items.asMap().entries.map((entry) {
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
                  // 売上・数量
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
        ],
      ),
    );
  }

  List<ItemSalesData> _getFilteredItems(CategorySummaryDoc categorySummary) {
    List<ItemSalesData> items = categorySummary.topItems;
    
    // カテゴリフィルター
    if (_category != 'all') {
      items = items.where((item) => item.category == _category).toList();
    }
    
    // 並び順
    if (_sortBy == 'sales') {
      items.sort((a, b) => b.sales.compareTo(a.sales));
    } else {
      items.sort((a, b) => b.qty.compareTo(a.qty));
    }
    
    return items;
  }

  String _getCategoryDisplayName(String category) {
    switch (category) {
      case 'all':
        return '全て';
      case 'items':
        return '商品';
      case 'sideGameChip':
        return 'サイドゲームチップ';
      case 'extraCost':
        return '追加料金';
      case 'tournaments':
        return 'トーナメント';
      default:
        return category;
    }
  }

  String _getCategoryValue(String displayName) {
    switch (displayName) {
      case '全て':
        return 'all';
      case '商品':
        return 'items';
      case 'サイドゲームチップ':
        return 'sideGameChip';
      case '追加料金':
        return 'extraCost';
      case 'トーナメント':
        return 'tournaments';
      default:
        return 'all';
    }
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
