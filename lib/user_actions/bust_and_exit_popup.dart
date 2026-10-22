import 'dart:async';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:amuse_app_template/user_actions/action_feedback_dialogs.dart';

/// Bust&退席確認ダイアログ
Future<void> showBustAndExitDialog({
  required BuildContext context,
  required Map<String, dynamic> user,
  required String tournamentId,
  required String tableId,
  required int seatNumber,
  bool closeUserActionMenuOnSuccess = false,
}) async {
  final outerCtx = context;
  final pokerName = user['pokerName'] as String? ?? 'Unknown';

  return showDialog<void>(
    context: outerCtx,
    barrierDismissible: false,
    builder: (BuildContext dialogCtx) {
      return AlertDialog(
        title: Row(
          children: [
            Icon(Icons.exit_to_app, color: Colors.red),
            const SizedBox(width: 8),
            const Text('Bust&退席確認'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('以下のユーザーをBust&退席させますか？'),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('ユーザー名: $pokerName'),
                  Text('卓: $tableId'),
                  Text('シート: $seatNumber'),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(),
            child: const Text('キャンセル'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.of(dialogCtx).pop();
              await _executeBustAndExit(
                context: outerCtx,
                user: user,
                tournamentId: tournamentId,
                tableId: tableId,
                seatNumber: seatNumber,
                closeUserActionMenuOnSuccess: closeUserActionMenuOnSuccess,
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('確定'),
          ),
        ],
      );
    },
  );
}

/// Bust&退席処理を実行
Future<void> _executeBustAndExit({
  required BuildContext context,
  required Map<String, dynamic> user,
  required String tournamentId,
  required String tableId,
  required int seatNumber,
  bool closeUserActionMenuOnSuccess = false,
}) async {
  final feedback = ActionProgressDialogController(context);

  try {
    debugPrint('=== ローディングダイアログ表示開始 ===');
    await feedback.showLoading(message: 'Bust&退席処理中...');
    debugPrint('=== ローディングダイアログ表示完了 ===');

    // Cloud Function呼び出し（タイムアウト付き）
    final functions = FunctionsClient.instance;
    final callable = functions.httpsCallable('bustAndExit');

    debugPrint('=== Bust&退席Cloud Function呼び出し開始 ===');
    debugPrint('tournamentId: $tournamentId');
    debugPrint('tableId: $tableId');
    debugPrint('seatNumber: $seatNumber');
    debugPrint('userId: ${user['userId']}');

    // 操作記録用の operationId（1 試行 1 ドキュメント）
    final operationId =
        '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF).toRadixString(16)}';
    final device = await DeviceService().getCurrentDevice();
    final deviceName = device?.name;

    debugPrint('=== Cloud Function呼び出し実行中 ===');
    final result = await callable
        .call({
          'operationId': operationId,
          'tournamentId': tournamentId,
          'tableId': tableId,
          'seatNumber': seatNumber,
          'userId': user['userId'],
          if (deviceName != null && deviceName.isNotEmpty)
            'deviceName': deviceName,
        })
        .timeout(
          const Duration(seconds: 30),
          onTimeout: () {
            debugPrint('=== タイムアウト発生 ===');
            throw TimeoutException('Cloud Functionの呼び出しがタイムアウトしました');
          },
        );
    debugPrint('=== Cloud Function呼び出し完了 ===');

    debugPrint('=== Cloud Function応答 ===');
    debugPrint('result.data: ${result.data}');

    // 結果を確認
    final data = result.data as Map<String, dynamic>;

    debugPrint('=== レスポンス解析 ===');
    debugPrint('response: $data');
    debugPrint('success: ${data['success']}');

    feedback.hideLoading();

    if (isCallableSuccessResponse(data)) {
      if (context.mounted) {
        await showActionSuccessDialog(
          context,
          message: '${user['pokerName']}様のBust&退席処理が完了しました',
        );
        if (closeUserActionMenuOnSuccess && context.mounted) {
          Navigator.of(context).pop();
        }
      }
    } else {
      // USER-44 soft-fail: raw error 非表示
      if (context.mounted) {
        await showActionErrorDialog(
          context,
          message: mapCallableSoftFailMessage(data),
        );
      }
    }
  } catch (e) {
    debugPrint('=== Bust&退席処理エラー ===');
    debugPrint('error: $e');

    feedback.hideLoading();
    if (context.mounted) {
      await showActionErrorDialog(
        context,
        message: buildAsyncActionErrorMessage(
          e,
          defaultMessage: 'Bust&退席に失敗しました',
        ),
      );
    }
  } finally {
    feedback.hideLoading();
  }
}
