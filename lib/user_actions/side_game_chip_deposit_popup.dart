import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/user_actions/user_action_validation_messages.dart';
import 'package:amuse_app_template/user_actions/user_action_load_errors.dart';
import 'package:amuse_app_template/user_actions/side_game_dialog_layout.dart';

/// SideGame用chip預入ポップアップ
Future<void> showSideGameChipDepositDialog({
  required BuildContext context,
  required String userId,
  required String pokerName,
  String? tableId,
  int? seatNumber,
  bool closeUserActionMenuOnLeaveSuccess = false,
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

  final result = await showDialog<_DepositResult>(
    context: context,
    barrierDismissible: true,
    builder: (ctx) => _SideGameChipDepositDialog(
      userId: userId,
      pokerName: pokerName,
      tableId: tableId,
      seatNumber: seatNumber,
    ),
  );

  if (result == null || !outerCtx.mounted) return;

  await showDialog<void>(
    context: outerCtx,
    builder: (ctx) => AlertDialog(
      title: const Text('処理完了'),
      content: Text(
        '${pokerName}様の${result.amount.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')} chipの預入処理${result.leftSeat ? 'と退席処理' : ''}が完了しました。',
      ),
      actions: [
        ElevatedButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child: const Text('OK'),
        ),
      ],
    ),
  );

  if (shouldCloseUserActionMenuAfterLeave(
        operationSucceeded: true,
        leftSeat: result.leftSeat,
      ) &&
      closeUserActionMenuOnLeaveSuccess &&
      outerCtx.mounted) {
    Navigator.of(outerCtx).pop();
  }
}

class _DepositResult {
  final int amount;
  final bool leftSeat;
  const _DepositResult({required this.amount, required this.leftSeat});
}

class _SideGameChipDepositDialog extends StatefulWidget {
  final String userId;
  final String pokerName;
  final String? tableId;
  final int? seatNumber;

  const _SideGameChipDepositDialog({
    required this.userId,
    required this.pokerName,
    this.tableId,
    this.seatNumber,
  });

  @override
  State<_SideGameChipDepositDialog> createState() =>
      _SideGameChipDepositDialogState();
}

class _SideGameChipDepositDialogState extends State<_SideGameChipDepositDialog> {
  final TextEditingController _amountController = TextEditingController();
  bool _isLoading = false;
  num _currentChip = 0;
  late final String _clientNonce;

  @override
  void initState() {
    super.initState();
    _clientNonce =
        'deposit_${DateTime.now().millisecondsSinceEpoch}_${widget.userId.substring(0, 8)}';
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
                Icon(Icons.account_balance, color: Colors.green),
                SizedBox(width: 8),
                Text('chip預入'),
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
                      labelText: '預入額',
                      hintText: '預入するchip額を入力',
                      suffixText: 'chip',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.money),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ],
              ),
            ),
            actionsOverflowButtonSpacing: 8,
            actions: [
              TextButton(
                onPressed: _isLoading ? null : () => Navigator.of(context).pop(),
                child: const Text('キャンセル'),
              ),
              ElevatedButton(
                onPressed: _isLoading || !_canDeposit()
                    ? null
                    : () => _showConfirmDialog(false),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  foregroundColor: Colors.white,
                ),
                child: const Text('預入のみ'),
              ),
              ElevatedButton(
                onPressed: _isLoading || !_canDeposit()
                    ? null
                    : () => _showConfirmDialog(true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.orange,
                  foregroundColor: Colors.white,
                ),
                child: const Text('預入と退席'),
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

  bool _canDeposit() {
    final amount = int.tryParse(_amountController.text);
    return amount != null && amount > 0;
  }

  Future<void> _showConfirmDialog(bool shouldLeaveSeat) async {
    final amount = int.parse(_amountController.text);

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('預入確認'),
        content: Text(
          '${widget.pokerName}様の${amount.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')} chipの預入${shouldLeaveSeat ? 'と退席' : ''}で確定してよろしいですか？',
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
    if (_isLoading) return;
    setState(() => _isLoading = true);

    var depositSucceeded = false;
    var leaveSucceeded = false;
    Object? stepError;
    int? newBalance;

    try {
      final functions = FunctionsClient.instance;
      // USER-51: deposit → leave の順。deposit 成功後に leave 失敗しうる。
      final depositResult = await functions.httpsCallable('depositChip').call({
        'userId': widget.userId,
        'amount': amount,
        'clientNonce': _clientNonce,
      });

      if (!isCallableSuccessResponse(depositResult.data)) {
        stepError = null;
        // soft-fail: 預入未完了
        if (mounted) {
          setState(() => _isLoading = false);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(mapCallableSoftFailMessage(depositResult.data)),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      depositSucceeded = true;
      final depositData = depositResult.data;
      if (depositData is Map) {
        final data = depositData['data'];
        if (data is Map && data['newBalance'] is num) {
          newBalance = (data['newBalance'] as num).toInt();
        }
      }
      if (newBalance != null && mounted) {
        setState(() => _currentChip = newBalance!);
      }

      if (shouldLeaveSeat) {
        if (widget.tableId == null || widget.seatNumber == null) {
          leaveSucceeded = false;
          stepError = Exception(kUserActionLeaveSeatMissingInfoMessage);
        } else {
          try {
            final leaveResult =
                await functions.httpsCallable('leaveSeat').call({
              'tableId': widget.tableId,
              'seatNumber': widget.seatNumber,
              'userId': widget.userId,
            });
            if (isCallableSuccessResponse(leaveResult.data)) {
              leaveSucceeded = true;
            } else {
              leaveSucceeded = false;
              // leave soft-fail: 預入は済んでいる
            }
          } catch (e) {
            leaveSucceeded = false;
            stepError = e;
          }
        }
      } else {
        leaveSucceeded = true;
      }
    } catch (e) {
      stepError = e;
      depositSucceeded = false;
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }

    if (!mounted) return;

    final outcome = resolveDepositLeaveOutcome(
      depositSucceeded: depositSucceeded,
      leaveRequested: shouldLeaveSeat,
      leaveSucceeded: leaveSucceeded,
    );

    switch (outcome) {
      case DepositLeaveOutcome.bothSucceeded:
        Navigator.of(context).pop(
          _DepositResult(amount: amount, leftSeat: shouldLeaveSeat),
        );
        return;
      case DepositLeaveOutcome.depositSucceededLeaveFailed:
        // 部分成功: 自動ロールバックしない。ダイアログ維持（clientNonce で再預入を防ぐ）
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              messageForDepositLeaveOutcome(outcome) ??
                  kUserActionDepositSucceededLeaveFailedMessage,
            ),
            backgroundColor: Colors.orange,
            duration: const Duration(seconds: 6),
          ),
        );
        return;
      case DepositLeaveOutcome.depositFailed:
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              messageForDepositLeaveOutcome(
                    outcome,
                    depositOrLeaveError: stepError,
                  ) ??
                  kUserActionDepositFailedMessage,
            ),
            backgroundColor: Colors.red,
          ),
        );
        return;
    }
  }
}
