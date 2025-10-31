import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:amuse_app_template/Accounting/accountingHistoryPage.dart';
import 'package:amuse_app_template/Accounting/accountingEditDialog.dart';
import 'package:amuse_app_template/Accounting/accountingCancelDialog.dart';
import 'package:amuse_app_template/Accounting/refundProcessingDialog.dart';
import 'package:amuse_app_template/Accounting/paymentMethodDialog.dart';
import 'package:amuse_app_template/Accounting/categoryDetailDialog.dart';
import 'package:amuse_app_template/Accounting/categoryPaymentMethodDialog.dart';
import 'package:amuse_app_template/Accounting/payment_split_calculator.dart';
import 'package:amuse_app_template/globalConstant.dart';

class _CategoryAmounts {
  _CategoryAmounts({required this.displayValues, required this.monetaryValues});

  final Map<String, int> displayValues;
  final Map<String, int> monetaryValues;

  int get total => monetaryValues.values.fold(0, (sum, value) => sum + value);
}

class _AutoSplitResult {
  _AutoSplitResult({
    required this.paymentMethodsByAmount,
    required this.serverResult,
    required this.verified,
  });

  final Map<String, int> paymentMethodsByAmount;
  final Map<String, dynamic> serverResult;
  final bool verified;
}

class AccountingPage extends StatefulWidget {
  const AccountingPage({super.key});

  @override
  State<AccountingPage> createState() => _AccountingPageState();
}

