import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

/// 会計後返金ダイアログ。
///
/// 仕様書 [04_仕様書/06_要対応の会計画面と一覧取得.md] の primary action `refund` 用。
/// `recordPostSettlementRefund` callable を呼ぶ。
///
/// Step04 で追加された新 callable を Step06 でこの画面から呼び出す。
class PostSettlementRefundDialog extends StatefulWidget {
  final String billId;
  final int initialAmountIncl;

  const PostSettlementRefundDialog({
    super.key,
    required this.billId,
    required this.initialAmountIncl,
  });

  @override
  State<PostSettlementRefundDialog> createState() =>
      _PostSettlementRefundDialogState();
}

class _PostSettlementRefundDialogState
    extends State<PostSettlementRefundDialog> {
  final _firestore = FirebaseFirestore.instance;
  final _functions = FirebaseFunctions.instanceFor(region: 'asia-northeast1');

  late final TextEditingController _amountCtrl;
  String _method = 'cash';
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  List<({String id, int remaining})> _effectiveAdjustments = [];

  @override
  void initState() {
    super.initState();
    _amountCtrl = TextEditingController(
      text: widget.initialAmountIncl.toString(),
    );
    _loadEffectiveAdjustments();
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadEffectiveAdjustments() async {
    try {
      final billSnap =
          await _firestore.collection('bills').doc(widget.billId).get();
      final billData = billSnap.data();
      final cycleNo =
          ((billData?['reopenSummary']
                      as Map<String, dynamic>?)?['currentSettlementCycle']
                  as num?)
              ?.toInt() ??
          1;

      final adjSnap = await _firestore
          .collection('bills')
          .doc(widget.billId)
          .collection('settlementCycles')
          .doc(cycleNo.toString())
          .collection('adjustments')
          .where('adjustmentState', isEqualTo: 'effective')
          .get();

      final list =
          adjSnap.docs
              .map((d) {
                final data = d.data();
                final remaining =
                    (data['requiredActionRemainingIncl'] as num?)?.toInt() ??
                    0;
                return (id: d.id, remaining: remaining);
              })
              .where((e) => e.remaining > 0)
              .toList();

      if (!mounted) return;
      setState(() {
        _effectiveAdjustments = list;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '対象 adjustment の取得に失敗しました: $e';
        _loading = false;
      });
    }
  }

  Future<void> _submit() async {
    final amount = int.tryParse(_amountCtrl.text);
    if (amount == null || amount <= 0) {
      setState(() => _error = '金額を 1 以上の整数で入力してください');
      return;
    }
    if (_effectiveAdjustments.isEmpty) {
      setState(() => _error = '対象 adjustment が見つかりません');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final target = _effectiveAdjustments.first;
      final allocAmount = amount > target.remaining ? target.remaining : amount;

      final result = await _functions
          .httpsCallable('recordPostSettlementRefund')
          .call({
            'billId': widget.billId,
            'amountIncl': allocAmount,
            'methodBreakdown': [
              {'method': _method, 'amountIncl': allocAmount},
            ],
            'allocations': [
              {'adjustmentId': target.id, 'amountIncl': allocAmount},
            ],
          });

      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '返金を記録しました（cashActionId: ${result.data['cashActionId'] ?? '—'}）',
          ),
        ),
      );
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '返金に失敗しました: [${e.code}] ${e.message ?? '—'}';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '返金に失敗しました: $e');
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('返金'),
      content: _loading
          ? const SizedBox(
              height: 80,
              child: Center(child: CircularProgressIndicator()),
            )
          : SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('billId: ${widget.billId}'),
                  const SizedBox(height: 8),
                  if (_effectiveAdjustments.isNotEmpty)
                    Text(
                      '対象 adjustment: ${_effectiveAdjustments.first.id}（残額 ¥${_effectiveAdjustments.first.remaining}）',
                      style: const TextStyle(fontSize: 12),
                    )
                  else
                    const Text(
                      '対象 adjustment がありません（既に解消済みの可能性）',
                      style: TextStyle(fontSize: 12, color: Colors.red),
                    ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _amountCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: '返金額（円・税込）',
                    ),
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    value: _method,
                    decoration: const InputDecoration(labelText: '返金方法'),
                    items: const [
                      DropdownMenuItem(value: 'cash', child: Text('現金')),
                      DropdownMenuItem(
                        value: 'credit_card',
                        child: Text('クレジットカード'),
                      ),
                      DropdownMenuItem(
                        value: 'electronic_money',
                        child: Text('電子マネー'),
                      ),
                      DropdownMenuItem(value: 'qr', child: Text('QR')),
                      DropdownMenuItem(
                        value: 'bank_transfer',
                        child: Text('銀行振込'),
                      ),
                      DropdownMenuItem(value: 'other', child: Text('その他')),
                    ],
                    onChanged: _submitting
                        ? null
                        : (v) {
                            if (v == null) return;
                            setState(() => _method = v);
                          },
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      _error!,
                      style: const TextStyle(color: Colors.red, fontSize: 12),
                    ),
                  ],
                ],
              ),
            ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(),
          child: const Text('キャンセル'),
        ),
        ElevatedButton(
          onPressed: (_submitting || _loading) ? null : _submit,
          child: _submitting
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('返金する'),
        ),
      ],
    );
  }
}
