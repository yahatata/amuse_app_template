import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/user_actions/user_action_validation_messages.dart';
import 'package:amuse_app_template/user_actions/user_action_load_errors.dart';

/// SideGame用chip参照ポップアップ
Future<void> showSideGameChipViewDialog({
  required BuildContext context,
  required String userId,
  required String pokerName,
}) async {
  // 外側（ページ側）のコンテキストを退避。以降のUI操作は必ずこれを使う
  final outerCtx = context;

  if (userId.isEmpty) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(
        outerCtx,
      ).showSnackBar(SnackBar(content: Text(kUserActionUserIdMissingMessage)));
    }
    return;
  }

  await showDialog<void>(
    context: context,
    barrierDismissible: true,
    builder: (ctx) =>
        _SideGameChipViewDialog(userId: userId, pokerName: pokerName),
  );
}

class _SideGameChipViewDialog extends StatelessWidget {
  final String userId;
  final String pokerName;

  const _SideGameChipViewDialog({required this.userId, required this.pokerName});

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Row(
        children: [
          const Icon(Icons.account_balance_wallet, color: Colors.orange),
          const SizedBox(width: 8),
          const Text('chip残高'),
        ],
      ),
      content: StreamBuilder<DocumentSnapshot>(
        stream: FirebaseFirestore.instance
            .collection('users')
            .doc(userId)
            .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error, color: Colors.red, size: 48),
                const SizedBox(height: 16),
                Text(
                  userActionStreamErrorMessage(
                    kUserActionUserDocLoadFailedMessage,
                    snapshot.error,
                  ),
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.red[700],
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            );
          }

          if (!snapshot.hasData || !snapshot.data!.exists) {
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.person_off, color: Colors.grey, size: 48),
                const SizedBox(height: 16),
                Text(
                  'ユーザー情報が見つかりません',
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.grey[700],
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            );
          }

          final userData = snapshot.data!.data() as Map<String, dynamic>;
          final sideGameChip = userData['sideGameChip'] as num? ?? 0;

          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // ユーザー名表示
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

              // chip残高表示
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  vertical: 20,
                  horizontal: 16,
                ),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.orange.shade200, width: 2),
                ),
                child: Column(
                  children: [
                    const Icon(
                      Icons.account_balance_wallet,
                      color: Colors.orange,
                      size: 40,
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      '現在のchip残高',
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.grey,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${sideGameChip.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                      style: const TextStyle(
                        fontSize: 32,
                        fontWeight: FontWeight.bold,
                        color: Colors.orange,
                      ),
                    ),
                    const Text(
                      'chip',
                      style: TextStyle(
                        fontSize: 16,
                        color: Colors.orange,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('閉じる'),
        ),
      ],
    );
  }
}