class _AccountingPageState extends State<AccountingPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseFunctions _functions = FirebaseFunctions.instance;

  List<Map<String, dynamic>> _activeBills = [];
  List<Map<String, dynamic>> _settledBills = [];
  bool _isLoading = false;
  bool _showSettledBills = false;

  @override
  void initState() {
    super.initState();
    _loadActiveBills();
    _loadSettledBills();
  }

  // 営業日を計算する関数
  String _getBusinessDate() {
    final now = DateTime.now();
    final closeHour = GlobalConstants.STORE_CLOSE_HOUR;

    // 現在時刻が店舗締め時間より前の場合は前日の営業日
    if (now.hour < closeHour) {
      final businessDate = now.subtract(const Duration(days: 1));
      return businessDate.toIso8601String().split('T')[0];
    } else {
      // 店舗締め時間以降は当日の営業日
      return now.toIso8601String().split('T')[0];
    }
  }

  Future<void> _loadActiveBills() async {
    setState(() {
      _isLoading = true;
    });

    try {
      // 営業日の未会計の請求書を取得
      final businessDate = _getBusinessDate();
      final querySnapshot = await _firestore
          .collection('todaysBills')
          .where('date', isEqualTo: businessDate)
          .where('status', isEqualTo: 'open')
          .get();

      setState(() {
        _activeBills = querySnapshot.docs.map((doc) {
          final data = doc.data();
          return {'id': doc.id, ...data};
        }).toList();
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('データの取得に失敗しました: $e')));
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _loadSettledBills() async {
    try {
      // 営業日の会計完了済みの請求書を取得
      final businessDate = _getBusinessDate();
      final querySnapshot = await _firestore
          .collection('todaysBills')
          .where('date', isEqualTo: businessDate)
          .where('status', isEqualTo: 'settled')
          .orderBy('accountingCompletedAt', descending: true)
          .get();

      setState(() {
        _settledBills = querySnapshot.docs.map((doc) {
          final data = doc.data();
          return {'id': doc.id, ...data};
        }).toList();
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('会計完了データの取得に失敗しました: $e')));
      }
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
      case 'sideGameChip':
        return Icons.casino;
      default:
        return Icons.attach_money;
    }
  }

  // カテゴリ名を取得
  String _getCategoryName(String category) {
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

  // 会計明細確認ダイアログを表示
  Future<bool> _showPaymentConfirmationDialog(
    Map<String, dynamic> bill,
    Map<String, dynamic> paymentMethodsByCategory,
    Map<String, int> paymentMethodsByAmount,
  ) async {
    final pokerName = bill['pokerName'] ?? '不明';
    final totalPrice = (bill['totalPrice'] as num?)?.toInt() ?? 0;

    // カテゴリ別の金額を計算
    final List<dynamic> extraCost = bill['extraCost'] as List<dynamic>? ?? [];
    final List<dynamic> items = bill['items'] as List<dynamic>? ?? [];
    final List<dynamic> sideGameChip =
        bill['sideGameChip'] as List<dynamic>? ?? [];
    final Map<String, dynamic> tournaments =
        bill['tournaments'] as Map<String, dynamic>? ?? {};

    int extraCostAmount = 0;
    for (var cost in extraCost) {
      if (cost is Map<String, dynamic>) {
        extraCostAmount += (cost['price'] as num?)?.toInt() ?? 0;
      }
    }

    int itemsAmount = 0;
    for (var item in items) {
      if (item is Map<String, dynamic>) {
        itemsAmount += (item['price'] as num?)?.toInt() ?? 0;
      }
    }

    int sideGameChipAmount = 0;
    for (var chip in sideGameChip) {
      if (chip is Map<String, dynamic>) {
        final chipCount = (chip['chipCount'] as num?)?.toInt() ?? 0;
        sideGameChipAmount += chipCount;
      }
    }

    int tournamentsAmount = 0;
    for (var tournament in tournaments.values) {
      if (tournament is Map<String, dynamic>) {
        tournamentsAmount += (tournament['entryFee'] as num?)?.toInt() ?? 0;
      }
    }

    final categoryAmounts = <String, int>{
      'extraCost': extraCostAmount,
      'items': itemsAmount,
      'sideGameChip': sideGameChipAmount,
      'tournaments': tournamentsAmount,
    };

    return await showDialog<bool>(
          context: context,
          barrierDismissible: false,
          builder: (context) => Dialog(
            child: Container(
              width: MediaQuery.of(context).size.width * 0.85,
              constraints: const BoxConstraints(maxWidth: 500),
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // タイトル
                  const Row(
                    children: [
                      Icon(Icons.receipt_long, color: Colors.blue, size: 28),
                      SizedBox(width: 8),
                      Text(
                        '会計明細確認',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  // コンテンツ
                  Flexible(
                    child: SingleChildScrollView(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // ユーザー名
                          Row(
                            children: [
                              const Icon(
                                Icons.person,
                                size: 20,
                                color: Colors.grey,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                pokerName,
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),

                          // カテゴリ別内訳
                          const Text(
                            '内訳',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          ...categoryAmounts.entries.where((e) => e.value > 0).map((
                            entry,
                          ) {
                            final categoryKey = entry.key;
                            final categoryValue = entry.value;
                            String displayAmount;

                            // サイドゲームチップの場合はチップ枚数と円換算額を表示
                            if (categoryKey == 'sideGameChip') {
                              final chipValue =
                                  (categoryValue *
                                          GlobalConstants
                                              .SIDE_GAME_CHIP_EXCHANGE_RATE)
                                      .toInt();
                              displayAmount =
                                  'チップ${categoryValue}枚 (¥${chipValue.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')})';
                            } else {
                              displayAmount =
                                  '¥${categoryValue.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}';
                            }

                            return Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    _getCategoryName(categoryKey),
                                    style: const TextStyle(fontSize: 14),
                                  ),
                                  Text(
                                    displayAmount,
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ],
                              ),
                            );
                          }),
                          const Divider(height: 24),

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
                                '¥${totalPrice.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),

                          // 支払い方法
                          const Text(
                            '支払い方法',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          ...paymentMethodsByAmount.entries.map((entry) {
                            final method = entry.key;
                            final amount = entry.value;
                            String displayText;

                            if (method == 'sideGameChip') {
                              final chipValue =
                                  (amount *
                                          GlobalConstants
                                              .SIDE_GAME_CHIP_EXCHANGE_RATE)
                                      .toInt();
                              displayText =
                                  'チップ${amount}枚 (¥${chipValue.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')})';
                            } else {
                              displayText =
                                  '¥${amount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}';
                            }

                            return Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Row(
                                children: [
                                  Icon(
                                    _getPaymentMethodIcon(method),
                                    size: 20,
                                    color: Colors.grey.shade700,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      _getPaymentMethodName(method),
                                      style: const TextStyle(fontSize: 14),
                                    ),
                                  ),
                                  Text(
                                    displayText,
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w500,
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
                  const SizedBox(height: 20),
                  // アクションボタン
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        onPressed: () => Navigator.of(context).pop(false),
                        child: const Text('キャンセル'),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton(
                        onPressed: () => Navigator.of(context).pop(true),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.blue,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 24,
                            vertical: 12,
                          ),
                        ),
                        child: const Text('会計を開始'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ) ??
        false;
  }

  // カテゴリ別支払い方法から支払い方法ごとの合計金額を計算
  Map<String, int> _calculatePaymentMethodsByAmount(
    Map<String, dynamic> bill,
    Map<String, dynamic> paymentMethodsByCategory,
  ) {
    final Map<String, int> paymentMethodsByAmount = {};

    // カテゴリ別の金額を取得
    final List<dynamic> extraCost = bill['extraCost'] as List<dynamic>? ?? [];
    final List<dynamic> items = bill['items'] as List<dynamic>? ?? [];
    final List<dynamic> sideGameChip =
        bill['sideGameChip'] as List<dynamic>? ?? [];
    final Map<String, dynamic> tournaments =
        bill['tournaments'] as Map<String, dynamic>? ?? {};

    int extraCostAmount = 0;
    for (var cost in extraCost) {
      if (cost is Map<String, dynamic>) {
        // extraCostはpriceフィールドを使用（processVisitByQR.ts参照）
        final amount = (cost['price'] as num?)?.toInt() ?? 0;
        extraCostAmount += amount;
      }
    }

    int itemsAmount = 0;
    for (var item in items) {
      if (item is Map<String, dynamic>) {
        final price = (item['price'] as num?)?.toInt() ?? 0;
        itemsAmount += price;
      }
    }

    int sideGameChipAmount = 0;
    for (var chip in sideGameChip) {
      if (chip is Map<String, dynamic>) {
        final chipCount = (chip['chipCount'] as num?)?.toInt() ?? 0;
        sideGameChipAmount += chipCount;
      }
    }

    int tournamentsAmount = 0;
    for (var tournament in tournaments.values) {
      if (tournament is Map<String, dynamic>) {
        final price = (tournament['entryFee'] as num?)?.toInt() ?? 0;
        tournamentsAmount += price;
      }
    }

    final Map<String, int> categoryAmounts = {
      'extraCost': extraCostAmount,
      'items': itemsAmount,
      'sideGameChip': sideGameChipAmount,
      'tournaments': tournamentsAmount,
    };

    // カテゴリ別の支払い方法を集計
    for (final entry in paymentMethodsByCategory.entries) {
      final category = entry.key;
      final paymentValue = entry.value;
      final categoryAmount = categoryAmounts[category] ?? 0;

      if (categoryAmount > 0) {
        // 文字列の場合（単一支払い方法）
        if (paymentValue is String) {
          paymentMethodsByAmount[paymentValue] =
              (paymentMethodsByAmount[paymentValue] ?? 0) + categoryAmount;
        }
        // 配列の場合（分割支払い）
        else if (paymentValue is List) {
          for (final split in paymentValue) {
            if (split is Map<String, dynamic>) {
              final method = split['method']?.toString() ?? 'cash';
              final amount = (split['amount'] as num?)?.toInt() ?? 0;

              // サイドゲームチップの場合はそのままチップ枚数を保存
              if (method == 'sideGameChip') {
                paymentMethodsByAmount[method] =
                    (paymentMethodsByAmount[method] ?? 0) + amount;
              } else {
                // その他の支払い方法は円単位
                paymentMethodsByAmount[method] =
                    (paymentMethodsByAmount[method] ?? 0) + amount;
              }
            }
          }
        }
      }
    }

    return paymentMethodsByAmount;
  }

  String _formatCurrency(int amount) {
    final formatted = amount.toString().replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
      (match) => '${match[1]},',
    );
    return '¥$formatted';
  }

  _CategoryAmounts _buildCategoryAmounts(Map<String, dynamic> bill) {
    final Map<String, int> displayValues = {
      'extraCost': 0,
      'sideGameChip': 0,
      'items': 0,
      'tournaments': 0,
    };

    final Map<String, int> monetaryValues = {
      'extraCost': 0,
      'sideGameChip': 0,
      'items': 0,
      'tournaments': 0,
    };

    final List<dynamic> extraCost = bill['extraCost'] as List<dynamic>? ?? [];
    for (final cost in extraCost) {
      if (cost is Map<String, dynamic>) {
        final amount = (cost['price'] as num?)?.toInt() ?? 0;
        displayValues['extraCost'] = (displayValues['extraCost'] ?? 0) + amount;
        monetaryValues['extraCost'] =
            (monetaryValues['extraCost'] ?? 0) + amount;
      }
    }

    final Map<String, dynamic> tournaments =
        bill['tournaments'] as Map<String, dynamic>? ?? {};
    for (final tournament in tournaments.values) {
      if (tournament is Map<String, dynamic>) {
        final amount = (tournament['entryFee'] as num?)?.toInt() ?? 0;
        displayValues['tournaments'] =
            (displayValues['tournaments'] ?? 0) + amount;
        monetaryValues['tournaments'] =
            (monetaryValues['tournaments'] ?? 0) + amount;
      }
    }

    final List<dynamic> items = bill['items'] as List<dynamic>? ?? [];
    for (final item in items) {
      if (item is Map<String, dynamic>) {
        final amount = (item['price'] as num?)?.toInt() ?? 0;
        displayValues['items'] = (displayValues['items'] ?? 0) + amount;
        monetaryValues['items'] = (monetaryValues['items'] ?? 0) + amount;
      }
    }

    final List<dynamic> sideGameChip =
        bill['sideGameChip'] as List<dynamic>? ?? [];
    for (final chip in sideGameChip) {
      if (chip is Map<String, dynamic>) {
        final chipCount = (chip['chipCount'] as num?)?.toInt() ?? 0;
        final chipPrice =
            (chip['price'] as num?)?.toInt() ??
            (chipCount * GlobalConstants.SIDE_GAME_CHIP_EXCHANGE_RATE).toInt();
        displayValues['sideGameChip'] =
            (displayValues['sideGameChip'] ?? 0) + chipCount;
        monetaryValues['sideGameChip'] =
            (monetaryValues['sideGameChip'] ?? 0) + chipPrice;
      }
    }

    displayValues.removeWhere((key, value) => value <= 0);
    monetaryValues.removeWhere((key, value) => value <= 0);

    return _CategoryAmounts(
      displayValues: displayValues,
      monetaryValues: monetaryValues,
    );
  }

  Future<Map<String, int>> _getUserBalances(String? userId) async {
    final Map<String, int> balances = {
      'pointA': 0,
      'pointB': 0,
      'sideGameChip': 0,
    };

    if (userId == null || userId.isEmpty) {
      return balances;
    }

    try {
      final userDoc = await _firestore.collection('users').doc(userId).get();
      if (userDoc.exists) {
        final data = userDoc.data() ?? {};
        balances['pointA'] = (data['pointA'] as num?)?.toInt() ?? 0;
        balances['pointB'] = (data['pointB'] as num?)?.toInt() ?? 0;
        balances['sideGameChip'] =
            (data['sideGameChip'] as num?)?.toInt() ??
            (data['sideGameChip'] as num?)?.toInt() ??
            0;
      }
    } catch (e) {
      debugPrint('残高取得エラー: $e');
    }

    return balances;
  }

  Map<String, dynamic> _buildFullPaymentCategorySelection(
    Map<String, int> categoryDisplayAmounts,
    String baseMethod,
  ) {
    final Map<String, dynamic> result = {};
    categoryDisplayAmounts.forEach((category, amount) {
      if (amount > 0) {
        result[category] = baseMethod;
      }
    });
    return result;
  }

  Future<Map<String, dynamic>?> _showPaymentStartOptionsDialog(
    Map<String, dynamic> bill,
    _CategoryAmounts categoryAmounts,
    Map<String, int> userBalances,
  ) async {
    final pokerName = bill['pokerName']?.toString() ?? '不明';
    String selectedBaseMethod = 'cash';

    final baseMethodOptions = [
      {'key': 'cash', 'label': '現金', 'icon': Icons.attach_money},
      {'key': 'credit_card', 'label': 'クレジットカード', 'icon': Icons.credit_card},
      {'key': 'electronic_money', 'label': '電子マネー', 'icon': Icons.qr_code},
    ];

    final totalAmount = categoryAmounts.total;

    return showDialog<Map<String, dynamic>>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return Dialog(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 540),
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(
                              Icons.payment,
                              color: Colors.blue,
                              size: 28,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              '${pokerName}様',
                              style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          '決済方法を選択してください',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 12,
                          runSpacing: 12,
                          children: baseMethodOptions.map((option) {
                            final isSelected =
                                selectedBaseMethod == option['key'];
                            return ChoiceChip(
                              selected: isSelected,
                              onSelected: (_) {
                                setDialogState(() {
                                  selectedBaseMethod = option['key'] as String;
                                });
                              },
                              label: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(option['icon'] as IconData),
                                  const SizedBox(width: 6),
                                  Text(option['label'] as String),
                                ],
                              ),
                              selectedColor: Colors.blue.shade100,
                              backgroundColor: Colors.grey.shade200,
                              labelStyle: TextStyle(
                                color: isSelected
                                    ? Colors.blue.shade900
                                    : Colors.grey.shade800,
                                fontWeight: isSelected
                                    ? FontWeight.bold
                                    : FontWeight.normal,
                              ),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 10,
                              ),
                            );
                          }).toList(),
                        ),
                        const SizedBox(height: 24),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: () {
                              Navigator.of(dialogContext).pop({
                                'action': 'auto',
                                'baseMethod': selectedBaseMethod,
                              });
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.orange.shade600,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                            ),
                            child: const Text(
                              'ポイント + 選択した決済方法で支払う',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: () {
                              Navigator.of(dialogContext).pop({
                                'action': 'full',
                                'baseMethod': selectedBaseMethod,
                              });
                            },
                            style: ElevatedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 14),
                            ),
                            child: const Text(
                              'すべてを選択した決済方法で支払う',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton(
                            onPressed: () {
                              Navigator.of(
                                dialogContext,
                              ).pop({'action': 'custom'});
                            },
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 14),
                            ),
                            child: const Text(
                              'カスタム支払い',
                              style: TextStyle(fontSize: 16),
                            ),
                          ),
                        ),
                        const SizedBox(height: 24),
                        Divider(color: Colors.grey.shade300),
                        const SizedBox(height: 12),
                        Text(
                          '合計: ${_formatCurrency(totalAmount)}',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          '内訳',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        ...categoryAmounts.displayValues.entries.map((entry) {
                          final category = entry.key;
                          final value = entry.value;
                          String amountText;
                          if (category == 'sideGameChip') {
                            final yenValue =
                                (value *
                                        GlobalConstants
                                            .SIDE_GAME_CHIP_EXCHANGE_RATE)
                                    .toInt();
                            amountText =
                                'チップ$value枚 (${_formatCurrency(yenValue)})';
                          } else {
                            amountText = _formatCurrency(value);
                          }
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  _getCategoryName(category),
                                  style: const TextStyle(fontSize: 14),
                                ),
                                Text(
                                  amountText,
                                  style: const TextStyle(fontSize: 14),
                                ),
                              ],
                            ),
                          );
                        }),
                        const SizedBox(height: 16),
                        const Text(
                          'ポイント残高',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        _buildBalanceRow(
                          'ポイントA',
                          _formatCurrency(userBalances['pointA'] ?? 0),
                        ),
                        _buildBalanceRow(
                          'ポイントB',
                          _formatCurrency(userBalances['pointB'] ?? 0),
                        ),
                        _buildBalanceRow(
                          'サイドゲームチップ',
                          '${userBalances['sideGameChip'] ?? 0}枚 (${_formatCurrency(((userBalances['sideGameChip'] ?? 0) * GlobalConstants.SIDE_GAME_CHIP_EXCHANGE_RATE).toInt())})',
                        ),
                        const SizedBox(height: 24),
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: () => Navigator.of(dialogContext).pop(),
                            child: const Text('キャンセル'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildBalanceRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 14)),
          Text(value, style: const TextStyle(fontSize: 14)),
        ],
      ),
    );
  }

  Future<_AutoSplitResult?> _performAutoSplit({
    required String billId,
    required Map<String, int> categoryAmounts,
    required Map<String, int> userBalances,
    required String baseMethod,
  }) async {
    try {
      final balancesForCalculator = {
        'pointA': userBalances['pointA'] ?? 0,
        'pointB': userBalances['pointB'] ?? 0,
        'sideGameChip': userBalances['sideGameChip'] ?? 0,
      };

      final splitResult = calculatePaymentSplit(
        selectedBaseMethod: baseMethod,
        categoryPaymentMethods: GlobalConstants.categoryPaymentMethods,
        bill: categoryAmounts,
        balances: balancesForCalculator,
        pointPriority: GlobalConstants.POINT_PRIORITY,
      );

      final verifyResponse = await _functions
          .httpsCallable('verifyPaymentSplit')
          .call({
            'billId': billId,
            'clientResult': splitResult.toMap(),
            'selectedBaseMethod': baseMethod,
            'pointPriority': GlobalConstants.POINT_PRIORITY,
          });

      final responseData = Map<String, dynamic>.from(
        verifyResponse.data as Map,
      );
      final serverResult = Map<String, dynamic>.from(
        responseData['result'] as Map,
      );

      final usedPointsRaw = Map<String, dynamic>.from(
        serverResult['usedPoints'] as Map,
      );
      final cashLikeAmount =
          (serverResult['cashLikeAmount'] as num?)?.toInt() ?? 0;

      if (cashLikeAmount <= 0) {
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('ポイントのみでの支払いはできません。')));
        }
        return null;
      }

      final paymentMethodsByAmount = <String, int>{};
      paymentMethodsByAmount[baseMethod] = cashLikeAmount;

      usedPointsRaw.forEach((method, value) {
        final amount = (value as num?)?.toInt() ?? 0;
        if (amount <= 0) return;
        if (method == 'sideGameChip') {
          final chips = (amount / GlobalConstants.SIDE_GAME_CHIP_EXCHANGE_RATE)
              .round();
          if (chips > 0) {
            paymentMethodsByAmount['sideGameChip'] = chips;
          }
        } else {
          paymentMethodsByAmount[method] = amount;
        }
      });

      final verified = responseData['verified'] == true;

      if (!verified && mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('サーバー側で計算結果を調整しました。')));
      }

      return _AutoSplitResult(
        paymentMethodsByAmount: paymentMethodsByAmount,
        serverResult: serverResult,
        verified: verified,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('自動計算に失敗しました: $e')));
      }
      return null;
    }
  }

  Future<void> _executeStartAccounting(
    String billId,
    Map<String, int> paymentMethodsByAmount,
  ) async {
    try {
      final result = await _functions.httpsCallable('startAccounting').call({
        'billId': billId,
        'paymentMethodsByAmount': paymentMethodsByAmount,
      });

      if (!mounted) return;

      if (result.data['success'] == true) {
        final shouldComplete = await showDialog<bool>(
          context: context,
          barrierDismissible: false,
          builder: (context) => AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.check_circle, color: Colors.green),
                SizedBox(width: 8),
                Text('会計開始完了'),
              ],
            ),
            content: const Text(
              '会計を開始しました。\n\nこのまま会計を完了しますか？',
              style: TextStyle(fontSize: 16),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('後で', style: TextStyle(fontSize: 16)),
              ),
              ElevatedButton(
                onPressed: () => Navigator.of(context).pop(true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  foregroundColor: Colors.white,
                ),
                child: const Text(
                  '会計完了',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
        );

        if (shouldComplete == true) {
          await _completeAccounting(billId);
        } else {
          _loadActiveBills();
        }
      } else {
        await showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.error_outline, color: Colors.red),
                SizedBox(width: 8),
                Text('会計開始エラー'),
              ],
            ),
            content: Text(result.data['message'] ?? '会計開始に失敗しました'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('閉じる'),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;

      await showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.error_outline, color: Colors.red),
              SizedBox(width: 8),
              Text('会計開始エラー'),
            ],
          ),
          content: Text(_extractUserFriendlyMessage(e.toString())),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('閉じる'),
            ),
          ],
        ),
      );
    }
  }

  Future<void> _startAccounting(String billId) async {
    final bill = _activeBills.firstWhere(
      (b) => b['id'] == billId,
      orElse: () => {},
    );

    if (bill.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('請求書が見つかりません')));
      return;
    }

    final categoryAmounts = _buildCategoryAmounts(bill);
    final userBalances = await _getUserBalances(bill['userId']?.toString());

    final startOptions = await _showPaymentStartOptionsDialog(
      bill,
      categoryAmounts,
      userBalances,
    );

    if (startOptions == null) return;

    final action = startOptions['action']?.toString();
    if (action == null) return;

    Map<String, dynamic> selectedPaymentMethodsByCategory = {};
    Map<String, int> paymentMethodsByAmount = {};

    if (action == 'custom') {
      final customSelection = await showDialog<Map<String, dynamic>>(
        context: context,
        barrierDismissible: false,
        builder: (context) => CategoryPaymentMethodDialog(bill: bill),
      );

      if (customSelection == null) return;

      selectedPaymentMethodsByCategory = customSelection;
      paymentMethodsByAmount = _calculatePaymentMethodsByAmount(
        bill,
        customSelection,
      );
    } else if (action == 'full') {
      final baseMethod = startOptions['baseMethod']?.toString();
      if (baseMethod == null || baseMethod.isEmpty) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('決済方法を選択してください')));
        return;
      }

      selectedPaymentMethodsByCategory = _buildFullPaymentCategorySelection(
        categoryAmounts.displayValues,
        baseMethod,
      );
      paymentMethodsByAmount = _calculatePaymentMethodsByAmount(
        bill,
        selectedPaymentMethodsByCategory,
      );
    } else if (action == 'auto') {
      final baseMethod = startOptions['baseMethod']?.toString();
      if (baseMethod == null || baseMethod.isEmpty) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('決済方法を選択してください')));
        return;
      }

      final autoResult = await _performAutoSplit(
        billId: billId,
        categoryAmounts: categoryAmounts.monetaryValues,
        userBalances: userBalances,
        baseMethod: baseMethod,
      );

      if (autoResult == null) return;

      paymentMethodsByAmount = autoResult.paymentMethodsByAmount;
      selectedPaymentMethodsByCategory = {};
    } else {
      return;
    }

    if (paymentMethodsByAmount.isEmpty) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('支払い金額の計算に失敗しました')));
      return;
    }

    final shouldStart = await _showPaymentConfirmationDialog(
      bill,
      selectedPaymentMethodsByCategory,
      paymentMethodsByAmount,
    );

    if (!shouldStart) return;

    await _executeStartAccounting(billId, paymentMethodsByAmount);
  }

  Future<void> _completeAccounting(String billId) async {
    try {
      final result = await _functions.httpsCallable('completeAccounting').call({
        'billId': billId,
      });

      // デバッグログを追加
      print('会計完了結果: ${result.data}');
      print('success値: ${result.data['success']}');
      print('successの型: ${result.data['success'].runtimeType}');

      if (result.data['success'] == true) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('会計を完了しました')));
        _loadActiveBills(); // データを再読み込み
        _loadSettledBills(); // 会計完了データも再読み込み
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('会計完了に失敗しました: ${result.data['message']}')),
        );
      }
    } catch (e) {
      print('会計完了エラー: $e');
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('会計完了に失敗しました: $e')));
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
      case 'sideGameChip':
        return 'サイドゲームチップ';
      default:
        return '現金';
    }
  }

  // エラーメッセージからユーザーフレンドリーな部分のみを抽出
  String _extractUserFriendlyMessage(String errorMessage) {
    // Firebase Functions のエラーメッセージから実際のメッセージ部分を抽出
    final regex = RegExp(r'の残高が不足しています。現在の残高: \d+円、必要な金額: \d+円');
    final match = regex.firstMatch(errorMessage);

    if (match != null) {
      // マッチした部分の前後を含めて、より自然なメッセージを構築
      final beforeMatch = errorMessage.substring(0, match.start);
      final matchedPart = match.group(0)!;

      // 技術的な部分を除去して、ポイント名と残高不足メッセージのみを抽出
      if (beforeMatch.contains('ポイントA')) {
        return 'ポイントA$matchedPart';
      } else if (beforeMatch.contains('ポイントB')) {
        return 'ポイントB$matchedPart';
      } else if (beforeMatch.contains('サイドゲームチップ')) {
        return 'サイドゲームチップ$matchedPart';
      }
    }

    // マッチしない場合は元のメッセージを返す（フォールバック）
    return errorMessage;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('会計管理'),
        backgroundColor: Colors.blue[600],
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.history),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const AccountingHistoryPage(),
                ),
              );
            },
            tooltip: '会計履歴',
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              _loadActiveBills();
              _loadSettledBills();
            },
            tooltip: '更新',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : DefaultTabController(
              length: 2,
              child: Column(
                children: [
                  const TabBar(
                    tabs: [
                      Tab(text: '未会計'),
                      Tab(text: '会計完了'),
                    ],
                  ),
                  Expanded(
                    child: TabBarView(
                      children: [
                        _buildActiveBillsTab(),
                        _buildSettledBillsTab(),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildActiveBillsTab() {
    if (_activeBills.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.receipt_long, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text(
              '未会計の請求書はありません',
              style: TextStyle(fontSize: 18, color: Colors.grey),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _activeBills.length,
      itemBuilder: (context, index) {
        final bill = _activeBills[index];
        return _buildBillCard(bill);
      },
    );
  }

  Widget _buildSettledBillsTab() {
    if (_settledBills.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.check_circle_outline, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text(
              '会計完了済みの請求書はありません',
              style: TextStyle(fontSize: 18, color: Colors.grey),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _settledBills.length,
      itemBuilder: (context, index) {
        final bill = _settledBills[index];
        return _buildSettledBillCard(bill);
      },
    );
  }

  Widget _buildBillCard(Map<String, dynamic> bill) {
    final totalPrice = bill['totalPrice'] ?? 0;
    final status = bill['status'] ?? 'open';
    final accountingStarted = bill['accountingStartedAt'] != null;
    final pokerName = bill['pokerName'] ?? '不明';
    final createdAt = bill['createdAt']?.toDate() ?? DateTime.now();

    return Card(
      elevation: 4,
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ヘッダー
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  pokerName,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: accountingStarted ? Colors.orange : Colors.blue,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    accountingStarted ? '会計中' : '未会計',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '作成日時: ${_formatDateTime(createdAt)}',
              style: TextStyle(color: Colors.grey[600], fontSize: 14),
            ),
            const SizedBox(height: 16),

            // 会計額表示
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.blue[50],
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.blue[200]!),
              ),
              child: Column(
                children: [
                  Text(
                    '¥${totalPrice.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                    style: const TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                      color: Colors.blue,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    '会計額',
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.blue,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // 内訳表示（会計未開始時のみ）
            if (!accountingStarted) _buildBillBreakdown(bill),

            const SizedBox(height: 16),

            // 会計中の表示（支払い方法と内訳、操作）
            if (accountingStarted) ...[
              // 支払い方法
              _buildPaymentMethodsByAmount(bill),
              const SizedBox(height: 12),
              // 内訳
              _buildBillBreakdown(bill),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        final ok = await _revertAccountingStart(bill['id']);
                        if (ok) {
                          // 戻したら再編集フローへ
                          await _startAccounting(bill['id']);
                        }
                      },
                      icon: const Icon(Icons.edit),
                      label: const Text('支払い方法変更'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.blue,
                        side: const BorderSide(color: Colors.blue),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _revertAccountingStart(bill['id']),
                      icon: const Icon(Icons.undo),
                      label: const Text('会計開始前に戻る'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.red,
                        side: const BorderSide(color: Colors.red),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                ],
              ),
            ] else
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _showEditDialog(bill),
                      icon: const Icon(Icons.edit),
                      label: const Text('修正'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.blue,
                        side: const BorderSide(color: Colors.blue),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: () => _startAccounting(bill['id']),
                      icon: const Icon(Icons.play_arrow),
                      label: const Text('会計開始'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  // 会計開始前に戻す（Cloud Function 呼び出し）
  Future<bool> _revertAccountingStart(String billId) async {
    try {
      final result = await _functions
          .httpsCallable('revertAccountingStart')
          .call({'billId': billId});
      if (mounted) {
        _loadActiveBills();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result.data['message'] ?? '会計開始を取り消しました')),
        );
      }
      return true;
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('取り消しに失敗しました: $e')));
      }
      return false;
    }
  }

  Widget _buildSettledBillCard(Map<String, dynamic> bill) {
    final billId = bill['id'] ?? 'unknown';
    final totalPrice = bill['totalPrice'] ?? 0;
    final pokerName = bill['pokerName'] ?? '不明';
    final accountingCompletedAt =
        bill['accountingCompletedAt']?.toDate() ?? DateTime.now();
    final refundAmount = bill['refundAmount'] ?? 0;
    final paymentMethod = bill['paymentMethod'] ?? 'cash';

    print('=== _buildSettledBillCard ===');
    print('billId: $billId, pokerName: $pokerName');

    return Card(
      elevation: 4,
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ヘッダー
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  pokerName,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.green,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    '会計完了',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 8),

            // 会計完了日時
            Text(
              '会計完了: ${accountingCompletedAt.year}年${accountingCompletedAt.month}月${accountingCompletedAt.day}日 ${accountingCompletedAt.hour.toString().padLeft(2, '0')}:${accountingCompletedAt.minute.toString().padLeft(2, '0')}',
              style: TextStyle(fontSize: 14, color: Colors.grey.shade600),
            ),

            const SizedBox(height: 16),

            // 合計金額
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.green.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.green.shade200),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    '会計額',
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.green,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    '${totalPrice}円',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.green.shade700,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // 支払い方法ごとの合計金額を表示
            _buildPaymentMethodsByAmount(bill),

            const SizedBox(height: 16),

            // アクションボタン
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _showEditDialog(bill),
                    icon: const Icon(Icons.edit),
                    label: const Text('修正'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.blue,
                      side: const BorderSide(color: Colors.blue),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _showCancelDialog(bill),
                    icon: const Icon(Icons.cancel),
                    label: const Text('キャンセル'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                      side: const BorderSide(color: Colors.red),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBillBreakdown(Map<String, dynamic> bill) {
    final breakdown = <Widget>[];

    // 入店料（extraCost配列から取得）
    final extraCosts = bill['extraCost'] as List<dynamic>? ?? [];
    int totalExtraCost = 0;
    for (final extraCost in extraCosts) {
      totalExtraCost += (extraCost['price'] as num? ?? 0).toInt();
    }
    if (totalExtraCost > 0) {
      breakdown.add(
        _buildBreakdownItem('入店料', totalExtraCost, bill, 'extraCost'),
      );
    }

    // トーナメント参加費
    final tournamentsData = bill['tournaments'];
    int totalTournamentFee = 0;

    // tournamentsはMapまたはListの可能性があるため、型チェックを行う
    if (tournamentsData is Map<String, dynamic>) {
      for (final tournamentEntry in tournamentsData.values) {
        if (tournamentEntry is Map<String, dynamic>) {
          totalTournamentFee += (tournamentEntry['entryFee'] as num? ?? 0)
              .toInt();
        }
      }
    } else if (tournamentsData is List) {
      // Listの場合は空配列なので何もしない
    }

    if (totalTournamentFee > 0) {
      breakdown.add(
        _buildBreakdownItem(
          'トーナメント参加費',
          totalTournamentFee,
          bill,
          'tournaments',
        ),
      );
    }

    // フード・ドリンク（items配列から取得）
    final items = bill['items'] as List<dynamic>? ?? [];
    int totalOrderAmount = 0;
    for (final item in items) {
      final price = (item['price'] as num? ?? 0).toInt();
      final quantity = (item['quantity'] as num? ?? 0).toInt();
      totalOrderAmount += price * quantity;
    }
    if (totalOrderAmount > 0) {
      breakdown.add(
        _buildBreakdownItem('フード・ドリンク', totalOrderAmount, bill, 'items'),
      );
    }

    // サイドゲームチップ（sideGameChip配列から取得、action='purchase'のみ）
    final sideGameChips = bill['sideGameChip'] as List<dynamic>? ?? [];
    int totalSideGameChipAmount = 0;
    for (final chip in sideGameChips) {
      // action='purchase'のデータのみを集計
      if (chip['action'] == 'purchase') {
        totalSideGameChipAmount += (chip['price'] as num? ?? 0).toInt();
      }
    }
    if (totalSideGameChipAmount > 0) {
      breakdown.add(
        _buildBreakdownItem(
          'サイドゲームチップ',
          totalSideGameChipAmount,
          bill,
          'sideGameChip',
        ),
      );
    }

    if (breakdown.isEmpty) {
      breakdown.add(const Text('内訳なし', style: TextStyle(color: Colors.grey)));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '内訳',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        ...breakdown,
      ],
    );
  }

  Widget _buildBreakdownItem(
    String label,
    int amount,
    Map<String, dynamic> bill,
    String categoryKey,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: InkWell(
        onTap: () => _showCategoryDetail(label, bill),
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Text(label),
                  const SizedBox(width: 4),
                  Icon(
                    Icons.info_outline,
                    size: 16,
                    color: Colors.grey.shade600,
                  ),
                ],
              ),
              Row(
                children: [
                  Text(
                    '¥${amount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  // 支払い方法バッジを作成
  Widget _buildPaymentBadge(String method, int? amount) {
    // サイドゲームチップの場合は換算して表示
    String displayText;
    if (method == 'sideGameChip' && amount != null) {
      final chipValue = (amount * GlobalConstants.SIDE_GAME_CHIP_EXCHANGE_RATE)
          .toInt();
      displayText =
          '${_getPaymentMethodName(method)} チップ${amount}枚 (¥${chipValue.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')})';
    } else if (amount != null) {
      displayText =
          '${_getPaymentMethodName(method)} ¥${amount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}';
    } else {
      displayText = _getPaymentMethodName(method);
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.blue.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.blue.shade200),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            _getPaymentMethodIcon(method),
            size: 14,
            color: Colors.blue.shade700,
          ),
          const SizedBox(width: 4),
          Text(
            displayText,
            style: TextStyle(
              fontSize: 11,
              color: Colors.blue.shade700,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  void _showCategoryDetail(String categoryName, Map<String, dynamic> bill) {
    List<dynamic> items = [];

    switch (categoryName) {
      case '入店料':
        items = bill['extraCost'] as List<dynamic>? ?? [];
        break;
      case 'トーナメント参加費':
        final tournamentsData = bill['tournaments'];
        if (tournamentsData is Map<String, dynamic>) {
          items = tournamentsData.values.toList();
        }
        break;
      case 'フード・ドリンク':
        items = bill['items'] as List<dynamic>? ?? [];
        break;
      case 'サイドゲームチップ':
        final allSideGameChips = bill['sideGameChip'] as List<dynamic>? ?? [];
        // action='purchase'のデータのみを表示
        items = allSideGameChips
            .where((chip) => chip['action'] == 'purchase')
            .toList();
        break;
    }

    if (items.isNotEmpty) {
      showDialog(
        context: context,
        builder: (context) => CategoryDetailDialog(
          categoryName: categoryName,
          items: items,
          totalAmount: _calculateCategoryTotal(categoryName, bill),
        ),
      );
    }
  }

  int _calculateCategoryTotal(String categoryName, Map<String, dynamic> bill) {
    switch (categoryName) {
      case '入店料':
        final extraCosts = bill['extraCost'] as List<dynamic>? ?? [];
        return extraCosts.fold(
          0,
          (sum, item) => sum + ((item['price'] as num? ?? 0).toInt()),
        );
      case 'トーナメント参加費':
        final tournamentsData = bill['tournaments'];
        if (tournamentsData is Map<String, dynamic>) {
          return tournamentsData.values.fold(
            0,
            (sum, item) => sum + ((item['entryFee'] as num? ?? 0).toInt()),
          );
        }
        return 0;
      case 'フード・ドリンク':
        final items = bill['items'] as List<dynamic>? ?? [];
        return items.fold(
          0,
          (sum, item) =>
              sum +
              ((item['price'] as num? ?? 0).toInt() *
                  (item['quantity'] as num? ?? 0).toInt()),
        );
      case 'サイドゲームチップ':
        final sideGameChips = bill['sideGameChip'] as List<dynamic>? ?? [];
        // action='purchase'のデータのみを集計
        return sideGameChips
            .where((chip) => chip['action'] == 'purchase')
            .fold(
              0,
              (sum, item) => sum + ((item['price'] as num? ?? 0).toInt()),
            );
      default:
        return 0;
    }
  }

  // 支払い方法ごとの合計金額を表示（会計完了タブ用）
  Widget _buildPaymentMethodsByAmount(Map<String, dynamic> bill) {
    final paymentMethodsByAmount =
        bill['paymentMethodsByAmount'] as Map<String, dynamic>? ?? {};

    if (paymentMethodsByAmount.isEmpty) {
      return const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '支払い方法',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
          SizedBox(height: 8),
          Text('データなし', style: TextStyle(color: Colors.grey)),
        ],
      );
    }

    final List<Widget> paymentMethodItems = [];

    for (final entry in paymentMethodsByAmount.entries) {
      final method = entry.key;
      final amount = (entry.value as num).toInt();

      // サイドゲームチップの場合はチップ枚数と換算額を表示
      String displayText;
      if (method == 'sideGameChip') {
        final chipCount = amount; // 保存されている値は既にチップ枚数
        final yenAmount =
            (chipCount * GlobalConstants.SIDE_GAME_CHIP_EXCHANGE_RATE).toInt();
        displayText =
            'チップ${chipCount.toString()} (¥${yenAmount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')})';
      } else {
        displayText =
            '¥${amount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}';
      }

      paymentMethodItems.add(
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(
                    _getPaymentMethodIcon(method),
                    size: 20,
                    color: Colors.grey.shade700,
                  ),
                  const SizedBox(width: 8),
                  Text(_getPaymentMethodName(method)),
                ],
              ),
              Text(
                displayText,
                style: const TextStyle(fontWeight: FontWeight.w500),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '支払い方法',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        ...paymentMethodItems,
      ],
    );
  }

  String _formatDateTime(DateTime dateTime) {
    return '${dateTime.month}/${dateTime.day} ${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
  }

  void _showEditDialog(Map<String, dynamic> bill) {
    showDialog(
      context: context,
      builder: (context) => AccountingEditDialog(
        bill: bill,
        onUpdated: () {
          _loadActiveBills();
          _loadSettledBills();
        },
      ),
    );
  }

  void _showCancelDialog(Map<String, dynamic> bill) {
    showDialog(
      context: context,
      builder: (context) => AccountingCancelDialog(
        bill: bill,
        onUpdated: () {
          _loadActiveBills();
          _loadSettledBills();
        },
      ),
    );
  }

  void _showRefundDialog(Map<String, dynamic> bill) {
    showDialog(
      context: context,
      builder: (context) => RefundProcessingDialog(
        bill: bill,
        onUpdated: () {
          _loadActiveBills();
          _loadSettledBills();
        },
      ),
    );
  }
}
