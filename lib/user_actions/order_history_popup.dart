import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:async';
import '../globalConstant.dart';

/// 注文履歴参照ポップアップ
Future<void> showOrderHistoryDialog({
  required BuildContext context,
  required String userId,
  required String pokerName,
}) async {
  final outerCtx = context;

  if (userId.isEmpty) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(outerCtx).showSnackBar(
        const SnackBar(content: Text('ユーザー識別子が見つかりません')),
      );
    }
    return;
  }

  await showDialog<void>(
    context: context,
    barrierDismissible: true,
    builder: (ctx) => _OrderHistoryDialog(userId: userId, pokerName: pokerName),
  );
}

class _OrderHistoryDialog extends StatelessWidget {
  final String userId;
  final String pokerName;

  const _OrderHistoryDialog({
    required this.userId,
    required this.pokerName,
  });

  String _getBusinessDate() {
    final now = DateTime.now();
    final closeHour = GlobalConstants.normalizeStoreCloseHour(GlobalConstants.STORE_CLOSE_HOUR);
    
    if (now.hour < closeHour) {
      final businessDate = now.subtract(const Duration(days: 1));
      return businessDate.toIso8601String().split('T')[0];
    } else {
      return now.toIso8601String().split('T')[0];
    }
  }

  @override
  Widget build(BuildContext context) {
    final businessDate = _getBusinessDate();

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 800, maxHeight: 600),
        child: Column(
          children: [
            // ヘッダー
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.indigo.shade50,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.receipt_long, color: Colors.indigo),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '注文履歴 - $pokerName',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            // 注文一覧
            Expanded(
              child: StreamBuilder<QuerySnapshot>(
                stream: FirebaseFirestore.instance
                    .collection('bills')
                    .where('party.userId', isEqualTo: userId)
                    .where('businessDate', isEqualTo: businessDate)
                    .snapshots(),
                builder: (context, billsSnapshot) {
                  if (billsSnapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }

                  if (billsSnapshot.hasError) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.error, color: Colors.red, size: 48),
                          const SizedBox(height: 16),
                          Text(
                            'エラーが発生しました',
                            style: TextStyle(
                              fontSize: 16,
                              color: Colors.red[700],
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            billsSnapshot.error.toString(),
                            style: const TextStyle(fontSize: 14),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    );
                  }

                  if (!billsSnapshot.hasData || billsSnapshot.data!.docs.isEmpty) {
                    return const Center(
                      child: Text('当日の注文履歴がありません'),
                    );
                  }

                  // 全てのbillsからitemsを取得
                  final List<Map<String, dynamic>> allItems = [];
                  
                  for (final billDoc in billsSnapshot.data!.docs) {
                    final billId = billDoc.id;
                    // itemsサブコレクションを取得（非同期のため、StreamBuilderを使用）
                  }

                  // StreamBuilderでitemsを取得
                  return StreamBuilder<List<Map<String, dynamic>>>(
                    stream: _getAllItemsStream(billsSnapshot.data!.docs),
                    builder: (context, itemsSnapshot) {
                      if (itemsSnapshot.connectionState == ConnectionState.waiting) {
                        return const Center(child: CircularProgressIndicator());
                      }

                      if (itemsSnapshot.hasError) {
                        return Center(
                          child: Text('エラー: ${itemsSnapshot.error}'),
                        );
                      }

                      final items = itemsSnapshot.data ?? [];
                      
                      if (items.isEmpty) {
                        return const Center(
                          child: Text('当日の注文履歴がありません'),
                        );
                      }

                      // orderedAtでソート（最新が上）
                      items.sort((a, b) {
                        final aTime = a['orderedAt'] as Timestamp?;
                        final bTime = b['orderedAt'] as Timestamp?;
                        if (aTime == null && bTime == null) return 0;
                        if (aTime == null) return 1;
                        if (bTime == null) return -1;
                        return bTime.compareTo(aTime);
                      });

                      // businessDateをYYYYMMDD形式に変換
                      final orderDocId = businessDate.replaceAll('-', '');

                      return ListView.builder(
                        padding: const EdgeInsets.all(8),
                        itemCount: items.length,
                        itemBuilder: (context, index) {
                          final item = items[index];
                          final itemId = item['itemId'] as String? ?? '';
                          final name = item['name'] as String? ?? '';
                          final quantity = item['quantity'] as num? ?? 0;
                          final unitPriceIncl = item['unitPriceIncl'] as num? ?? 0;
                          final totalPriceIncl = item['totalPriceIncl'] as num? ?? 0;
                          final orderedAt = item['orderedAt'] as Timestamp?;
                          
                          String formattedDate = '日時不明';
                          if (orderedAt != null) {
                            final date = orderedAt.toDate();
                            formattedDate = '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
                          }

                          return Card(
                            margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            child: StreamBuilder<DocumentSnapshot>(
                              stream: itemId.isNotEmpty
                                  ? FirebaseFirestore.instance
                                      .collection('orders')
                                      .doc(orderDocId)
                                      .collection('_TodaysOrders')
                                      .doc(itemId)
                                      .snapshots()
                                  : null,
                              builder: (context, statusSnapshot) {
                                String statusText = '';
                                Color statusColor = Colors.grey;
                                
                                if (statusSnapshot.hasData && statusSnapshot.data!.exists) {
                                  final statusData = statusSnapshot.data!.data() as Map<String, dynamic>?;
                                  final status = statusData?['status'] as String? ?? '';
                                  switch (status) {
                                    case 'served':
                                      statusText = '提供済み';
                                      statusColor = Colors.green;
                                      break;
                                    case 'preparing':
                                      statusText = '準備中';
                                      statusColor = Colors.orange;
                                      break;
                                    case 'cancel':
                                      statusText = 'キャンセル';
                                      statusColor = Colors.red;
                                      break;
                                    default:
                                      statusText = status;
                                      break;
                                  }
                                }

                                return ListTile(
                                  leading: const Icon(Icons.restaurant, color: Colors.indigo),
                                  title: Text(
                                    name,
                                    style: const TextStyle(fontWeight: FontWeight.bold),
                                  ),
                                  subtitle: Text('数量: $quantity  単価: ¥${unitPriceIncl.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}'),
                                  trailing: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      if (statusText.isNotEmpty)
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                          decoration: BoxDecoration(
                                            color: statusColor.withOpacity(0.1),
                                            borderRadius: BorderRadius.circular(4),
                                            border: Border.all(color: statusColor),
                                          ),
                                          child: Text(
                                            statusText,
                                            style: TextStyle(
                                              fontSize: 12,
                                              color: statusColor,
                                              fontWeight: FontWeight.bold,
                                            ),
                                          ),
                                        ),
                                      const SizedBox(width: 8),
                                      Column(
                                        mainAxisAlignment: MainAxisAlignment.center,
                                        crossAxisAlignment: CrossAxisAlignment.end,
                                        children: [
                                          Text(
                                            '¥${totalPriceIncl.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                                            style: const TextStyle(
                                              fontSize: 16,
                                              fontWeight: FontWeight.bold,
                                              color: Colors.indigo,
                                            ),
                                          ),
                                          Text(
                                            formattedDate,
                                            style: const TextStyle(
                                              fontSize: 12,
                                              color: Colors.grey,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                          );
                        },
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Stream<List<Map<String, dynamic>>> _getAllItemsStream(List<QueryDocumentSnapshot> bills) async* {
    if (bills.isEmpty) {
      yield [];
      return;
    }

    // 全てのbillsのitemsサブコレクションを取得
    final List<Map<String, dynamic>> allItems = [];
    
    for (final billDoc in bills) {
      final billId = billDoc.id;
      final itemsSnapshot = await FirebaseFirestore.instance
          .collection('bills')
          .doc(billId)
          .collection('items')
          .get();
      
      for (final itemDoc in itemsSnapshot.docs) {
        final data = itemDoc.data() as Map<String, dynamic>;
        allItems.add({
          ...data,
          'billId': billId,
          'itemId': itemDoc.id, // ドキュメントIDを追加
        });
      }
    }

    yield allItems;
    
    // リアルタイム更新のために各billのitemsを監視
    final controllers = bills.map((billDoc) {
      final billId = billDoc.id;
      return FirebaseFirestore.instance
          .collection('bills')
          .doc(billId)
          .collection('items')
          .snapshots();
    }).toList();

    await for (final snapshots in _combineStreams(controllers)) {
      final List<Map<String, dynamic>> updatedItems = [];
      for (int i = 0; i < snapshots.length; i++) {
        final billId = bills[i].id;
        for (final doc in snapshots[i].docs) {
          final data = doc.data() as Map<String, dynamic>;
          updatedItems.add({
            ...data,
            'billId': billId,
            'itemId': doc.id, // ドキュメントIDを追加
          });
        }
      }
      yield updatedItems;
    }
  }

  Stream<List<QuerySnapshot>> _combineStreams(List<Stream<QuerySnapshot>> streams) {
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

