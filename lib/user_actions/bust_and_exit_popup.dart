import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:amuse_app_template/services/device_service.dart';

/// Bust&退席確認ダイアログ
Future<void> showBustAndExitDialog({
  required BuildContext context,
  required Map<String, dynamic> user,
  required String tournamentId,
  required String tableId,
  required int seatNumber,
}) async {
  final pokerName = user['pokerName'] as String? ?? 'Unknown';
  
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (BuildContext context) {
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
            const SizedBox(height: 16),
            Text(
              'この操作により、ユーザーは卓から退席し、Bustしたプレイヤー数が増加します。',
              style: TextStyle(color: Colors.red.shade700),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('キャンセル'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.of(context).pop();
              await _executeBustAndExit(
                context: context,
                user: user,
                tournamentId: tournamentId,
                tableId: tableId,
                seatNumber: seatNumber,
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
}) async {
  // Overlayを使用したローディング表示
  OverlayEntry? loadingOverlay;
  
  try {
    // ローディング表示
    print('=== ローディングダイアログ表示開始 ===');
    
    // Overlayを使用してローディングを表示
    loadingOverlay = OverlayEntry(
      builder: (context) => Material(
        color: Colors.black54,
        child: Center(
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                SizedBox(width: 16),
                Text('Bust&退席処理中...'),
              ],
            ),
          ),
        ),
      ),
    );
    
    // Overlayに追加
    Overlay.of(context).insert(loadingOverlay);
    print('=== ローディングダイアログ表示完了 ===');

    // Cloud Function呼び出し（タイムアウト付き）
    final functions = FirebaseFunctions.instance;
    final callable = functions.httpsCallable('bustAndExit');
    
    print('=== Bust&退席Cloud Function呼び出し開始 ===');
    print('tournamentId: $tournamentId');
    print('tableId: $tableId');
    print('seatNumber: $seatNumber');
    print('userId: ${user['userId']}');
    
    // 操作記録用の operationId（1 試行 1 ドキュメント）
    final operationId =
        '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF).toRadixString(16)}';
    final device = await DeviceService().getCurrentDevice();
    final deviceName = device?.name;

    print('=== Cloud Function呼び出し実行中 ===');
    final result = await callable.call({
      'operationId': operationId,
      'tournamentId': tournamentId,
      'tableId': tableId,
      'seatNumber': seatNumber,
      'userId': user['userId'],
      if (deviceName != null && deviceName.isNotEmpty) 'deviceName': deviceName,
    }).timeout(
      const Duration(seconds: 30),
      onTimeout: () {
        print('=== タイムアウト発生 ===');
        throw TimeoutException('Cloud Functionの呼び出しがタイムアウトしました');
      },
    );
    print('=== Cloud Function呼び出し完了 ===');

    print('=== Cloud Function応答 ===');
    print('result.data: ${result.data}');

    // 結果を確認
    final data = result.data as Map<String, dynamic>;

    print('=== レスポンス解析 ===');
    print('response: $data');
    print('success: ${data['success']}');
    
    if (data['success'] == true) {
      // 成功メッセージを表示
      if (context.mounted) {
        showDialog(
          context: context,
          builder: (BuildContext context) {
            return AlertDialog(
              title: Row(
                children: [
                  Icon(Icons.check_circle, color: Colors.green),
                  const SizedBox(width: 8),
                  const Text('完了'),
                ],
              ),
              content: Text('${user['pokerName']}様のBust&退席処理が完了しました'),
              actions: [
                ElevatedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('OK'),
                ),
              ],
            );
          },
        );
      }
    } else {
      // エラーメッセージを表示
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Bust&退席に失敗しました: ${data['error'] ?? '不明なエラー'}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  } catch (e) {
    print('=== Bust&退席処理エラー ===');
    print('error: $e');
    
    // エラーメッセージを表示
    if (context.mounted) {
      String errorMessage = 'Bust&退席に失敗しました';
      
      if (e is TimeoutException) {
        errorMessage = '処理がタイムアウトしました。しばらく待ってから再試行してください。';
      } else if (e.toString().contains('network')) {
        errorMessage = 'ネットワークエラーが発生しました。接続を確認してください。';
      } else if (e.toString().contains('permission')) {
        errorMessage = '権限が不足しています。管理者に連絡してください。';
      }
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(errorMessage),
          backgroundColor: Colors.red,
          duration: const Duration(seconds: 5),
          action: SnackBarAction(
            label: '詳細',
            textColor: Colors.white,
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('詳細エラー: $e'),
                  backgroundColor: Colors.red.shade800,
                  duration: const Duration(seconds: 3),
                ),
              );
            },
          ),
        ),
      );
    }
  } finally {
    // ローディングを確実に閉じる
    if (loadingOverlay != null) {
      loadingOverlay.remove();
    }
  }
}
