/// 支払い方法詳細画面
/// 
/// 責務: 支払い方法別売上データの詳細表示（当月・年間比較）
/// 参照フィールド: analyticsMonthly/{YYYY-MM}（当月）、年間データ（年間比較）
/// 遅延ロード: あり（年間データは初回ロード時）

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../data/repo/analytics_repository.dart';
import '../../data/models/analytics_models.dart';
import '../../core/utils/formatters.dart';
import '../../app_config/dashboard_config.dart';
import '../widgets/donut_chart.dart';
import '../widgets/stacked_bar_chart.dart';
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

/// 月次データのProvider
final monthlyDataProvider = FutureProvider.family<MonthlyDoc?, String>((ref, yyyymm) async {
  final repository = AnalyticsRepository();
  return repository.fetchMonthlyDoc(yyyymm);
});

/// 年間データのProvider
final yearlyDataProvider = FutureProvider.family<List<MonthlyDoc>, String>((ref, year) async {
  final repository = AnalyticsRepository();
  return repository.fetchYearlyMonthlyDocs(year);
});

// endregion

class PaymentBreakdownPage extends ConsumerStatefulWidget {
  final String? month;
  
  const PaymentBreakdownPage({
    super.key,
    this.month,
  });

  @override
  ConsumerState<PaymentBreakdownPage> createState() => _PaymentBreakdownPageState();
}

