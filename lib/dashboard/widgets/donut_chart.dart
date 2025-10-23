/// ドーナツグラフウィジェット
/// 
/// 責務: 支払い方法・カテゴリ構成のドーナツグラフ表示
/// 参照フィールド: MonthlyDoc.paymentMethodSales, MonthlyDoc.categorySales
/// 遅延ロード: なし（データは既に取得済み）

import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../data/models/analytics_models.dart';
import '../../core/utils/formatters.dart';

class DonutChart extends StatelessWidget {
  final List<PaymentMethodSales>? paymentData;
  final List<CategorySales>? categoryData;
  final String title;
  final double? height;
  final VoidCallback? onTap;

  const DonutChart({
    super.key,
    this.paymentData,
    this.categoryData,
    required this.title,
    this.height,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    // 画面縦幅の13%を円グラフの半径として使用
    final screenHeight = MediaQuery.of(context).size.height;
    final chartRadius = screenHeight * 0.06;
    
    final data = paymentData ?? categoryData;
    if (data == null || data.isEmpty) {
      return Container(
        height: height ?? 220,
        child: const Center(
          child: Text('データがありません'),
        ),
      );
    }

    // 0以外のデータのみをフィルタリング
    final filteredData = data.where((item) => (item as dynamic).sales > 0).toList();
    if (filteredData.isEmpty) {
      return Container(
        height: height ?? 220,
        child: const Center(
          child: Text('データがありません'),
        ),
      );
    }

    final total = filteredData.map((e) => (e as dynamic).sales).reduce((a, b) => a + b);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: height ?? 220,
        padding: const EdgeInsets.all(16.0),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // タイトルと円グラフを縦に配置
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  // ドーナツグラフ全体のサイズ（画面縦幅の13%の直径）
                  width: chartRadius * 2,
                  height: chartRadius * 2,
                  child: PieChart(
                    PieChartData(
                      pieTouchData: PieTouchData(
                        enabled: true,
                        touchCallback: (FlTouchEvent event, pieTouchResponse) {
                          // タップ時の処理（必要に応じて実装）
                        },
                      ),
                      sectionsSpace: 2,
                      // ドーナツの内側の穴のサイズ（外側半径の30%）
                      centerSpaceRadius: chartRadius * 0.3,
                      sections: _buildSections(filteredData, total, chartRadius),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                // 合計金額
                Center(
                  child: Text(
                    Formatters.formatCurrency(total),
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.blue,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(width: 16),
            // 文字群（カテゴリ名称・合計金額・割合）
            Expanded(
              child: SingleChildScrollView(
                child: _buildLegend(filteredData, total),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<PieChartSectionData> _buildSections(List<dynamic> data, int total, double chartRadius) {
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
      final percentage = ((item as dynamic).sales / total) * 100;

      return PieChartSectionData(
        color: color,
        value: (item as dynamic).sales.toDouble(),
        title: '',
        radius: chartRadius, // 円グラフの実際のサイズ（画面縦幅の13%）
        titleStyle: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.bold,
          color: Colors.white,
        ),
        badgeWidget: null,
        badgePositionPercentageOffset: 1.3,
      );
    }).toList();
  }

  Widget _buildLegend(List<dynamic> data, int total) {
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
        final percentage = ((item as dynamic).sales / total) * 100;

        String displayName;
        if (paymentData != null) {
          displayName = Formatters.getPaymentMethodDisplayName((item as dynamic).method);
        } else {
          displayName = Formatters.getCategoryDisplayName((item as dynamic).category);
        }

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
              // カテゴリ名称と金額・割合
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // カテゴリ名称
                    Text(
                      displayName,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    // 金額と割合
                    Text(
                      '${Formatters.formatCurrency((item as dynamic).sales)}(${Formatters.formatPercentage(percentage / 100)})',
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
