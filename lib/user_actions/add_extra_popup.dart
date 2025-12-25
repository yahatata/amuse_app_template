import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:async';

/// 追加料金を手動で追加するダイアログ
Future<void> showAddExtraDialog({
  required BuildContext context,
  required Map<String, dynamic> user,
}) async {
  final outerCtx = context;
  final String billId = (user['billId'] ?? '').toString();
  final String pokerName = (user['pokerName'] ?? '(名前未設定)').toString();

  if (billId.isEmpty) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(outerCtx).showSnackBar(
        const SnackBar(content: Text('伝票IDが見つかりません')),
      );
    }
    return;
  }

  final TextEditingController amountController = TextEditingController();
  final GlobalKey<FormState> formKey = GlobalKey<FormState>();

  await showDialog<void>(
    context: outerCtx,
    barrierDismissible: true,
    builder: (dialogCtx) {
      return Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Container(
          constraints: const BoxConstraints(maxWidth: 600, maxHeight: 700),
          child: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // ヘッダー
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.green.shade50,
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(16),
                      topRight: Radius.circular(16),
                    ),
                  ),
                  child: Row(
                    children: const [
                      Icon(Icons.attach_money, color: Colors.green),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '追加料金',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                // コンテンツ
                Flexible(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // 対象ユーザー
                        Text(
                          '対象ユーザー: $pokerName',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 16),
                        // 注意文（会計データについて）
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.orange.shade50,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.orange.shade200),
                          ),
                          child: const Text(
                            '下記の会計データは実際の会計データからズレがある場合があります。正確なデータは会計管理画面から確認してください。',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.orange,
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        // 現時点の未会計データ
                        const Text(
                          '現時点の未会計データ',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        StreamBuilder<DocumentSnapshot>(
                          stream: FirebaseFirestore.instance
                              .collection('bills')
                              .doc(billId)
                              .snapshots(),
                          builder: (context, billSnapshot) {
                            if (!billSnapshot.hasData || !billSnapshot.data!.exists) {
                              return const Center(child: CircularProgressIndicator());
                            }

                            return StreamBuilder<List<Map<String, dynamic>>>(
                              stream: _getBillSubcollections(billId),
                              builder: (context, subcollectionsSnapshot) {
                                if (subcollectionsSnapshot.connectionState == ConnectionState.waiting) {
                                  return const Center(child: CircularProgressIndicator());
                                }

                                final categories = subcollectionsSnapshot.data ?? [];
                                int totalAmount = 0;

                                for (final category in categories) {
                                  totalAmount += category['amount'] as int? ?? 0;
                                }

                                return Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    // カテゴリごとの金額
                                    ...categories.map((category) {
                                      final categoryName = category['name'] as String;
                                      final amount = category['amount'] as int;
                                      if (amount == 0) return const SizedBox.shrink();
                                      
                                      return Padding(
                                        padding: const EdgeInsets.only(bottom: 8),
                                        child: Row(
                                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                          children: [
                                            Text(categoryName),
                                            Text(
                                              '¥${amount.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                                              style: const TextStyle(fontWeight: FontWeight.bold),
                                            ),
                                          ],
                                        ),
                                      );
                                    }),
                                    const Divider(),
                                    // 合計金額
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        const Text(
                                          '合計金額',
                                          style: TextStyle(
                                            fontSize: 18,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                        Text(
                                          '¥${totalAmount.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                                          style: const TextStyle(
                                            fontSize: 18,
                                            fontWeight: FontWeight.bold,
                                            color: Colors.green,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                );
                              },
                            );
                          },
                        ),
                        const SizedBox(height: 16),
                        // 注意文（追加料金について）
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.grey.shade100,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.grey.shade300),
                          ),
                          child: const Text(
                            'ここで追加された料金はその他料金カテゴリに追加料金として保存されます',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey,
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        // 金額入力フィールド
                        TextFormField(
                          controller: amountController,
                          decoration: const InputDecoration(
                            labelText: '金額',
                            hintText: '0',
                            prefixText: '¥',
                            border: OutlineInputBorder(),
                          ),
                          keyboardType: TextInputType.number,
                          validator: (value) {
                            if (value == null || value.isEmpty) {
                              return '金額を入力してください';
                            }
                            final amount = int.tryParse(value);
                            if (amount == null || amount < 0) {
                              return '0以上の数値を入力してください';
                            }
                            return null;
                          },
                        ),
                      ],
                    ),
                  ),
                ),
                // アクション
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        onPressed: () => Navigator.of(dialogCtx).pop(),
                        child: const Text('キャンセル'),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton(
                        onPressed: () async {
                          if (!formKey.currentState!.validate()) {
                            return;
                          }

                          final amount = int.tryParse(amountController.text);
                          if (amount == null || amount < 0) {
                            return;
                          }

                          // 確認ダイアログを表示
                          Navigator.of(dialogCtx).pop();
                          
                          final confirmed = await showDialog<bool>(
                            context: outerCtx,
                            builder: (confirmCtx) => AlertDialog(
                              title: const Text('追加料金の確認'),
                              content: Text('¥${amount.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')} を追加しますか？'),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.of(confirmCtx).pop(false),
                                  child: const Text('キャンセル'),
                                ),
                                ElevatedButton(
                                  onPressed: () => Navigator.of(confirmCtx).pop(true),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.green,
                                    foregroundColor: Colors.white,
                                  ),
                                  child: const Text('確定'),
                                ),
                              ],
                            ),
                          );

                          if (confirmed == true) {
                            await _executeAddExtra(
                              context: outerCtx,
                              billId: billId,
                              pokerName: pokerName,
                              amount: amount,
                            );
                          }
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                        ),
                        child: const Text('確定'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

/// billsのサブコレクションからカテゴリごとの金額を取得
Stream<List<Map<String, dynamic>>> _getBillSubcollections(String billId) async* {
  final billRef = FirebaseFirestore.instance.collection('bills').doc(billId);
  
  // extras
  final extrasSnapshot = await billRef.collection('extras').get();
  int extraCostAmount = extrasSnapshot.docs.fold(0, (sum, doc) {
    return sum + ((doc.data()['amountIncl'] as num?)?.toInt() ?? 0);
  });
  
  // items
  final itemsSnapshot = await billRef.collection('items').get();
  int itemsAmount = itemsSnapshot.docs.fold(0, (sum, doc) {
    return sum + ((doc.data()['totalPriceIncl'] as num?)?.toInt() ?? 0);
  });
  
  // sideGameChips (action='purchase'のみ)
  final sideGameChipsSnapshot = await billRef.collection('sideGameChips').get();
  int sideGameChipAmount = sideGameChipsSnapshot.docs
      .where((doc) => doc.data()['action'] == 'purchase')
      .fold(0, (sum, doc) {
        return sum + ((doc.data()['amountIncl'] as num?)?.toInt() ?? 0);
      });
  
  // tournaments
  final tournamentsSnapshot = await billRef.collection('tournaments').get();
  int tournamentsAmount = tournamentsSnapshot.docs.fold(0, (sum, doc) {
    final data = doc.data();
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
  
  // リアルタイム更新のために監視
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
    
    int itemsAmount = items.fold(0, (sum, doc) {
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

/// 追加料金処理を実行
Future<void> _executeAddExtra({
  required BuildContext context,
  required String billId,
  required String pokerName,
  required int amount,
}) async {
  if (!context.mounted) return;

  final overlayState = Overlay.maybeOf(context, rootOverlay: true);
  OverlayEntry? loadingOverlay;
  bool loadingShown = false;

  void hideLoading() {
    if (loadingShown) {
      try {
        loadingOverlay?.remove();
      } catch (_) {
        // noop
      }
      loadingOverlay = null;
      loadingShown = false;
    }
  }

  try {
    // ローディング表示
    loadingOverlay = OverlayEntry(
      builder: (_) => Material(
        color: Colors.black54,
        child: Center(
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                SizedBox(width: 16),
                Text('追加料金処理中...'),
              ],
            ),
          ),
        ),
      ),
    );
    if (overlayState != null) {
      overlayState.insert(loadingOverlay!);
      loadingShown = true;
    }

    // Cloud Function呼び出し
    final functions = FirebaseFunctions.instance;
    final callable = functions.httpsCallable('appendExtra');

    final result = await callable.call({
      'billId': billId,
      'name': '追加料金',
      'amountIncl': amount,
    }).timeout(
      const Duration(seconds: 30),
      onTimeout: () => throw TimeoutException('Cloud Functionの呼び出しがタイムアウトしました'),
    );

    if (!context.mounted) {
      hideLoading();
      return;
    }

    final data = result.data as Map<String, dynamic>? ?? {};
    final bool ok = data['success'] == true;

    hideLoading();

    if (ok) {
      await showDialog(
        context: context,
        builder: (dCtx) => AlertDialog(
          title: Row(
            children: const [
              Icon(Icons.check_circle, color: Colors.green),
              SizedBox(width: 8),
              Text('完了'),
            ],
          ),
          content: Text('$pokerName様に追加料金¥${amount.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}を追加しました'),
          actions: [
            ElevatedButton(
              onPressed: () => Navigator.of(dCtx).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    } else {
      final err = data['error'] ?? '不明なエラー';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('追加料金の登録に失敗しました: $err'),
          backgroundColor: Colors.red,
        ),
      );
    }
  } on TimeoutException {
    hideLoading();
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('処理がタイムアウトしました。しばらく待ってから再試行してください。'),
          backgroundColor: Colors.red,
          duration: Duration(seconds: 5),
        ),
      );
    }
  } catch (e) {
    hideLoading();
    if (context.mounted) {
      final msg = e.toString();
      String ui = '追加料金の登録に失敗しました';
      if (msg.contains('network')) {
        ui = 'ネットワークエラーが発生しました。接続を確認してください。';
      } else if (msg.contains('permission')) {
        ui = '権限が不足しています。管理者に連絡してください。';
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ui),
          backgroundColor: Colors.red,
          duration: const Duration(seconds: 5),
        ),
      );
    }
  } finally {
    hideLoading();
  }
}

