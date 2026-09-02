// 確定ボタン + 警告
//
// 参照: 06_UI_SPEC §4-4, §4-5

import 'package:flutter/material.dart';
import '../errors/payroll_user_facing_errors.dart';
import '../services/payroll_callable_service.dart';

class ConfirmSection extends StatefulWidget {
  final String paymentPeriodKey;
  final String runId;
  final String runStatus;
  final String monthlyPayrollStatus;
  final int failedStaffCount;

  const ConfirmSection({
    super.key,
    required this.paymentPeriodKey,
    required this.runId,
    required this.runStatus,
    required this.monthlyPayrollStatus,
    required this.failedStaffCount,
  });

  @override
  State<ConfirmSection> createState() => _ConfirmSectionState();
}

class _ConfirmSectionState extends State<ConfirmSection> {
  final _service = PayrollCallableService();
  bool _confirming = false;

  bool get _canConfirm =>
      widget.runStatus == 'completed' &&
      widget.monthlyPayrollStatus == 'draft';

  bool get _isCompletedWithErrors =>
      widget.runStatus == 'completed_with_errors';

  Future<void> _confirm() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('給与計算結果を確定'),
        content: const Text(
          '確定すると、この期間の再計算はできなくなります。\n\n確定してよろしいですか？',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('キャンセル'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('確定する'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _confirming = true);
    _openProcessingOverlay();
    String? successMessage;
    String? errorMessage;
    try {
      final result = await _service.confirmPayrollRun(
        paymentPeriodKey: widget.paymentPeriodKey,
        runId: widget.runId,
      );
      if (!mounted) return;
      if (!isPayrollCallableSuccess(
        result,
        shapeValidator: isConfirmPayrollRunShape,
      )) {
        errorMessage = mapPayrollSoftFail(
          result,
          operation: kConfirmPayrollRunOperation,
        );
        return;
      }
      successMessage = '確定しました';
    } catch (e) {
      if (mounted) {
        errorMessage = mapPayrollCallableError(
          e,
          operation: kConfirmPayrollRunOperation,
        );
      }
    } finally {
      if (mounted) {
        _closeProcessingOverlay();
        setState(() => _confirming = false);
      }
    }

    if (!mounted) return;
    if (successMessage != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(successMessage)),
      );
    } else if (errorMessage != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(errorMessage)),
      );
    }
  }

  /// 確定（更新系）: 画面全体の黒半透明 + CPI。ボタン内スピナーは使わない。
  void _openProcessingOverlay() {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black.withValues(alpha: 0.35),
      useRootNavigator: true,
      builder: (_) => PopScope(
        canPop: false,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircularProgressIndicator(color: Colors.white),
              const SizedBox(height: 16),
              Text(
                '確定処理中…',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.95),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _closeProcessingOverlay() {
    final nav = Navigator.of(context, rootNavigator: true);
    if (nav.canPop()) {
      nav.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.monthlyPayrollStatus != 'draft') {
      return const SizedBox.shrink();
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_isCompletedWithErrors)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.orange),
              ),
              child: Text(
                '${widget.failedStaffCount}名のスタッフの計算が失敗しているため確定できません。\n計算タブから失敗分を再実行するか、中止してください。',
                style: TextStyle(color: Colors.orange.shade800),
              ),
            ),
          ElevatedButton.icon(
            onPressed: _canConfirm && !_confirming ? _confirm : null,
            icon: const Icon(Icons.check_circle),
            label: const Text('計算結果を確定する'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
          ),
        ],
      ),
    );
  }
}
