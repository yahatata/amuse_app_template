import 'package:amuse_app_template/user/balance_display.dart';
import 'package:amuse_app_template/user/point_ids.dart';
import 'package:amuse_app_template/user/user_balances.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'chip_point_logs_page.dart';
import 'package:amuse_app_template/user_actions/user_action_validation_messages.dart';
import 'package:amuse_app_template/user_actions/user_action_load_errors.dart';

/// 所持チップ・所持ポイント参照ポップアップ（A-7: 有効残高のみ・config 表示名）
Future<void> showChipPointViewDialog({
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
    builder: (ctx) =>
        _ChipPointViewDialog(userId: userId, pokerName: pokerName),
  );
}

class _ChipPointViewDialog extends StatelessWidget {
  final String userId;
  final String pokerName;

  const _ChipPointViewDialog({
    required this.userId,
    required this.pokerName,
  });

  @override
  Widget build(BuildContext context) {
    final enabledIds = enabledBalanceIdsFromStoreConfig();

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 500, maxHeight: 600),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
              ),
              child: const Row(
                children: [
                  Icon(Icons.volunteer_activism, color: Colors.orange),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '所持残高',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Flexible(
              child: StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                stream: FirebaseFirestore.instance
                    .collection('users')
                    .doc(userId)
                    .snapshots(),
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }

                  if (snapshot.hasError) {
                    return Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        userActionStreamErrorMessage(
                          kUserActionUserDocLoadFailedMessage,
                          snapshot.error,
                        ),
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.red[700],
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    );
                  }

                  if (!snapshot.hasData || !snapshot.data!.exists) {
                    return const Padding(
                      padding: EdgeInsets.all(16),
                      child: Text('ユーザー情報が見つかりません'),
                    );
                  }

                  final userData =
                      snapshot.data!.data() as Map<String, dynamic>? ?? {};

                  if (enabledIds.isEmpty) {
                    return const Padding(
                      padding: EdgeInsets.all(16),
                      child: Text('表示可能な残高がありません'),
                    );
                  }

                  return SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
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
                              const Icon(Icons.person,
                                  color: Colors.blue, size: 16),
                              const SizedBox(height: 4),
                              Text(
                                pokerName,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.blue,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),
                        for (final id in enabledIds) ...[
                          _buildBalanceCard(
                            title: balanceDisplayName(id),
                            displayAmount:
                                formatBalanceFieldDisplay(userData, id),
                            icon: id == kSideGameChipId
                                ? Icons.casino
                                : Icons.account_balance_wallet,
                            color: id == kSideGameChipId
                                ? Colors.orange
                                : Colors.blue,
                            corrupt: readBalanceField(userData, id).kind ==
                                BalanceReadKind.corrupt,
                          ),
                          const SizedBox(height: 6),
                        ],
                        const SizedBox(height: 4),
                        ElevatedButton.icon(
                          onPressed: () {
                            Navigator.of(context).pop();
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (ctx) => ChipPointLogsPage(
                                  userId: userId,
                                  pokerName: pokerName,
                                ),
                              ),
                            );
                          },
                          icon: const Icon(Icons.history),
                          label: const Text('履歴を参照'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.orange,
                            foregroundColor: Colors.white,
                            minimumSize: const Size(double.infinity, 48),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
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

  Widget _buildBalanceCard({
    required String title,
    required String displayAmount,
    required IconData icon,
    required Color color,
    required bool corrupt,
  }) {
    return Card(
      elevation: 1,
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.12),
          child: Icon(icon, color: color),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
        trailing: Text(
          displayAmount,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: corrupt ? Colors.red : color,
          ),
        ),
      ),
    );
  }
}
