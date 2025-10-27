import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
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
  
  // ユーザーの残高を保持
  int _pointABalance = 0;
  int _pointBBalance = 0;
  int _sideGameTipBalance = 0;
  bool _isLoadingBalance = true;

  @override
  void initState() {
    super.initState();
    // 各カテゴリのデフォルト支払い方法を「現金」に設定
    _getCategoriesWithAmounts().forEach((category, _) {
      _selectedPaymentMethods[category] = 'cash';
    });
    // ユーザーの残高を取得
    _loadUserBalance();
  }

  // ユーザーの残高を取得
  Future<void> _loadUserBalance() async {
    final userId = widget.bill['userId'] as String?;
    if (userId == null || userId.isEmpty) {
      setState(() {
        _isLoadingBalance = false;
      });
      return;
    }

    try {
      final userDoc = await FirebaseFirestore.instance
          .collection('users')
          .doc(userId)
          .get();

      if (userDoc.exists) {
        final userData = userDoc.data()!;
        setState(() {
          _pointABalance = (userData['pointA'] as num? ?? 0).toInt();
          _pointBBalance = (userData['pointB'] as num? ?? 0).toInt();
          _sideGameTipBalance = (userData['sideGameTip'] as num? ?? 0).toInt();
          _isLoadingBalance = false;
        });
      } else {
        setState(() {
          _isLoadingBalance = false;
        });
      }
    } catch (e) {
      print('残高取得エラー: $e');
      setState(() {
        _isLoadingBalance = false;
      });
    }
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
    // 将来、一括支払いボタンを有効化する場合に使用
    // final commonPaymentMethods = _getCommonPaymentMethods();

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
              // 将来、複数の共通支払い方法が使える場合に有効化
              /* 
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
              */
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
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          _getPaymentMethodName(paymentMethod),
                                          style: TextStyle(
                                            fontSize: 14,
                                            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                                            color: isSelected ? Colors.blue : Colors.black87,
                                          ),
                                        ),
                                        if (_shouldShowBalance(paymentMethod))
                                          Text(
                                            _getBalanceText(paymentMethod),
                                            style: TextStyle(
                                              fontSize: 12,
                                              color: _getBalanceColor(paymentMethod, category),
                                              fontWeight: FontWeight.w500,
                                            ),
                                          ),
                                      ],
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
              ? () async {
                  // 残高不足チェックと自動分割処理
                  final result = await _processPaymentMethods();
                  if (result != null && mounted) {
                    Navigator.of(context).pop(result);
                  }
                }
              : null,
          child: const Text('確定'),
        ),
      ],
    );
  }

  // 支払い方法を処理（残高不足チェック + 自動分割）
  Future<Map<String, dynamic>?> _processPaymentMethods() async {
    final categoriesWithAmounts = _getCategoriesWithAmounts();
    final result = <String, dynamic>{};

    for (final entry in categoriesWithAmounts.entries) {
      final category = entry.key;
      final categoryAmount = entry.value;
      final selectedMethod = _selectedPaymentMethods[category];

      if (selectedMethod == null) continue;

      // ポイント/サイドゲームチップの場合、残高チェック
      if (selectedMethod == 'pointA' || selectedMethod == 'pointB' || selectedMethod == 'sideGameTip') {
        int balance = 0;
        double availableValue = 0;
        int availableChips = 0;
        
        switch (selectedMethod) {
          case 'pointA':
            balance = _pointABalance;
            availableValue = balance.toDouble();
            availableChips = balance;
            break;
          case 'pointB':
            balance = _pointBBalance;
            availableValue = balance.toDouble();
            availableChips = balance;
            break;
          case 'sideGameTip':
            balance = _sideGameTipBalance;
            availableValue = balance * GlobalConstants.SIDE_GAME_CHIP_EXCHANGE_RATE;
            availableChips = (availableValue / GlobalConstants.SIDE_GAME_CHIP_EXCHANGE_RATE).round();
            break;
        }

        // 残高が十分な場合
        if (availableValue >= categoryAmount) {
          result[category] = selectedMethod; // 文字列のまま（既存互換）
        } 
        // 残高不足の場合
        else {
          // 不足分の支払い方法を選択
          final shortfallMethod = await _showShortfallPaymentDialog(
            category,
            selectedMethod,
            availableChips,
            categoryAmount,
          );

          if (shortfallMethod == null) {
            // キャンセルされた
            return null;
          }

          // 分割支払いとして保存
          final remainingAmount = categoryAmount - availableValue.toInt();
          result[category] = [
            {'method': selectedMethod, 'amount': availableChips},
            {'method': shortfallMethod, 'amount': remainingAmount},
          ];
        }
      } else {
        // 現金・クレカ・電子マネーの場合はそのまま
        result[category] = selectedMethod;
      }
    }

    return result;
  }

  // 不足分の支払い方法選択ダイアログ
  Future<String?> _showShortfallPaymentDialog(
    String category,
    String originalMethod,
    int availableChips,
    int totalAmount,
  ) async {
    // 利用可能な金額を計算（サイドゲームチップの場合は換算）
    final double availableValue;
    if (originalMethod == 'sideGameTip') {
      availableValue = availableChips * GlobalConstants.SIDE_GAME_CHIP_EXCHANGE_RATE;
    } else {
      availableValue = availableChips.toDouble();
    }
    
    final shortfall = totalAmount - availableValue.toInt();
    final availableMethods = GlobalConstants.categoryPaymentMethods[category] ?? [];
    
    // 不足分に使える支払い方法（元の方法とポイント系を除外）
    final shortfallOptions = availableMethods.where((method) =>
      method != originalMethod &&
      method != 'pointA' &&
      method != 'pointB' &&
      method != 'sideGameTip'
    ).toList();

    return showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.warning_amber, color: Colors.orange),
            SizedBox(width: 8),
            Text('残高不足'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _getCategoryDisplayName(category),
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              '${_getPaymentMethodName(originalMethod)}の残高が不足しています。',
              style: const TextStyle(fontSize: 14),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('必要金額: ¥${totalAmount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}'),
                  if (originalMethod == 'sideGameTip')
                    Text('${_getPaymentMethodName(originalMethod)}残高: ${availableChips}枚 (¥${availableValue.toInt().toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')})', 
                      style: TextStyle(color: Colors.green.shade700, fontWeight: FontWeight.bold))
                  else
                    Text('${_getPaymentMethodName(originalMethod)}残高: ¥${availableChips.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}', 
                      style: TextStyle(color: Colors.green.shade700, fontWeight: FontWeight.bold)),
                  const Divider(),
                  Text('不足分: ¥${shortfall.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}', 
                    style: TextStyle(color: Colors.red.shade700, fontWeight: FontWeight.bold, fontSize: 16)),
                ],
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              '不足分の支払い方法を選択してください:',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            ...shortfallOptions.map((method) {
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                child: ElevatedButton.icon(
                  onPressed: () => Navigator.of(context).pop(method),
                  icon: Icon(_getPaymentMethodIcon(method), size: 20),
                  label: Text(
                    _getPaymentMethodName(method),
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                  ),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                    minimumSize: const Size(double.infinity, 48),
                    backgroundColor: Colors.blue.shade600,
                    foregroundColor: Colors.white,
                  ),
                ),
              );
            }).toList(),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('キャンセル'),
          ),
        ],
      ),
    );
  }

  // 残高を表示すべき支払い方法かどうか
  bool _shouldShowBalance(String paymentMethod) {
    return paymentMethod == 'pointA' || 
           paymentMethod == 'pointB' || 
           paymentMethod == 'sideGameTip';
  }

  // 残高のテキストを取得
  String _getBalanceText(String paymentMethod) {
    if (_isLoadingBalance) {
      return '残高: 読込中...';
    }
    
    int balance = 0;
    switch (paymentMethod) {
      case 'pointA':
        balance = _pointABalance;
        return '残高: ¥${balance.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}';
      case 'pointB':
        balance = _pointBBalance;
        return '残高: ¥${balance.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}';
      case 'sideGameTip':
        balance = _sideGameTipBalance;
        final chipValue = (balance * GlobalConstants.SIDE_GAME_CHIP_EXCHANGE_RATE).toInt();
        return '残高: ${balance.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}枚 (¥${chipValue.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')})';
      default:
        return '残高: ¥0';
    }
  }

  // 残高の色を取得（残高不足の場合は赤色）
  Color _getBalanceColor(String paymentMethod, String category) {
    if (_isLoadingBalance) {
      return Colors.grey;
    }
    
    final categoriesWithAmounts = _getCategoriesWithAmounts();
    final requiredAmount = categoriesWithAmounts[category] ?? 0;
    
    int balance = 0;
    double availableValue = 0;
    
    switch (paymentMethod) {
      case 'pointA':
        balance = _pointABalance;
        availableValue = balance.toDouble();
        break;
      case 'pointB':
        balance = _pointBBalance;
        availableValue = balance.toDouble();
        break;
      case 'sideGameTip':
        balance = _sideGameTipBalance;
        availableValue = balance * GlobalConstants.SIDE_GAME_CHIP_EXCHANGE_RATE;
        break;
      default:
        return Colors.grey.shade600;
    }
    
    // 残高が足りない場合は赤色、足りる場合は緑色
    return availableValue >= requiredAmount ? Colors.green.shade700 : Colors.red.shade700;
  }
}

