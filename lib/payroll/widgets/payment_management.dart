// 支払い管理画面
//
// 参照: 06_UI_SPEC §5-1, §5-2, §5-3

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:amuse_app_template/services/payroll_config_service.dart';
import 'package:amuse_app_template/payroll/utils/payment_date_utils.dart';
import '../services/payroll_callable_service.dart';
import 'staff_card.dart';

class PaymentManagement extends StatefulWidget {
  final String paymentPeriodKey;
  final String monthlyPayrollStatus;
  final List<StaffCardData> staffList;
  /// false のとき、スタッフごとの支払い行は出さない（カード内操作に寄せる）
  final bool showPerStaffPaymentRows;
  /// 親（結果タブのカードなど）が支払い登録中のとき一括操作を抑止
  final bool paymentRegisterBusy;
  /// このウィジェット内の一括／行ごと登録の処理中を親に伝える（カード側ボタンと相互ロック用）
  final ValueChanged<bool>? onManagementProcessingChanged;

  const PaymentManagement({
    super.key,
    required this.paymentPeriodKey,
    required this.monthlyPayrollStatus,
    required this.staffList,
    this.showPerStaffPaymentRows = true,
    this.paymentRegisterBusy = false,
    this.onManagementProcessingChanged,
  });

  @override
  State<PaymentManagement> createState() => _PaymentManagementState();
}

class _PaymentManagementState extends State<PaymentManagement> {
  final _service = PayrollCallableService();
  bool _processing = false;

  int get _paidCount =>
      widget.staffList.where((s) => s.paymentStatus == 'paid').length;
  int get _holdCount =>
      widget.staffList.where((s) => s.paymentStatus == 'hold').length;
  int get _totalCount => widget.staffList.length;

  bool get _anyProcessing => _processing || widget.paymentRegisterBusy;

  bool get _isPaymentOverdue {
    final config = PayrollConfigService.instance.latest;
    if (config == null) return false;
    if (widget.monthlyPayrollStatus != 'confirmed') return false;

    final parts = widget.paymentPeriodKey.split('_');
    if (parts.length != 2) return false;
    final actualPaymentDate = computeActualPaymentDate(
      periodEnd: parts[1],
      paymentDayOfMonth: config.paymentDayOfMonth,
      paymentMonthOffset: config.paymentMonthOffset,
    );
    if (actualPaymentDate == null) return false;

    final payDate = DateTime.tryParse(actualPaymentDate);
    if (payDate == null) return false;

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final payDay = DateTime(payDate.year, payDate.month, payDate.day);
    return today.isAfter(payDay);
  }

  String get _statusLabel {
    switch (widget.monthlyPayrollStatus) {
      case 'confirmed':
        return '確定済み（$_paidCount/$_totalCount 支払い済み）';
      case 'hold':
        return '保留あり（$_holdCount名保留中）';
      case 'paid':
        return '✓ 全員支払い済み';
      default:
        return widget.monthlyPayrollStatus;
    }
  }

  void _setProcessing(bool v) {
    widget.onManagementProcessingChanged?.call(v);
    if (mounted) setState(() => _processing = v);
  }

