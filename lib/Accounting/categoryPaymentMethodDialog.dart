import 'package:flutter/material.dart';
import 'package:amuse_app_template/globalConstant.dart';

class CategoryPaymentMethodDialog extends StatefulWidget {
  final Map<String, dynamic> bill;

  const CategoryPaymentMethodDialog({
    Key? key,
    required this.bill,
  }) : super(key: key);

  @override
  State<CategoryPaymentMethodDialog> createState() => _CategoryPaymentMethodDialogState();
}

class _CategoryPaymentMethodDialogState extends State<CategoryPaymentMethodDialog> {
  // カテゴリごとに選択された支払い方法を保持
  final Map<String, String?> _selectedPaymentMethods = {};

  @override
  void initState() {
    super.initState();
    // 各カテゴリの初期値をnullに設定
    _getCategoriesWithAmounts().forEach((category, _) {
      _selectedPaymentMethods[category] = null;
    });
  }

  // カテゴリごとの金額を計算
  Map<String, int> _getCategoriesWithAmounts() {
    final Map<String, int> categoriesWithAmounts = {};

    // 入店料（extraCost）
    final extraCosts = widget.bill['extraCost'] as List<dynamic>? ?? [];
    int totalExtraCost = 0;
    for (final extraCost in extraCosts) {
      totalExtraCost += (extraCost['price'] as num? ?? 0).toInt();
    }
    if (totalExtraCost > 0) {
      categoriesWithAmounts['extraCost'] = totalExtraCost;
    }

    // トーナメント参加費（tournaments）
    final tournamentsData = widget.bill['tournaments'];
    int totalTournamentFee = 0;
    if (tournamentsData is Map<String, dynamic>) {
      for (final tournament in tournamentsData.values) {
        totalTournamentFee += (tournament['entryFee'] as num? ?? 0).toInt();
      }
    }
    if (totalTournamentFee > 0) {
      categoriesWithAmounts['tournaments'] = totalTournamentFee;
    }

    // フード・ドリンク（items）
    final items = widget.bill['items'] as List<dynamic>? ?? [];
    int totalOrderAmount = 0;
    for (final item in items) {
      final price = (item['price'] as num? ?? 0).toInt();
      final quantity = (item['quantity'] as num? ?? 0).toInt();
      totalOrderAmount += price * quantity;
    }
    if (totalOrderAmount > 0) {
      categoriesWithAmounts['items'] = totalOrderAmount;
    }

    // サイドゲームチップ（sideGameChip）
    final sideGameChips = widget.bill['sideGameChip'] as List<dynamic>? ?? [];
    int totalSideGameChipAmount = 0;
    for (final chip in sideGameChips) {
      totalSideGameChipAmount += (chip['price'] as num? ?? 0).toInt();
    }
    if (totalSideGameChipAmount > 0) {
      categoriesWithAmounts['sideGameChip'] = totalSideGameChipAmount;
    }

    return categoriesWithAmounts;
  }

  // カテゴリ名の表示用ラベルを取得
  String _getCategoryDisplayName(String category) {
    switch (category) {
      case 'extraCost':
        return '入店料';
      case 'tournaments':
        return 'トーナメント参加費';
      case 'items':
        return 'フード・ドリンク';
      case 'sideGameChip':
        return 'サイドゲームチップ';
      default:
        return category;
    }
  }

  // 支払い方法の表示名を取得
  String _getPaymentMethodName(String paymentMethod) {
    switch (paymentMethod) {
      case 'cash':
        return '現金';
      case 'credit_card':
        return 'クレジットカード';
      case 'electronic_money':
        return '電子マネー';
      case 'pointA':
        return 'ポイントA';
      case 'pointB':
        return 'ポイントB';
      case 'sideGameTip':
        return 'サイドゲームチップ';
      default:
        return paymentMethod;
    }
  }

  // 支払い方法のアイコンを取得
  IconData _getPaymentMethodIcon(String paymentMethod) {
    switch (paymentMethod) {
      case 'cash':
        return Icons.attach_money;
      case 'credit_card':
        return Icons.credit_card;
      case 'electronic_money':
        return Icons.qr_code;
      case 'pointA':
        return Icons.star;
      case 'pointB':
        return Icons.stars;
      case 'sideGameTip':
        return Icons.casino;
      default:
        return Icons.payment;
    }
  }

  // カテゴリのアイコンを取得
  IconData _getCategoryIcon(String category) {
    switch (category) {
      case 'extraCost':
        return Icons.door_front_door;
      case 'tournaments':
        return Icons.emoji_events;
      case 'items':
        return Icons.restaurant;
      case 'sideGameChip':
        return Icons.casino;
      default:
        return Icons.category;
    }
  }

