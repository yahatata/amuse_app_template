import 'dart:async';

import 'package:flutter/material.dart';

class ActionProgressDialogController {
  ActionProgressDialogController(this.context);

  final BuildContext context;
  bool _loadingVisible = false;

  Future<void> showLoading({required String message}) async {
    if (!context.mounted || _loadingVisible) {
      return;
    }
    _loadingVisible = true;
    unawaited(
      showDialog<void>(
        context: context,
        barrierDismissible: false,
        useRootNavigator: true,
        builder: (dialogContext) => PopScope(
          canPop: false,
          child: AlertDialog(
            content: Row(
              children: [
                const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2.5),
                ),
                const SizedBox(width: 16),
                Expanded(child: Text(message)),
              ],
            ),
          ),
        ),
      ),
    );
    await Future<void>.delayed(Duration.zero);
  }

  void hideLoading() {
    if (!_loadingVisible || !context.mounted) {
      _loadingVisible = false;
      return;
    }
    _loadingVisible = false;
    final navigator = Navigator.of(context, rootNavigator: true);
    if (navigator.canPop()) {
      navigator.pop();
    }
  }
}

Future<void> showActionMessageDialog(
  BuildContext context, {
  required String title,
  required String message,
  required IconData icon,
  required Color color,
}) async {
  if (!context.mounted) {
    return;
  }
  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    useRootNavigator: true,
    builder: (dialogContext) => AlertDialog(
      title: Row(
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 8),
          Text(title),
        ],
      ),
      content: Text(message),
      actions: [
        ElevatedButton(
          onPressed: () =>
              Navigator.of(dialogContext, rootNavigator: true).pop(),
          child: const Text('OK'),
        ),
      ],
    ),
  );
}

Future<void> showActionSuccessDialog(
  BuildContext context, {
  required String message,
  String title = '完了',
}) {
  return showActionMessageDialog(
    context,
    title: title,
    message: message,
    icon: Icons.check_circle,
    color: Colors.green,
  );
}

Future<void> showActionErrorDialog(
  BuildContext context, {
  required String message,
  String title = 'エラー',
}) {
  return showActionMessageDialog(
    context,
    title: title,
    message: message,
    icon: Icons.error,
    color: Colors.red,
  );
}

String buildAsyncActionErrorMessage(
  Object error, {
  required String defaultMessage,
}) {
  if (error is TimeoutException) {
    return '処理がタイムアウトしました。しばらく待ってから再試行してください。';
  }

  final raw = error.toString().toLowerCase();
  if (raw.contains('network')) {
    return 'ネットワークエラーが発生しました。接続を確認してください。';
  }
  if (raw.contains('permission')) {
    return '権限が不足しています。管理者に連絡してください。';
  }
  return '$defaultMessage\n詳細: $error';
}
