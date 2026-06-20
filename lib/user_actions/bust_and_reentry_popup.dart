import 'dart:async';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:amuse_app_template/user_actions/action_feedback_dialogs.dart';

import 'dart:math';

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/services/device_service.dart';

/// Bust＆リエントリー確認ダイアログ
Future<void> showBustAndReentryDialog({
  required BuildContext context,
  required Map<String, dynamic> user,
  required String tournamentId,
  required String tableId,
  required int seatNumber,
  bool closeUserActionMenuOnSuccess = false,
}) async {
  final outerCtx = context;
  final String userId = (user['userId'] ?? '').toString();
  final String pokerName = (user['pokerName'] ?? '').toString();

  if (userId.isEmpty) {
    ScaffoldMessenger.of(
      outerCtx,
    ).showSnackBar(const SnackBar(content: Text('ユーザー識別子が見つかりません')));
    return;
  }

  // トーナメント情報を取得
  Map<String, dynamic>? tournamentData;
  int currentReentryCount = 0;
  bool isLoading = true;
  String? errorMessage;

  try {
    // トーナメント情報を取得
    final tournamentDoc = await FirebaseFirestore.instance
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .get();

    if (!tournamentDoc.exists) {
      throw Exception('トーナメントが見つかりません');
    }

    tournamentData = tournamentDoc.data()!;

    // activeStays から billId を取得
    final activeStayDoc = await FirebaseFirestore.instance
        .collection('activeStays')
        .doc(userId)
        .get();

    if (activeStayDoc.exists && activeStayDoc.data()?['isActive'] == true) {
      final billId = activeStayDoc.data()!['billId'] as String?;

      if (billId != null) {
        // bills サブコレクションからトーナメント情報を取得
        final tournamentDoc = await FirebaseFirestore.instance
            .collection('bills')
            .doc(billId)
            .collection('tournaments')
            .doc(tournamentId)
            .get();

        if (tournamentDoc.exists) {
          final tournamentData = tournamentDoc.data()!;
          currentReentryCount = tournamentData['reentryCount'] as int? ?? 0;
        }
      }
    }

    isLoading = false;
  } catch (e) {
    isLoading = false;
    errorMessage = e.toString();
  }

  if (errorMessage != null) {
    if (outerCtx.mounted) {
      await showActionErrorDialog(outerCtx, message: 'エラー: $errorMessage');
    }
    return;
  }

  if (!outerCtx.mounted) {
    return;
  }

  await showDialog<void>(
    context: outerCtx,
    barrierDismissible: false,
    builder: (BuildContext dialogCtx) {
      return AlertDialog(
        title: const Text('Bust＆リエントリー確認'),
        content: isLoading
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('対象ユーザー: $pokerName'),
                    const SizedBox(height: 16),
                    Text(
                      'リエントリーフィー: ¥${tournamentData?['snapshot']?['reentryFee'] ?? 0}',
                    ),
                    const SizedBox(height: 8),
                    Text('現在のリエントリー回数: $currentReentryCount回'),
                    const SizedBox(height: 8),
                    Text(
                      '最大リエントリー回数: ${tournamentData?['snapshot']?['maxReentriesPerPlayer'] ?? '無制限'}回',
                    ),
                    const SizedBox(height: 16),
                    if (tournamentData?['snapshot']?['maxReentriesPerPlayer'] !=
                            null &&
                        currentReentryCount >=
                            (tournamentData!['snapshot']['maxReentriesPerPlayer']
                                as int))
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.red.shade100,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'リエントリー制限に達しているためリエントリーできません',
                          style: TextStyle(
                            color: Colors.red,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(),
            child: const Text('キャンセル'),
          ),
          if (tournamentData?['snapshot']?['maxReentriesPerPlayer'] == null ||
              currentReentryCount <
                  (tournamentData!['snapshot']['maxReentriesPerPlayer'] as int))
            ElevatedButton(
              onPressed: () async {
                // 先に確認ダイアログを閉じる
                Navigator.of(dialogCtx).pop();

                // Cloud Functionを実行
                await _executeBustAndReentry(
                  context: outerCtx,
                  userId: userId,
                  pokerName: pokerName,
                  tournamentId: tournamentId,
                  tableId: tableId,
                  seatNumber: seatNumber,
                  tournamentData: tournamentData!,
                  closeUserActionMenuOnSuccess: closeUserActionMenuOnSuccess,
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue,
                foregroundColor: Colors.white,
              ),
              child: const Text('確定'),
            ),
        ],
      );
    },
  );
}

/// Bust＆リエントリー処理を実行
Future<void> _executeBustAndReentry({
  required BuildContext context,
  required String userId,
  required String pokerName,
  required String tournamentId,
  required String tableId,
  required int seatNumber,
  required Map<String, dynamic> tournamentData,
  bool closeUserActionMenuOnSuccess = false,
}) async {
  final feedback = ActionProgressDialogController(context);

  try {
    await feedback.showLoading(message: 'Bust＆リエントリー処理中...');

    debugPrint('=== Bust＆リエントリー処理開始 ===');
    debugPrint('userId: $userId');
    debugPrint('pokerName: $pokerName');
    debugPrint('tournamentId: $tournamentId');
    debugPrint('tableId: $tableId');
    debugPrint('seatNumber: $seatNumber');
    final operationId =
        '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF).toRadixString(16)}';
    final device = await DeviceService().getCurrentDevice();
    final deviceName = device?.name;

    final functions = FunctionsClient.instance;
    final callable = functions.httpsCallable('bustAndReentry');

    debugPrint('=== Cloud Function呼び出し実行中 ===');
    final result = await callable
        .call({
          'operationId': operationId,
          'tournamentId': tournamentId,
          'userId': userId,
          'tableId': tableId,
          'seatNumber': seatNumber,
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

    if (data['success'] == true) {
      if (context.mounted) {
        await showActionSuccessDialog(
          context,
          message: '$pokerName様のリエントリー処理が完了しました',
        );
        if (closeUserActionMenuOnSuccess && context.mounted) {
          Navigator.of(context).pop();
        }
      }
    } else {
      if (context.mounted) {
        await showActionErrorDialog(
          context,
          message: 'リエントリー処理に失敗しました: ${data['error'] ?? '不明なエラー'}',
        );
      }
    }
  } catch (e) {
    debugPrint('=== Bust＆リエントリー処理エラー ===');
    debugPrint('error: $e');

    feedback.hideLoading();
    if (context.mounted) {
      await showActionErrorDialog(
        context,
        message: buildAsyncActionErrorMessage(
          e,
          defaultMessage: 'リエントリー処理に失敗しました',
        ),
      );
    }
  } finally {
    feedback.hideLoading();
  }
}
