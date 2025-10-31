import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

/// SideGame用Tip引き出しポップアップ
Future<void> showSideGameTipWithdrawDialog({
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
      ).showSnackBar(const SnackBar(content: Text('ユーザー識別子が見つかりません')));
    }
    return;
  }

  await showDialog<void>(
    context: context,
    barrierDismissible: true,
    builder: (ctx) =>
        _SideGameTipWithdrawDialog(userId: userId, pokerName: pokerName),
  );
}

class _SideGameTipWithdrawDialog extends StatefulWidget {
  final String userId;
  final String pokerName;

  const _SideGameTipWithdrawDialog({
    required this.userId,
    required this.pokerName,
  });

  @override
  State<_SideGameTipWithdrawDialog> createState() =>
      _SideGameTipWithdrawDialogState();
}

class _SideGameTipWithdrawDialogState
    extends State<_SideGameTipWithdrawDialog> {
  final TextEditingController _amountController = TextEditingController();
  bool _isLoading = false;
  num _currentTip = 0;

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Row(
        children: [
          const Icon(Icons.account_balance_wallet, color: Colors.red),
          const SizedBox(width: 8),
          const Text('Tip引き出し'),
        ],
      ),
      content: SizedBox(
        width: 300,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ユーザー情報と残高表示（StreamBuilderで分離）
            StreamBuilder<DocumentSnapshot>(
              stream: FirebaseFirestore.instance
                  .collection('users')
                  .doc(widget.userId)
                  .snapshots(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (snapshot.hasError ||
                    !snapshot.hasData ||
                    !snapshot.data!.exists) {
                  return Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.red.shade200),
                    ),
                    child: const Column(
                      children: [
                        Icon(Icons.error, color: Colors.red, size: 32),
                        SizedBox(height: 8),
                        Text(
                          'ユーザー情報の取得に失敗しました',
                          style: TextStyle(
                            fontSize: 16,
                            color: Colors.red,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  );
                }

                final userData = snapshot.data!.data() as Map<String, dynamic>;
                _currentTip = userData['sideGameChip'] as num? ?? 0;

                return Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
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
                        widget.pokerName,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: Colors.blue,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '現在の残高: ${_currentTip.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')} Tip',
                        style: const TextStyle(
                          fontSize: 14,
                          color: Colors.grey,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 20),

            // 引き出し額入力（StreamBuilderの外に移動）
            TextField(
              controller: _amountController,
              keyboardType: TextInputType.number,
              enabled: !_isLoading,
              decoration: const InputDecoration(
                labelText: '引き出し額',
                hintText: '引き出しするTip額を入力',
                suffixText: 'Tip',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.money),
              ),
              onChanged: (value) {
                setState(() {}); // ボタンの有効/無効を更新
              },
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.of(context).pop(),
          child: const Text('キャンセル'),
        ),
        ElevatedButton(
          onPressed: _isLoading
              ? null
              : _canWithdraw()
              ? _showConfirmDialog
              : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.red,
            foregroundColor: Colors.white,
          ),
          child: _isLoading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                )
              : const Text('引き出し確定'),
        ),
      ],
    );
  }

  bool _canWithdraw() {
    final amount = int.tryParse(_amountController.text);
    return amount != null && amount > 0;
  }

  Future<void> _showConfirmDialog() async {
    final amount = int.parse(_amountController.text);

    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('引き出し確認'),
        content: Text(
          '${widget.pokerName}様の${amount.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')} Tipの引き出し処理を開始してよろしいですか？',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('キャンセル'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              _processWithdraw(amount);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('確定'),
          ),
        ],
      ),
    );
  }

  Future<void> _processWithdraw(int amount) async {
    setState(() {
      _isLoading = true;
    });

    // 処理中ダイアログを表示
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => const AlertDialog(
        content: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(width: 16),
            Text('引き出し処理中...'),
          ],
        ),
      ),
    );

    try {
      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('withdrawTip');

      final result = await callable.call({
        'userId': widget.userId,
        'amount': amount,
      });

      // 処理中ダイアログを閉じる
      Navigator.of(context).pop();

      if (mounted) {
        // 引き出しポップアップを閉じる
        Navigator.of(context).pop();

        // 成功メッセージを表示
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '引き出し処理が完了しました${widget.pokerName}様に${amount.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}のTipをお渡しください。',
            ),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 5),
          ),
        );
      }
    } catch (e) {
      // 処理中ダイアログを閉じる
      if (mounted) {
        Navigator.of(context).pop();

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('引き出し処理に失敗しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }
}
