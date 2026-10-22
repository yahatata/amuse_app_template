import 'dart:async';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/user_actions/user_action_validation_messages.dart';
import 'package:amuse_app_template/user_actions/user_action_load_errors.dart';

/// 現在の会計参照ダイアログ
Future<void> showCurrentAccountingDialog({
  required BuildContext context,
  required Map<String, dynamic> user,
}) async {
  final outerCtx = context;
  final String billId = (user['billId'] ?? '').toString();
  final String pokerName = (user['pokerName'] ?? '(名前未設定)').toString();

  if (billId.isEmpty) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(outerCtx).showSnackBar(
        SnackBar(content: Text(kUserActionBillIdMissingMessage)),
      );
    }
    return;
  }

  await showDialog<void>(
    context: context,
    barrierDismissible: true,
    builder: (ctx) => _CurrentAccountingDialog(billId: billId, pokerName: pokerName),
  );
}

class _CurrentAccountingDialog extends StatelessWidget {
  final String billId;
  final String pokerName;

  const _CurrentAccountingDialog({
    required this.billId,
    required this.pokerName,
  });

  // カテゴリ名を取得
  String _getCategoryName(String category) {
    switch (category) {
      case 'extraCost':
        return 'その他料金';
      case 'tournaments':
        return 'トーナメント';
      case 'items':
        return 'フード・ドリンク';
      case 'sideGameChip':
        return 'サイドゲームチップ';
      default:
        return category;
    }
  }

