import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// プロフィール参照ポップアップ
Future<void> showProfileDialog({
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
    builder: (ctx) => _ProfileDialog(userId: userId, pokerName: pokerName),
  );
}

class _ProfileDialog extends StatelessWidget {
  final String userId;
  final String pokerName;

  const _ProfileDialog({
    required this.userId,
    required this.pokerName,
  });

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 600, maxHeight: 700),
        child: Column(
          children: [
            // ヘッダー
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.brown.shade50,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.account_circle, color: Colors.brown),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'プロフィール - $pokerName',
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
            // プロフィール情報
            Expanded(
              child: StreamBuilder<DocumentSnapshot>(
                stream: FirebaseFirestore.instance
                    .collection('users')
                    .doc(userId)
                    .snapshots(),
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }

                  if (snapshot.hasError) {
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
                            snapshot.error.toString(),
                            style: const TextStyle(fontSize: 14),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    );
                  }

                  if (!snapshot.hasData || !snapshot.data!.exists) {
                    return const Center(
                      child: Text('ユーザー情報が見つかりません'),
                    );
                  }

                  final userData = snapshot.data!.data() as Map<String, dynamic>;
                  final pointA = userData['pointA'] as num? ?? 0;
                  final pointB = userData['pointB'] as num? ?? 0;
                  final sideGameChip = userData['sideGameChip'] as num? ?? 0;
                  final birthMonthDay = userData['birthMonthDay'] as String? ?? '';
                  final email = userData['email'] as String? ?? '';
                  final createdAt = userData['createdAt'] as Timestamp?;
                  final lastLogin = userData['lastLogin'] as Timestamp?;

                  String formatDate(Timestamp? timestamp) {
                    if (timestamp == null) return '未設定';
                    final date = timestamp.toDate();
                    return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
                  }

                  return SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildInfoRow('Poker Name', pokerName),
                        const SizedBox(height: 12),
                        _buildInfoRow('Point A', pointA.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')),
                        const SizedBox(height: 12),
                        _buildInfoRow('Point B', pointB.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')),
                        const SizedBox(height: 12),
                        _buildInfoRow('SideGame Chip', sideGameChip.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')),
                        const SizedBox(height: 12),
                        _buildInfoRow('生年月日', birthMonthDay.isEmpty ? '未設定' : birthMonthDay),
                        const SizedBox(height: 12),
                        _buildInfoRow('Email', email.isEmpty ? '未設定' : email),
                        const SizedBox(height: 12),
                        _buildInfoRow('アカウント作成日', formatDate(createdAt)),
                        const SizedBox(height: 12),
                        _buildInfoRow('最終ログイン', formatDate(lastLogin)),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: Colors.grey.shade700,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 14,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

