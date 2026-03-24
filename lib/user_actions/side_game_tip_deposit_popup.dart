import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

/// SideGame用Tip預入ポップアップ
Future<void> showSideGameTipDepositDialog({
  required BuildContext context,
  required String userId,
  required String pokerName,
  String? tableId,
  int? seatNumber,
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
    builder: (ctx) => _SideGameTipDepositDialog(
      userId: userId,
      pokerName: pokerName,
      tableId: tableId,
      seatNumber: seatNumber,
    ),
  );
}

class _SideGameTipDepositDialog extends StatefulWidget {
  final String userId;
  final String pokerName;
  final String? tableId;
  final int? seatNumber;

  const _SideGameTipDepositDialog({
    required this.userId,
    required this.pokerName,
    this.tableId,
    this.seatNumber,
  });

  @override
  State<_SideGameTipDepositDialog> createState() =>
      _SideGameTipDepositDialogState();
}

class _SideGameTipDepositDialogState extends State<_SideGameTipDepositDialog> {
  final TextEditingController _amountController = TextEditingController();
  bool _isLoading = false;
  num _currentTip = 0;
  // ✅ ダイアログが開いている間は固定の clientNonce（画面セッションで固定）
  late final String _clientNonce;

  @override
  void initState() {
    super.initState();
    // ダイアログが開いた時点で生成し、閉じるまで同じ値を使い回す
    _clientNonce = 'deposit_${DateTime.now().millisecondsSinceEpoch}_${widget.userId.substring(0, 8)}';
  }

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
          const Icon(Icons.account_balance, color: Colors.green),
          const SizedBox(width: 8),
          const Text('Tip預入'),
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

            // 預入額入力（StreamBuilderの外に移動）
            TextField(
              controller: _amountController,
              keyboardType: TextInputType.number,
              enabled: !_isLoading,
              decoration: const InputDecoration(
                labelText: '預入額',
                hintText: '預入するTip額を入力',
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
              : _canDeposit()
              ? () => _showConfirmDialog(false)
              : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.green,
            foregroundColor: Colors.white,
          ),
          child: const Text('預入のみ'),
        ),
        ElevatedButton(
          onPressed: _isLoading
              ? null
              : _canDeposit()
              ? () => _showConfirmDialog(true)
              : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.orange,
            foregroundColor: Colors.white,
          ),
          child: const Text('預入と退席'),
        ),
      ],
    );
  }

  bool _canDeposit() {
    final amount = int.tryParse(_amountController.text);
    return amount != null && amount > 0;
  }

  Future<void> _showConfirmDialog(bool shouldLeaveSeat) async {
    final amount = int.parse(_amountController.text);

    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('預入確認'),
        content: Text(
          '${widget.pokerName}様の${amount.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')} Tipの預入${shouldLeaveSeat ? 'と退席' : ''}で確定してよろしいですか？',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('キャンセル'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              _processDeposit(amount, shouldLeaveSeat);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: shouldLeaveSeat ? Colors.orange : Colors.green,
              foregroundColor: Colors.white,
            ),
            child: Text(shouldLeaveSeat ? '預入と退席' : '預入のみ'),
          ),
        ],
      ),
    );
  }

  Future<void> _processDeposit(int amount, bool shouldLeaveSeat) async {
    setState(() {
      _isLoading = true;
    });

    // 処理中ダイアログを表示
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        content: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(width: 16),
            Text(shouldLeaveSeat ? '預入と退席処理中...' : '預入処理中...'),
          ],
        ),
      ),
    );

    try {
      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('depositTip');

      // 1. Tip預入処理
      await callable.call({
        'userId': widget.userId,
        'amount': amount,
        'clientNonce': _clientNonce, // ✅ トップレベルに追加（ダイアログが開いている間は固定）
      });

      // 2. 退席処理が必要な場合
      if (shouldLeaveSeat) {
        if (widget.tableId != null && widget.seatNumber != null) {
          final leaveSeatCallable = functions.httpsCallable('leaveSeat');
          await leaveSeatCallable.call({
            'tableId': widget.tableId,
            'seatNumber': widget.seatNumber,
            'userId': widget.userId,
          });
        } else {
          throw Exception('退席処理に必要な情報が不足しています（tableId, seatNumber）');
        }
      }

      // 処理中ダイアログを閉じる
      Navigator.of(context).pop();

      if (mounted) {
        // 預入ポップアップを閉じる
        Navigator.of(context).pop();

        // 成功メッセージを表示
        await showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('処理完了'),
            content: Text(
              '${widget.pokerName}様の${amount.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')} Tipの預入処理${shouldLeaveSeat ? 'と退席処理' : ''}が完了しました。',
            ),
            actions: [
              ElevatedButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('OK'),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      // 処理中ダイアログを閉じる
      if (mounted) {
        Navigator.of(context).pop();

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('預入処理に失敗しました: $e'),
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