class _PaymentBreakdownPageState extends ConsumerState<PaymentBreakdownPage>
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
    final yearlyDataAsync = ref.watch(yearlyDataProvider(_selectedYear));

    final config = DashboardConfig();
    
    return Scaffold(
      backgroundColor: config.bodyBackgroundColor,
      appBar: AppBar(
        title: Text('支払い方法詳細'),
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
          _buildCurrentMonthTab(context, monthlyDataAsync),
          // 年間比較タブ
          _buildYearlyComparisonTab(context, yearlyDataAsync),
        ],
      ),
    );
  }

  Widget _buildCurrentMonthTab(BuildContext context, AsyncValue<MonthlyDoc?> monthlyDataAsync) {
    return monthlyDataAsync.when(
      data: (monthlyData) {
        if (monthlyData == null) {
          return const Center(
            child: Text('データが見つかりません'),
          );
        }
        return _buildCurrentMonthContent(context, monthlyData);
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
          // ドーナツグラフ（スケルトン）
          const SkeletonChart(width: double.infinity, height: 300),
          const SizedBox(height: 16),
          // 支払い方法リスト（スケルトン）
          const SkeletonChart(width: double.infinity, height: 400),
        ],
      ),
    );
  }

  Widget _buildCurrentMonthContent(BuildContext context, MonthlyDoc monthlyData) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        children: [
          // 月選択プルダウン
          _buildMonthSelector(context),
          const SizedBox(height: 16),
          // 支払い方法ドーナツグラフ
          _buildPaymentDonutChart(context, monthlyData),
          const SizedBox(height: 16),
          // 支払い方法詳細リスト
          _buildPaymentMethodList(context, monthlyData),
        ],
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
          // 年間支払い方法推移
          _buildYearlyPaymentChart(context, yearlyData),
        ],
      ),
    );
  }

  Widget _buildPaymentDonutChart(BuildContext context, MonthlyDoc monthlyData) {
    final screenHeight = MediaQuery.of(context).size.height;
    // カードサイズを画面縦幅の50%に固定
    final cardHeight = screenHeight * 0.5;
    // 円グラフのサイズを3倍の80%（2.4倍）に
    final chartRadius = screenHeight * 0.047 * 3 * 0.8;
    
    final paymentMethods = monthlyData.paymentMethodSales;
    final total = paymentMethods.map((p) => p.sales).reduce((a, b) => a + b);
    
    // 0以外のデータのみをフィルタリング
    final filteredData = paymentMethods.where((item) => item.sales > 0).toList();
    if (filteredData.isEmpty) {
      return Container(
        height: cardHeight,
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
        child: const Center(
          child: Text('データがありません'),
        ),
      );
    }

    // 売上降順（最大を先頭）にソート
    filteredData.sort((a, b) => b.sales.compareTo(a.sales));

    return Container(
      height: cardHeight,
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
          // タイトルを左上に表示
          const Text(
            '当月支払い方法別',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          // スペーサーで中央配置を実現
          Expanded(
            child: Row(
              children: [
                // 円グラフを中央に配置
                Expanded(
                  child: Stack(
                    children: [
                      // 円グラフ上部に合計金額を表示
                      Positioned(
                        top: 0,
                        left: 0,
                        right: 0,
                        child: Center(
                          child: RichText(
                            text: TextSpan(
                              children: [
                                const TextSpan(
                                  text: '当月総売上：',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.black,
                                  ),
                                ),
                                TextSpan(
                                  text: Formatters.formatCurrency(total),
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.blue,
                                  ),
                                ),
                              ],
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                      // ドーナツグラフ
                      Center(
                        child: SizedBox(
                          width: chartRadius * 2,
                          height: chartRadius * 2,
                          child: PieChart(
                            PieChartData(
                              startDegreeOffset: -90,
                              pieTouchData: PieTouchData(
                                enabled: true,
                                touchCallback: (FlTouchEvent event, pieTouchResponse) {},
                              ),
                              sectionsSpace: 2,
                              centerSpaceRadius: chartRadius * 0.3,
                              sections: _buildDonutSections(filteredData, total, chartRadius),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 16),
                // 凡例を右側に配置
                Expanded(
                  child: SingleChildScrollView(
                    child: _buildLegend(filteredData, total),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPaymentMethodList(BuildContext context, MonthlyDoc monthlyData) {
    final paymentMethods = monthlyData.paymentMethodSales;
    final total = paymentMethods.map((p) => p.sales).reduce((a, b) => a + b);
    
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
          const Text(
            '支払い方法別詳細',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          ...paymentMethods.map((payment) {
            final percentage = total > 0 ? (payment.sales / total) * 100 : 0.0;
            
            return Container(
              margin: const EdgeInsets.only(bottom: 12.0),
              padding: const EdgeInsets.all(16.0),
              decoration: BoxDecoration(
                color: Colors.grey[50],
                borderRadius: BorderRadius.circular(8.0),
                border: Border.all(color: Colors.grey[200]!),
              ),
              child: Row(
                children: [
                  // 支払い方法アイコン
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: _getPaymentMethodColor(payment.method),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      _getPaymentMethodIcon(payment.method),
                      color: Colors.white,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 16),
                  // 支払い方法情報
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          Formatters.getPaymentMethodDisplayName(payment.method),
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        Text(
                          '${Formatters.formatCurrency(payment.sales)} (${Formatters.formatPercentage(percentage / 100)})',
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey[600],
                          ),
                        ),
                      ],
                    ),
                  ),
                  // 進捗バー
                  Container(
                    width: 100,
                    height: 8,
                    decoration: BoxDecoration(
                      color: Colors.grey[200],
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: FractionallySizedBox(
                      alignment: Alignment.centerLeft,
                      widthFactor: percentage / 100,
                      child: Container(
                        decoration: BoxDecoration(
                          color: _getPaymentMethodColor(payment.method),
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
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

  Widget _buildYearlyPaymentChart(BuildContext context, List<MonthlyDoc> yearlyData) {
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
        chartType: 'payment',
        title: '年間支払い方法別推移',
      ),
    );
  }

  Color _getPaymentMethodColor(String method) {
    switch (method) {
      case 'cash':
        return Colors.green;
      case 'credit_card':
        return Colors.blue;
      case 'electronic_money':
        return Colors.orange;
      case 'pointA':
        return Colors.purple;
      case 'pointB':
        return Colors.pink;
      case 'pointC':
      case 'pointD':
      case 'pointE':
        return Colors.deepPurple;
      case 'sideGameChip':
        return Colors.teal;
      default:
        return Colors.grey;
    }
  }

  IconData _getPaymentMethodIcon(String method) {
    switch (method) {
      case 'cash':
        return Icons.money;
      case 'credit_card':
        return Icons.credit_card;
      case 'electronic_money':
        return Icons.phone_android;
      case 'pointA':
      case 'pointB':
      case 'pointC':
      case 'pointD':
      case 'pointE':
        return Icons.stars;
      case 'sideGameChip':
        return Icons.casino;
   default:
      return Icons.payment;
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

  List<PieChartSectionData> _buildDonutSections(List<PaymentMethodSales> data, int total, double chartRadius) {
    final colors = [
      Colors.blue,
      Colors.green,
      Colors.orange,
      Colors.purple,
      Colors.red,
      Colors.teal,
      Colors.indigo,
      Colors.pink,
    ];

    return data.asMap().entries.map((entry) {
      final index = entry.key;
      final item = entry.value;
      final color = colors[index % colors.length];

      return PieChartSectionData(
        color: color,
        value: item.sales.toDouble(),
        title: '',
        radius: chartRadius,
        titleStyle: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.bold,
          color: Colors.white,
        ),
      );
    }).toList();
  }

  Widget _buildLegend(List<PaymentMethodSales> data, int total) {
    final colors = [
      Colors.blue,
      Colors.green,
      Colors.orange,
      Colors.purple,
      Colors.red,
      Colors.teal,
      Colors.indigo,
      Colors.pink,
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: data.asMap().entries.map((entry) {
        final index = entry.key;
        final item = entry.value;
        final color = colors[index % colors.length];
        final percentage = (item.sales / total) * 100;

        return Padding(
          padding: const EdgeInsets.only(bottom: 6.0),
          child: Row(
            children: [
              // 色付き円
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: color,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              // 支払い方法名称と金額・割合
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 支払い方法名称
                    Text(
                      Formatters.getPaymentMethodDisplayName(item.method),
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    // 金額と割合
                    Text(
                      '${Formatters.formatCurrency(item.sales)}(${Formatters.formatPercentage(percentage / 100)})',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}
