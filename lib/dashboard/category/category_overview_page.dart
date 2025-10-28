/// カテゴリ詳細画面
/// 
/// 責務: カテゴリ別売上データの詳細表示
/// 参照フィールド: analyticsMonthly/{YYYY-MM}（月次Doc）、byCategory/summary（商品別）
/// 遅延ロード: あり（商品別データは初回ロード時）

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../data/repo/analytics_repository.dart';
import '../../data/models/analytics_models.dart';
import '../../core/utils/formatters.dart';
import '../../app_config/dashboard_config.dart';
import '../widgets/horizontal_bar_chart.dart';
import '../widgets/stacked_bar_chart.dart';
import '../../core/widgets/skeleton.dart';
import 'category_item_breakdown_page.dart';

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

/// 年間データのProvider
final yearlyDataProvider = FutureProvider.family<List<MonthlyDoc>, String>((ref, year) async {
  final repository = AnalyticsRepository();
  return repository.fetchYearlyMonthlyDocs(year);
});

// endregion

class CategoryOverviewPage extends ConsumerStatefulWidget {
  final String? month;
  
  const CategoryOverviewPage({
    super.key,
    this.month,
  });

  @override
  ConsumerState<CategoryOverviewPage> createState() => _CategoryOverviewPageState();
}

class _CategoryOverviewPageState extends ConsumerState<CategoryOverviewPage>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  String _selectedYear = '';
  
  final List<String> _tabs = [
    '当月',
    '年間比較',
  ];

  @override
  void initState() {
    super.initState();
    _selectedYear = DateTime.now().year.toString();
    _tabController = TabController(
      length: _tabs.length,
      vsync: this,
    );
    // 遷移時に渡された月をデフォルト値として設定
    if (widget.month != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(selectedMonthProvider.notifier).state = widget.month!;
      });
    }
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
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
    final monthlyDataAsync = ref.watch(monthlyDataProvider(selectedMonth));
    final categorySummaryAsync = ref.watch(categorySummaryProvider(selectedMonth));
    final yearlyDataAsync = ref.watch(yearlyDataProvider(_selectedYear));

    final config = DashboardConfig();
    
    return Scaffold(
      backgroundColor: config.bodyBackgroundColor,
      appBar: AppBar(
        title: const Text('カテゴリ詳細'),
        backgroundColor: config.appBarColor,
        foregroundColor: config.appBarTextColor,
        centerTitle: true,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: Container(
            color: config.tabBackgroundColor,
            child: TabBar(
              controller: _tabController,
              labelColor: config.tabTextColor,
              unselectedLabelColor: Colors.grey[400],
              indicatorColor: config.tabColor,
              tabs: _tabs.map((tab) => Tab(text: tab)).toList(),
            ),
          ),
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // 当月タブ
          _buildCurrentMonthTab(context, monthlyDataAsync, categorySummaryAsync),
          // 年間比較タブ
          _buildYearlyComparisonTab(context, yearlyDataAsync),
        ],
      ),
    );
  }

  Widget _buildCurrentMonthTab(BuildContext context, AsyncValue<MonthlyDoc?> monthlyDataAsync, AsyncValue<CategorySummaryDoc?> categorySummaryAsync) {
    return monthlyDataAsync.when(
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
    );
  }

  Widget _buildYearlyComparisonTab(BuildContext context, AsyncValue<List<MonthlyDoc>> yearlyDataAsync) {
    return yearlyDataAsync.when(
      data: (yearlyData) {
        if (yearlyData.isEmpty) {
          return const Center(
            child: Text('データが見つかりません'),
          );
        }
        return _buildYearlyComparisonContent(context, yearlyData);
      },
      loading: () => _buildSkeletonContent(context),
      error: (error, stack) => Center(
        child: Text('エラーが発生しました: $error'),
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
          // 月選択ドロップダウン
          _buildMonthSelector(context),
          const SizedBox(height: 16),
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
              Consumer(
                builder: (context, ref, child) {
                  final selectedMonth = ref.watch(selectedMonthProvider);
                  return TextButton(
                    onPressed: () {
                      // 商品別詳細画面へ遷移
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => CategoryItemBreakdownPage(month: selectedMonth),
                        ),
                      );
                    },
                    child: const Text('詳細を見る'),
                  );
                },
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

  Widget _buildMonthSelector(BuildContext context) {
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
      child: Consumer(
        builder: (context, ref, child) {
          final selectedMonth = ref.watch(selectedMonthProvider);
          final availableMonthsAsync = ref.watch(availableMonthsProvider);
          
          return availableMonthsAsync.when(
            data: (availableMonths) {
              return Row(
                children: [
                  const Text(
                    '月選択: ',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: DropdownButton<String>(
                      value: selectedMonth,
                      isExpanded: true,
                      items: availableMonths.map((month) {
                        return DropdownMenuItem<String>(
                          value: month,
                          child: Text(_formatMonthDisplay(month)),
                        );
                      }).toList(),
                      onChanged: (month) {
                        if (month != null) {
                          ref.read(selectedMonthProvider.notifier).state = month;
                        }
                      },
                    ),
                  ),
                ],
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, stack) => const Text('エラーが発生しました'),
          );
        },
      ),
    );
  }

  Widget _buildYearlyComparisonContent(BuildContext context, List<MonthlyDoc> yearlyData) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        children: [
          // 年選択
          _buildYearSelector(context),
          const SizedBox(height: 16),
          // 年間カテゴリ別推移
          _buildYearlyCategoryChart(context, yearlyData),
        ],
      ),
    );
  }

  Widget _buildYearSelector(BuildContext context) {
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
      child: Row(
        children: [
          const Text(
            '対象年: ',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(width: 8),
          DropdownButton<String>(
            value: _selectedYear,
            onChanged: (String? newValue) {
              if (newValue != null) {
                setState(() {
                  _selectedYear = newValue;
                });
              }
            },
            items: List.generate(5, (index) {
              final year = DateTime.now().year - index;
              return DropdownMenuItem<String>(
                value: year.toString(),
                child: Text('${year}年'),
              );
            }),
          ),
        ],
      ),
    );
  }

  Widget _buildYearlyCategoryChart(BuildContext context, List<MonthlyDoc> yearlyData) {
    return Container(
      height: 400,
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
      child: StackedBarChart(
        yearlyData: yearlyData,
        chartType: 'category',
        title: '年間カテゴリ別推移',
      ),
    );
  }
}
