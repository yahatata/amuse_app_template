/// 折れ線グラフウィジェット
/// 
/// 責務: 日次売上推移の折れ線グラフ表示
/// 参照フィールド: MonthlyDoc.dailySalesList
/// 遅延ロード: なし（データは既に取得済み）

import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart' as fl_chart;
import '../../data/models/analytics_models.dart';
import '../../core/utils/formatters.dart';

class LineChart extends StatelessWidget {
  final List<DailySales> dailyData;
  final String title;
  final double? height;
  final VoidCallback? onTap;

  const LineChart({
    super.key,
    required this.dailyData,
    required this.title,
    this.height,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    if (dailyData.isEmpty) {
      return Container(
        height: height ?? 240,
        child: const Center(
          child: Text('データがありません'),
        ),
      );
    }

    // 最大売上を取得
    final maxSales = dailyData.map((e) => e.sales).reduce((a, b) => a > b ? a : b);
    
    // 最上位補助線の金額を決定（20,000円単位）
    int topValue;
    if (maxSales <= 100000) {
      topValue = 100000; // 100,000円
    } else if (maxSales <= 200000) {
      topValue = 200000; // 200,000円
    } else if (maxSales <= 300000) {
      topValue = 300000; // 300,000円
    } else if (maxSales <= 400000) {
      topValue = 400000; // 400,000円
    } else {
      // 400,000円を超える場合は100,000円刻みで増加
      topValue = ((maxSales / 100000).ceil() * 100000);
    }

    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: height ?? 240,
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
            child: fl_chart.LineChart(
              fl_chart.LineChartData(
                  lineTouchData: fl_chart.LineTouchData(
                    enabled: true,
                    touchTooltipData: fl_chart.LineTouchTooltipData(
                      tooltipRoundedRadius: 8,
                      getTooltipItems: (touchedSpots) {
                        return touchedSpots.map((touchedSpot) {
                          final index = touchedSpot.x.toInt();
                          if (index >= 0 && index < dailyData.length) {
                            final data = dailyData[index];
                            return fl_chart.LineTooltipItem(
                              '${Formatters.formatDateJapanese(data.date)}\n${Formatters.formatCurrency(data.sales)}',
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
                        interval: _calculateInterval(dailyData.length),
                        getTitlesWidget: (value, meta) {
                          final index = value.toInt();
                          if (index >= 0 && index < dailyData.length) {
                            final data = dailyData[index];
                            return Padding(
                              padding: const EdgeInsets.only(top: 8.0),
                              child: Text(
                                Formatters.formatDateShort(data.date),
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
                          return Text(
                            Formatters.formatNumber(intValue),
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
                  maxX: (dailyData.length - 1).toDouble(),
                  minY: 0,
                  maxY: topValue.toDouble(),
                  lineBarsData: [
                    fl_chart.LineChartBarData(
                      spots: _buildSpots(),
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
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<fl_chart.FlSpot> _buildSpots() {
    return dailyData.asMap().entries.map((entry) {
      final index = entry.key;
      final data = entry.value;
      return fl_chart.FlSpot(index.toDouble(), data.sales.toDouble());
    }).toList();
  }

  double _calculateInterval(int dataLength) {
    if (dataLength <= 7) return 1;
    if (dataLength <= 15) return 2;
    if (dataLength <= 31) return 5;
    return 10;
  }
}
