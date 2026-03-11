import 'package:flutter/material.dart';
import 'package:amuse_app_template/Accounting/payment_split_calculator.dart';
import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';

/// 支払い分割計算のテスト用画面
/// 
/// ローカル完結で動作し、様々なパターンで計算ロジックをテストできます。
class PaymentSplitTestPage extends StatefulWidget {
  const PaymentSplitTestPage({super.key});

  @override
  State<PaymentSplitTestPage> createState() => _PaymentSplitTestPageState();
}

class _PaymentSplitTestPageState extends State<PaymentSplitTestPage> {
  // 選択された実決済手段
  String _selectedBaseMethod = 'cash';

  // カテゴリ別の金額
  final Map<String, TextEditingController> _billControllers = {
    'extraCost': TextEditingController(text: '1000'),
    'sideGameChip': TextEditingController(text: '3000'),
    'items': TextEditingController(text: '1500'),
    'tournaments': TextEditingController(text: '2000'),
  };

  // ポイント残高（任意の値を入力可能）
  final Map<String, TextEditingController> _balanceControllers = {
    'pointA': TextEditingController(text: '5000'),
    'pointB': TextEditingController(text: '0'),
    'sideGameChip': TextEditingController(text: '0'),
  };

  // ポイント優先順位
  List<String> _pointPriority = ['pointA', 'pointB', 'sideGameChip'];

  // 計算結果
  PaymentSplitResult? _result;

