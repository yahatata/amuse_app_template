/// 横棒グラフウィジェット
/// 
/// 責務: カテゴリ別売上データの横棒グラフ表示
/// 参照フィールド: MonthlyDoc.categorySales
/// 遅延ロード: なし（データは既に取得済み）

import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../data/models/analytics_models.dart';
import '../../core/utils/formatters.dart';

class HorizontalBarChart extends StatelessWidget {
  final List<CategorySales> categoryData;
  final double? height;
  final bool showValues;
  final VoidCallback? onTap;

  const HorizontalBarChart({
    super.key,
    required this.categoryData,
    this.height,
    this.showValues = true,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    if (categoryData.isEmpty) {
      return Container(
        height: height ?? 200,
        child: const Center(
          child: Text('データがありません'),
        ),
      );
    }

    // 最上位補助線を計算（15万円単位）
    final maxValue = categoryData.map((e) => e.sales).reduce((a, b) => a > b ? a : b);
    final topValue = _calculateTopValue(maxValue);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: height ?? 200,
        padding: const EdgeInsets.all(16.0),
        child: BarChart(
          BarChartData(
            alignment: BarChartAlignment.spaceAround,
            maxY: topValue.toDouble(),
            barTouchData: BarTouchData(
              enabled: true,
                  touchTooltipData: BarTouchTooltipData(
                    tooltipRoundedRadius: 8,
                    getTooltipItem: (group, groupIndex, rod, rodIndex) {
                      return BarTooltipItem(
                        '${Formatters.getCategoryDisplayName(rod.toY.toString())}\n${Formatters.formatCurrency(rod.toY.toInt())}',
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
                    if (value.toInt() >= 0 && value.toInt() < categoryData.length) {
                      return Padding(
                        padding: const EdgeInsets.only(top: 8.0),
                        child: Text(
                          Formatters.getCategoryDisplayName(categoryData[value.toInt()].category),
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
                  interval: topValue / 3, // 補助線と同期
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
              horizontalInterval: topValue / 3, // 4本の補助線（0, 1/3, 2/3, 1）
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
    );
  }

  /// 最上位補助線を計算（15万円単位）
  int _calculateTopValue(int maxValue) {
    if (maxValue <= 150000) {
      return 150000; // 15万円
    } else if (maxValue <= 300000) {
      return 300000; // 30万円
    } else if (maxValue <= 450000) {
      return 450000; // 45万円
    } else if (maxValue <= 600000) {
      return 600000; // 60万円
    } else {
      return ((maxValue / 150000).ceil() * 150000);
    }
  }

  List<BarChartGroupData> _buildBarGroups() {
    final colors = [
      Colors.blue,
      Colors.green,
      Colors.orange,
      Colors.purple,
    ];

    return categoryData.asMap().entries.map((entry) {
      final index = entry.key;
      final data = entry.value;
      final color = colors[index % colors.length];

      return BarChartGroupData(
        x: index,
        barRods: [
          BarChartRodData(
            toY: data.sales.toDouble(),
            color: color,
            width: 20,
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(4),
              topRight: Radius.circular(4),
            ),
            backDrawRodData: BackgroundBarChartRodData(
              show: true,
              color: Colors.grey.withOpacity(0.1),
            ),
          ),
        ],
        showingTooltipIndicators: [],
      );
    }).toList();
  }
}
