/// 商品別詳細画面
/// 
/// 責務: 商品別売上データの詳細表示（売上・数量切り替え）
/// 参照フィールド: analyticsMonthly/{YYYY-MM}/byCategory/summary.itemSales
/// 遅延ロード: なし（データは既に取得済み）

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../data/repo/analytics_repository.dart';
import '../../data/models/analytics_models.dart';
import '../../core/utils/formatters.dart';
import '../../app_config/dashboard_config.dart';
import '../../core/widgets/skeleton.dart';

// region Riverpod Providers

/// 利用可能な月のリストのProvider
final availableMonthsProvider = FutureProvider<List<String>>((ref) async {
  final firestore = FirebaseFirestore.instance;
  final snapshot = await firestore.collection('analyticsMonthly').get();
  final months = snapshot.docs.map((doc) => doc.id).toList();
  months.sort((a, b) => b.compareTo(a)); // 新しい順にソート
  return months;
});

/// 選択された月のProvider
final selectedMonthProvider = StateProvider<String>((ref) {
  final repository = AnalyticsRepository();
  return repository.getCurrentYearMonth();
});

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
  void initState() {
    super.initState();
    // 遷移時に渡された月をデフォルト値として設定
    if (widget.month != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(selectedMonthProvider.notifier).state = widget.month!;
      });
    }
  }

  /// 月の表示形式をフォーマット（YYYY-MM → YYYY/MM）
  String _formatMonthDisplay(String monthId) {
    if (monthId.isEmpty) return '';
    final parts = monthId.split('-');
    if (parts.length != 2) return monthId;
    final year = parts[0];
    final month = parts[1];
    return '$year/$month';
  }

  @override
  Widget build(BuildContext context) {
    final selectedMonth = ref.watch(selectedMonthProvider);
    final categorySummaryAsync = ref.watch(categorySummaryProvider(selectedMonth));

    final config = DashboardConfig();
    
    return Scaffold(
      backgroundColor: config.bodyBackgroundColor,
      appBar: AppBar(
        title: Text('商品別詳細 - ${Formatters.formatYearMonth(selectedMonth)}'),
        backgroundColor: config.appBarColor,
        foregroundColor: config.appBarTextColor,
        centerTitle: true,
        actions: [
          Consumer(
            builder: (context, ref, child) {
              final availableMonthsAsync = ref.watch(availableMonthsProvider);
              
              return availableMonthsAsync.when(
                data: (availableMonths) {
                  if (availableMonths.isEmpty) {
                    return const SizedBox.shrink();
                  }
                  
                  final displayText = _formatMonthDisplay(selectedMonth);
                  
                  return PopupMenuButton<String>(
                    onSelected: (month) {
                      ref.read(selectedMonthProvider.notifier).state = month;
                    },
                    itemBuilder: (context) {
                      return availableMonths.map((month) {
                        return PopupMenuItem<String>(
                          value: month,
                          child: Text(_formatMonthDisplay(month)),
                        );
                      }).toList();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      child: Text(
                        displayText,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                          decoration: TextDecoration.underline,
                          decorationColor: Colors.white,
                        ),
                      ),
                    ),
                  );
                },
                loading: () => const SizedBox.shrink(),
                error: (error, stack) => const SizedBox.shrink(),
              );
            },
          ),
        ],
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
