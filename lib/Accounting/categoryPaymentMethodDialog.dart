import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/Accounting/payment_rounding.dart';
import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/user/balance_display.dart';
import 'package:amuse_app_template/user/point_ids.dart';
import 'package:amuse_app_template/user/user_balances.dart';
import 'package:amuse_app_template/user/validate_point_config.dart';

class CategoryPaymentMethodDialog extends StatefulWidget {
  final Map<String, dynamic> bill;

  const CategoryPaymentMethodDialog({Key? key, required this.bill})
    : super(key: key);

  @override
  State<CategoryPaymentMethodDialog> createState() =>
      _CategoryPaymentMethodDialogState();
}

class _CategoryPaymentMethodDialogState
    extends State<CategoryPaymentMethodDialog> {
  // カテゴリごとに選択された支払い方法を保持
  final Map<String, String?> _selectedPaymentMethods = {};

  // ユーザーの残高（pointA〜E, sideGameChip）を保持
  Map<String, int> _balances = {for (final id in kAllBalanceIds) id: 0};
  bool _isLoadingBalance = true;
  bool _isLoadingCategories = true;
  Map<String, int> _categoriesWithAmounts = {};

  // A-7: config 検証結果。categoryOrder は本ダイアログでは不要だが、
  // balancePaymentSettings / categoryPaymentMethods（enabled 済み）はここで使う。
  PointConfigValidationResult? _configResult;

  @override
  void initState() {
    super.initState();
    _configResult = StoreConfigService.instance.latestData
        ?.validatePointConfigA7();
    // カテゴリごとの金額を取得（非同期）
    _loadCategoriesWithAmounts();
    // ユーザーの残高を取得
    _loadUserBalance();
  }

  ValidatedPointConfig? get _validatedConfig =>
      (_configResult != null && _configResult!.ok) ? _configResult!.value : null;

  Map<String, BalancePaymentSetting> get _balancePaymentSettings =>
      _validatedConfig?.balancePaymentSettings ?? const {};

  Map<String, List<String>> get _categoryPaymentMethods =>
      _validatedConfig?.categoryPaymentMethods ??
      (StoreConfigService.instance.latestData?.categoryPaymentMethods ??
          kDefaultCategoryPaymentMethods);

  // カテゴリごとの金額を取得（billsスキーマ対応）
  Future<void> _loadCategoriesWithAmounts() async {
    final billId = widget.bill['id'] as String?;
    if (billId == null || billId.isEmpty) {
      setState(() {
        _isLoadingCategories = false;
      });
      return;
    }

    try {
      final billRef = FirebaseFirestore.instance.collection('bills').doc(billId);
      final Map<String, int> categoriesWithAmounts = {};

      // extras サブコレクション
      final extrasSnapshot = await billRef.collection('extras').get();
      int extraCostAmount = extrasSnapshot.docs.fold(0, (sum, doc) {
        return sum + ((doc.data()['amountIncl'] as num?)?.toInt() ?? 0);
      });
      if (extraCostAmount > 0) {
        categoriesWithAmounts['extraCost'] = extraCostAmount;
      }

      // items サブコレクション
      final itemsSnapshot = await billRef.collection('items').get();
      int itemsAmount = itemsSnapshot.docs
          .where((doc) {
            final data = doc.data();
            // voided: true のアイテムは算出対象外
            return (data['voided'] as bool?) != true;
          })
          .fold(0, (sum, doc) {
        return sum + ((doc.data()['totalPriceIncl'] as num?)?.toInt() ?? 0);
      });
      if (itemsAmount > 0) {
        categoriesWithAmounts['items'] = itemsAmount;
      }

      // sideGameChips サブコレクション（action='purchase'のみ）
      final sideGameChipsSnapshot = await billRef.collection('sideGameChips').get();
      int sideGameChipAmount = sideGameChipsSnapshot.docs
          .where((doc) => doc.data()['action'] == 'purchase')
          .fold(0, (sum, doc) {
            return sum + ((doc.data()['amountIncl'] as num?)?.toInt() ?? 0);
          });
      if (sideGameChipAmount > 0) {
        categoriesWithAmounts['sideGameChip'] = sideGameChipAmount;
      }

      // tournaments サブコレクション
      final tournamentsSnapshot = await billRef.collection('tournaments').get();
      int tournamentsAmount = tournamentsSnapshot.docs.fold(0, (sum, doc) {
        final data = doc.data();
        final entryCount = (data['entryCount'] as num?)?.toInt() ?? 0;
        final entryFeeIncl = (data['entryFeeIncl'] as num?)?.toInt() ?? 0;
        final reentryCount = (data['reentryCount'] as num?)?.toInt() ?? 0;
        final reentryFeeIncl = (data['reentryFeeIncl'] as num?)?.toInt() ?? 0;
        final addonCount = (data['addonCount'] as num?)?.toInt() ?? 0;
        final addonFeeIncl = (data['addonFeeIncl'] as num?)?.toInt() ?? 0;
        return sum +
            (entryCount * entryFeeIncl) +
            (reentryCount * reentryFeeIncl) +
            (addonCount * addonFeeIncl);
      });
      if (tournamentsAmount > 0) {
        categoriesWithAmounts['tournaments'] = tournamentsAmount;
      }

      setState(() {
        _categoriesWithAmounts = categoriesWithAmounts;
        // 各カテゴリのデフォルト支払い方法を「現金」に設定
        categoriesWithAmounts.forEach((category, _) {
          _selectedPaymentMethods[category] = 'cash';
        });
        _isLoadingCategories = false;
      });
    } catch (e) {
      debugPrint('カテゴリ金額取得エラー: $e');
      setState(() {
        _isLoadingCategories = false;
      });
    }
  }

  // ユーザーの残高を取得（pointA〜E, sideGameChip 全て）
  Future<void> _loadUserBalance() async {
    // billsスキーマでは party.userId から取得
    final party = widget.bill['party'] as Map<String, dynamic>?;
    final userId = party?['userId'] as String? ?? widget.bill['userId'] as String?;
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

      final data = userDoc.exists ? userDoc.data() : null;
      final balances = readAllStandardBalancesForMigration(data);
      setState(() {
        _balances = balances;
        _isLoadingBalance = false;
      });
    } catch (e) {
      debugPrint('残高取得エラー: $e');
      setState(() {
        _isLoadingBalance = false;
      });
    }
  }

  // カテゴリごとの金額を取得（既に読み込んだデータを使用）
  Map<String, int> _getCategoriesWithAmounts() {
    return _categoriesWithAmounts;
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

  // 支払い方法の表示名を取得（A-7: config displayName）
  String _getPaymentMethodName(String paymentMethod) {
    return balanceDisplayName(paymentMethod);
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
      case 'pointC':
      case 'pointD':
      case 'pointE':
        return Icons.star_border;
      case 'sideGameChip':
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
      final availableMethods = _categoryPaymentMethods[category] ?? [];
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
    if (_isLoadingCategories) {
      return const AlertDialog(
        content: Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('データを読み込み中...'),
              ],
            ),
          ),
        ),
      );
    }

    final categoriesWithAmounts = _getCategoriesWithAmounts();
    if (categoriesWithAmounts.isEmpty) {
      return AlertDialog(
        title: const Text('エラー'),
        content: const Text('カテゴリデータが見つかりませんでした。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('閉じる'),
          ),
        ],
      );
    }

    // A-7: categoryOrder 等を含む config が不整合な場合、ポイント系の計算・選択を
    // 進めるとサーバ側 startAccounting で必ず拒否されるため、ここで明示的に止める。
    if (_configResult != null && !_configResult!.ok) {
      return AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.error_outline, color: Colors.red),
            SizedBox(width: 8),
            Text('会計設定エラー'),
          ],
        ),
        content: Text(
          'ポイント関連の会計設定に不備があります。店舗設定を確認してください。\n\n'
          '詳細: ${_configResult!.message}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('閉じる'),
          ),
        ],
      );
    }

    final totalAmount = categoriesWithAmounts.values.fold(
      0,
      (sum, amount) => sum + amount,
    );
    // 将来、一括支払いボタンを有効化する場合に使用
    // final commonPaymentMethods = _getCommonPaymentMethods();

    return AlertDialog(
      title: const Text(
        'カテゴリ別支払い方法選択',
        style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
      ),
      content: SizedBox(
        width: double.maxFinite,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 各カテゴリの支払い方法選択
              ...categoriesWithAmounts.entries.map((entry) {
                final category = entry.key;
                final amount = entry.value;
                final availablePaymentMethods =
                    _categoryPaymentMethods[category] ?? [];

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
                          final isSelected =
                              _selectedPaymentMethods[category] ==
                              paymentMethod;
                          return InkWell(
                            onTap: () {
                              setState(() {
                                _selectedPaymentMethods[category] =
                                    paymentMethod;
                              });
                            },
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? Colors.blue.shade50
                                    : Colors.grey.shade50,
                                border: Border.all(
                                  color: isSelected
                                      ? Colors.blue
                                      : Colors.grey.shade300,
                                  width: isSelected ? 2 : 1,
                                ),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    _getPaymentMethodIcon(paymentMethod),
                                    size: 20,
                                    color: isSelected
                                        ? Colors.blue
                                        : Colors.grey.shade600,
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          _getPaymentMethodName(paymentMethod),
                                          style: TextStyle(
                                            fontSize: 14,
                                            fontWeight: isSelected
                                                ? FontWeight.bold
                                                : FontWeight.normal,
                                            color: isSelected
                                                ? Colors.blue
                                                : Colors.black87,
                                          ),
                                        ),
                                        if (_shouldShowBalance(paymentMethod))
                                          Text(
                                            _getBalanceText(paymentMethod),
                                            style: TextStyle(
                                              fontSize: 12,
                                              color: _getBalanceColor(
                                                paymentMethod,
                                                category,
                                              ),
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
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
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

  // 支払い方法を処理（A-7: usageUnit + 整数比換算での残高チェック + 自動分割）
  Future<Map<String, dynamic>?> _processPaymentMethods() async {
    final categoriesWithAmounts = _getCategoriesWithAmounts();
    final result = <String, dynamic>{};

    for (final entry in categoriesWithAmounts.entries) {
      final category = entry.key;
      final categoryAmount = entry.value;
      final selectedMethod = _selectedPaymentMethods[category];

      if (selectedMethod == null) continue;

      if (isBalanceId(selectedMethod)) {
        final setting = _balancePaymentSettings[selectedMethod];
        final balance = _balances[selectedMethod] ?? 0;

        final usableReferenceAmount = computeMaxUsableReferenceAmount(
          categoryAmountReference: categoryAmount,
          availableBalance: balance,
          setting: setting,
        );

        if (usableReferenceAmount >= categoryAmount) {
          result[category] = selectedMethod;
        } else if (usableReferenceAmount > 0) {
          final shortfallMethod = await _showShortfallPaymentDialog(
            category,
            selectedMethod,
            categoryAmount,
            usableReferenceAmount,
          );

          if (shortfallMethod == null) {
            return null;
          }

          final remainingAmount = categoryAmount - usableReferenceAmount;
          result[category] = [
            {'method': selectedMethod, 'amount': usableReferenceAmount},
            {'method': shortfallMethod, 'amount': remainingAmount},
          ];
        } else {
          final shortfallMethod = await _showShortfallPaymentDialog(
            category,
            selectedMethod,
            categoryAmount,
            0,
          );

          if (shortfallMethod == null) {
            return null;
          }

          result[category] = [
            {'method': shortfallMethod, 'amount': categoryAmount},
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
    int totalAmount,
    int usableReferenceAmount,
  ) async {
    final shortfall = totalAmount - usableReferenceAmount;
    final isRoundingRemainder = usableReferenceAmount > 0;
    final availableMethods = _categoryPaymentMethods[category] ?? [];

    // 不足分に使える支払い方法（元の方法とポイント/残高系を除外）
    final shortfallOptions = availableMethods
        .where((method) => method != originalMethod && !isBalanceId(method))
        .toList();

    final setting = _balancePaymentSettings[originalMethod];

    return showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Icon(Icons.warning_amber, color: Colors.orange),
            const SizedBox(width: 8),
            Text(isRoundingRemainder ? '利用単位による端数' : '残高不足'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _getCategoryDisplayName(category),
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            Text(
              isRoundingRemainder
                  ? '${usageUnitHint(_getPaymentMethodName(originalMethod), setting)}。${_getPaymentMethodName(originalMethod)}だけでは全額払えないため、残りは別の支払い方法が必要です。'
                  : '${_getPaymentMethodName(originalMethod)}の残高が不足しています。',
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
                  Text(
                    '必要金額: ¥${totalAmount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                  ),
                  Text(
                    '${_getPaymentMethodName(originalMethod)}で使用: ¥${usableReferenceAmount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                    style: TextStyle(
                      color: Colors.green.shade700,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const Divider(),
                  Text(
                    '不足分: ¥${shortfall.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                    style: TextStyle(
                      color: Colors.red.shade700,
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
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
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      vertical: 12,
                      horizontal: 16,
                    ),
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

  // 残高を表示すべき支払い方法かどうか（pointA〜E, sideGameChip）
  bool _shouldShowBalance(String paymentMethod) => isBalanceId(paymentMethod);

  static String _formatNumber(int value) => value
      .toString()
      .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},');

  // 残高のテキストを取得
  // 換算比が 1:1（referenceUnits == balanceUnits）なら残高量そのものを金額として表示し、
  // それ以外（例: sideGameChip の枚数換算）は「単位数 (¥基準値換算)」の形で表示する。
  String _getBalanceText(String paymentMethod) {
    if (_isLoadingBalance) {
      return '残高: 読込中...';
    }

    final balance = _balances[paymentMethod] ?? 0;
    final setting = _balancePaymentSettings[paymentMethod];
    final referenceEquivalent = approxBalanceAsReferenceAmount(balance, setting);

    final isOneToOne = setting == null ||
        setting.conversion.referenceUnits == setting.conversion.balanceUnits;
    if (isOneToOne) {
      return '残高: ¥${_formatNumber(referenceEquivalent)}';
    }

    final unitLabel = paymentMethod == kSideGameChipId ? '枚' : '単位';
    return '残高: ${_formatNumber(balance)}$unitLabel (¥${_formatNumber(referenceEquivalent)})';
  }

  // 残高の色を取得（残高不足の場合は赤色）
  Color _getBalanceColor(String paymentMethod, String category) {
    if (_isLoadingBalance) {
      return Colors.grey;
    }

    if (!isBalanceId(paymentMethod)) {
      return Colors.grey.shade600;
    }

    final categoriesWithAmounts = _getCategoriesWithAmounts();
    final requiredAmount = categoriesWithAmounts[category] ?? 0;
    final balance = _balances[paymentMethod] ?? 0;
    final availableReferenceValue = approxBalanceAsReferenceAmount(
      balance,
      _balancePaymentSettings[paymentMethod],
    );

    // 残高が足りない場合は赤色、足りる場合は緑色
    return availableReferenceValue >= requiredAmount
        ? Colors.green.shade700
        : Colors.red.shade700;
  }
}
