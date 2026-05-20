import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

class PostSettlementIdempotencyReplayPage extends StatefulWidget {
  const PostSettlementIdempotencyReplayPage({super.key});

  @override
  State<PostSettlementIdempotencyReplayPage> createState() =>
      _PostSettlementIdempotencyReplayPageState();
}

enum _ReplayAdjustmentType {
  decreaseRefundPending,
  decreaseRefunded,
  increaseCollectionPending,
  increaseCollected,
}

extension _ReplayAdjustmentTypeX on _ReplayAdjustmentType {
  String get value => switch (this) {
    _ReplayAdjustmentType.decreaseRefundPending => 'decrease_refund_pending',
    _ReplayAdjustmentType.decreaseRefunded => 'decrease_refunded',
    _ReplayAdjustmentType.increaseCollectionPending =>
      'increase_collection_pending',
    _ReplayAdjustmentType.increaseCollected => 'increase_collected',
  };

  String get label => switch (this) {
    _ReplayAdjustmentType.decreaseRefundPending => '減額（返金待ち）',
    _ReplayAdjustmentType.decreaseRefunded => '減額（即時返金）',
    _ReplayAdjustmentType.increaseCollectionPending => '増額（追加徴収待ち）',
    _ReplayAdjustmentType.increaseCollected => '増額（即時徴収）',
  };

  bool get isDecrease =>
      this == _ReplayAdjustmentType.decreaseRefundPending ||
      this == _ReplayAdjustmentType.decreaseRefunded;

  bool get isImmediate =>
      this == _ReplayAdjustmentType.decreaseRefunded ||
      this == _ReplayAdjustmentType.increaseCollected;
}

class _CycleSnapshotInfo {
  const _CycleSnapshotInfo({
    required this.status,
    required this.cycleNo,
    required this.nextSequenceNo,
    required this.adjustmentCount,
    required this.cashActionCount,
  });

  final String status;
  final int cycleNo;
  final int nextSequenceNo;
  final int adjustmentCount;
  final int cashActionCount;
}

class _ReplayResultView {
  const _ReplayResultView({
    required this.before,
    required this.after,
    required this.firstResponse,
    required this.secondResponse,
    required this.expectedSequenceDelta,
  });

  final _CycleSnapshotInfo before;
  final _CycleSnapshotInfo after;
  final Map<String, dynamic> firstResponse;
  final Map<String, dynamic> secondResponse;
  final int expectedSequenceDelta;
}

