import 'package:flutter/material.dart';

import 'package:amuse_app_template/Accounting/carryover_remote_cash_payment.dart';
import 'package:amuse_app_template/Accounting/errors/accounting_error_operations.dart';
import 'package:amuse_app_template/Accounting/errors/map_accounting_error.dart';

/// C1-B 来店なし入金ダイアログ（置きバケ remote payment UI を参考）。
///
/// - 現金固定
/// - 請求額全額を表示（入力欄なし）
/// - 成功時は `true` を pop
class CarryoverRemoteCashPaymentDialog extends StatefulWidget {
  const CarryoverRemoteCashPaymentDialog({
    super.key,
    required this.billId,
    required this.fallbackAmountIncl,
    this.displayTitle,
  });

  final String billId;
  final int fallbackAmountIncl;
  final String? displayTitle;

  @override
  State<CarryoverRemoteCashPaymentDialog> createState() =>
      _CarryoverRemoteCashPaymentDialogState();
}

class _CarryoverRemoteCashPaymentDialogState
    extends State<CarryoverRemoteCashPaymentDialog> {
  bool _loadingPreview = true;
  bool _submitting = false;
  String? _loadError;
  String? _submitError;
  int _claimTotalIncl = 0;
  Map<String, int> _monetaryByCategory = {};

  @override
  void initState() {
    super.initState();
    _claimTotalIncl = widget.fallbackAmountIncl;
    _loadPreview();
  }

  Future<void> _loadPreview() async {
    setState(() {
      _loadingPreview = true;
      _loadError = null;
    });
    try {
      final preview = await fetchCarryoverBillPreviewTotals(widget.billId);
      if (!mounted) return;
      setState(() {
        _claimTotalIncl = preview.claimTotalIncl;
        _monetaryByCategory = preview.monetaryByCategory;
        _loadingPreview = false;
      });
    } catch (e) {
      if (!mounted) return;
      final mapped = mapAccountingCallableError(
        e,
        operation: AccountingErrorOperations.loadBills,
      );
      setState(() {
        _loadingPreview = false;
        _loadError = mapped.message;
        _claimTotalIncl = widget.fallbackAmountIncl;
      });
    }
  }

  Future<void> _onSubmit() async {
    if (_submitting || _loadingPreview) return;
    setState(() {
      _submitError = null;
      _submitting = true;
    });

    try {
      final result = await settleCarryoverWithRemoteCashPayment(
        billId: widget.billId,
        inputAmountIncl: _claimTotalIncl,
        claimTotalIncl: _claimTotalIncl,
        monetaryByCategory: _monetaryByCategory,
      );
      if (!mounted) return;
      if (result.success) {
        Navigator.of(context).pop(true);
        return;
      }
      setState(() {
        _submitError =
            result.errorMessage ?? kCarryoverRemoteCashAmountMismatchMessage;
      });
    } catch (e) {
      if (!mounted) return;
      final mapped = mapAccountingCallableError(
        e,
        operation: AccountingErrorOperations.complete,
      );
      setState(() => _submitError = mapped.message);
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final titleSuffix =
        (widget.displayTitle != null && widget.displayTitle!.isNotEmpty)
            ? '（${widget.displayTitle}）'
            : '';

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
                title: Text('来店なし入金$titleSuffix'),
                content: _loadingPreview
                    ? const SizedBox(
                        height: 80,
                        child: Center(child: CircularProgressIndicator()),
                      )
                    : SingleChildScrollView(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (_loadError != null) ...[
                              Text(
                                _loadError!,
                                style: const TextStyle(
                                  color: Colors.orange,
                                  fontSize: 13,
                                ),
                              ),
                              const SizedBox(height: 8),
                            ],
                            Text(
                              '請求額: ¥$_claimTotalIncl',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              '支払方法: 現金',
                              style: TextStyle(fontSize: 13),
                            ),
                            const SizedBox(height: 4),
                            const Text(
                              '請求額全額を現金で精算します。',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey,
                              ),
                            ),
                            if (_submitError != null) ...[
                              const SizedBox(height: 8),
                              Text(
                                _submitError!,
                                style: const TextStyle(
                                  color: Colors.red,
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                actions: [
                  TextButton(
                    onPressed: _submitting
                        ? null
                        : () => Navigator.of(context).pop(false),
                    child: const Text('キャンセル'),
                  ),
                  TextButton(
                    onPressed: (_submitting || _loadingPreview)
                        ? null
                        : _onSubmit,
                    child: const Text('実行'),
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
