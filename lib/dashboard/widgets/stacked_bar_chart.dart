/// 積み上げ棒グラフウィジェット
/// 
/// 責務: 年間比較用の積み上げ棒グラフ表示
/// 参照フィールド: List<MonthlyDoc>（年間データ）
/// 遅延ロード: あり（年間データ取得時）

import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../data/models/analytics_models.dart';
import '../../core/utils/formatters.dart';

class StackedBarChart extends StatefulWidget {
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
  State<StackedBarChart> createState() => _StackedBarChartState();
}

class _StackedBarChartState extends State<StackedBarChart> {
  late ScrollController _scrollController;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
    
    // 初期スクロール位置を設定
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _setInitialScrollPosition();
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  /// 現在月に基づいて初期スクロール位置を設定
  void _setInitialScrollPosition() {
    if (!_isScrollableChart()) return;
    
    final currentMonth = DateTime.now().month;
    final screenWidth = MediaQuery.of(context).size.width;
    final monthWidth = 160.0; // 各月160px幅
    
    // 現在月が7-12月の場合、その月が画面左に表示されるまでスクロール
    if (currentMonth >= 7) {
      final targetMonth = currentMonth - 1; // 0ベースのインデックス
      final scrollOffset = (targetMonth * monthWidth) - (screenWidth * 0.1); // 少し余白を残す
      
      if (scrollOffset > 0) {
        _scrollController.animateTo(
          scrollOffset,
          duration: const Duration(milliseconds: 500),
          curve: Curves.easeInOut,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.yearlyData.isEmpty) {
      return Container(
        height: widget.height ?? 280,
        child: const Center(
          child: Text('データがありません'),
        ),
      );
    }

    final topValue = _calculateTopValue();
    final isScrollable = _isScrollableChart();

    return GestureDetector(
      onTap: widget.onTap,
      child: Container(
        height: widget.height ?? 280,
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.title,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: isScrollable 
                ? SingleChildScrollView(
                    controller: _scrollController,
                    scrollDirection: Axis.horizontal,
                    child: SizedBox(
                      width: widget.yearlyData.length * 160.0, // 各月160px幅（倍に拡大）
                      child: Column(
                        children: [
                          // 凡例表示（決済別・カテゴリ別のみ）
                          if (widget.chartType == 'payment' || widget.chartType == 'category')
                            _buildLegend(),
                          const SizedBox(height: 8),
                          // グラフ
                          Expanded(
                            child: BarChart(
                              BarChartData(
                                alignment: BarChartAlignment.spaceAround,
                                maxY: topValue.toDouble(),
                                barTouchData: BarTouchData(
                                  enabled: true,
                                  touchTooltipData: BarTouchTooltipData(
                                    tooltipRoundedRadius: 8,
                                    getTooltipItem: (group, groupIndex, rod, rodIndex) {
                                      final month = group.x.toInt();
                                      final value = rod.toY.toInt();
                                      final monthName = _getMonthName(month);
                                      return BarTooltipItem(
                                        '$monthName\n${Formatters.formatCurrency(value)}',
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
                                  rightTitles: AxisTitles(
                                    sideTitles: SideTitles(
                                      showTitles: true,
                                      reservedSize: 60,
                                      interval: topValue / 5, // 補助線と同期
                                      getTitlesWidget: (value, meta) {
                                        return _buildYAxisLabel(value.toInt());
                                      },
                                    ),
                                  ),
                                  topTitles: const AxisTitles(
                                    sideTitles: SideTitles(showTitles: false),
                                  ),
                                  bottomTitles: AxisTitles(
                                    sideTitles: SideTitles(
                                      showTitles: true,
                                      getTitlesWidget: (value, meta) {
                                        final month = value.toInt();
                                        if (month >= 0 && month < widget.yearlyData.length) {
                                          return Padding(
                                            padding: const EdgeInsets.only(top: 8.0),
                                            child: Text(
                                              _getMonthName(month),
                                              style: const TextStyle(
                                                fontSize: 12,
                                                color: Colors.black,
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
                                      interval: topValue / 5, // 補助線と同期
                                      getTitlesWidget: (value, meta) {
                                        return _buildYAxisLabel(value.toInt());
                                      },
                                    ),
                                  ),
                                ),
                                borderData: FlBorderData(show: false),
                                barGroups: _buildBarGroups(),
                                gridData: FlGridData(
                                  show: true,
                                  drawVerticalLine: false,
                                  horizontalInterval: topValue / 5, // 6本の補助線
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
                  )
                : BarChart(
                    BarChartData(
                      alignment: BarChartAlignment.spaceAround,
                      maxY: topValue.toDouble(),
                      barTouchData: BarTouchData(
                        enabled: true,
                        touchTooltipData: BarTouchTooltipData(
                          tooltipRoundedRadius: 8,
                          getTooltipItem: (group, groupIndex, rod, rodIndex) {
                            final month = group.x.toInt();
                            final value = rod.toY.toInt();
                            final monthName = _getMonthName(month);
                            return BarTooltipItem(
                              '$monthName\n${Formatters.formatCurrency(value)}',
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
                                        if (month >= 0 && month < widget.yearlyData.length) {
                                          return Padding(
                                            padding: const EdgeInsets.only(top: 8.0),
                                            child: Text(
                                              _getMonthName(month),
                                              style: const TextStyle(
                                                fontSize: 12,
                                                color: Colors.black,
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
                            interval: topValue / 5, // 補助線と同期
                            getTitlesWidget: (value, meta) {
                              return _buildYAxisLabel(value.toInt());
                            },
                          ),
                        ),
                      ),
                      borderData: FlBorderData(show: false),
                      barGroups: _buildBarGroups(),
                      gridData: FlGridData(
                        show: true,
                        drawVerticalLine: false,
                        horizontalInterval: topValue / 5, // 6本の補助線
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

  /// 最上位補助線の値を計算（各グラフタイプに応じた単位）
  int _calculateTopValue() {
    switch (widget.chartType) {
      case 'sales':
        return _calculateSalesTopValue();
      case 'payment':
        return _calculatePaymentTopValue();
      case 'category':
        return _calculateCategoryTopValue();
      case 'orders':
        return _calculateOrdersTopValue();
      case 'avgValue':
        return _calculateAvgValueTopValue();
      default:
        return 1000000;
    }
  }

  /// 総売上グラフの最上位補助線（50万円単位）
  int _calculateSalesTopValue() {
    final maxSales = widget.yearlyData.map((doc) => doc.grossSales).reduce((a, b) => a > b ? a : b);
    
    if (maxSales <= 2500000) {
      return 2500000; // 250万円
    } else if (maxSales <= 5000000) {
      return 5000000; // 500万円
    } else if (maxSales <= 7500000) {
      return 7500000; // 750万円
    } else if (maxSales <= 10000000) {
      return 10000000; // 1000万円
    } else {
      return ((maxSales / 2500000).ceil() * 2500000);
    }
  }

  /// 決済別グラフの最上位補助線（100万円単位）
  int _calculatePaymentTopValue() {
    // 決済別の全項目中の最大値を取得
    int maxValue = 0;
    for (final doc in widget.yearlyData) {
      for (final payment in doc.paymentMethodSales) {
        if (payment.sales > maxValue) {
          maxValue = payment.sales;
        }
      }
    }
    
    if (maxValue <= 1000000) {
      return 1000000; // 100万円
    } else if (maxValue <= 2000000) {
      return 2000000; // 200万円
    } else if (maxValue <= 3000000) {
      return 3000000; // 300万円
    } else if (maxValue <= 4000000) {
      return 4000000; // 400万円
    } else {
      return ((maxValue / 1000000).ceil() * 1000000);
    }
  }

  /// カテゴリ別グラフの最上位補助線（100万円単位）
  int _calculateCategoryTopValue() {
    // カテゴリ別の全項目中の最大値を取得
    int maxValue = 0;
    for (final doc in widget.yearlyData) {
      for (final category in doc.categorySales) {
        if (category.sales > maxValue) {
          maxValue = category.sales;
        }
      }
    }
    
    if (maxValue <= 1000000) {
      return 1000000; // 100万円
    } else if (maxValue <= 2000000) {
      return 2000000; // 200万円
    } else if (maxValue <= 3000000) {
      return 3000000; // 300万円
    } else if (maxValue <= 4000000) {
      return 4000000; // 400万円
    } else {
      return ((maxValue / 1000000).ceil() * 1000000);
    }
  }

  /// 来店数グラフの最上位補助線（50人単位）
  int _calculateOrdersTopValue() {
    final maxOrders = widget.yearlyData.map((doc) => doc.orderCount).reduce((a, b) => a > b ? a : b);
    
    if (maxOrders <= 250) {
      return 250; // 250人
    } else if (maxOrders <= 500) {
      return 500; // 500人
    } else if (maxOrders <= 750) {
      return 750; // 750人
    } else if (maxOrders <= 1000) {
      return 1000; // 1000人
    } else {
      return ((maxOrders / 250).ceil() * 250);
    }
  }

  /// 平均客単価グラフの最上位補助線（500円単位）
  int _calculateAvgValueTopValue() {
    final maxAvgValue = widget.yearlyData.map((doc) => doc.avgOrderValue).reduce((a, b) => a > b ? a : b);
    
    if (maxAvgValue <= 2500) {
      return 2500; // 2500円
    } else if (maxAvgValue <= 5000) {
      return 5000; // 5000円
    } else if (maxAvgValue <= 7500) {
      return 7500; // 7500円
    } else if (maxAvgValue <= 10000) {
      return 10000; // 10000円
    } else {
      return ((maxAvgValue / 2500).ceil() * 2500);
    }
  }

  /// スクロール可能なグラフかどうかを判定
  bool _isScrollableChart() {
    return widget.chartType == 'payment' || widget.chartType == 'category';
  }

  /// 月名を取得（YYYY-MM形式のMM部分を参照）
  String _getMonthName(int monthIndex) {
    if (monthIndex >= 0 && monthIndex < widget.yearlyData.length) {
      final doc = widget.yearlyData[monthIndex];
      // MonthlyDocのmonthIdから月を取得
      final monthId = doc.monthId; // YYYY-MM形式
      if (monthId != null && monthId.isNotEmpty) {
        final parts = monthId.split('-');
        if (parts.length == 2) {
          final month = int.parse(parts[1]);
          return '${month}月';
        }
      }
      // フォールバック: インデックス+1
      return '${monthIndex + 1}月';
    }
    return '${monthIndex + 1}月';
  }

  /// 凡例を構築（決済別・カテゴリ別グラフ用）
  Widget _buildLegend() {
    if (widget.yearlyData.isEmpty) return const SizedBox.shrink();
    
    final firstDoc = widget.yearlyData.first;
    List<Map<String, dynamic>> legendItems = [];
    
    if (widget.chartType == 'payment') {
      final colors = [Colors.blue, Colors.green, Colors.orange, Colors.purple, Colors.red, Colors.teal];
      legendItems = firstDoc.paymentMethodSales.asMap().entries.map((entry) {
        final index = entry.key;
        final payment = entry.value;
        return {
          'color': colors[index % colors.length],
          'name': payment.method,
        };
      }).toList();
    } else if (widget.chartType == 'category') {
      final colors = [Colors.blue, Colors.green, Colors.orange, Colors.purple];
      legendItems = firstDoc.categorySales.asMap().entries.map((entry) {
        final index = entry.key;
        final category = entry.value;
        return {
          'color': colors[index % colors.length],
          'name': category.category,
        };
      }).toList();
    }
    
    return Container(
      height: 30,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: legendItems.map((item) {
            return Container(
              margin: const EdgeInsets.only(right: 16),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      color: item['color'],
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    item['name'],
                    style: const TextStyle(
                      fontSize: 10,
                      color: Colors.black,
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  /// Y軸ラベルを構築
  Widget _buildYAxisLabel(int value) {
    if (value == 0) {
      return const Text(
        '0',
        style: TextStyle(
          fontSize: 10,
          color: Colors.black,
        ),
      );
    }

    switch (widget.chartType) {
      case 'sales':
        // 万円表記
        final manValue = value ~/ 10000;
        return Text(
          '${manValue}万',
          style: const TextStyle(
            fontSize: 10,
            color: Colors.black,
          ),
        );
      case 'payment':
      case 'category':
        // 万円表記
        final manValue = value ~/ 10000;
        return Text(
          '${manValue}万',
          style: const TextStyle(
            fontSize: 10,
            color: Colors.black,
          ),
        );
      case 'orders':
        // 人数表記
        return Text(
          Formatters.formatNumber(value),
          style: const TextStyle(
            fontSize: 10,
            color: Colors.black,
          ),
        );
      case 'avgValue':
        // 円表記
        return Text(
          Formatters.formatNumber(value),
          style: const TextStyle(
            fontSize: 10,
            color: Colors.black,
          ),
        );
      default:
        return Text(
          Formatters.formatNumber(value),
          style: const TextStyle(
            fontSize: 10,
            color: Colors.black,
          ),
        );
    }
  }

  List<BarChartGroupData> _buildBarGroups() {
    return widget.yearlyData.asMap().entries.map((entry) {
      final index = entry.key;
      final data = entry.value;
      
      switch (widget.chartType) {
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
