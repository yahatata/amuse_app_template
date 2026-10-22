import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/user_actions/user_action_validation_messages.dart';
import 'package:amuse_app_template/user_actions/user_action_load_errors.dart';

/// 現在の座席確認ダイアログ
Future<void> showCurrentSeatDialog({
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
    builder: (ctx) => _CurrentSeatDialog(billId: billId, pokerName: pokerName),
  );
}

class _CurrentSeatDialog extends StatelessWidget {
  final String billId;
  final String pokerName;

  const _CurrentSeatDialog({
    required this.billId,
    required this.pokerName,
  });

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
                color: Colors.purple.shade50,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
              ),
              child: Row(
                children: const [
                  Icon(Icons.event_seat, color: Colors.purple),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '現在の座席確認',
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

                  final billData = billSnapshot.data!.data()!;
                  final place = billData['place'] as Map<String, dynamic>? ?? {};
                  final tableId = place['table'] as String?;
                  final seat = place['seat'] as num?;

                  return SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // ユーザー名
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                            vertical: 12,
                            horizontal: 16,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.blue.shade50,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: Colors.blue.shade200),
                          ),
                          child: Column(
                            children: [
                              const Icon(Icons.person, color: Colors.blue, size: 32),
                              const SizedBox(height: 8),
                              Text(
                                pokerName,
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.blue,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 20),
                        // 座席情報
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: Colors.purple.shade50,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: Colors.purple.shade200, width: 2),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                '現在の座席',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  const Icon(Icons.table_restaurant, color: Colors.purple),
                                  const SizedBox(width: 8),
                                  Text(
                                    'テーブル: ${tableId ?? '未設定'}',
                                    style: const TextStyle(fontSize: 16),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  const Icon(Icons.event_seat, color: Colors.purple),
                                  const SizedBox(width: 8),
                                  Text(
                                    '席: ${seat != null ? seat.toString() : '未設定'}',
                                    style: const TextStyle(fontSize: 16),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        // テーブルステータス（tableIdがnullでない場合）
                        if (tableId != null) ...[
                          const SizedBox(height: 16),
                          StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                            stream: FirebaseFirestore.instance
                                .collection('tables')
                                .doc(tableId)
                                .snapshots(),
                            builder: (context, tableSnapshot) {
                              if (tableSnapshot.connectionState == ConnectionState.waiting) {
                                return const Center(child: CircularProgressIndicator());
                              }

                              if (!tableSnapshot.hasData || !tableSnapshot.data!.exists) {
                                return Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                    color: Colors.grey.shade100,
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(color: Colors.grey.shade300),
                                  ),
                                  child: const Text(
                                    'テーブル情報が見つかりません',
                                    style: TextStyle(fontSize: 14),
                                  ),
                                );
                              }

                              final tableData = tableSnapshot.data!.data()!;
                              final status = tableData['status'] as String? ?? '不明';

                              return Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: Colors.orange.shade50,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: Colors.orange.shade200, width: 2),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'テーブルステータス',
                                      style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                    Row(
                                      children: [
                                        const Icon(Icons.info, color: Colors.orange),
                                        const SizedBox(width: 8),
                                        Text(
                                          'ステータス: $status',
                                          style: const TextStyle(fontSize: 16),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                        ],
                      ],
                    ),
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
}

