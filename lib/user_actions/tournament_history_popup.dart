import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:async';
import 'package:intl/intl.dart';
import 'package:amuse_app_template/user_actions/user_action_validation_messages.dart';
import 'package:amuse_app_template/user_actions/user_action_load_errors.dart';

/// トーナメント履歴参照ポップアップ
Future<void> showTournamentHistoryDialog({
  required BuildContext context,
  required String userId,
  required String pokerName,
}) async {
  final outerCtx = context;

  if (userId.isEmpty) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(outerCtx).showSnackBar(
        SnackBar(content: Text(kUserActionUserIdMissingMessage)),
      );
    }
    return;
  }

  await showDialog<void>(
    context: context,
    barrierDismissible: true,
    builder: (ctx) => _TournamentHistoryDialog(userId: userId, pokerName: pokerName),
  );
}

class _TournamentHistoryDialog extends StatelessWidget {
  final String userId;
  final String pokerName;

  const _TournamentHistoryDialog({
    required this.userId,
    required this.pokerName,
  });

  @override
  Widget build(BuildContext context) {
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
                color: Colors.redAccent.withOpacity(0.1),
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.emoji_events, color: Colors.redAccent),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'トーナメント履歴 - $pokerName',
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
            // トーナメント一覧
            Expanded(
              child: StreamBuilder<DocumentSnapshot>(
                stream: FirebaseFirestore.instance
                    .collection('storeMeta')
                    .doc('currentBusinessDay')
                    .snapshots(),
                builder: (context, stateSnapshot) {
                  if (!stateSnapshot.hasData) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  
                  final stateData = stateSnapshot.data?.data() as Map<String, dynamic>?;
                  final status = stateData?['status'] as String?;
                  final currentBusinessDateKey = stateData?['currentBusinessDateKey'] as String?;
                  
                  // 閉店中の場合は、現在の日時が属する日付をbusinessDateとして使用
                  final businessDateKey = (status == 'running' && currentBusinessDateKey != null)
                      ? currentBusinessDateKey
                      : DateFormat('yyyy-MM-dd').format(DateTime.now());
                  
                  return StreamBuilder<QuerySnapshot>(
                    stream: FirebaseFirestore.instance
                        .collection('bills')
                        .where('party.userId', isEqualTo: userId)
                        .where('businessDate', isEqualTo: businessDateKey)
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
                                userActionStreamErrorMessage(
                                  kUserActionTournamentHistoryLoadFailedMessage,
                                  billsSnapshot.error,
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

                      if (!billsSnapshot.hasData || billsSnapshot.data!.docs.isEmpty) {
                        return const Center(
                          child: Text('当日のトーナメント履歴がありません'),
                        );
                      }

                      // StreamBuilderでtournamentsを取得
                      return StreamBuilder<List<Map<String, dynamic>>>(
                        stream: _getAllTournamentsStream(billsSnapshot.data!.docs),
                        builder: (context, tournamentsSnapshot) {
                          if (tournamentsSnapshot.connectionState == ConnectionState.waiting) {
                            return const Center(child: CircularProgressIndicator());
                          }

                          if (tournamentsSnapshot.hasError) {
                            // USER-73: 失敗 ≠ 空履歴
                            return Center(
                              child: Text(
                                userActionStreamErrorMessage(
                                  kUserActionTournamentHistoryLoadFailedMessage,
                                  tournamentsSnapshot.error,
                                ),
                                textAlign: TextAlign.center,
                              ),
                            );
                          }

                          final tournaments = tournamentsSnapshot.data ?? [];
                          
                          if (tournaments.isEmpty) {
                            return const Center(
                              child: Text('当日のトーナメント履歴がありません'),
                            );
                          }

                          return ListView.builder(
                            padding: const EdgeInsets.all(8),
                            itemCount: tournaments.length,
                            itemBuilder: (context, index) {
                              final tournament = tournaments[index];
                              final templateName = tournament['templateName'] as String? ?? '';
                              final entryFeeIncl = tournament['entryFeeIncl'] as num? ?? 0;
                              final entryCount = tournament['entryCount'] as num? ?? 0;
                              final reentryFeeIncl = tournament['reentryFeeIncl'] as num? ?? 0;
                              final reentryCount = tournament['reentryCount'] as num? ?? 0;
                              final addonFeeIncl = tournament['addonFeeIncl'] as num? ?? 0;
                              final addonCount = tournament['addonCount'] as num? ?? 0;

                              final totalAmount = (entryFeeIncl * entryCount) +
                                  (reentryFeeIncl * reentryCount) +
                                  (addonFeeIncl * addonCount);

                              return Card(
                                margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                child: Padding(
                                  padding: const EdgeInsets.all(16),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          const Icon(Icons.emoji_events, color: Colors.redAccent),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: Text(
                                              templateName,
                                              style: const TextStyle(
                                                fontSize: 18,
                                                fontWeight: FontWeight.bold,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 12),
                                      if (entryCount > 0)
                                        Padding(
                                          padding: const EdgeInsets.only(bottom: 4),
                                          child: Text(
                                            'エントリー: ¥${(entryFeeIncl * entryCount).toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                                            style: const TextStyle(fontSize: 14),
                                          ),
                                        ),
                                      if (reentryCount > 0)
                                        Padding(
                                          padding: const EdgeInsets.only(bottom: 4),
                                          child: Text(
                                            'リエントリー: ¥${(reentryFeeIncl * reentryCount).toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')} (${reentryCount.toInt()}回)',
                                            style: const TextStyle(fontSize: 14),
                                          ),
                                        ),
                                      if (addonCount > 0)
                                        Padding(
                                          padding: const EdgeInsets.only(bottom: 4),
                                          child: Text(
                                            'addon: ¥${(addonFeeIncl * addonCount).toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')} (${addonCount.toInt()}回)',
                                            style: const TextStyle(fontSize: 14),
                                          ),
                                        ),
                                      const Divider(),
                                      Padding(
                                        padding: const EdgeInsets.only(top: 4),
                                        child: Text(
                                          '合計金額: ¥${totalAmount.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                                          style: const TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.bold,
                                            color: Colors.redAccent,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
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

  Stream<List<Map<String, dynamic>>> _getAllTournamentsStream(List<QueryDocumentSnapshot> bills) async* {
    if (bills.isEmpty) {
      yield [];
      return;
    }

    // 全てのbillsのtournamentsサブコレクションを取得
    final List<Map<String, dynamic>> allTournaments = [];
    
    for (final billDoc in bills) {
      final billId = billDoc.id;
      final tournamentsSnapshot = await FirebaseFirestore.instance
          .collection('bills')
          .doc(billId)
          .collection('tournaments')
          .get();
      
      for (final tournamentDoc in tournamentsSnapshot.docs) {
        final data = tournamentDoc.data() as Map<String, dynamic>;
        allTournaments.add({
          ...data,
          'billId': billId,
        });
      }
    }

    yield allTournaments;
    
    // リアルタイム更新のために各billのtournamentsを監視
    final controllers = bills.map((billDoc) {
      final billId = billDoc.id;
      return FirebaseFirestore.instance
          .collection('bills')
          .doc(billId)
          .collection('tournaments')
          .snapshots();
    }).toList();

    await for (final snapshots in _combineStreams(controllers)) {
      final List<Map<String, dynamic>> updatedTournaments = [];
      for (int i = 0; i < snapshots.length; i++) {
        final billId = bills[i].id;
        for (final doc in snapshots[i].docs) {
          final data = doc.data() as Map<String, dynamic>;
          updatedTournaments.add({
            ...data,
            'billId': billId,
          });
        }
      }
      yield updatedTournaments;
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

