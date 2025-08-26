import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

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
    
    // todaysBillsからユーザーのトーナメント情報を取得
    final todayBillsQuery = await FirebaseFirestore.instance
        .collection('todaysBills')
        .where('userId', isEqualTo: userId)
        .where('status', isEqualTo: 'open')
        .limit(1)
        .get();
    
    if (todayBillsQuery.docs.isNotEmpty) {
      final todayBillsData = todayBillsQuery.docs.first.data();
      final tournaments = todayBillsData['tournaments'] as Map<String, dynamic>? ?? {};
      userTournamentData = tournaments[tournamentId];
      
      // リエントリー回数を計算
      if (userTournamentData != null) {
        // 既存のトーナメント情報からリエントリー回数を計算
        if (userTournamentData['reentryFee'] != null) {
          // リエントリーフィーが設定されている場合、これはリエントリー
          currentReentryCount = 1;
        } else if (userTournamentData['entryFee'] != null) {
          // エントリーフィーが設定されている場合、これは初回エントリー
          currentReentryCount = 0;
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
                // 先にCloud Functionを実行
                await _executeBustAndReentry(
                  context: context,
                  userId: userId,
                  pokerName: pokerName,
                  tournamentId: tournamentId,
                  tableId: tableId,
                  seatNumber: seatNumber,
                  tournamentData: tournamentData!,
                );
                
                // 処理完了後にダイアログを閉じる
                if (context.mounted) {
                  Navigator.of(context).pop();
                }
              },
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
  try {
    print('=== Bust＆リエントリー処理開始 ===');
    print('userId: $userId');
    print('pokerName: $pokerName');
    print('tournamentId: $tournamentId');
    print('tableId: $tableId');
    print('seatNumber: $seatNumber');
    
    final functions = FirebaseFunctions.instance;
    final callable = functions.httpsCallable('bustAndReentry');
    
    final result = await callable.call({
      'tournamentId': tournamentId,
      'userId': userId,
      'tableId': tableId,
      'seatNumber': seatNumber,
    });

    print('=== Cloud Function応答 ===');
    print('result.data: ${result.data}');

    final response = result.data as Map<String, dynamic>;
    
    print('=== レスポンス解析 ===');
    print('response: $response');
    print('success: ${response['success']}');
    
    if (response['success'] == true) {
      print('=== 成功処理開始 ===');
      if (context.mounted) {
        print('context.mounted: true');
        // 成功メッセージのポップアップを表示
        await showDialog<void>(
          context: context,
          barrierDismissible: true,
          builder: (BuildContext context) {
            print('=== ダイアログビルダー実行 ===');
            return AlertDialog(
              title: const Text('リエントリー完了'),
              content: Text('$pokerName様のリエントリー処理が完了しました'),
              actions: [
                TextButton(
                  onPressed: () {
                    print('=== OKボタン押下 ===');
                    Navigator.of(context).pop();
                  },
                  child: const Text('OK'),
                ),
              ],
            );
          },
        );
        print('=== ダイアログ表示完了 ===');
      } else {
        print('context.mounted: false');
      }
    } else {
      print('=== エラー処理 ===');
      print('error: ${response['error']}');
      throw Exception(response['error'] ?? '不明なエラー');
    }
  } catch (e) {
    print('=== 例外処理 ===');
    print('error: $e');
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('リエントリー処理に失敗しました: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
}