  @override
  void dispose() {
    for (final controller in _billControllers.values) {
      controller.dispose();
    }
    for (final controller in _balanceControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }


  void _calculate() {
    try {
      // 入力値を取得
      final bill = <String, int>{};
      for (final entry in _billControllers.entries) {
        final value = int.tryParse(entry.value.text) ?? 0;
        bill[entry.key] = value;
      }

      // バランスはコントローラーから取得
      final balances = <String, int>{};
      for (final entry in _balanceControllers.entries) {
        final value = int.tryParse(entry.value.text) ?? 0;
        balances[entry.key] = value;
      }

      // 計算実行
      final result = calculatePaymentSplit(
        selectedBaseMethod: _selectedBaseMethod,
        categoryPaymentMethods: StoreConfigService.instance.latestData?.categoryPaymentMethods ?? kDefaultCategoryPaymentMethods,
        bill: bill,
        balances: balances,
        pointPriority: _pointPriority,
      );

      setState(() {
        _result = result;
      });
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('計算エラー: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  void _reorderPointPriority(int oldIndex, int newIndex) {
    setState(() {
      if (newIndex > oldIndex) {
        newIndex -= 1;
      }
      final item = _pointPriority.removeAt(oldIndex);
      _pointPriority.insert(newIndex, item);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('支払い分割計算テスト'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 実決済手段の選択
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '実決済手段',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: 'cash', label: Text('現金')),
                        ButtonSegment(value: 'credit_card', label: Text('クレカ')),
                        ButtonSegment(
                          value: 'electronic_money',
                          label: Text('電子マネー'),
                        ),
                      ],
                      selected: {_selectedBaseMethod},
                      onSelectionChanged: (Set<String> newSelection) {
                        setState(() {
                          _selectedBaseMethod = newSelection.first;
                        });
                      },
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // カテゴリ別金額入力
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'カテゴリ別金額',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    ..._billControllers.entries.map((entry) {
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 120,
                              child: Text(_getCategoryLabel(entry.key)),
                            ),
                            Expanded(
                              child: TextField(
                                controller: entry.value,
                                keyboardType: TextInputType.number,
                                decoration: const InputDecoration(
                                  labelText: '金額（円）',
                                  border: OutlineInputBorder(),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // ポイント残高入力
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'ポイント残高',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    ..._balanceControllers.entries.map((entry) {
                      final isChip = entry.key == 'sideGameChip';
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 120,
                              child: Text(_getPointLabel(entry.key)),
                            ),
                            Expanded(
                              child: TextField(
                                controller: entry.value,
                                keyboardType: TextInputType.number,
                                decoration: InputDecoration(
                                  labelText: isChip ? 'チップ数' : 'ポイント',
                                  border: const OutlineInputBorder(),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // ポイント優先順位
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'ポイント優先順位',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    ReorderableListView(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      onReorder: _reorderPointPriority,
                      children: _pointPriority.map((pointType) {
                        return ListTile(
                          key: ValueKey(pointType),
                          title: Text(_getPointLabel(pointType)),
                          trailing: const Icon(Icons.drag_handle),
                        );
                      }).toList(),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // 計算ボタン
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _calculate,
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                child: const Text(
                  '計算実行',
                  style: TextStyle(fontSize: 16),
                ),
              ),
            ),
            const SizedBox(height: 24),

            // 計算結果表示
            if (_result != null) ...[
              const Text(
                '計算結果',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 16),

              // 使用したポイント
              Card(
                color: Colors.blue.shade50,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '使用したポイント',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      ..._result!.usedPoints.entries.map((entry) {
                        final isChip = entry.key == 'sideGameChip';
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(_getPointLabel(entry.key)),
                              Text(
                                '${entry.value.toString()}円${isChip ? " (${(entry.value / (StoreConfigService.instance.latestData?.sideGameChipRate ?? kDefaultSideGameChipRate)).toStringAsFixed(1)}チップ)" : ""}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // 計算後の残高
              Card(
                color: Colors.orange.shade50,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '計算後の残高',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      ..._getRemainingBalances().entries.map((entry) {
                        final isChip = entry.key == 'sideGameChip';
                        final displayValue = entry.value;
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(_getPointLabel(entry.key)),
                              Text(
                                isChip
                                    ? '${displayValue.toStringAsFixed(1)}チップ (${(displayValue * (StoreConfigService.instance.latestData?.sideGameChipRate ?? kDefaultSideGameChipRate)).toStringAsFixed(0)}円相当)'
                                    : '${displayValue.toStringAsFixed(0)}${isChip ? "チップ" : "ポイント"}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // 実決済手段での支払額
              Card(
                color: Colors.green.shade50,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '実決済手段での支払額',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '${_result!.cashLikeAmount.toString()}円',
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _getBaseMethodLabel(_result!.calculationMetadata.selectedBaseMethod),
                        style: TextStyle(
                          fontSize: 14,
                          color: Colors.grey.shade700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // カテゴリ別内訳
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'カテゴリ別内訳',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      ..._result!.categoryBreakdown.entries.map((entry) {
                        final breakdown = entry.value;
                        // 元の金額を取得
                        final originalAmount = int.tryParse(_billControllers[entry.key]?.text ?? '0') ?? 0;
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    _getCategoryLabel(entry.key),
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  Text(
                                    '合計: ${originalAmount}円',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'ポイント: ${breakdown.pointsUsed}円',
                                    style: TextStyle(color: Colors.blue.shade700),
                                  ),
                                  Text(
                                    '実決済: ${breakdown.baseMethodAmount}円',
                                    style: TextStyle(color: Colors.green.shade700),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // 計算メタデータ
              Card(
                color: Colors.grey.shade100,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        '計算メタデータ',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '優先順位: ${_result!.calculationMetadata.pointPriority.join(" → ")}',
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '実決済手段: ${_getBaseMethodLabel(_result!.calculationMetadata.selectedBaseMethod)}',
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _getCategoryLabel(String key) {
    switch (key) {
      case 'extraCost':
        return '入店料';
      case 'sideGameChip':
        return 'サイドゲームチップ';
      case 'items':
        return 'フード・ドリンク';
      case 'tournaments':
        return 'トーナメント';
      default:
        return key;
    }
  }

  String _getPointLabel(String key) {
    switch (key) {
      case 'pointA':
        return 'ポイントA';
      case 'pointB':
        return 'ポイントB';
      case 'sideGameChip':
        return 'サイドゲームチップ';
      default:
        return key;
    }
  }

  String _getBaseMethodLabel(String method) {
    switch (method) {
      case 'cash':
        return '現金';
      case 'credit_card':
        return 'クレジットカード';
      case 'electronic_money':
        return '電子マネー';
      default:
        return method;
    }
  }

  /// 計算後の残高を計算
  Map<String, double> _getRemainingBalances() {
    if (_result == null) return {};

    final remaining = <String, double>{};
    for (final entry in _balanceControllers.entries) {
      final initialBalance = double.tryParse(entry.value.text) ?? 0.0;
      final usedAmount = _result!.usedPoints[entry.key] ?? 0;

      if (entry.key == 'sideGameChip') {
        // sideGameChipはチップ数として扱う
        final usedChips = usedAmount / (StoreConfigService.instance.latestData?.sideGameChipRate ?? kDefaultSideGameChipRate);
        remaining[entry.key] = initialBalance - usedChips;
      } else {
        // 通常のポイントは円単位
        remaining[entry.key] = initialBalance - usedAmount;
      }
    }

    return remaining;
  }
}

