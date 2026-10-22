import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/user_actions/user_action_validation_messages.dart';
import 'package:amuse_app_template/user_actions/user_action_load_errors.dart';
import 'package:amuse_app_template/user_actions/action_feedback_dialogs.dart';
import 'package:amuse_app_template/user_actions/side_game_dialog_layout.dart';

/// SideGame用chip引き出しポップアップ
Future<void> showSideGameChipWithdrawDialog({
  required BuildContext context,
  required String userId,
  required String pokerName,
}) async {
  final outerCtx = context;

  if (userId.isEmpty) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(
        outerCtx,
      ).showSnackBar(SnackBar(content: Text(kUserActionUserIdMissingMessage)));
    }
    return;
  }

  final amount = await showDialog<int>(
    context: context,
    barrierDismissible: true,
    builder: (ctx) =>
        _SideGameChipWithdrawDialog(userId: userId, pokerName: pokerName),
  );

  if (amount == null || !outerCtx.mounted) return;

  ScaffoldMessenger.of(outerCtx).showSnackBar(
    SnackBar(
      content: Text(
        '引き出し処理が完了しました${pokerName}様に${amount.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}のchipをお渡しください。',
      ),
      backgroundColor: Colors.green,
      duration: const Duration(seconds: 5),
    ),
  );
}

class _SideGameChipWithdrawDialog extends StatefulWidget {
  final String userId;
  final String pokerName;

  const _SideGameChipWithdrawDialog({
    required this.userId,
    required this.pokerName,
  });

  @override
  State<_SideGameChipWithdrawDialog> createState() =>
      _SideGameChipWithdrawDialogState();
}

class _SideGameChipWithdrawDialogState
    extends State<_SideGameChipWithdrawDialog> {
  final TextEditingController _amountController = TextEditingController();
  bool _isLoading = false;
  num _currentChip = 0;
  late final String _clientNonce;

  @override
  void initState() {
    super.initState();
    _clientNonce =
        'withdraw_${DateTime.now().millisecondsSinceEpoch}_${widget.userId.substring(0, 8)}';
  }

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return PopScope(
      canPop: !_isLoading,
      child: Stack(
        children: [
          AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.account_balance_wallet, color: Colors.red),
                SizedBox(width: 8),
                Text('chip引き出し'),
              ],
            ),
            content: SideGameDialogScrollableContent(
              maxWidth: 300,
              maxHeight: sideGameAlertDialogContentMaxHeight(context),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
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

                      final userData =
                          snapshot.data!.data() as Map<String, dynamic>;
                      _currentChip = userData['sideGameChip'] as num? ?? 0;

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
                              '現在の残高: ${_currentChip.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')} chip',
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
                  TextField(
                    controller: _amountController,
                    keyboardType: TextInputType.number,
                    enabled: !_isLoading,
                    decoration: const InputDecoration(
                      labelText: '引き出すchip額',
                      hintText: '引き出すchip額を入力',
                      suffixText: 'chip',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.money),
                    ),
                    onChanged: (_) => setState(() {}),
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
                onPressed: _isLoading || !_canWithdraw()
                    ? null
                    : _showConfirmDialog,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  foregroundColor: Colors.white,
                ),
                child: const Text('引き出す'),
              ),
            ],
          ),
          if (_isLoading)
            Positioned(
              left: 0,
              top: 0,
              width: size.width,
              height: size.height,
              child: AbsorbPointer(
                child: ColoredBox(
                  color: Colors.black.withValues(alpha: 0.35),
                  child: const Center(child: CircularProgressIndicator()),
                ),
              ),
            ),
        ],
      ),
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
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('引き出し確認'),
        content: Text(
          '${widget.pokerName}様の${amount.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')} chipを引き出しますか？',
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
            child: const Text('引き出す'),
          ),
        ],
      ),
    );
  }

  Future<void> _processWithdraw(int amount) async {
    if (_isLoading) return;
    setState(() => _isLoading = true);

    Object? error;
    var succeeded = false;
    int? newBalance;
    try {
      final functions = FunctionsClient.instance;
      final result = await functions.httpsCallable('withdrawChip').call({
        'userId': widget.userId,
        'amount': amount,
        'clientNonce': _clientNonce,
      });
      // USER-53: success==true のときのみ残高更新・完了
      if (isCallableSuccessResponse(result.data)) {
        succeeded = true;
        final data = result.data;
        if (data is Map) {
          final inner = data['data'];
          if (inner is Map && inner['newBalance'] is num) {
            newBalance = (inner['newBalance'] as num).toInt();
          }
        }
      } else {
        error = null;
        if (mounted) {
          setState(() => _isLoading = false);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(mapCallableSoftFailMessage(result.data)),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }
    } catch (e) {
      error = e;
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }

    if (!mounted) return;
    if (!succeeded) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error != null
                ? buildAsyncActionErrorMessage(
                    error,
                    defaultMessage: kUserActionWithdrawFailedMessage,
                  )
                : kUserActionWithdrawFailedMessage,
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (newBalance != null) {
      setState(() => _currentChip = newBalance!);
    }
    Navigator.of(context).pop(amount);
  }
}