  // カテゴリセクションを構築
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
          if (children.isNotEmpty) ...[
            const SizedBox(height: 8),
            ...children,
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 600, maxHeight: 700),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ヘッダー
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.calculate, color: Colors.blue),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          '現在の合計金額',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          pokerName,
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey[700],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            // コンテンツ
            Flexible(
              child: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                stream: FirebaseFirestore.instance
                    .collection('bills')
                    .doc(billId)
                    .snapshots(),
                builder: (context, billSnapshot) {
                  if (billSnapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }

                  if (billSnapshot.hasError) {
                    // USER-67: 伝票本体が取れない場合は全画面エラー（部分データなし）
                    return Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.error, color: Colors.red, size: 48),
                          const SizedBox(height: 16),
                          Text(
                            userActionStreamErrorMessage(
                              kUserActionBillLoadFailedMessage,
                              billSnapshot.error,
                            ),
                            style: TextStyle(
                              fontSize: 16,
                              color: Colors.red[700],
                              fontWeight: FontWeight.bold,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    );
                  }

                  if (!billSnapshot.hasData || !billSnapshot.data!.exists) {
                    return const Padding(
                      padding: EdgeInsets.all(16),
                      child: Center(
                        child: Text('伝票情報が見つかりません'),
                      ),
                    );
                  }

                  return StreamBuilder<List<Map<String, dynamic>>>(
                    stream: _getBillSubcollections(billId),
                    builder: (context, snapshot) {
                      if (snapshot.connectionState == ConnectionState.waiting) {
                        return const Center(child: CircularProgressIndicator());
                      }

                      if (snapshot.hasError) {
                        // USER-69: サブコレクション失敗でも伝票ヘッダは維持し、更新失敗バナーを出す
                        return SingleChildScrollView(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                pokerName,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: Colors.orange.shade50,
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(
                                    color: Colors.orange.shade200,
                                  ),
                                ),
                                child: Text(
                                  userActionStreamErrorMessage(
                                    kUserActionBillDetailsUpdateFailedMessage,
                                    snapshot.error,
                                  ),
                                  style: TextStyle(color: Colors.orange[900]),
                                ),
                              ),
                            ],
                          ),
                        );
                      }

                      final categories = snapshot.data ?? [];
                      final extraCostAmount = categories.firstWhere(
                        (c) => c['name'] == 'その他料金',
                        orElse: () => {'amount': 0},
                      )['amount'] as int;
                      final itemsAmount = categories.firstWhere(
                        (c) => c['name'] == 'フード・ドリンク',
                        orElse: () => {'amount': 0},
                      )['amount'] as int;
                      final sideGameChipAmount = categories.firstWhere(
                        (c) => c['name'] == 'サイドゲームチップ',
                        orElse: () => {'amount': 0},
                      )['amount'] as int;
                      final tournamentsAmount = categories.firstWhere(
                        (c) => c['name'] == 'トーナメント',
                        orElse: () => {'amount': 0},
                      )['amount'] as int;

                      final grandTotal = extraCostAmount + itemsAmount + sideGameChipAmount + tournamentsAmount;

                      return SingleChildScrollView(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'カテゴリ別内訳',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                            const SizedBox(height: 12),
                            
                            // その他料金
                            if (extraCostAmount > 0) ...[
                              FutureBuilder<QuerySnapshot>(
                                future: FirebaseFirestore.instance
                                    .collection('bills')
                                    .doc(billId)
                                    .collection('extras')
                                    .get(),
                                builder: (context, extrasSnapshot) {
                                  if (!extrasSnapshot.hasData) {
                                    return const SizedBox.shrink();
                                  }
                                  final extrasList = extrasSnapshot.data!.docs
                                      .map((doc) => doc.data() as Map<String, dynamic>)
                                      .toList();
                                  final hasExtras = extrasList.isNotEmpty;
                                  
                                  if (!hasExtras) return const SizedBox.shrink();
                                  
                                  return _buildCategorySection(
                                    categoryName: _getCategoryName('extraCost'),
                                    totalAmount: extraCostAmount,
                                    children: [
                                      ...extrasList.map((extra) {
                                        final amount = (extra['amountIncl'] as num?)?.toInt() ?? 0;
                                        final name = extra['name'] as String? ?? '追加料金';
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
                                  );
                                },
                              ),
                              const SizedBox(height: 12),
                            ],

                            // フード・ドリンク
                            if (itemsAmount > 0) ...[
                              FutureBuilder<QuerySnapshot>(
                                future: FirebaseFirestore.instance
                                    .collection('bills')
                                    .doc(billId)
                                    .collection('items')
                                    .get(),
                                builder: (context, itemsSnapshot) {
                                  if (!itemsSnapshot.hasData) {
                                    return const SizedBox.shrink();
                                  }
                                  final itemsList = itemsSnapshot.data!.docs
                                      .map((doc) => doc.data() as Map<String, dynamic>)
                                      .toList();
                                  
                                  return _buildCategorySection(
                                    categoryName: _getCategoryName('items'),
                                    totalAmount: itemsAmount,
                                    children: [
                                      ...itemsList
                                          .where((item) {
                                            // voided: true のアイテムは表示対象外
                                            return (item['voided'] as bool?) != true;
                                          })
                                          .map((item) {
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
                                  );
                                },
                              ),
                              const SizedBox(height: 12),
                            ],

                            // サイドゲームチップ
                            if (sideGameChipAmount > 0) ...[
                              FutureBuilder<QuerySnapshot>(
                                future: FirebaseFirestore.instance
                                    .collection('bills')
                                    .doc(billId)
                                    .collection('sideGameChips')
                                    .where('action', isEqualTo: 'purchase')
                                    .get(),
                                builder: (context, chipsSnapshot) {
                                  if (!chipsSnapshot.hasData) {
                                    return const SizedBox.shrink();
                                  }
                                  final chipsList = chipsSnapshot.data!.docs
                                      .map((doc) => doc.data() as Map<String, dynamic>)
                                      .toList();
                                  
                                  return _buildCategorySection(
                                    categoryName: _getCategoryName('sideGameChip'),
                                    totalAmount: sideGameChipAmount,
                                    children: [
                                      ...chipsList.map((chip) {
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
                                  );
                                },
                              ),
                              const SizedBox(height: 12),
                            ],

                            // トーナメント
                            if (tournamentsAmount > 0) ...[
                              FutureBuilder<QuerySnapshot>(
                                future: FirebaseFirestore.instance
                                    .collection('bills')
                                    .doc(billId)
                                    .collection('tournaments')
                                    .get(),
                                builder: (context, tournamentsSnapshot) {
                                  if (!tournamentsSnapshot.hasData) {
                                    return const SizedBox.shrink();
                                  }
                                  final tournamentsList = tournamentsSnapshot.data!.docs.map((doc) {
                                    final data = doc.data() as Map<String, dynamic>;
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
                                  
                                  return _buildCategorySection(
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
                                  );
                                },
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
                              '※この表示は UI補助用途のみです。金額の正は amounts.* および startAccounting 内のサーバ再計算にあります。',
                              style: TextStyle(fontSize: 12, color: Colors.grey),
                            ),
                          ],
                        ),
                      );
                    },
                  );
                },
              ),
            ),
            // アクション
            Padding(
              padding: const EdgeInsets.all(8),
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('閉じる'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Stream<List<Map<String, dynamic>>> _getBillSubcollections(String billId) async* {
    final billRef = FirebaseFirestore.instance.collection('bills').doc(billId);

    // Initial fetch
    final extrasSnapshot = await billRef.collection('extras').get();
    int extraCostAmount = extrasSnapshot.docs.fold(0, (sum, doc) {
      final data = doc.data() as Map<String, dynamic>? ?? {};
      return sum + ((data['amountIncl'] as num?)?.toInt() ?? 0);
    });

    final itemsSnapshot = await billRef.collection('items').get();
    int itemsAmount = itemsSnapshot.docs
        .where((doc) {
          final data = doc.data() as Map<String, dynamic>? ?? {};
          // voided: true のアイテムは算出対象外
          return (data['voided'] as bool?) != true;
        })
        .fold(0, (sum, doc) {
      final data = doc.data() as Map<String, dynamic>? ?? {};
      return sum + ((data['totalPriceIncl'] as num?)?.toInt() ?? 0);
    });

    final sideGameChipsSnapshot = await billRef.collection('sideGameChips').get();
    int sideGameChipAmount = sideGameChipsSnapshot.docs
        .where((doc) {
          final data = doc.data() as Map<String, dynamic>? ?? {};
          return data['action'] == 'purchase';
        })
        .fold(0, (sum, doc) {
          final data = doc.data() as Map<String, dynamic>? ?? {};
          return sum + ((data['amountIncl'] as num?)?.toInt() ?? 0);
        });

    final tournamentsSnapshot = await billRef.collection('tournaments').get();
    int tournamentsAmount = tournamentsSnapshot.docs.fold(0, (sum, doc) {
      final data = doc.data() as Map<String, dynamic>? ?? {};
      final entryFeeIncl = (data['entryFeeIncl'] as num?)?.toInt() ?? 0;
      final entryCount = (data['entryCount'] as num?)?.toInt() ?? 0;
      final reentryFeeIncl = (data['reentryFeeIncl'] as num?)?.toInt() ?? 0;
      final reentryCount = (data['reentryCount'] as num?)?.toInt() ?? 0;
      final addonFeeIncl = (data['addonFeeIncl'] as num?)?.toInt() ?? 0;
      final addonCount = (data['addonCount'] as num?)?.toInt() ?? 0;
      return sum + (entryFeeIncl * entryCount) + (reentryFeeIncl * reentryCount) + (addonFeeIncl * addonCount);
    });

    yield [
      {'name': 'その他料金', 'amount': extraCostAmount},
      {'name': 'フード・ドリンク', 'amount': itemsAmount},
      {'name': 'サイドゲームチップ', 'amount': sideGameChipAmount},
      {'name': 'トーナメント', 'amount': tournamentsAmount},
    ];

    // Real-time updates
    final extrasStream = billRef.collection('extras').snapshots();
    final itemsStream = billRef.collection('items').snapshots();
    final sideGameChipsStream = billRef.collection('sideGameChips').snapshots();
    final tournamentsStream = billRef.collection('tournaments').snapshots();

    await for (final snapshots in _combineSubcollectionStreams([
      extrasStream,
      itemsStream,
      sideGameChipsStream,
      tournamentsStream,
    ])) {
      final extras = snapshots[0].docs;
      final items = snapshots[1].docs;
      final sideGameChips = snapshots[2].docs;
      final tournaments = snapshots[3].docs;

      int extraCostAmount = extras.fold(0, (sum, doc) {
        final data = doc.data() as Map<String, dynamic>? ?? {};
        return sum + ((data['amountIncl'] as num?)?.toInt() ?? 0);
      });

      int itemsAmount = items
          .where((doc) {
            final data = doc.data() as Map<String, dynamic>? ?? {};
            // voided: true のアイテムは算出対象外
            return (data['voided'] as bool?) != true;
          })
          .fold(0, (sum, doc) {
        final data = doc.data() as Map<String, dynamic>? ?? {};
        return sum + ((data['totalPriceIncl'] as num?)?.toInt() ?? 0);
      });

      int sideGameChipAmount = sideGameChips
          .where((doc) {
            final data = doc.data() as Map<String, dynamic>? ?? {};
            return data['action'] == 'purchase';
          })
          .fold(0, (sum, doc) {
            final data = doc.data() as Map<String, dynamic>? ?? {};
            return sum + ((data['amountIncl'] as num?)?.toInt() ?? 0);
          });

      int tournamentsAmount = tournaments.fold(0, (sum, doc) {
        final data = doc.data() as Map<String, dynamic>? ?? {};
        final entryFeeIncl = (data['entryFeeIncl'] as num?)?.toInt() ?? 0;
        final entryCount = (data['entryCount'] as num?)?.toInt() ?? 0;
        final reentryFeeIncl = (data['reentryFeeIncl'] as num?)?.toInt() ?? 0;
        final reentryCount = (data['reentryCount'] as num?)?.toInt() ?? 0;
        final addonFeeIncl = (data['addonFeeIncl'] as num?)?.toInt() ?? 0;
        final addonCount = (data['addonCount'] as num?)?.toInt() ?? 0;
        return sum + (entryFeeIncl * entryCount) + (reentryFeeIncl * reentryCount) + (addonFeeIncl * addonCount);
      });

      yield [
        {'name': 'その他料金', 'amount': extraCostAmount},
        {'name': 'フード・ドリンク', 'amount': itemsAmount},
        {'name': 'サイドゲームチップ', 'amount': sideGameChipAmount},
        {'name': 'トーナメント', 'amount': tournamentsAmount},
      ];
    }
  }

  Stream<List<QuerySnapshot>> _combineSubcollectionStreams(List<Stream<QuerySnapshot>> streams) {
    if (streams.isEmpty) {
      return Stream.value([]);
    }
    
    final controller = StreamController<List<QuerySnapshot>>();
    final List<QuerySnapshot?> latest = List.filled(streams.length, null);
    final List<StreamSubscription> subscriptions = [];
    
    void checkAndEmit() {
      if (latest.every((snapshot) => snapshot != null)) {
        controller.add(latest.cast<QuerySnapshot>());
      }
    }
    
    for (int i = 0; i < streams.length; i++) {
      final index = i;
      subscriptions.add(
        streams[i].listen(
          (snapshot) {
            latest[index] = snapshot;
            checkAndEmit();
          },
          onError: controller.addError,
        ),
      );
    }
    
    controller.onCancel = () {
      for (final sub in subscriptions) {
        sub.cancel();
      }
    };
    
    return controller.stream;
  }

}

