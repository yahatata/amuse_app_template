import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:amuse_app_template/user/balance_display.dart';
import 'package:amuse_app_template/user/point_ids.dart';
import 'package:amuse_app_template/user/side_game_chip_display.dart';

/// 会計後返金ダイアログ。
///
/// 仕様書 [04_仕様書/06_要対応の会計画面と一覧取得.md] の primary action `refund` 用。
/// `recordPostSettlementRefund` callable を呼ぶ。
///
/// C-2.5: ポイント/sideGameChip 返金対応を追加。
/// 返金可能上限は元の支払い額から既返金額を差し引いた値。
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
  String? _method;
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  List<({String id, int remaining})> _effectiveAdjustments = [];

  static const _nonSpecialMethods = [
    'cash',
    'credit_card',
    'electronic_money',
    'qr',
    'bank_transfer',
  ];

  static const _specialMethods = [
    'pointA',
    'pointB',
    'pointC',
    'pointD',
    'pointE',
    'sideGameChip',
  ];

  /// 元の支払い手段別金額（paymentTotals）
  Map<String, int> _paymentTotals = {};

  /// 当 cycle で既に返金済みの手段別金額
  Map<String, int> _alreadyRefundedByMethod = {};

  /// 当 cycle で既に追加徴収済みの手段別金額
  Map<String, int> _alreadyCollectedByMethod = {};

  /// 返金手段の選択肢（元の支払いがあり、まだ返金可能残額がある手段）
  List<String> _availableMethods = [];

  @override
  void initState() {
    super.initState();
    _amountCtrl = TextEditingController(
      text: widget.initialAmountIncl.toString(),
    );
    _loadData();
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
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

      // paymentTotals を取得
      final rawTotals =
          (billData?['paymentTotals'] as Map<String, dynamic>?) ?? {};
      final paymentTotals = {
        for (final e in rawTotals.entries)
          e.key: (e.value as num?)?.toInt() ?? 0,
      };

      // 当 cycle の cashActions を全件ロードして返金済み額を集計
      final cashActionsSnap = await _firestore
          .collection('bills')
          .doc(widget.billId)
          .collection('settlementCycles')
          .doc(cycleNo.toString())
          .collection('cashActions')
          .get();

      final alreadyRefunded = <String, int>{};
      final alreadyCollected = <String, int>{};
      for (final doc in cashActionsSnap.docs) {
        final data = doc.data();
        final type = data['cashActionType'];
        final breakdown = data['methodBreakdown'] as List<dynamic>? ?? [];
        for (final entry in breakdown) {
          if (entry is! Map) continue;
          final m = (entry['method'] as String?) ?? '';
          final amt = (entry['amountIncl'] as num?)?.toInt() ?? 0;
          if (type == 'refund') {
            alreadyRefunded[m] = (alreadyRefunded[m] ?? 0) + amt;
          } else if (type == 'collection') {
            alreadyCollected[m] = (alreadyCollected[m] ?? 0) + amt;
          }
        }
      }

      // 返金可能手段：元の支払い+追加徴収があり、残額 > 0 のもの
      final allMethods = [..._nonSpecialMethods, ..._specialMethods];
      final available = allMethods
          .where((m) =>
              _remainingRefundable(
                paymentTotals[m] ?? 0,
                alreadyCollected[m] ?? 0,
                alreadyRefunded[m] ?? 0,
              ) >
              0)
          .toList();

      // adjustment 取得
      final adjSnap = await _firestore
          .collection('bills')
          .doc(widget.billId)
          .collection('settlementCycles')
          .doc(cycleNo.toString())
          .collection('adjustments')
          .where('adjustmentState', isEqualTo: 'effective')
          .get();

      final list = adjSnap.docs
          .map((d) {
            final data = d.data();
            final remaining =
                (data['requiredActionRemainingIncl'] as num?)?.toInt() ?? 0;
            return (id: d.id, remaining: remaining);
          })
          .where((e) => e.remaining > 0)
          .toList();

      if (!mounted) return;
      setState(() {
        _paymentTotals = paymentTotals;
        _alreadyRefundedByMethod = alreadyRefunded;
        _alreadyCollectedByMethod = alreadyCollected;
        _availableMethods = available;
        _method = available.isNotEmpty ? available.first : null;
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

  int _remainingRefundable(int paid, int collected, int alreadyRefunded) =>
      paid + collected - alreadyRefunded;

  int _maxRefundableForMethod(String method) => _remainingRefundable(
        _paymentTotals[method] ?? 0,
        _alreadyCollectedByMethod[method] ?? 0,
        _alreadyRefundedByMethod[method] ?? 0,
      );

  Future<void> _submit() async {
    final amount = int.tryParse(_amountCtrl.text);
    if (amount == null || amount <= 0) {
      setState(() => _error = '金額を 1 以上の整数で入力してください');
      return;
    }
    if (_method == null) {
      setState(() => _error = '返金方法を選択してください');
      return;
    }
    final maxRefundable = _maxRefundableForMethod(_method!);
    if (amount > maxRefundable) {
      setState(
        () => _error = '${_methodLabel(_method!)} での返金上限は ¥$maxRefundable です',
      );
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
      setState(() => _submitting = false);
      final messenger = ScaffoldMessenger.of(context);
      Navigator.of(context).pop();
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            '返金を記録しました（cashActionId: ${result.data['cashActionId'] ?? '—'}）',
          ),
        ),
      );
      return;
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '返金に失敗しました: [${e.code}] ${e.message ?? '—'}';
        _submitting = false;
      });
      return;
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '返金に失敗しました: $e';
        _submitting = false;
      });
      return;
    }
  }

  String _methodLabel(String method) {
    switch (method) {
      case 'qr':
        return 'QR';
      case 'bank_transfer':
        return '銀行振込';
      case 'other':
        return 'その他';
      default:
        return balanceDisplayName(method);
    }
  }

  /// 支払い手段と金額を表示用文字列に変換（特殊メソッドは枚数/pt + 円相当）
  String _formatMethodAmount(String method, int yenAmount) {
    final fmt = NumberFormat('#,###');
    if (method == 'sideGameChip') {
      return formatSideGameChipPaymentFromReference(
        yenAmount,
        methodLabel: '${balanceDisplayName(method)}:',
      );
    }
    if (isCurrencyPointId(method)) {
      return '${balanceDisplayName(method)}: ${fmt.format(yenAmount)} (${fmt.format(yenAmount)}円相当)';
    }
    return '${_methodLabel(method)}: ¥${fmt.format(yenAmount)}';
  }

  /// 選択中メソッドの最大返金額を helperText 用文字列で返す
  String? _maxHelperText() {
    if (_method == null) return null;
    final max = _maxRefundableForMethod(_method!);
    if (max <= 0) return null;
    final fmt = NumberFormat('#,###');
    if (_method == 'sideGameChip') {
      return '最大返金: ${formatSideGameChipPaymentFromReference(max, methodLabel: balanceDisplayName(kSideGameChipId))}';
    }
    return '最大返金: ¥${fmt.format(max)}';
  }

  /// ドロップダウン用ラベル（最大返金額つき）
  String _dropdownLabel(String method) {
    final max = _maxRefundableForMethod(method);
    final fmt = NumberFormat('#,###');
    if (method == 'sideGameChip') {
      return '${balanceDisplayName(method)}（最大: ${formatSideGameChipPaymentFromReference(max, methodLabel: balanceDisplayName(method))}）';
    }
    if (isCurrencyPointId(method)) {
      return '${balanceDisplayName(method)}（最大: ¥${fmt.format(max)}）';
    }
    return '${_methodLabel(method)}（最大: ¥${fmt.format(max)}）';
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return PopScope(
      canPop: !_submitting,
      child: SizedBox(
        width: size.width,
        height: size.height,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Center(
              child: AlertDialog(
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
                  // 元の支払い情報
                  if (_paymentTotals.isNotEmpty) ...[
                    const Text(
                      '元の支払い',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: Colors.black54,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children: [
                        for (final entry in _paymentTotals.entries)
                          if (entry.value > 0)
                            Chip(
                              label: Text(
                                _formatMethodAmount(entry.key, entry.value),
                                style: const TextStyle(fontSize: 12),
                              ),
                              visualDensity: VisualDensity.compact,
                              backgroundColor:
                                  _specialMethods.contains(entry.key)
                                      ? Colors.orange[50]
                                      : Colors.blue[50],
                            ),
                      ],
                    ),
                    const SizedBox(height: 8),
                  ],
                  // 複数手段の注意書き
                  if (_availableMethods.length > 1) ...[
                    const Text(
                      '複数の支払い手段がある場合、1回の操作で1手段のみ返金できます。複数手段で返金する場合は2回に分けてください。',
                      style: TextStyle(fontSize: 11, color: Colors.black54),
                    ),
                    const SizedBox(height: 8),
                  ],
                  // 対象 adjustment
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
                  // 返金額
                  TextField(
                    controller: _amountCtrl,
                    keyboardType: TextInputType.number,
                    enabled: !_submitting,
                    decoration: InputDecoration(
                      labelText: '返金額（円・税込）',
                      helperText: _maxHelperText(),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 8),
                  // 返金手段
                  if (_availableMethods.isEmpty)
                    const Text(
                      '返金対応可能な支払い手段が見つかりません',
                      style: TextStyle(color: Colors.red, fontSize: 12),
                    )
                  else if (_availableMethods.length == 1)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Text(
                        '返金方法: ${_dropdownLabel(_availableMethods.first)}',
                        style: const TextStyle(fontSize: 14),
                      ),
                    )
                  else
                    DropdownButtonFormField<String>(
                      value: _method,
                      decoration: const InputDecoration(labelText: '返金方法'),
                      items: [
                        for (final m in _availableMethods)
                          DropdownMenuItem(
                            value: m,
                            child: Text(_dropdownLabel(m)),
                          ),
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
          onPressed: (_submitting || _loading || _availableMethods.isEmpty)
              ? null
              : _submit,
          child: const Text('返金する'),
        ),
      ],
    ),
            ),
            if (_submitting)
              Positioned.fill(
                child: AbsorbPointer(
                  child: ColoredBox(
                    color: Colors.black.withValues(alpha: 0.35),
                    child: const Center(child: CircularProgressIndicator()),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}