  // 全てのカテゴリで支払い方法が選択されているかチェック
  bool _areAllPaymentMethodsSelected() {
    final categories = _getCategoriesWithAmounts();
    for (final category in categories.keys) {
      if (_selectedPaymentMethods[category] == null) {
        return false;
      }
    }
    return true;
  }

  // 全カテゴリで共通して利用可能な支払い方法を取得
  List<String> _getCommonPaymentMethods() {
    final categories = _getCategoriesWithAmounts();
    if (categories.isEmpty) return [];

    Set<String>? commonMethods;

    for (final category in categories.keys) {
      final availableMethods = GlobalConstants.categoryPaymentMethods[category] ?? [];
      final methodsSet = availableMethods.toSet();

      if (commonMethods == null) {
        commonMethods = methodsSet;
      } else {
        commonMethods = commonMethods.intersection(methodsSet);
      }
    }

    return commonMethods?.toList() ?? [];
  }

  // 全カテゴリに同じ支払い方法を設定
  void _setAllCategoriesToPaymentMethod(String paymentMethod) {
    setState(() {
      final categories = _getCategoriesWithAmounts();
      for (final category in categories.keys) {
        _selectedPaymentMethods[category] = paymentMethod;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final categoriesWithAmounts = _getCategoriesWithAmounts();
    final totalAmount = categoriesWithAmounts.values.fold(0, (sum, amount) => sum + amount);
    final commonPaymentMethods = _getCommonPaymentMethods();

    return AlertDialog(
      title: const Text(
        'カテゴリ別支払い方法選択',
        style: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.bold,
        ),
      ),
      content: SizedBox(
        width: double.maxFinite,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 一括支払いセクション（共通の支払い方法がある場合のみ表示）
              if (commonPaymentMethods.isNotEmpty) ...[
                const Text(
                  '一括支払い',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(height: 8),
                ...commonPaymentMethods.map((paymentMethod) {
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ElevatedButton.icon(
                      onPressed: () => _setAllCategoriesToPaymentMethod(paymentMethod),
                      icon: Icon(_getPaymentMethodIcon(paymentMethod), size: 24),
                      label: Text(
                        '全て${_getPaymentMethodName(paymentMethod)}で支払う',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
                        minimumSize: const Size(double.infinity, 50),
                        backgroundColor: Colors.green.shade600,
                        foregroundColor: Colors.white,
                      ),
                    ),
                  );
                }).toList(),
                const Divider(thickness: 2),
                const SizedBox(height: 8),
                const Text(
                  '個別選択',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
                const SizedBox(height: 8),
              ],
              // 各カテゴリの支払い方法選択
              ...categoriesWithAmounts.entries.map((entry) {
                final category = entry.key;
                final amount = entry.value;
                final availablePaymentMethods = GlobalConstants.categoryPaymentMethods[category] ?? [];

                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  elevation: 2,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // カテゴリ名と金額
                        Row(
                          children: [
                            Icon(
                              _getCategoryIcon(category),
                              size: 20,
                              color: Colors.blue.shade600,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _getCategoryDisplayName(category),
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            Text(
                              '¥${amount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: Colors.green,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        // 支払い方法選択
                        ...availablePaymentMethods.map((paymentMethod) {
                          final isSelected = _selectedPaymentMethods[category] == paymentMethod;
                          return InkWell(
                            onTap: () {
                              setState(() {
                                _selectedPaymentMethods[category] = paymentMethod;
                              });
                            },
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: isSelected ? Colors.blue.shade50 : Colors.grey.shade50,
                                border: Border.all(
                                  color: isSelected ? Colors.blue : Colors.grey.shade300,
                                  width: isSelected ? 2 : 1,
                                ),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    _getPaymentMethodIcon(paymentMethod),
                                    size: 20,
                                    color: isSelected ? Colors.blue : Colors.grey.shade600,
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Text(
                                      _getPaymentMethodName(paymentMethod),
                                      style: TextStyle(
                                        fontSize: 14,
                                        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                                        color: isSelected ? Colors.blue : Colors.black87,
                                      ),
                                    ),
                                  ),
                                  if (isSelected)
                                    const Icon(
                                      Icons.check_circle,
                                      color: Colors.blue,
                                      size: 20,
                                    ),
                                ],
                              ),
                            ),
                          );
                        }).toList(),
                      ],
                    ),
                  ),
                );
              }).toList(),
              const Divider(thickness: 2),
              // 合計金額
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    '合計',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    '¥${totalAmount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.green,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('キャンセル'),
        ),
        ElevatedButton(
          onPressed: _areAllPaymentMethodsSelected()
              ? () {
                  Navigator.of(context).pop(_selectedPaymentMethods);
                }
              : null,
          child: const Text('確定'),
        ),
      ],
    );
  }
}

