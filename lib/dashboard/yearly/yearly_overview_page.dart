/// 年間比較画面
/// 
/// 責務: 年間データの比較表示（タブ切替対応）
/// 参照フィールド: 対象年の12ヶ月分のanalyticsMonthly/{YYYY-MM}
/// 遅延ロード: あり（初回ロード時）

import 'package:amuse_app_template/dashboard/errors/dashboard_user_facing_errors.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/repo/analytics_repository.dart';
import '../../data/models/analytics_models.dart';
import '../../app_config/dashboard_config.dart';
import '../widgets/stacked_bar_chart.dart';
import '../../core/widgets/skeleton.dart';

// region Riverpod Providers

/// 年間データのProvider
final yearlyDataProvider = FutureProvider.family<List<MonthlyDoc>, String>((ref, year) async {
  final repository = AnalyticsRepository();
  return repository.fetchYearlyMonthlyDocs(year);
});

// endregion

class YearlyOverviewPage extends ConsumerStatefulWidget {
  final String? initialTab;
  
  const YearlyOverviewPage({
    super.key,
    this.initialTab,
  });

  @override
  ConsumerState<YearlyOverviewPage> createState() => _YearlyOverviewPageState();
}

class _YearlyOverviewPageState extends ConsumerState<YearlyOverviewPage>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  String _selectedYear = '';
  
  final List<String> _tabs = [
    '総売上',
    '決済別',
    'カテゴリ別',
    '来店数',
    '平均客単価',
  ];

  @override
  void initState() {
    super.initState();
    _selectedYear = DateTime.now().year.toString();
    _tabController = TabController(
      length: _tabs.length,
      vsync: this,
      initialIndex: _getInitialTabIndex(),
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  int _getInitialTabIndex() {
    if (widget.initialTab == null) return 0;
    final index = _tabs.indexOf(widget.initialTab!);
    return index >= 0 ? index : 0;
  }

  @override
  Widget build(BuildContext context) {
    final yearlyDataAsync = ref.watch(yearlyDataProvider(_selectedYear));
    final config = DashboardConfig();

    return Scaffold(
      backgroundColor: config.bodyBackgroundColor,
      appBar: AppBar(
        title: Text('${_selectedYear}年 年間比較'),
        backgroundColor: config.appBarColor,
        foregroundColor: config.appBarTextColor,
        centerTitle: true,
        actions: [
          // 年選択をAppBar右端に配置
          Container(
            margin: const EdgeInsets.only(right: 16),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  '対象年: ',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                  ),
                ),
                DropdownButton<String>(
                  value: _selectedYear,
                  dropdownColor: Colors.blue[700],
                  underline: Container(), // 下線を削除
                  icon: const Icon(
                    Icons.arrow_drop_down,
                    color: Colors.white,
                  ),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                  ),
                  onChanged: (String? newValue) {
                    if (newValue != null) {
                      setState(() {
                        _selectedYear = newValue;
                      });
                    }
                  },
                  items: _generateYearItems(),
                ),
              ],
            ),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: Container(
            color: config.tabBackgroundColor,
            child: TabBar(
              controller: _tabController,
              isScrollable: true,
              labelColor: config.tabTextColor,
              unselectedLabelColor: Colors.grey[400],
              indicatorColor: config.tabColor,
              tabs: _tabs.map((tab) => Tab(text: tab)).toList(),
            ),
          ),
        ),
      ),
      body: yearlyDataAsync.when(
        data: (yearlyData) {
          if (yearlyData.isEmpty) {
            return const Center(
              child: Text('データが見つかりません'),
            );
          }
          return _buildYearlyContent(context, yearlyData);
        },
        loading: () => _buildSkeletonContent(context),
        error: (error, stack) => dashboardLoadErrorWidget(
          message: mapDashboardLoadError(error),
          onRetry: () => ref.invalidate(yearlyDataProvider(_selectedYear)),
        ),
      ),
    );
  }

  Widget _buildSkeletonContent(BuildContext context) {
    return Column(
      children: [
        // 年選択
        Container(
          padding: const EdgeInsets.all(16.0),
          child: const Skeleton(width: 200, height: 40),
        ),
        // グラフ
        Expanded(
          child: const SkeletonChart(width: double.infinity, height: 400),
        ),
      ],
    );
  }

  Widget _buildYearlyContent(BuildContext context, List<MonthlyDoc> yearlyData) {
    return TabBarView(
      controller: _tabController,
      children: [
        // 総売上
        _buildSalesChart(yearlyData),
        // 決済別
        _buildPaymentChart(yearlyData),
        // カテゴリ別
        _buildCategoryChart(yearlyData),
        // 来店数
        _buildOrdersChart(yearlyData),
        // 平均客単価
        _buildAvgValueChart(yearlyData),
      ],
    );
  }

  /// 年選択のアイテムを生成（2025年~現在年まで）
  List<DropdownMenuItem<String>> _generateYearItems() {
    final currentYear = DateTime.now().year;
    final startYear = 2025;
    
    return List.generate(
      currentYear - startYear + 1,
      (index) {
        final year = startYear + index;
        return DropdownMenuItem<String>(
          value: year.toString(),
          child: Text(
            '${year}年',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
            ),
          ),
        );
      },
    );
  }

  Widget _buildSalesChart(List<MonthlyDoc> yearlyData) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: StackedBarChart(
        yearlyData: yearlyData,
        chartType: 'sales',
        title: '月間総売上推移',
        onTap: () {
          // 詳細アクション（必要に応じて実装）
        },
      ),
    );
  }

  Widget _buildPaymentChart(List<MonthlyDoc> yearlyData) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: StackedBarChart(
        yearlyData: yearlyData,
        chartType: 'payment',
        title: '月間決済別推移',
        onTap: () {
          // 詳細アクション（必要に応じて実装）
        },
      ),
    );
  }

  Widget _buildCategoryChart(List<MonthlyDoc> yearlyData) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: StackedBarChart(
        yearlyData: yearlyData,
        chartType: 'category',
        title: '月間カテゴリ別推移',
        onTap: () {
          // 詳細アクション（必要に応じて実装）
        },
      ),
    );
  }

  Widget _buildOrdersChart(List<MonthlyDoc> yearlyData) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: StackedBarChart(
        yearlyData: yearlyData,
        chartType: 'orders',
        title: '月間来店数推移',
        onTap: () {
          // 詳細アクション（必要に応じて実装）
        },
      ),
    );
  }

  Widget _buildAvgValueChart(List<MonthlyDoc> yearlyData) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: StackedBarChart(
        yearlyData: yearlyData,
        chartType: 'avgValue',
        title: '月間平均客単価推移',
        onTap: () {
          // 詳細アクション（必要に応じて実装）
        },
      ),
    );
  }
}
