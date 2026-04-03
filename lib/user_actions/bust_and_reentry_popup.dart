import 'dart:async';
import 'package:amuse_app_template/core/utils/functions_client.dart';

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
}) async {
  final String userId = (user['userId'] ?? '').toString();
  final String pokerName = (user['pokerName'] ?? '').toString();
  
  if (userId.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('ユーザー識別子が見つかりません')),
    );
    return;
  }
  


  // トーナメント情報を取得
  Map<String, dynamic>? tournamentData;
  Map<String, dynamic>? userTournamentData;
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
          userTournamentData = tournamentData;
        }
      }
    }
    
    isLoading = false;
  } catch (e) {
    isLoading = false;
    errorMessage = e.toString();
  }

  if (errorMessage != null) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('エラー: $errorMessage')),
      );
    }
    return;
  }

  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (BuildContext context) {
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
                    Text('リエントリーフィー: ¥${tournamentData?['snapshot']?['reentryFee'] ?? 0}'),
                    const SizedBox(height: 8),
                    Text('現在のリエントリー回数: $currentReentryCount回'),
                    const SizedBox(height: 8),
                    Text('最大リエントリー回数: ${tournamentData?['snapshot']?['maxReentriesPerPlayer'] ?? '無制限'}回'),
                    const SizedBox(height: 16),
                    if (tournamentData?['snapshot']?['maxReentriesPerPlayer'] != null &&
                        currentReentryCount >= (tournamentData!['snapshot']['maxReentriesPerPlayer'] as int))
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.red.shade100,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'リエントリー制限に達しているためリエントリーできません',
                          style: TextStyle(color: Colors.red, fontWeight: FontWeight.bold),
                        ),
                      ),
                  ],
                ),
              ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('キャンセル'),
          ),
          if (tournamentData?['snapshot']?['maxReentriesPerPlayer'] == null ||
              currentReentryCount < (tournamentData!['snapshot']['maxReentriesPerPlayer'] as int))
            ElevatedButton(
              onPressed: () async {
                // 先に確認ダイアログを閉じる
                Navigator.of(context).pop();
                
                // Cloud Functionを実行
                await _executeBustAndReentry(
                  context: context,
                  userId: userId,
                  pokerName: pokerName,
                  tournamentId: tournamentId,
                  tableId: tableId,
                  seatNumber: seatNumber,
                  tournamentData: tournamentData!,
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
}) async {
  // Overlayを使用したローディング表示
  OverlayEntry? loadingOverlay;
  
  try {
    // ローディング表示
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
                Text('Bust＆リエントリー処理中...'),
              ],
            ),
          ),
        ),
      ),
    );
    
    // Overlayに追加
    Overlay.of(context).insert(loadingOverlay);
    
    print('=== Bust＆リエントリー処理開始 ===');
    print('userId: $userId');
    print('pokerName: $pokerName');
    print('tournamentId: $tournamentId');
    print('tableId: $tableId');
    print('seatNumber: $seatNumber');
    
    final operationId =
        '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF).toRadixString(16)}';
    final device = await DeviceService().getCurrentDevice();
    final deviceName = device?.name;

    final functions = FunctionsClient.instance;
    final callable = functions.httpsCallable('bustAndReentry');

    print('=== Cloud Function呼び出し実行中 ===');
    final result = await callable.call({
      'operationId': operationId,
      'tournamentId': tournamentId,
      'userId': userId,
      'tableId': tableId,
      'seatNumber': seatNumber,
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
              content: Text('$pokerName様のリエントリー処理が完了しました'),
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
            content: Text('リエントリー処理に失敗しました: ${data['error'] ?? '不明なエラー'}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  } catch (e) {
    print('=== Bust＆リエントリー処理エラー ===');
    print('error: $e');
    
    // エラーメッセージを表示
    if (context.mounted) {
      String errorMessage = 'リエントリー処理に失敗しました';
      
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
