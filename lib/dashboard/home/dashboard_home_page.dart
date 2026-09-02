import 'package:amuse_app_template/dashboard/errors/dashboard_user_facing_errors.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fl_chart/fl_chart.dart' as fl_chart;
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../data/repo/analytics_repository.dart';
import '../../data/models/analytics_models.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/skeleton.dart';
import '../../app_config/dashboard_config.dart';
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
  Widget build(BuildContext context, WidgetRef ref) {
    final monthlyDataAsync = ref.watch(monthlyDataProvider);

    final config = DashboardConfig();
    
    return Scaffold(
      backgroundColor: config.bodyBackgroundColor,
      appBar: PreferredSize(
        preferredSize: Size.fromHeight(MediaQuery.of(context).size.height * 0.08),
        child: AppBar(
          title: const Text('売上ダッシュボード'),
          backgroundColor: config.appBarColor,
          foregroundColor: config.appBarTextColor,
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
      body: Padding(
        padding: EdgeInsets.only(
          top: MediaQuery.of(context).size.height * 0.01,
          left: MediaQuery.of(context).size.width * 0.01,
        ),
        child: monthlyDataAsync.when(
          data: (monthlyData) {
            if (monthlyData == null) {
              return const Center(
                child: Text('データが見つかりません'),
              );
            }
            return _buildDashboardContent(context, monthlyData);
          },
          loading: () => _buildSkeletonContent(context),
          error: (error, stack) => dashboardLoadErrorWidget(
            message: mapDashboardLoadError(error),
            onRetry: () => ref.invalidate(monthlyDataProvider),
          ),
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
            width: screenWidth * 0.97,
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
            width: screenWidth * 0.96,
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
                  error: (error, stack) => dashboardLoadErrorWidget(
                    message: dashboardStreamErrorMessage(
                      hasStaleData: false,
                      isPartial: true,
                    ),
                    onRetry: () => ref.invalidate(lastSixMonthsProvider),
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
    final maxScale = (maxValue * 1.1).round();

    return _buildThreeMonthsLineChart(data, maxScale);
  }

  Widget _buildThreeMonthsLineChart(List<Map<String, dynamic>> data, int maxScale) {
    if (data.isEmpty) {
      return const Center(
        child: Text('データがありません'),
      );
    }

    // デバッグ用ログ
    print('グラフ表示用データ: ${data.map((e) => '${e['monthId']}(${e['monthName']}): ${e['grossSales']}').join(', ')}');

    // 最大売上を取得
    final maxSales = data.map((e) => e['grossSales'] as int).reduce((a, b) => a > b ? a : b);
    
    // 最上位補助線の金額を決定（50万円単位）
    int topValue;
    if (maxSales <= 2500000) {
      topValue = 2500000; // 250万円
    } else if (maxSales <= 5000000) {
      topValue = 5000000; // 500万円
    } else if (maxSales <= 7500000) {
      topValue = 7500000; // 750万円
    } else if (maxSales <= 10000000) {
      topValue = 10000000; // 1000万円
    } else {
      // 1000万円を超える場合は250万円刻みで増加
      topValue = ((maxSales / 2500000).ceil() * 2500000);
    }

    return fl_chart.LineChart(
      fl_chart.LineChartData(
        lineTouchData: fl_chart.LineTouchData(
          enabled: true,
          touchTooltipData: fl_chart.LineTouchTooltipData(
            tooltipRoundedRadius: 8,
            getTooltipItems: (touchedSpots) {
              return touchedSpots.map((touchedSpot) {
                final index = touchedSpot.x.toInt();
                if (index >= 0 && index < data.length) {
                  final monthData = data[index];
                  return fl_chart.LineTooltipItem(
                    '${monthData['monthName']}\n${Formatters.formatCurrency(monthData['grossSales'])}',
                    const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                    ),
                  );
                }
                return null;
              }).toList();
            },
          ),
        ),
        gridData: fl_chart.FlGridData(
          show: true,
          drawVerticalLine: false,
          horizontalInterval: topValue / 5, // 5つの間隔で6本の補助線
          getDrawingHorizontalLine: (value) {
            return fl_chart.FlLine(
              color: Colors.grey.withOpacity(0.2),
              strokeWidth: 1,
            );
          },
        ),
        titlesData: fl_chart.FlTitlesData(
          show: true,
          rightTitles: const fl_chart.AxisTitles(
            sideTitles: fl_chart.SideTitles(showTitles: false),
          ),
          topTitles: const fl_chart.AxisTitles(
            sideTitles: fl_chart.SideTitles(showTitles: false),
          ),
          bottomTitles: fl_chart.AxisTitles(
            sideTitles: fl_chart.SideTitles(
              showTitles: true,
              reservedSize: 30,
              interval: 1,
              getTitlesWidget: (value, meta) {
                final index = value.toInt();
                if (index >= 0 && index < data.length) {
                  return Padding(
                    padding: const EdgeInsets.only(top: 8.0),
                    child: Text(
                      data[index]['monthName'],
                      style: const TextStyle(
                        fontSize: 10,
                        color: Colors.grey,
                      ),
                    ),
                  );
                }
                return const Text('');
              },
            ),
          ),
          leftTitles: fl_chart.AxisTitles(
            sideTitles: fl_chart.SideTitles(
              showTitles: true,
              reservedSize: 60,
              interval: topValue / 5, // 5つの間隔で6本の補助線
              getTitlesWidget: (value, meta) {
                final intValue = value.toInt();
                if (intValue == 0) {
                  return const Text(
                    '0',
                    style: TextStyle(
                      fontSize: 10,
                      color: Colors.grey,
                    ),
                  );
                }
                // 万円表記に変換
                final manValue = intValue ~/ 10000;
                return Text(
                  '${manValue}万',
                  style: const TextStyle(
                    fontSize: 10,
                    color: Colors.grey,
                  ),
                );
              },
            ),
          ),
        ),
        borderData: fl_chart.FlBorderData(
          show: true,
          border: Border.all(
            color: Colors.grey.withOpacity(0.2),
            width: 1,
          ),
        ),
        minX: 0,
        maxX: (data.length - 1).toDouble(),
        minY: 0,
        maxY: topValue.toDouble(),
        lineBarsData: [
          fl_chart.LineChartBarData(
            spots: data.asMap().entries.map((entry) {
              return fl_chart.FlSpot(entry.key.toDouble(), entry.value['grossSales'].toDouble());
            }).toList(),
            isCurved: false,
            color: Colors.blue,
            barWidth: 3,
            isStrokeCapRound: true,
            dotData: fl_chart.FlDotData(
              show: true,
              getDotPainter: (spot, percent, barData, index) {
                return fl_chart.FlDotCirclePainter(
                  radius: 4,
                  color: Colors.blue,
                  strokeWidth: 2,
                  strokeColor: Colors.white,
                );
              },
            ),
            belowBarData: fl_chart.BarAreaData(
              show: true,
              color: Colors.blue.withOpacity(0.1),
            ),
          ),
        ],
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
            child: Consumer(
              builder: (context, ref, child) {
                final selectedMonth = ref.watch(selectedMonthProvider);
                return HorizontalBarChart(
                  categoryData: monthlyData.categorySales,
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => CategoryOverviewPage(month: selectedMonth),
                      ),
                    );
                  },
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
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                '支払手段',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Consumer(
                builder: (context, ref, child) {
                  final selectedMonth = ref.watch(selectedMonthProvider);
                  return GestureDetector(
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => PaymentBreakdownPage(month: selectedMonth),
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
                  );
                },
              ),
            ],
          ),
          Expanded(
            child: Consumer(
              builder: (context, ref, child) {
                final selectedMonth = ref.watch(selectedMonthProvider);
                return DonutChart(
                  paymentData: monthlyData.paymentMethodSales,
                  title: '',
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => PaymentBreakdownPage(month: selectedMonth),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
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
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'カテゴリ構成',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Consumer(
                builder: (context, ref, child) {
                  final selectedMonth = ref.watch(selectedMonthProvider);
                  return GestureDetector(
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => CategoryOverviewPage(month: selectedMonth),
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
                  );
                },
              ),
            ],
          ),
          Expanded(
            child: DonutChart(
              categoryData: monthlyData.categorySales,
              title: '',
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
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                '当月日次推移',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Consumer(
                builder: (context, ref, child) {
                  final selectedMonth = ref.watch(selectedMonthProvider);
                  return GestureDetector(
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => DailyTrendPage(month: selectedMonth),
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
                  );
                },
              ),
            ],
          ),
          Expanded(
            child: Consumer(
              builder: (context, ref, child) {
                final selectedMonth = ref.watch(selectedMonthProvider);
                return LineChart(
                  dailyData: monthlyData.dailySalesList,
                  title: '',
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => DailyTrendPage(month: selectedMonth),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