class _PostSettlementIdempotencyReplayPageState
    extends State<PostSettlementIdempotencyReplayPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final TextEditingController _billIdCtrl = TextEditingController();
  final TextEditingController _amountCtrl = TextEditingController(text: '100');
  final TextEditingController _noteCtrl = TextEditingController(
    text: '11-G idempotency replay test',
  );
  final TextEditingController _idempotencyKeyCtrl = TextEditingController(
    text: 'replay-test-1',
  );

  _ReplayAdjustmentType _type = _ReplayAdjustmentType.increaseCollectionPending;
  String _immediateMethod = 'cash';
  bool _submitting = false;
  String? _error;
  _ReplayResultView? _result;

  @override
  void dispose() {
    _billIdCtrl.dispose();
    _amountCtrl.dispose();
    _noteCtrl.dispose();
    _idempotencyKeyCtrl.dispose();
    super.dispose();
  }

  Future<_CycleSnapshotInfo> _readCycleSnapshot(String billId) async {
    final billSnap = await _firestore.collection('bills').doc(billId).get();
    final bill = billSnap.data();
    if (bill == null) {
      throw StateError('bill が見つかりません');
    }
    final status = bill['status'] as String? ?? 'unknown';
    final cycleNo =
        ((bill['reopenSummary']
                    as Map<String, dynamic>?)?['currentSettlementCycle']
                as num?)
            ?.toInt() ??
        1;
    final cycleRef = _firestore
        .collection('bills')
        .doc(billId)
        .collection('settlementCycles')
        .doc(cycleNo.toString());
    final cycleSnap = await cycleRef.get();
    final cycle = cycleSnap.data() ?? const <String, dynamic>{};
    final adjustmentsSnap = await cycleRef.collection('adjustments').get();
    final cashActionsSnap = await cycleRef.collection('cashActions').get();
    return _CycleSnapshotInfo(
      status: status,
      cycleNo: cycleNo,
      nextSequenceNo: (cycle['nextSequenceNo'] as num?)?.toInt() ?? 0,
      adjustmentCount: adjustmentsSnap.docs.length,
      cashActionCount: cashActionsSnap.docs.length,
    );
  }

  Map<String, dynamic> _buildPayload() {
    final billId = _billIdCtrl.text.trim();
    final amount = int.tryParse(_amountCtrl.text.trim()) ?? 0;
    final note = _noteCtrl.text.trim();
    final idempotencyKey = _idempotencyKeyCtrl.text.trim();
    if (billId.isEmpty) {
      throw StateError('billId を入力してください');
    }
    if (amount <= 0) {
      throw StateError('金額は 1 以上で入力してください');
    }
    if (idempotencyKey.isEmpty) {
      throw StateError('idempotencyKey を入力してください');
    }
    final sign = _type.isDecrease ? -1 : 1;
    return {
      'billId': billId,
      'idempotencyKey': idempotencyKey,
      'adjustmentType': _type.value,
      'adjustmentAmountIncl': amount,
      'note': note,
      'lines': [
        {
          'lineNo': 1,
          'targetCategory': 'extra',
          'targetId': null,
          'targetName': '調整用追加料金',
          'operationType': 'extra',
          'qtyDelta': sign,
          'amountInclDelta': sign * amount,
          'note': note,
        },
      ],
      if (_type.isImmediate)
        'immediateCashAction': {'method': _immediateMethod, 'note': note},
    };
  }

  String _summarizeResult(_ReplayResultView result) {
    final firstDiag = (result.firstResponse['diagnostics'] as Map?) ?? const {};
    final secondDiag =
        (result.secondResponse['diagnostics'] as Map?) ?? const {};
    final actualSequenceDelta =
        result.after.nextSequenceNo - result.before.nextSequenceNo;
    final actualAdjustmentDelta =
        result.after.adjustmentCount - result.before.adjustmentCount;
    final actualCashActionDelta =
        result.after.cashActionCount - result.before.cashActionCount;

    return [
      'before: status=${result.before.status}, cycle=${result.before.cycleNo}, nextSequenceNo=${result.before.nextSequenceNo}, adjustments=${result.before.adjustmentCount}, cashActions=${result.before.cashActionCount}',
      'after: status=${result.after.status}, cycle=${result.after.cycleNo}, nextSequenceNo=${result.after.nextSequenceNo}, adjustments=${result.after.adjustmentCount}, cashActions=${result.after.cashActionCount}',
      'first: adjustmentId=${result.firstResponse['adjustmentId'] ?? '—'}, cashActionId=${result.firstResponse['cashActionId'] ?? '—'}, reused=${firstDiag['reused'] ?? false}',
      'second: adjustmentId=${result.secondResponse['adjustmentId'] ?? '—'}, cashActionId=${result.secondResponse['cashActionId'] ?? '—'}, reused=${secondDiag['reused'] ?? false}',
      'check: expected nextSequenceNo delta=${result.expectedSequenceDelta}, actual=$actualSequenceDelta',
      'check: adjustment count delta should be 1, actual=$actualAdjustmentDelta',
      'check: cashAction count delta should be ${_type.isImmediate ? 1 : 0}, actual=$actualCashActionDelta',
      'check: adjustmentId same = ${result.firstResponse['adjustmentId'] == result.secondResponse['adjustmentId']}',
      'check: cashActionId same = ${result.firstResponse['cashActionId'] == result.secondResponse['cashActionId']}',
    ].join('\n');
  }

  Future<void> _runReplay() async {
    setState(() {
      _submitting = true;
      _error = null;
      _result = null;
    });
    try {
      final payload = _buildPayload();
      final billId = payload['billId'] as String;
      final before = await _readCycleSnapshot(billId);
      final callable = FunctionsClient.instance.httpsCallable(
        'createPostSettlementAdjustment',
      );
      final first = await callable.call(payload);
      final second = await callable.call(payload);
      final after = await _readCycleSnapshot(billId);
      final expectedSequenceDelta = _type.isImmediate ? 2 : 1;
      if (!mounted) return;
      setState(() {
        _result = _ReplayResultView(
          before: before,
          after: after,
          firstResponse: Map<String, dynamic>.from(first.data as Map),
          secondResponse: Map<String, dynamic>.from(second.data as Map),
          expectedSequenceDelta: expectedSequenceDelta,
        );
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('同一 idempotencyKey で 2 回送信しました')),
      );
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Callable 失敗: [${e.code}] ${e.message ?? '—'}';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '実行に失敗しました: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('冪等再送確認'),
        backgroundColor: Colors.indigo[700],
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '同じ payload を同じ idempotencyKey で 2 回送信し、重複副作用が出ないことを確認します。',
                      style: TextStyle(fontSize: 13),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _billIdCtrl,
                      decoration: const InputDecoration(
                        labelText: 'billId',
                        helperText:
                            'settled か post_settlement_pending の test bill を指定します',
                      ),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<_ReplayAdjustmentType>(
                      value: _type,
                      decoration: const InputDecoration(
                        labelText: 'adjustmentType',
                      ),
                      items: [
                        for (final value in _ReplayAdjustmentType.values)
                          DropdownMenuItem(
                            value: value,
                            child: Text(value.label),
                          ),
                      ],
                      onChanged: _submitting
                          ? null
                          : (value) {
                              if (value == null) return;
                              setState(() {
                                _type = value;
                              });
                            },
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _amountCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: '金額（税込）',
                        helperText: '簡易確認なので調整用追加料金 1 行だけを送ります',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _idempotencyKeyCtrl,
                      decoration: const InputDecoration(
                        labelText: 'idempotencyKey',
                        helperText: '1 回目と 2 回目で同じ key を使います',
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _noteCtrl,
                      decoration: const InputDecoration(labelText: 'メモ'),
                    ),
                    if (_type.isImmediate) ...[
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        value: _immediateMethod,
                        decoration: const InputDecoration(labelText: '即時精算の方法'),
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
                            : (value) {
                                if (value == null) return;
                                setState(() {
                                  _immediateMethod = value;
                                });
                              },
                      ),
                    ],
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: _submitting ? null : _runReplay,
                      icon: _submitting
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.repeat),
                      label: const Text('同じ内容を2回送信する'),
                    ),
                  ],
                ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
            if (_result != null) ...[
              const SizedBox(height: 16),
              Card(
                color: Colors.indigo[50],
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: SelectableText(
                    _summarizeResult(_result!),
                    style: const TextStyle(fontSize: 13, height: 1.5),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
