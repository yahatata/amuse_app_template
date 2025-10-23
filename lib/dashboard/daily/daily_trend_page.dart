/// 日次推移画面
/// 
/// 責務: 日次売上推移の詳細表示（現金・電子マネー・ポイント切り替え）
/// 参照フィールド: analyticsMonthly/{YYYY-MM}/days/{YYYY-MM-DD}
/// 遅延ロード: あり（日次データは初回ロード時）

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/repo/analytics_repository.dart';
import '../../data/models/analytics_models.dart';
import '../../core/utils/formatters.dart';
import '../widgets/line_chart.dart';
import '../../core/widgets/skeleton.dart';

// region Riverpod Providers

/// 日次データのProvider
final dailyDataProvider = FutureProvider.family<List<DailyDoc>, String>((ref, yyyymm) async {
  final repository = AnalyticsRepository();
  return repository.fetchMonthlyDays(yyyymm);
});

// endregion

class DailyTrendPage extends ConsumerStatefulWidget {
  final String? month;
  
  const DailyTrendPage({
    super.key,
    this.month,
  });

  @override
  ConsumerState<DailyTrendPage> createState() => _DailyTrendPageState();
}

class _DailyTrendPageState extends ConsumerState<DailyTrendPage> {
  String _selectedView = 'all'; // 'all', 'cash_credit_emoney', 'points'
  
  final List<String> _viewOptions = ['全て', '現金・クレカ・電子マネー', 'ポイント'];

  @override
  Widget build(BuildContext context) {
    final currentMonth = widget.month ?? AnalyticsRepository().getCurrentYearMonth();
    final dailyDataAsync = ref.watch(dailyDataProvider(currentMonth));

    return Scaffold(
      appBar: AppBar(
        title: Text('日次推移 - ${Formatters.formatYearMonth(currentMonth)}'),
        backgroundColor: Colors.blue[700],
        foregroundColor: Colors.white,
        centerTitle: true,
      ),
      body: dailyDataAsync.when(
        data: (dailyData) {
          if (dailyData.isEmpty) {
            return const Center(
              child: Text('データが見つかりません'),
            );
          }
          return _buildDailyContent(context, dailyData);
        },
        loading: () => _buildSkeletonContent(context),
        error: (error, stack) => Center(
          child: Text('エラーが発生しました: $error'),
        ),
      ),
    );
  }

  Widget _buildSkeletonContent(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        children: [
          // ビュー選択（スケルトン）
          const Skeleton(width: double.infinity, height: 60),
          const SizedBox(height: 16),
          // 折れ線グラフ（スケルトン）
          const SkeletonChart(width: double.infinity, height: 400),
          const SizedBox(height: 16),
          // 日次詳細（スケルトン）
          const SkeletonChart(width: double.infinity, height: 300),
        ],
      ),
    );
  }

  Widget _buildDailyContent(BuildContext context, List<DailyDoc> dailyData) {
    final filteredData = _getFilteredData(dailyData);
    
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        children: [
          // ビュー選択
          _buildViewSelector(context),
          const SizedBox(height: 16),
          // 折れ線グラフ
          _buildLineChart(context, filteredData),
          const SizedBox(height: 16),
          // 日次詳細
          _buildDailyDetails(context, filteredData),
        ],
      ),
    );
  }

  Widget _buildViewSelector(BuildContext context) {
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
            '表示切り替え',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: _viewOptions.map((option) => 
              ButtonSegment<String>(
                value: option,
                label: Text(option),
              ),
            ).toList(),
            selected: {_getViewDisplayName(_selectedView)},
            onSelectionChanged: (Set<String> selection) {
              setState(() {
                _selectedView = _getViewValue(selection.first);
              });
            },
          ),
        ],
      ),
    );
  }

  Widget _buildLineChart(BuildContext context, List<DailyDoc> dailyData) {
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
      child: LineChart(
        dailyData: dailyData.map((doc) => DailySales(
          doc.date,
          _getSalesForView(doc),
        )).toList(),
        title: '日次売上推移',
      ),
    );
  }

  Widget _buildDailyDetails(BuildContext context, List<DailyDoc> dailyData) {
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
          Text(
            '日次詳細 (${dailyData.length}日)',
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          ...dailyData.map((doc) {
            final sales = _getSalesForView(doc);
            final percentage = _getPercentage(dailyData, sales);
            
            return Container(
              margin: const EdgeInsets.only(bottom: 8.0),
              padding: const EdgeInsets.all(12.0),
              decoration: BoxDecoration(
                color: Colors.grey[50],
                borderRadius: BorderRadius.circular(8.0),
                border: Border.all(color: Colors.grey[200]!),
              ),
              child: Row(
                children: [
                  // 日付
                  Container(
                    width: 60,
                    child: Text(
                      Formatters.formatDateShort(doc.date),
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  // 売上情報
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          Formatters.formatCurrency(sales),
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: Colors.blue,
                          ),
                        ),
                        Text(
                          '${Formatters.formatNumber(doc.orderCount)}回',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey[600],
                          ),
                        ),
                      ],
                    ),
                  ),
                  // 進捗バー
                  Container(
                    width: 80,
                    height: 8,
                    decoration: BoxDecoration(
                      color: Colors.grey[200],
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: FractionallySizedBox(
                      alignment: Alignment.centerLeft,
                      widthFactor: percentage,
                      child: Container(
                        decoration: BoxDecoration(
                          color: Colors.blue,
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

  List<DailyDoc> _getFilteredData(List<DailyDoc> dailyData) {
    // 現在のビューに応じてフィルタリング
    // 実際の実装では、必要に応じてデータをフィルタリング
    return dailyData;
  }

  int _getSalesForView(DailyDoc doc) {
    switch (_selectedView) {
      case 'cash_credit_emoney':
        return (doc.byPaymentMethod['cash'] ?? 0) + 
               (doc.byPaymentMethod['credit_card'] ?? 0) + 
               (doc.byPaymentMethod['electronic_money'] ?? 0);
      case 'points':
        return (doc.byPaymentMethod['pointA'] ?? 0) + 
               (doc.byPaymentMethod['pointB'] ?? 0) + 
               (doc.byPaymentMethod['sideGameChip'] ?? 0);
      default:
        return doc.grossSales;
    }
  }

  double _getPercentage(List<DailyDoc> dailyData, int sales) {
    if (dailyData.isEmpty) return 0.0;
    final maxSales = dailyData.map((doc) => _getSalesForView(doc)).reduce((a, b) => a > b ? a : b);
    return maxSales > 0 ? sales / maxSales : 0.0;
  }

  String _getViewDisplayName(String view) {
    switch (view) {
      case 'all':
        return '全て';
      case 'cash_credit_emoney':
        return '現金・クレカ・電子マネー';
      case 'points':
        return 'ポイント';
      default:
        return view;
    }
  }

  String _getViewValue(String displayName) {
    switch (displayName) {
      case '全て':
        return 'all';
      case '現金・クレカ・電子マネー':
        return 'cash_credit_emoney';
      case 'ポイント':
        return 'points';
      default:
        return 'all';
    }
  }
}
