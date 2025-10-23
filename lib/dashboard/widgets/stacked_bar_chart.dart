/// 積み上げ棒グラフウィジェット
/// 
/// 責務: 年間比較用の積み上げ棒グラフ表示
/// 参照フィールド: List<MonthlyDoc>（年間データ）
/// 遅延ロード: あり（年間データ取得時）

import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../data/models/analytics_models.dart';
import '../../core/utils/formatters.dart';

class StackedBarChart extends StatelessWidget {
  final List<MonthlyDoc> yearlyData;
  final String chartType; // 'payment', 'category', 'sales', 'orders', 'avgValue'
  final String title;
  final double? height;
  final VoidCallback? onTap;

  const StackedBarChart({
    super.key,
    required this.yearlyData,
    required this.chartType,
    required this.title,
    this.height,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    if (yearlyData.isEmpty) {
      return Container(
        height: height ?? 280,
        child: const Center(
          child: Text('データがありません'),
        ),
      );
    }

    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: height ?? 280,
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: BarChart(
                BarChartData(
                  alignment: BarChartAlignment.spaceAround,
                  maxY: _calculateMaxY(),
                  barTouchData: BarTouchData(
                    enabled: true,
                  touchTooltipData: BarTouchTooltipData(
                    tooltipRoundedRadius: 8,
                      getTooltipItem: (group, groupIndex, rod, rodIndex) {
                        final month = group.x.toInt();
                        final value = rod.toY.toInt();
                        return BarTooltipItem(
                          '${month + 1}月\n${Formatters.formatCurrency(value)}',
                          const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                          ),
                        );
                      },
                    ),
                  ),
                  titlesData: FlTitlesData(
                    show: true,
                    rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                    topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false),
                    ),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        getTitlesWidget: (value, meta) {
                          final month = value.toInt();
                          if (month >= 0 && month < yearlyData.length) {
                            return Padding(
                              padding: const EdgeInsets.only(top: 8.0),
                              child: Text(
                                Formatters.formatMonth(month + 1),
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey,
                                ),
                              ),
                            );
                          }
                          return const Text('');
                        },
                      ),
                    ),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 60,
                        getTitlesWidget: (value, meta) {
                          return Text(
                            Formatters.formatNumber(value.toInt()),
                            style: const TextStyle(
                              fontSize: 10,
                              color: Colors.grey,
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  borderData: FlBorderData(show: false),
                  barGroups: _buildBarGroups(),
                  gridData: FlGridData(
                    show: true,
                    drawVerticalLine: false,
                    horizontalInterval: _calculateMaxY() / 5,
                    getDrawingHorizontalLine: (value) {
                      return FlLine(
                        color: Colors.grey.withOpacity(0.2),
                        strokeWidth: 1,
                      );
                    },
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  double _calculateMaxY() {
    switch (chartType) {
      case 'payment':
        return yearlyData.map((doc) => 
          doc.paymentMethodSales.map((p) => p.sales).reduce((a, b) => a + b)
        ).reduce((a, b) => a > b ? a : b).toDouble() * 1.1;
      case 'category':
        return yearlyData.map((doc) => 
          doc.categorySales.map((c) => c.sales).reduce((a, b) => a + b)
        ).reduce((a, b) => a > b ? a : b).toDouble() * 1.1;
      case 'sales':
        return yearlyData.map((doc) => doc.grossSales).reduce((a, b) => a > b ? a : b).toDouble() * 1.1;
      case 'orders':
        return yearlyData.map((doc) => doc.orderCount).reduce((a, b) => a > b ? a : b).toDouble() * 1.1;
      case 'avgValue':
        return yearlyData.map((doc) => doc.avgOrderValue).reduce((a, b) => a > b ? a : b) * 1.1;
      default:
        return 1000000.0;
    }
  }

  List<BarChartGroupData> _buildBarGroups() {
    return yearlyData.asMap().entries.map((entry) {
      final index = entry.key;
      final data = entry.value;
      
      switch (chartType) {
        case 'payment':
          return _buildPaymentBarGroup(index, data);
        case 'category':
          return _buildCategoryBarGroup(index, data);
        case 'sales':
          return _buildSingleBarGroup(index, data.grossSales, Colors.blue, '総売上');
        case 'orders':
          return _buildSingleBarGroup(index, data.orderCount, Colors.green, '来店数');
        case 'avgValue':
          return _buildSingleBarGroup(index, data.avgOrderValue.round(), Colors.orange, '平均客単価');
        default:
          return _buildSingleBarGroup(index, data.grossSales, Colors.blue, '総売上');
      }
    }).toList();
  }

  BarChartGroupData _buildPaymentBarGroup(int index, MonthlyDoc data) {
    final paymentData = data.paymentMethodSales;
    final colors = [Colors.blue, Colors.green, Colors.orange, Colors.purple, Colors.red, Colors.teal];
    
    return BarChartGroupData(
      x: index,
      barRods: paymentData.asMap().entries.map((entry) {
        final rodIndex = entry.key;
        final payment = entry.value;
        return BarChartRodData(
          toY: payment.sales.toDouble(),
          color: colors[rodIndex % colors.length],
          width: 20,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(4),
            topRight: Radius.circular(4),
          ),
        );
      }).toList(),
    );
  }

  BarChartGroupData _buildCategoryBarGroup(int index, MonthlyDoc data) {
    final categoryData = data.categorySales;
    final colors = [Colors.blue, Colors.green, Colors.orange, Colors.purple];
    
    return BarChartGroupData(
      x: index,
      barRods: categoryData.asMap().entries.map((entry) {
        final rodIndex = entry.key;
        final category = entry.value;
        return BarChartRodData(
          toY: category.sales.toDouble(),
          color: colors[rodIndex % colors.length],
          width: 20,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(4),
            topRight: Radius.circular(4),
          ),
        );
      }).toList(),
    );
  }

  BarChartGroupData _buildSingleBarGroup(int index, int value, Color color, String label) {
    return BarChartGroupData(
      x: index,
      barRods: [
        BarChartRodData(
          toY: value.toDouble(),
          color: color,
          width: 20,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(4),
            topRight: Radius.circular(4),
          ),
        ),
      ],
    );
  }
}
