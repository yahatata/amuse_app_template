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
import 'package:amuse_app_template/utils/sectioned_user_list_page.dart';

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
    final closeHour = GlobalConstants.normalizeStoreCloseHour(GlobalConstants.STORE_CLOSE_HOUR);

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
      // 営業日の未会計・会計中の請求書を取得（open と settling の両方）
      final businessDate = _getBusinessDate();
      final querySnapshot = await _firestore
          .collection('bills')
          .where('businessDate', isEqualTo: businessDate)
          .where('status', whereIn: ['open', 'settling'])
          .get();

      setState(() {
        _activeBills = querySnapshot.docs.map((doc) {
          final data = doc.data();
          // レスポンス形式のマッピング
          final ops = data['ops'] as Map<String, dynamic>?;
          final paymentsSummary = data['paymentsSummary'] as Map<String, dynamic>?;
          
          final mappedData = <String, dynamic>{
            'id': doc.id,
            'userId': (data['party'] as Map<String, dynamic>?)?['userId'],
            'pokerName': (data['party'] as Map<String, dynamic>?)?['pokerName'],
            'currentTable': (data['place'] as Map<String, dynamic>?)?['table'],
            'currentSeat': (data['place'] as Map<String, dynamic>?)?['seat'],
            'status': data['status'],
            'createdAt': data['createdAt'],
            'updatedAt': data['updatedAt'],
            // accountingStartedAt: ops.accountingStartedAt (Functions側のstartAccounting.tsで設定)
            'accountingStartedAt': ops?['accountingStartedAt'],
            // paymentMethodsByAmount: paymentsSummary.byMethod (Functions側のtypes.tsで定義されている)
            // byMethod は Record<string, number> で、支払い方法ごとの金額を保持
            'paymentMethodsByAmount': paymentsSummary?['byMethod'],
            // totalPrice は一覧表示では簡易的な参考値（または非表示）
            // 厳密な計算は「現在の合計金額を計算」ボタン押下時のみ
            'totalPrice': null, // 一覧表示では非表示または簡易値
          };
          return mappedData;
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
      // 当日の営業日の会計完了済みの請求書を取得
      final businessDate = _getBusinessDate();
      debugPrint('[_loadSettledBills] 検索営業日: $businessDate');
      
      final querySnapshot = await _firestore
          .collection('bills')
          .where('businessDate', isEqualTo: businessDate)
          .where('status', isEqualTo: 'settled')
          .orderBy('ops.accountingCompletedAt', descending: true)
          .get();

      debugPrint('[_loadSettledBills] 取得件数: ${querySnapshot.docs.length}');
      
      // 取得したドキュメントの詳細をログ出力
      for (var doc in querySnapshot.docs) {
        final data = doc.data();
        debugPrint('[_loadSettledBills] ドキュメントID: ${doc.id}');
        debugPrint('[_loadSettledBills] businessDate: ${data['businessDate']}');
        debugPrint('[_loadSettledBills] status: ${data['status']}');
        debugPrint('[_loadSettledBills] pokerName: ${(data['party'] as Map<String, dynamic>?)?['pokerName']}');
        debugPrint('[_loadSettledBills] amounts.grandTotalRounded: ${(data['amounts'] as Map<String, dynamic>?)?['grandTotalRounded']}');
        debugPrint('[_loadSettledBills] ops.accountingCompletedAt: ${(data['ops'] as Map<String, dynamic>?)?['accountingCompletedAt']}');
      }

      setState(() {
        _settledBills = querySnapshot.docs.map((doc) {
          final data = doc.data();
          // レスポンス形式のマッピング
          final paymentsSummary = data['paymentsSummary'] as Map<String, dynamic>?;
          final mappedData = <String, dynamic>{
            'id': doc.id,
            'userId': (data['party'] as Map<String, dynamic>?)?['userId'],
            'pokerName': (data['party'] as Map<String, dynamic>?)?['pokerName'],
            'currentTable': (data['place'] as Map<String, dynamic>?)?['table'],
            'currentSeat': (data['place'] as Map<String, dynamic>?)?['seat'],
            'status': data['status'],
            'createdAt': data['createdAt'],
            'updatedAt': data['updatedAt'],
            // 確定済み伝票の場合は amounts.grandTotalRounded を使用
            'totalPrice': (data['amounts'] as Map<String, dynamic>?)?['grandTotalRounded'],
            'accountingCompletedAt': (data['ops'] as Map<String, dynamic>?)?['accountingCompletedAt'],
            // paymentsSummary.byMethod を paymentMethodsByAmount としてマッピング
            'paymentMethodsByAmount': paymentsSummary?['byMethod'],
          };
          return mappedData;
        }).toList();
      });
      
      debugPrint('[_loadSettledBills] マッピング後の件数: ${_settledBills.length}');
    } catch (e, stackTrace) {
      debugPrint('[_loadSettledBills] エラー: $e');
      debugPrint('[_loadSettledBills] スタックトレース: $stackTrace');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('会計完了データの取得に失敗しました: $e')));
      }
    }
  }

  // カテゴリ別金額計算ダイアログを表示（ボタン押下時のみサブコレクションを読み取る）
  Future<void> _showCategoryBreakdownDialog(String billId) async {
    try {
      final billRef = _firestore.collection('bills').doc(billId);

      // extras サブコレクション
      final extrasSnapshot = await billRef.collection('extras').get();
      final extrasList = extrasSnapshot.docs.map((doc) => doc.data()).toList();
      int extraCostAmount = extrasList.fold(0, (sum, data) {
        return sum + ((data['amountIncl'] as num?)?.toInt() ?? 0);
      });
      // 再入店の場合など、amountIncl が 0 でも表示するため、extrasList が空でない場合は表示
      final hasExtras = extrasList.isNotEmpty;

      // items サブコレクション
      final itemsSnapshot = await billRef.collection('items').get();
      final itemsList = itemsSnapshot.docs.map((doc) => doc.data()).toList();
      int itemsAmount = itemsList.fold(0, (sum, data) {
        return sum + ((data['totalPriceIncl'] as num?)?.toInt() ?? 0);
      });

      // sideGameChips サブコレクション（action='purchase'のみ）
      final sideGameChipsSnapshot = await billRef.collection('sideGameChips').get();
      final sideGameChipsList = sideGameChipsSnapshot.docs
          .where((doc) => doc.data()['action'] == 'purchase')
          .map((doc) => doc.data())
          .toList();
      int sideGameChipAmount = sideGameChipsList.fold(0, (sum, data) {
        return sum + ((data['amountIncl'] as num?)?.toInt() ?? 0);
      });

      // tournaments サブコレクション
      final tournamentsSnapshot = await billRef.collection('tournaments').get();
      final tournamentsList = tournamentsSnapshot.docs.map((doc) {
        final data = doc.data();
        return {
          'templateName': data['templateName'] ?? '不明',
          'entryCount': (data['entryCount'] as num?)?.toInt() ?? 0,
          'entryFeeIncl': (data['entryFeeIncl'] as num?)?.toInt() ?? 0,
          'reentryCount': (data['reentryCount'] as num?)?.toInt() ?? 0,
          'reentryFeeIncl': (data['reentryFeeIncl'] as num?)?.toInt() ?? 0,
          'addonCount': (data['addonCount'] as num?)?.toInt() ?? 0,
          'addonFeeIncl': (data['addonFeeIncl'] as num?)?.toInt() ?? 0,
        };
      }).toList();
      int tournamentsAmount = tournamentsList.fold(0, (sum, data) {
        return sum +
            (data['entryFeeIncl'] as int) * (data['entryCount'] as int) +
            (data['reentryFeeIncl'] as int) * (data['reentryCount'] as int) +
            (data['addonFeeIncl'] as int) * (data['addonCount'] as int);
      });

      final grandTotal = extraCostAmount + itemsAmount + sideGameChipAmount + tournamentsAmount;

      if (!mounted) return;

      // ダイアログで表示
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.calculate, color: Colors.blue),
              SizedBox(width: 8),
              Text('現在の合計金額'),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'カテゴリ別内訳',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                
                // 入店料（再入店の場合など、amountIncl が 0 でも表示）
                if (hasExtras) ...[
                  _buildCategorySection(
                    categoryName: _getCategoryName('extraCost'),
                    totalAmount: extraCostAmount,
                    children: [
                      ...extrasList.map((extra) {
                        final amount = (extra['amountIncl'] as num?)?.toInt() ?? 0;
                        final name = extra['name'] as String? ?? '入店料';
                        return Padding(
                          padding: const EdgeInsets.only(left: 16, top: 4, bottom: 4),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                name,
                                style: const TextStyle(fontSize: 13, color: Colors.grey),
                              ),
                              Text(
                                '¥${amount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                                style: const TextStyle(fontSize: 13, color: Colors.grey),
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],

                // フード・ドリンク
                if (itemsAmount > 0) ...[
                  _buildCategorySection(
                    categoryName: _getCategoryName('items'),
                    totalAmount: itemsAmount,
                    children: [
                      ...itemsList.map((item) {
                        final name = item['name'] as String? ?? '不明';
                        final quantity = (item['quantity'] as num?)?.toInt() ?? 0;
                        final totalPriceIncl = (item['totalPriceIncl'] as num?)?.toInt() ?? 0;
                        return Padding(
                          padding: const EdgeInsets.only(left: 16, top: 4, bottom: 4),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  '$name × $quantity',
                                  style: const TextStyle(fontSize: 13, color: Colors.grey),
                                ),
                              ),
                              Text(
                                '¥${totalPriceIncl.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                                style: const TextStyle(fontSize: 13, color: Colors.grey),
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],

                // サイドゲームチップ
                if (sideGameChipAmount > 0) ...[
                  _buildCategorySection(
                    categoryName: _getCategoryName('sideGameChip'),
                    totalAmount: sideGameChipAmount,
                    children: [
                      ...sideGameChipsList.map((chip) {
                        final chipQty = (chip['chipQty'] as num?)?.toInt() ?? 0;
                        final amountIncl = (chip['amountIncl'] as num?)?.toInt() ?? 0;
                        final name = chip['name'] as String? ?? 'チップ購入';
                        return Padding(
                          padding: const EdgeInsets.only(left: 16, top: 4, bottom: 4),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  '$name: ${chipQty}chip',
                                  style: const TextStyle(fontSize: 13, color: Colors.grey),
                                ),
                              ),
                              Text(
                                '¥${amountIncl.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                                style: const TextStyle(fontSize: 13, color: Colors.grey),
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],

                // トーナメント
                if (tournamentsAmount > 0) ...[
                  _buildCategorySection(
                    categoryName: _getCategoryName('tournaments'),
                    totalAmount: tournamentsAmount,
                    children: [
                      ...tournamentsList.map((tournament) {
                        final templateName = tournament['templateName'] as String;
                        final entryCount = tournament['entryCount'] as int;
                        final entryFeeIncl = tournament['entryFeeIncl'] as int;
                        final reentryCount = tournament['reentryCount'] as int;
                        final reentryFeeIncl = tournament['reentryFeeIncl'] as int;
                        final addonCount = tournament['addonCount'] as int;
                        final addonFeeIncl = tournament['addonFeeIncl'] as int;
                        final tournamentTotal = 
                            entryCount * entryFeeIncl +
                            reentryCount * reentryFeeIncl +
                            addonCount * addonFeeIncl;
                        
                        return Padding(
                          padding: const EdgeInsets.only(left: 16, top: 4, bottom: 4),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                templateName,
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Colors.grey),
                              ),
                              if (entryCount > 0)
                                Padding(
                                  padding: const EdgeInsets.only(left: 8, top: 2),
                                  child: Text(
                                    '  エントリー: ${entryCount}回 × ¥${entryFeeIncl.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')} = ¥${(entryCount * entryFeeIncl).toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                                    style: const TextStyle(fontSize: 12, color: Colors.grey),
                                  ),
                                ),
                              if (reentryCount > 0)
                                Padding(
                                  padding: const EdgeInsets.only(left: 8, top: 2),
                                  child: Text(
                                    '  リエントリー: ${reentryCount}回 × ¥${reentryFeeIncl.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')} = ¥${(reentryCount * reentryFeeIncl).toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                                    style: const TextStyle(fontSize: 12, color: Colors.grey),
                                  ),
                                ),
                              if (addonCount > 0)
                                Padding(
                                  padding: const EdgeInsets.only(left: 8, top: 2),
                                  child: Text(
                                    '  アドオン: ${addonCount}回 × ¥${addonFeeIncl.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')} = ¥${(addonCount * addonFeeIncl).toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                                    style: const TextStyle(fontSize: 12, color: Colors.grey),
                                  ),
                                ),
                              Padding(
                                padding: const EdgeInsets.only(left: 8, top: 2),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    const Text(
                                      '  小計',
                                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: Colors.grey),
                                    ),
                                    Text(
                                      '¥${tournamentTotal.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: Colors.grey),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],

                const Divider(),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      '合計',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    Text(
                      '¥${grandTotal.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  '※この表示は UI補助用途のみです。金額の正は amounts.* および verifyPaymentSplit にあります。',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('閉じる'),
            ),
          ],
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('合計金額の計算に失敗しました: $e')),
        );
      }
    }
  }

  // カテゴリセクションを構築（合計と詳細を明確に区別）
  Widget _buildCategorySection({
    required String categoryName,
    required int totalAmount,
    required List<Widget> children,
  }) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(8),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // カテゴリ名と合計金額（太字・大きめ）
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                categoryName,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                ),
              ),
              Text(
                '¥${totalAmount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          // 詳細リスト（インデント・小さめのフォント）
          if (children.isNotEmpty) ...[
            const SizedBox(height: 8),
            ...children,
          ],
        ],
      ),
    );
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
    _CategoryAmounts categoryAmounts,
    Map<String, int> paymentMethodsByAmount,
  ) async {
    final pokerName = bill['pokerName'] ?? '不明';
    final totalPrice = categoryAmounts.total;

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
                          ...categoryAmounts.displayValues.entries.where((e) => e.value > 0).map((
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

  // カテゴリ別支払い方法から支払い方法ごとの合計金額を計算（カスタム支払い用）
  // CategoryPaymentMethodDialog から返される paymentMethodsByCategory を使用
  Map<String, int> _calculatePaymentMethodsByAmountFromCategorySelection(
    Map<String, dynamic> paymentMethodsByCategory,
    Map<String, int> categoryAmounts,
  ) {
    final Map<String, int> paymentMethodsByAmount = {};

    // カテゴリ別の支払い方法を集計
    for (final entry in paymentMethodsByCategory.entries) {
      final category = entry.key;
      final paymentValue = entry.value;
      final categoryAmount = categoryAmounts[category] ?? 0;

      if (categoryAmount > 0) {
        // 文字列の場合（単一支払い方法）
        if (paymentValue is String) {
          if (paymentValue == 'sideGameChip') {
            // サイドゲームチップの場合は円換算してチップ枚数に変換
            // CategoryPaymentMethodDialog では残高チェック時に円換算しているため、
            // ここでも円換算してチップ枚数に変換
            final chips = (categoryAmount / GlobalConstants.SIDE_GAME_CHIP_EXCHANGE_RATE).round();
            paymentMethodsByAmount[paymentValue] =
                (paymentMethodsByAmount[paymentValue] ?? 0) + chips;
          } else {
            paymentMethodsByAmount[paymentValue] =
                (paymentMethodsByAmount[paymentValue] ?? 0) + categoryAmount;
          }
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

  // カテゴリ別支払い方法から支払い方法ごとの合計金額を計算（レガシー用、使用されていない可能性あり）
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

  /// getBillPreviewTotals からカテゴリ別金額を取得して _CategoryAmounts を生成
  Future<_CategoryAmounts?> _fetchCategoryAmountsFromServer(String billId) async {
    try {
      final HttpsCallable callable = _functions.httpsCallable('getBillPreviewTotals');
      final result = await callable.call({'billId': billId});

      final data = Map<String, dynamic>.from(result.data as Map);
      final categories = Map<String, dynamic>.from(data['categories'] as Map);

      // displayValues: UI 表示用
      final displayValues = <String, int>{
        'extraCost': (categories['extraCost']['display'] as num?)?.toInt() ?? 0,
        'items': (categories['items']['display'] as num?)?.toInt() ?? 0,
        'tournaments': (categories['tournaments']['display'] as num?)?.toInt() ?? 0,
        // sideGameChip は displayChips を表示用とする
        'sideGameChip': (categories['sideGameChip']['displayChips'] as num?)?.toInt() ?? 0,
      };

      // monetaryValues: 金額計算・auto split 用
      final monetaryValues = <String, int>{
        'extraCost': (categories['extraCost']['monetary'] as num?)?.toInt() ?? 0,
        'items': (categories['items']['monetary'] as num?)?.toInt() ?? 0,
        'tournaments': (categories['tournaments']['monetary'] as num?)?.toInt() ?? 0,
        'sideGameChip': (categories['sideGameChip']['monetary'] as num?)?.toInt() ?? 0,
      };

      return _CategoryAmounts(
        displayValues: displayValues,
        monetaryValues: monetaryValues,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('会計プレビュー情報の取得に失敗しました: $e')),
        );
      }
      return null;
    }
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
    String baseMethod,
    Map<String, int> categoryAmounts,
    Map<String, int> userBalances,
  ) async {
    // ローディングダイアログを表示（処理完了まで閉じない）
    if (!mounted) return;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(
        child: Card(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('会計開始処理中...'),
              ],
            ),
          ),
        ),
      ),
    );

    try {
      // サーバー側検証を実行（ボタン3で実行）
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
        return;
      }

      // サーバー側検証結果を paymentMethodsByAmount に変換
      final verifiedPaymentMethodsByAmount = <String, int>{};
      verifiedPaymentMethodsByAmount[baseMethod] = cashLikeAmount;

      usedPointsRaw.forEach((method, value) {
        final amount = (value as num?)?.toInt() ?? 0;
        if (amount <= 0) return;
        if (method == 'sideGameChip') {
          final chips = (amount / GlobalConstants.SIDE_GAME_CHIP_EXCHANGE_RATE)
              .round();
          if (chips > 0) {
            verifiedPaymentMethodsByAmount['sideGameChip'] = chips;
          }
        } else {
          verifiedPaymentMethodsByAmount[method] = amount;
        }
      });

      final verified = responseData['verified'] == true;

      if (!verified && mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('サーバー側で計算結果を調整しました。')));
      }

      // サーバー側検証結果を使用して startAccounting を呼び出す
      final result = await _functions.httpsCallable('startAccounting').call({
        'billId': billId,
        'paymentMethodsByAmount': verifiedPaymentMethodsByAmount,
      });

      // ローディングダイアログを閉じる
      if (mounted) {
        Navigator.of(context).pop();
      }

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
      // エラー時もローディングダイアログを閉じる
      if (mounted) {
        try {
          Navigator.of(context).pop();
        } catch (_) {
          // ダイアログが既に閉じられている場合は無視
        }
      }

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

    // ローディングダイアログを表示
    if (!mounted) return;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(
        child: Card(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('読み込み中...'),
              ],
            ),
          ),
        ),
      ),
    );

    try {
      final categoryAmounts = await _fetchCategoryAmountsFromServer(billId);
      if (categoryAmounts == null) {
        if (mounted) {
          Navigator.of(context).pop(); // ローディングダイアログを閉じる
        }
        return;
      }

      // 0円会計のチェック
      final totalAmount = categoryAmounts.total;
      if (totalAmount == 0) {
        // ローディングダイアログを閉じる
        if (mounted) {
          Navigator.of(context).pop();
        }

        // 0円会計の確認ダイアログを表示
        final pokerName = bill['pokerName'] ?? '不明';
        final shouldProceed = await showDialog<bool>(
          context: context,
          barrierDismissible: false,
          builder: (context) => AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.warning, color: Colors.orange),
                SizedBox(width: 8),
                Text('0円会計の確認'),
              ],
            ),
            content: Text('この${pokerName}様の伝票は0円の状態で登録されています。確認したのち、問題がなければ確認ボタンを押下してください。'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('キャンセル'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.of(context).pop(true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  foregroundColor: Colors.white,
                ),
                child: const Text('確認'),
              ),
            ],
          ),
        );

        if (shouldProceed != true) {
          return;
        }

        // 0円会計の処理: startAccounting → completeAccountingV2
        await _processZeroAmountAccounting(billId);
        return;
      }

      final userBalances = await _getUserBalances(bill['userId']?.toString());

      final startOptions = await _showPaymentStartOptionsDialog(
        bill,
        categoryAmounts,
        userBalances,
      );

      // ローディングダイアログを閉じる
      if (mounted) {
        Navigator.of(context).pop();
      }

      if (startOptions == null) return;

      final action = startOptions['action']?.toString();
      if (action == null) return;

      Map<String, int> paymentMethodsByAmount = {};

      if (action == 'custom') {
        final customSelection = await showDialog<Map<String, dynamic>>(
          context: context,
          barrierDismissible: false,
          builder: (context) => CategoryPaymentMethodDialog(bill: bill),
        );

        if (customSelection == null) return;

        // カスタム選択結果から paymentMethodsByAmount を計算
        // CategoryPaymentMethodDialog は既に残高チェックと分割処理を行っているため、
        // その結果をそのまま使用
        paymentMethodsByAmount = _calculatePaymentMethodsByAmountFromCategorySelection(
          customSelection,
          categoryAmounts.monetaryValues,
        );
      } else if (action == 'auto') {
        final baseMethod = startOptions['baseMethod']?.toString();
        if (baseMethod == null || baseMethod.isEmpty) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('決済方法を選択してください')));
          return;
        }

        // ボタン2の選択後は、クライアント側で計算して確認ダイアログに表示
        // verifyPaymentSplit はボタン3で実行する
        final balancesForCalculator = {
          'pointA': userBalances['pointA'] ?? 0,
          'pointB': userBalances['pointB'] ?? 0,
          'sideGameChip': userBalances['sideGameChip'] ?? 0,
        };

        final splitResult = calculatePaymentSplit(
          selectedBaseMethod: baseMethod,
          categoryPaymentMethods: GlobalConstants.categoryPaymentMethods,
          bill: categoryAmounts.monetaryValues,
          balances: balancesForCalculator,
          pointPriority: GlobalConstants.POINT_PRIORITY,
        );

        final cashLikeAmount = splitResult.cashLikeAmount;
        if (cashLikeAmount <= 0) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('ポイントのみでの支払いはできません。')));
          return;
        }

        // クライアント側計算結果を paymentMethodsByAmount に変換
        paymentMethodsByAmount = <String, int>{};
        paymentMethodsByAmount[baseMethod] = cashLikeAmount;

        splitResult.usedPoints.forEach((method, value) {
          final amount = value.toInt();
          if (amount <= 0) return;
          if (method == 'sideGameChip') {
            final chips = (amount / GlobalConstants.SIDE_GAME_CHIP_EXCHANGE_RATE).round();
            if (chips > 0) {
              paymentMethodsByAmount['sideGameChip'] = chips;
            }
          } else {
            paymentMethodsByAmount[method] = amount;
          }
        });
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
        categoryAmounts,
        paymentMethodsByAmount,
      );

      if (!shouldStart) return;

      // ボタン3の確認後、サーバー側検証を実行してから startAccounting を呼び出す
      await _executeStartAccounting(
        billId,
        paymentMethodsByAmount,
        startOptions['baseMethod']?.toString() ?? 'cash',
        categoryAmounts.monetaryValues,
        userBalances,
      );
    } catch (e) {
      // エラー時もローディングダイアログを閉じる
      if (mounted) {
        try {
          Navigator.of(context).pop(); // ローディングダイアログを閉じる
        } catch (_) {
          // ダイアログが既に閉じられている場合は無視
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('会計開始処理中にエラーが発生しました: $e')),
        );
      }
    } finally {
      // 念のため、確実にローディングダイアログを閉じる
      if (mounted) {
        try {
          Navigator.of(context).pop();
        } catch (_) {
          // ダイアログが既に閉じられている場合は無視
        }
      }
    }
  }

  // 0円会計の処理
  Future<void> _processZeroAmountAccounting(String billId) async {
    // ローディングダイアログを表示
    if (!mounted) return;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(
        child: Card(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('0円会計処理中...'),
              ],
            ),
          ),
        ),
      ),
    );

    try {
      // 0円会計の場合、空のpaymentMethodsByAmountでstartAccountingを呼ぶ
      // Functions側で0円の場合の処理を許可する必要がある
      final startResult = await _functions.httpsCallable('startAccounting').call({
        'billId': billId,
        'paymentMethodsByAmount': <String, int>{}, // 空のMap
        'clientNonce': DateTime.now().millisecondsSinceEpoch.toString(),
      });

      // ローディングダイアログを閉じる
      if (mounted) {
        try {
          Navigator.of(context).pop();
        } catch (_) {
          // ダイアログが既に閉じられている場合は無視
        }
      }

      if (startResult.data['success'] == true) {
        // startAccountingが成功したら、completeAccountingV2を呼ぶ
        await _completeAccounting(billId);
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('会計開始に失敗しました: ${startResult.data['message'] ?? '不明なエラー'}')),
          );
        }
      }
    } catch (e) {
      // エラー時もローディングダイアログを閉じる
      if (mounted) {
        try {
          Navigator.of(context).pop();
        } catch (_) {
          // ダイアログが既に閉じられている場合は無視
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('0円会計処理に失敗しました: $e')),
        );
      }
    }
  }

  Future<void> _completeAccounting(String billId) async {
    // ローディングダイアログを表示（処理完了まで閉じない）
    if (!mounted) return;
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(
        child: Card(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('会計完了処理中...'),
              ],
            ),
          ),
        ),
      ),
    );

    try {
      final result = await _functions.httpsCallable('completeAccountingV2').call({
        'billId': billId,
      });

      // デバッグログを追加
      print('会計完了結果: ${result.data}');
      print('success値: ${result.data['success']}');
      print('successの型: ${result.data['success'].runtimeType}');

      // ローディングダイアログを閉じる
      if (mounted) {
        try {
          Navigator.of(context).pop();
        } catch (_) {
          // ダイアログが既に閉じられている場合は無視
        }
      }

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('会計を完了しました')));
        }
        // データを再読み込み（非同期で実行）
        _loadActiveBills(); // データを再読み込み
        _loadSettledBills(); // 会計完了データも再読み込み
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('会計完了に失敗しました: ${result.data['message']}')),
          );
        }
      }
    } catch (e) {
      // エラー時もローディングダイアログを閉じる
      if (mounted) {
        try {
          Navigator.of(context).pop();
        } catch (_) {
          // ダイアログが既に閉じられている場合は無視
        }
      }

      print('会計完了エラー: $e');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('会計完了に失敗しました: $e')));
      }
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

    // セクション付きリスト表示（pokerNameでソート）
    return buildSectionedUserListPage(
      users: _activeBills,
      nameKey: 'pokerName',
      itemBuilder: (context, bill) => _buildBillCard(bill),
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

    // セクション付きリスト表示（pokerNameでソート）
    return buildSectionedUserListPage(
      users: _settledBills,
      nameKey: 'pokerName',
      itemBuilder: (context, bill) => _buildSettledBillCard(bill),
    );
  }

  Widget _buildBillCard(Map<String, dynamic> bill) {
    final totalPrice = bill['totalPrice'] ?? 0;
    final status = bill['status'] ?? 'open';
    final accountingStarted = bill['accountingStartedAt'] != null;
    final pokerName = bill['pokerName'] ?? '不明';
    final createdAt = bill['createdAt']?.toDate() ?? DateTime.now();
    final screenWidth = MediaQuery.of(context).size.width;
    final cardWidth = screenWidth * 0.95;

    return Center(
      child: SizedBox(
        width: cardWidth,
        child: Card(
          elevation: 4,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // 上部：左上にuserName、作成日時、ボタン（横並び）、右上にステータス
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 左上：userName、作成日時、ボタン（横並び）
                    Expanded(
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            pokerName,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            '作成日時: ${_formatDateTime(createdAt)}',
                            style: TextStyle(color: Colors.grey[600], fontSize: 11),
                          ),
                          if (totalPrice == null || totalPrice == 0)
                            ElevatedButton.icon(
                              onPressed: () => _showCategoryBreakdownDialog(bill['id']),
                              icon: const Icon(Icons.calculate, size: 14),
                              label: const Text('現在の合計金額を計算', style: TextStyle(fontSize: 10)),
                              style: ElevatedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 6,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                    // 右上：ステータスバッジ
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
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                // 会計額表示（縮小版）
                if (totalPrice != null && totalPrice > 0)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(8),
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
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                            color: Colors.blue,
                          ),
                        ),
                        const Text(
                          '会計額（参考値）',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.blue,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                // 会計中の表示（支払い方法と操作）
                if (accountingStarted) ...[
                  const SizedBox(height: 8),
                  _buildPaymentMethodsByAmount(bill),
                  const SizedBox(height: 8),
                  // 右下：ボタン
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      OutlinedButton.icon(
                        onPressed: () async {
                          final ok = await _revertAccountingStart(bill['id']);
                          if (ok) {
                            await _startAccounting(bill['id']);
                          }
                        },
                        icon: const Icon(Icons.edit, size: 16),
                        label: const Text('支払い方法変更', style: TextStyle(fontSize: 11)),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.blue,
                          side: const BorderSide(color: Colors.blue),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton.icon(
                        onPressed: () => _revertAccountingStart(bill['id']),
                        icon: const Icon(Icons.undo, size: 16),
                        label: const Text('会計開始前に戻る', style: TextStyle(fontSize: 11)),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.red,
                          side: const BorderSide(color: Colors.red),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                        ),
                      ),
                    ],
                  ),
                ] else
                  // 右下：ボタン
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      OutlinedButton.icon(
                        onPressed: () => _showEditDialog(bill),
                        icon: const Icon(Icons.edit, size: 16),
                        label: const Text('修正', style: TextStyle(fontSize: 11)),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.blue,
                          side: const BorderSide(color: Colors.blue),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 300, // 横幅を300%相当（元の3倍）に設定
                        child: ElevatedButton.icon(
                          onPressed: () => _startAccounting(bill['id']),
                          icon: const Icon(Icons.play_arrow, size: 16),
                          label: const Text('会計開始', style: TextStyle(fontSize: 11)),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.green,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          ),
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // 会計開始前に戻す（Cloud Function 呼び出し）
  Future<bool> _revertAccountingStart(String billId) async {
    try {
      final result = await _functions
          .httpsCallable('cancelAccounting')
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
    final totalPrice = bill['totalPrice'] as int?;
    final pokerName = bill['pokerName'] ?? '不明';
    final accountingCompletedAt =
        bill['accountingCompletedAt']?.toDate() ?? DateTime.now();
    final refundAmount = bill['refundAmount'] ?? 0;
    final paymentMethod = bill['paymentMethod'] ?? 'cash';
    final screenWidth = MediaQuery.of(context).size.width;
    final cardWidth = screenWidth * 0.95;

    print('=== _buildSettledBillCard ===');
    print('billId: $billId, pokerName: $pokerName, totalPrice: $totalPrice');

    return Center(
      child: SizedBox(
        width: cardWidth,
        child: Card(
          elevation: 4,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // 上部：左上にuserName、右上にステータス
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      pokerName,
                      style: const TextStyle(
                        fontSize: 16,
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
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                // 会計完了日時
                Text(
                  '会計完了: ${accountingCompletedAt.year}年${accountingCompletedAt.month}月${accountingCompletedAt.day}日 ${accountingCompletedAt.hour.toString().padLeft(2, '0')}:${accountingCompletedAt.minute.toString().padLeft(2, '0')}',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                ),
                const SizedBox(height: 8),
                // 合計金額（縮小版）
                if (totalPrice != null)
                  Container(
                    padding: const EdgeInsets.all(8),
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
                            fontSize: 12,
                            color: Colors.green,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        Text(
                          '${totalPrice.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}円',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: Colors.green.shade700,
                          ),
                        ),
                      ],
                    ),
                  )
                else
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.orange.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.orange.shade200),
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '会計額',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.orange,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        Text(
                          '計算中...',
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.orange,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 8),
                // 支払い方法ごとの合計金額を表示
                _buildPaymentMethodsByAmount(bill),
                const SizedBox(height: 8),
                // 右下：アクションボタン
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () => _showEditDialog(bill),
                      icon: const Icon(Icons.edit, size: 16),
                      label: const Text('修正', style: TextStyle(fontSize: 11)),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.blue,
                        side: const BorderSide(color: Colors.blue),
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                      ),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton.icon(
                      onPressed: () => _showCancelDialog(bill),
                      icon: const Icon(Icons.cancel, size: 16),
                      label: const Text('キャンセル', style: TextStyle(fontSize: 11)),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.red,
                        side: const BorderSide(color: Colors.red),
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
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
                    size: 16,
                    color: Colors.grey.shade700,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _getPaymentMethodName(method),
                    style: const TextStyle(fontSize: 11),
                  ),
                ],
              ),
              Text(
                displayText,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text(
          '支払い方法',
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 4),
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
