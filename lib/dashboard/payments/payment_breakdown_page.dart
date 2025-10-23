/// 支払い方法詳細画面
/// 
/// 責務: 支払い方法別売上データの詳細表示（当月・年間比較）
/// 参照フィールド: analyticsMonthly/{YYYY-MM}（当月）、年間データ（年間比較）
/// 遅延ロード: あり（年間データは初回ロード時）

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/repo/analytics_repository.dart';
import '../../data/models/analytics_models.dart';
import '../../core/utils/formatters.dart';
import '../widgets/donut_chart.dart';
import '../widgets/stacked_bar_chart.dart';
import '../../core/widgets/skeleton.dart';

// region Riverpod Providers

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
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final currentMonth = widget.month ?? AnalyticsRepository().getCurrentYearMonth();
    final monthlyDataAsync = ref.watch(monthlyDataProvider(currentMonth));
    final yearlyDataAsync = ref.watch(yearlyDataProvider(_selectedYear));

    return Scaffold(
      appBar: AppBar(
        title: Text('支払い方法詳細 - ${Formatters.formatYearMonth(currentMonth)}'),
        backgroundColor: Colors.blue[700],
        foregroundColor: Colors.white,
        centerTitle: true,
        bottom: TabBar(
          controller: _tabController,
          tabs: _tabs.map((tab) => Tab(text: tab)).toList(),
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
      child: DonutChart(
        paymentData: monthlyData.paymentMethodSales,
        title: '当月支払い方法別',
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
        return Icons.stars;
      case 'pointB':
        return Icons.star;
      case 'sideGameChip':
        return Icons.casino;
      default:
        return Icons.payment;
    }
  }
}
