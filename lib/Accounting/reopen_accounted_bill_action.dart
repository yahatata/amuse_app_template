import 'package:amuse_app_template/Accounting/errors/accounting_error_operations.dart';
import 'package:amuse_app_template/Accounting/errors/accounting_load_user_facing_errors.dart';
import 'package:amuse_app_template/Accounting/errors/map_accounting_error.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:flutter/material.dart';

/// 会計前に戻す（`reopenAccountedBill`）の共通実行。
///
/// 成功時は success dialog を出し `true`。失敗・キャンセルは `false`。
Future<bool> runReopenAccountedBillFlow({
  required BuildContext context,
  required String billId,
  String? pokerName,
  String? reason,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('会計前に戻す'),
      content: Text(
        pokerName == null || pokerName.isEmpty
            ? 'この会計を会計前の状態に戻しますか？'
            : '$pokerName の会計を会計前の状態に戻しますか？',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('キャンセル'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          child: const Text('会計前に戻す'),
        ),
      ],
    ),
  );
  if (confirmed != true || !context.mounted) return false;

  var loadingVisible = false;
  Future<void> closeLoading() async {
    if (!loadingVisible || !context.mounted) return;
    try {
      Navigator.of(context).pop();
    } catch (_) {
      // already closed
    } finally {
      loadingVisible = false;
    }
  }

  Object? caughtError;
  Object? responseData;
  try {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(
        child: Card(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('会計前に戻す処理中...'),
              ],
            ),
          ),
        ),
      ),
    );
    loadingVisible = true;

    final result = await FunctionsClient.instance
        .httpsCallable('reopenAccountedBill')
        .call({
          'billId': billId,
          'clientNonce': DateTime.now().microsecondsSinceEpoch.toString(),
          if (reason != null && reason.isNotEmpty) 'reason': reason,
        });
    responseData = result.data;
  } catch (e) {
    caughtError = e;
  } finally {
    await closeLoading();
  }

  if (!context.mounted) return false;

  if (caughtError != null) {
    final mapped = mapAccountingCallableError(
      caughtError,
      operation: AccountingErrorOperations.reopen,
    );
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(mapped.message)),
    );
    return false;
  }

  if (!isCallableSuccessResponse(responseData)) {
    final mapped = mapAccountingSoftFailError(
      responseData,
      operation: AccountingErrorOperations.reopen,
    );
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(mapped.message)),
    );
    return false;
  }

  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('会計前に戻しました'),
      content: Text(resolveAccountingReopenSuccessMessage(responseData)),
      actions: [
        FilledButton(
          onPressed: () => Navigator.of(ctx).pop(),
          child: const Text('OK'),
        ),
      ],
    ),
  );
  return true;
}