  Future<void> _registerStatus(String staffId, String status) async {
    _setProcessing(true);
    try {
      await _service.registerPaymentStatus(
        paymentPeriodKey: widget.paymentPeriodKey,
        entries: [
          {'staffId': staffId, 'status': status}
        ],
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('登録に失敗: $e')),
        );
      }
    } finally {
      if (mounted) _setProcessing(false);
    }
  }

  Future<void> _bulkPaid() async {
    final unpaidStaff = widget.staffList
        .where((s) => s.paymentStatus != 'paid')
        .toList();
    if (unpaidStaff.isEmpty) return;

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => _BulkPaidConfirmDialog(
        unpaidCount: unpaidStaff.length,
        onSubmit: () => _service.registerPaymentStatus(
          paymentPeriodKey: widget.paymentPeriodKey,
          entries: unpaidStaff
              .map((s) => {'staffId': s.staffId, 'status': 'paid'})
              .toList(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final yenFormat = NumberFormat('#,###');
    final bulkEnabled =
        PayrollConfigService.instance.latest?.bulkPaymentRegistrationEnabled ??
            false;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Divider(height: 32),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text('支払い管理',
              style: Theme.of(context).textTheme.titleMedium),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Text(_statusLabel,
              style: const TextStyle(color: Colors.grey)),
        ),

        if (_isPaymentOverdue)
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.red),
            ),
            child: const Row(
              children: [
                Icon(Icons.warning, color: Colors.red, size: 20),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '支払日を過ぎています。未払いのスタッフがいます。',
                    style: TextStyle(color: Colors.red),
                  ),
                ),
              ],
            ),
          ),

        if (bulkEnabled &&
            widget.monthlyPayrollStatus != 'paid' &&
            !_anyProcessing)
          Padding(
            padding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: OutlinedButton.icon(
              onPressed: _bulkPaid,
              icon: const Icon(Icons.done_all),
              label: const Text('全員支払い済み'),
            ),
          ),

        if (_processing)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          ),

        if (widget.showPerStaffPaymentRows)
          ...widget.staffList.map((staff) => _staffPaymentRow(staff, yenFormat)),
      ],
    );
  }

  Widget _staffPaymentRow(StaffCardData staff, NumberFormat yenFormat) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(staff.staffName,
                    style: const TextStyle(fontWeight: FontWeight.w500)),
                Text('¥${yenFormat.format(staff.grossPay)}',
                    style: const TextStyle(color: Colors.grey, fontSize: 13)),
              ],
            ),
          ),
          _paymentActions(staff),
        ],
      ),
    );
  }

  Widget _paymentActions(StaffCardData staff) {
    switch (staff.paymentStatus) {
      case 'paid':
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.green.shade50,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Text('✓ 支払い済み',
              style: TextStyle(color: Colors.green.shade700, fontSize: 13)),
        );
      case 'hold':
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.amber.shade50,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text('⏸ 保留中',
                  style: TextStyle(
                      color: Colors.amber.shade800, fontSize: 12)),
            ),
            const SizedBox(width: 8),
            TextButton(
              onPressed: _processing
                  ? null
                  : () => _registerStatus(staff.staffId, 'paid'),
              child: const Text('支払い済み', style: TextStyle(fontSize: 12)),
            ),
          ],
        );
      default:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextButton(
              onPressed: _processing
                  ? null
                  : () => _registerStatus(staff.staffId, 'paid'),
              child: const Text('支払い済み', style: TextStyle(fontSize: 12)),
            ),
            TextButton(
              onPressed: _processing
                  ? null
                  : () => _registerStatus(staff.staffId, 'hold'),
              child: Text('保留',
                  style: TextStyle(
                      fontSize: 12, color: Colors.amber.shade800)),
            ),
          ],
        );
    }
  }
}

class _BulkPaidConfirmDialog extends StatefulWidget {
  const _BulkPaidConfirmDialog({
    required this.unpaidCount,
    required this.onSubmit,
  });

  final int unpaidCount;
  final Future<void> Function() onSubmit;

  @override
  State<_BulkPaidConfirmDialog> createState() => _BulkPaidConfirmDialogState();
}

class _BulkPaidConfirmDialogState extends State<_BulkPaidConfirmDialog> {
  bool _submitting = false;

  Future<void> _onConfirm() async {
    setState(() => _submitting = true);
    try {
      await widget.onSubmit();
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('一括登録に失敗: $e')),
        );
        setState(() => _submitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_submitting,
      child: AlertDialog(
        title: const Text('全員支払い済みに登録'),
        content: _submitting
            ? const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(),
                    SizedBox(height: 16),
                    Text(
                      '登録しています…',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              )
            : Text(
                '${widget.unpaidCount}名を支払い済みにします。よろしいですか？',
              ),
        actions: _submitting
            ? null
            : [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('キャンセル'),
                ),
                ElevatedButton(
                  onPressed: _onConfirm,
                  child: const Text('登録する'),
                ),
              ],
      ),
    );
  }
}
