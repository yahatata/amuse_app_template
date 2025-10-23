import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fl_chart/fl_chart.dart' as fl_chart;
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../data/repo/analytics_repository.dart';
import '../../data/models/analytics_models.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/skeleton.dart';
import '../widgets/horizontal_bar_chart.dart';
import '../widgets/donut_chart.dart';
import '../widgets/line_chart.dart';
import '../widgets/metric_card.dart';
import '../yearly/yearly_overview_page.dart';
import '../category/category_overview_page.dart';
import '../payments/payment_breakdown_page.dart';
import '../daily/daily_trend_page.dart';

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
final monthlyDataProvider = FutureProvider<MonthlyDoc?>((ref) async {
  final repository = AnalyticsRepository();
  final selectedMonth = ref.watch(selectedMonthProvider);
  return repository.fetchMonthlyDoc(selectedMonth);
});

/// 直近6ヶ月の総売上データのProvider
final lastSixMonthsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final repository = AnalyticsRepository();
  return repository.fetchLastSixMonthsGrossSales();
});

// endregion

class DashboardHomePage extends ConsumerWidget {
  const DashboardHomePage({super.key});

  /// 月の表示形式をフォーマット（YYYY-MM → YYYY年MM月）
  String _formatMonthDisplay(String monthId) {
    if (monthId.isEmpty) return '';
    final parts = monthId.split('-');
    if (parts.length != 2) return monthId;
    final year = parts[0];
    final month = parts[1];
    return '${year}年${month}月';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final monthlyDataAsync = ref.watch(monthlyDataProvider);

    return Scaffold(
      appBar: PreferredSize(
        preferredSize: Size.fromHeight(MediaQuery.of(context).size.height * 0.08),
        child: AppBar(
          title: const Text('売上ダッシュボード'),
          backgroundColor: Colors.blue[700],
          foregroundColor: Colors.white,
          centerTitle: true,
          actions: [
            Consumer(
              builder: (context, ref, child) {
                final selectedMonth = ref.watch(selectedMonthProvider);
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
      ),
      body: monthlyDataAsync.when(
        data: (monthlyData) {
          if (monthlyData == null) {
            return const Center(
              child: Text('データが見つかりません'),
            );
          }
          return _buildDashboardContent(context, monthlyData);
        },
        loading: () => _buildSkeletonContent(context),
        error: (error, stack) => Center(
          child: Text('エラーが発生しました: $error'),
        ),
      ),
    );
  }

  Widget _buildSkeletonContent(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final screenWidth = MediaQuery.of(context).size.width;
    
    return SingleChildScrollView(
      child: Column(
        children: [
          // 上部3つのカード（年間比較・支払い方法別・カテゴリ別売り上げ）
          Row(
            children: [
              // 年間比較グラフ
              Container(
                margin: EdgeInsets.all(screenWidth * 0.005),
                width: screenWidth * 0.38,
                height: screenHeight * 0.38,
                child: const SkeletonChart(),
              ),
              // 支払い方法別グラフ
              Container(
                margin: EdgeInsets.all(screenWidth * 0.005),
                width: screenWidth * 0.28,
                height: screenHeight * 0.38,
                child: const SkeletonChart(),
              ),
              // カテゴリ別売り上げグラフ
              Container(
                margin: EdgeInsets.all(screenWidth * 0.005),
                width: screenWidth * 0.28,
                height: screenHeight * 0.38,
                child: const SkeletonChart(),
              ),
            ],
          ),
          
          // 中間のカード群とカテゴリ別
          Row(
            children: [
              // KPIカード群（2x2）
              Container(
                margin: EdgeInsets.all(screenWidth * 0.005),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Container(
                          margin: EdgeInsets.all(screenWidth * 0.005),
                          width: screenWidth * 0.18,
                          height: screenHeight * 0.14,
                          child: SkeletonMetricCard(),
                        ),
                        Container(
                          margin: EdgeInsets.all(screenWidth * 0.005),
                          width: screenWidth * 0.18,
                          height: screenHeight * 0.14,
                          child: SkeletonMetricCard(),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        Container(
                          margin: EdgeInsets.all(screenWidth * 0.005),
                          width: screenWidth * 0.18,
                          height: screenHeight * 0.14,
                          child: SkeletonMetricCard(),
                        ),
                        Container(
                          margin: EdgeInsets.all(screenWidth * 0.005),
                          width: screenWidth * 0.18,
                          height: screenHeight * 0.14,
                          child: SkeletonMetricCard(),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              // 当月カテゴリ別
              Container(
                margin: EdgeInsets.all(screenWidth * 0.005),
                width: screenWidth * 0.58,
                height: screenHeight * 0.28,
                child: const SkeletonChart(),
              ),
            ],
          ),
          
          // 当月日次推移
          Container(
            margin: EdgeInsets.all(screenWidth * 0.005),
            width: screenWidth * 0.98,
            height: screenHeight * 0.40,
            child: const SkeletonChart(),
          ),
        ],
      ),
    );
  }

  Widget _buildDashboardContent(BuildContext context, MonthlyDoc monthlyData) {
    final screenHeight = MediaQuery.of(context).size.height;
    final screenWidth = MediaQuery.of(context).size.width;
    
    return SingleChildScrollView(
      child: Column(
        children: [
          // 上部3つのカード（年間比較・支払い方法別・カテゴリ別売り上げ）
          Row(
            children: [
              // 年間比較グラフ
              Container(
                margin: EdgeInsets.all(screenWidth * 0.005),
                width: screenWidth * 0.38,
                height: screenHeight * 0.33,
                child: _buildYearlyComparisonMini(context, monthlyData),
              ),
              // 支払い方法別グラフ
              Container(
                margin: EdgeInsets.all(screenWidth * 0.005),
                width: screenWidth * 0.28,
                height: screenHeight * 0.33,
                child: _buildPaymentMethodChart(context, monthlyData),
              ),
              // カテゴリ別売り上げグラフ
              Container(
                margin: EdgeInsets.all(screenWidth * 0.005),
                width: screenWidth * 0.28,
                height: screenHeight * 0.33,
                child: _buildCategoryCompositionChart(context, monthlyData),
              ),
            ],
          ),
          
          // 中間のカード群とカテゴリ別
          Row(
            children: [
              // KPIカード群（2x2）
              Container(
                margin: EdgeInsets.all(screenWidth * 0.005),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Container(
                          margin: EdgeInsets.all(screenWidth * 0.005),
                          width: screenWidth * 0.18,
                          height: screenHeight * 0.14,
                          child: MetricCard(
                            title: '今月総売上',
                            value: Formatters.formatCurrency(monthlyData.grossSales),
                            color: Colors.blue,
                            icon: Icons.attach_money,
                          ),
                        ),
                        Container(
                          margin: EdgeInsets.all(screenWidth * 0.005),
                          width: screenWidth * 0.18,
                          height: screenHeight * 0.14,
                          child: MetricCard(
                            title: '来店数',
                            value: Formatters.formatOrderCount(monthlyData.orderCount),
                            color: Colors.green,
                            icon: Icons.people,
                          ),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        Container(
                          margin: EdgeInsets.all(screenWidth * 0.005),
                          width: screenWidth * 0.18,
                          height: screenHeight * 0.14,
                          child: MetricCard(
                            title: '平均客単価',
                            value: Formatters.formatAvgOrderValue(monthlyData.avgOrderValue),
                            color: Colors.orange,
                            icon: Icons.trending_up,
                          ),
                        ),
                        Container(
                          margin: EdgeInsets.all(screenWidth * 0.005),
                          width: screenWidth * 0.18,
                          height: screenHeight * 0.14,
                          child: BestWorstMetricCard(
                            bestDate: monthlyData.bestWorstDays.bestDate,
                            bestAmount: monthlyData.bestWorstDays.bestAmount,
                            worstDate: monthlyData.bestWorstDays.worstDate,
                            worstAmount: monthlyData.bestWorstDays.worstAmount,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              // 当月カテゴリ別
              Container(
                margin: EdgeInsets.all(screenWidth * 0.005),
                width: screenWidth * 0.58,
                height: screenHeight * 0.28,
                child: _buildCategoryChart(context, monthlyData),
              ),
            ],
          ),
          
          // 当月日次推移
          Container(
            margin: EdgeInsets.all(screenWidth * 0.005),
            width: screenWidth * 0.98,
            height: screenHeight * 0.40,
            child: _buildDailyTrendChart(context, monthlyData),
          ),
        ],
      ),
    );
  }

  Widget _buildYearlyComparisonMini(BuildContext context, MonthlyDoc monthlyData) {
    return Container(
      height: 280,
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16.0),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
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
                '月ごとの比較',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              GestureDetector(
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => const YearlyOverviewPage(initialTab: '総売上'),
                    ),
                  );
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.blue[100],
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    '詳細',
                    style: TextStyle(fontSize: 12),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // 直近6ヶ月の折れ線グラフ
          Expanded(
            child: Consumer(
              builder: (context, ref, child) {
                final lastSixMonthsAsync = ref.watch(lastSixMonthsProvider);
                
                return lastSixMonthsAsync.when(
                  data: (data) {
                    if (data.isEmpty) {
                      return const Center(
                        child: Text('データがありません'),
                      );
                    }
                    return _buildThreeMonthsLineChartWithAxis(data);
                  },
                  loading: () => const Center(
                    child: CircularProgressIndicator(),
                  ),
                  error: (error, stack) => Center(
                    child: Text('エラー: $error'),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildThreeMonthsLineChartWithAxis(List<Map<String, dynamic>> data) {
    if (data.isEmpty) {
      return const Center(
        child: Text('データがありません'),
      );
    }

    // デバッグ用ログ
    print('グラフ表示用データ: ${data.map((e) => '${e['monthId']}(${e['monthName']}): ${e['grossSales']}').join(', ')}');

    // データを月順にソート
    data.sort((a, b) => a['monthId'].compareTo(b['monthId']));

    // 最大値を取得（Y軸のスケール用）
    final maxValue = data.map((e) => e['grossSales'] as int).reduce((a, b) => a > b ? a : b);
    final minValue = data.map((e) => e['grossSales'] as int).reduce((a, b) => a < b ? a : b);
    final range = maxValue - minValue;
    final padding = range * 0.1; // 10%のパディング

    return Row(
      children: [
        // 縦軸用のスペース（倍のサイズ）
        SizedBox(
          width: 60, // 縦軸用のスペースを倍のサイズに
          child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: List.generate(5, (index) {
              final value = (maxValue / 4) * (4 - index);
              return Text(
                value == 0 ? '0円' : '${(value / 10000).floor()}万円',
                style: const TextStyle(fontSize: 10),
                textAlign: TextAlign.right,
              );
            }),
          ),
        ),
        // グラフ部分
        Expanded(
          child: _buildThreeMonthsLineChart(data),
        ),
      ],
    );
  }

  Widget _buildThreeMonthsLineChart(List<Map<String, dynamic>> data) {
    if (data.isEmpty) {
      return const Center(
        child: Text('データがありません'),
      );
    }

    // デバッグ用ログ
    print('グラフ表示用データ: ${data.map((e) => '${e['monthId']}(${e['monthName']}): ${e['grossSales']}').join(', ')}');

    // データを月順にソート
    data.sort((a, b) => a['monthId'].compareTo(b['monthId']));

    // 最大値を取得（Y軸のスケール用）
    final maxValue = data.map((e) => e['grossSales'] as int).reduce((a, b) => a > b ? a : b);
    final minValue = data.map((e) => e['grossSales'] as int).reduce((a, b) => a < b ? a : b);
    final range = maxValue - minValue;
    final padding = range * 0.1; // 10%のパディング

    return fl_chart.LineChart(
      fl_chart.LineChartData(
        gridData: fl_chart.FlGridData(
          show: true,
          drawVerticalLine: false,
          horizontalInterval: (maxValue - minValue) / 4, // 4つの水平線を表示
        ),
        titlesData: fl_chart.FlTitlesData(
          leftTitles: const fl_chart.AxisTitles(
            sideTitles: fl_chart.SideTitles(showTitles: false),
          ),
          topTitles: const fl_chart.AxisTitles(
            sideTitles: fl_chart.SideTitles(showTitles: false),
          ),
          rightTitles: const fl_chart.AxisTitles(
            sideTitles: fl_chart.SideTitles(showTitles: false),
          ),
          bottomTitles: fl_chart.AxisTitles(
            sideTitles: fl_chart.SideTitles(
              showTitles: true,
              getTitlesWidget: (value, meta) {
                final index = value.toInt();
                if (index >= 0 && index < data.length) {
                  return Text(
                    data[index]['monthName'],
                    style: const TextStyle(fontSize: 12),
                  );
                }
                return const Text('');
              },
              interval: 1, // 各データポイントにラベルを表示
            ),
          ),
        ),
        borderData: fl_chart.FlBorderData(show: false),
        lineBarsData: [
          fl_chart.LineChartBarData(
            spots: data.asMap().entries.map((entry) {
              return fl_chart.FlSpot(entry.key.toDouble(), entry.value['grossSales'].toDouble());
            }).toList(),
            isCurved: false,
            color: Colors.blue,
            barWidth: 3,
            isStrokeCapRound: true,
            dotData: const fl_chart.FlDotData(show: true),
            belowBarData: fl_chart.BarAreaData(
              show: true,
              color: Colors.blue.withValues(alpha: 0.1),
            ),
          ),
        ],
        minY: 0, // 最小値を0に設定
        maxY: maxValue.toDouble(), // 最大値を最も売り上げの多い月の価格に設定
        minX: 0,
        maxX: (data.length - 1).toDouble(),
      ),
    );
  }



  Widget _buildCategoryChart(BuildContext context, MonthlyDoc monthlyData) {
    return Container(
      height: 220,
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16.0),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '当月カテゴリ別',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: HorizontalBarChart(
              categoryData: monthlyData.categorySales,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => const CategoryOverviewPage(),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPaymentMethodChart(BuildContext context, MonthlyDoc monthlyData) {
    return Container(
      height: 220,
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16.0),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: DonutChart(
        paymentData: monthlyData.paymentMethodSales,
        title: '支払手段',
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => const PaymentBreakdownPage(),
            ),
          );
        },
      ),
    );
  }

  Widget _buildCategoryCompositionChart(BuildContext context, MonthlyDoc monthlyData) {
    return Container(
      height: 220,
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16.0),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: DonutChart(
        categoryData: monthlyData.categorySales,
        title: 'カテゴリ構成',
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => const CategoryOverviewPage(),
            ),
          );
        },
      ),
    );
  }

  Widget _buildDailyTrendChart(BuildContext context, MonthlyDoc monthlyData) {
    return Container(
      height: 240,
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16.0),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: LineChart(
        dailyData: monthlyData.dailySalesList,
        title: '当月日次推移',
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => const DailyTrendPage(),
            ),
          );
        },
      ),
    );
  }
}
