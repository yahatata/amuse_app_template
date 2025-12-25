import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'chip_point_logs_page.dart';

/// 所持チップ・所持ポイント参照ポップアップ
Future<void> showChipPointViewDialog({
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
    builder: (ctx) => _ChipPointViewDialog(userId: userId, pokerName: pokerName),
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
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 500, maxHeight: 600),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ヘッダー
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(16),
                  topRight: Radius.circular(16),
                ),
              ),
              child: Row(
                children: const [
                  Icon(Icons.volunteer_activism, color: Colors.orange),
                  SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text(
                          '所持チップ',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          '所持ポイント',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
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
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
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
                    return Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
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
                      ),
                    );
                  }

                  final userData = snapshot.data!.data() as Map<String, dynamic>? ?? {};
                  final pointA = userData['pointA'] as num? ?? 0;
                  final pointB = userData['pointB'] as num? ?? 0;
                  final sideGameChip = userData['sideGameChip'] as num? ?? 0;

                  return SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Column(
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
                              const Icon(Icons.person, color: Colors.blue, size: 16),
                              const SizedBox(height: 4),
                              Text(
                                pokerName,
                                style: const TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.blue,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),

                        // PointA表示
                        _buildBalanceCard(
                          title: 'Point A',
                          amount: pointA.toInt(),
                          icon: Icons.account_balance_wallet,
                          color: Colors.blue,
                        ),
                        const SizedBox(height: 6),

                        // PointB表示
                        _buildBalanceCard(
                          title: 'Point B',
                          amount: pointB.toInt(),
                          icon: Icons.account_balance_wallet,
                          color: Colors.green,
                        ),
                        const SizedBox(height: 6),

                        // SideGameChip表示
                        _buildBalanceCard(
                          title: 'SideGame Chip',
                          amount: sideGameChip.toInt(),
                          icon: Icons.casino,
                          color: Colors.orange,
                        ),
                        const SizedBox(height: 10),

                        // Logs参照ボタン
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

  Widget _buildBalanceCard({
    required String title,
    required int amount,
    required IconData icon,
    required Color color,
  }) {
    // ColorからMaterialColorに変換するか、色を直接指定
    Color backgroundColor;
    Color borderColor;
    Color textColor;
    
    // 色に応じて適切なshadeを選択
    if (color == Colors.blue) {
      backgroundColor = Colors.blue.shade50;
      borderColor = Colors.blue.shade200;
      textColor = Colors.blue.shade700;
    } else if (color == Colors.green) {
      backgroundColor = Colors.green.shade50;
      borderColor = Colors.green.shade200;
      textColor = Colors.green.shade700;
    } else if (color == Colors.orange) {
      backgroundColor = Colors.orange.shade50;
      borderColor = Colors.orange.shade200;
      textColor = Colors.orange.shade700;
    } else {
      // デフォルト（色を薄く/濃くする）
      backgroundColor = color.withOpacity(0.1);
      borderColor = color.withOpacity(0.3);
      textColor = color;
    }
    
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: borderColor, width: 2),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 7,
                    color: textColor,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  amount.toString().replaceAllMapped(
                    RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'),
                    (Match m) => '${m[1]},',
                  ),
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

