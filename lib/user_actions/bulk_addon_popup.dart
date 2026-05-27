import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:amuse_app_template/tournament/template/template_addon_limit_helpers.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:async';

/// まとめてAddon確認ダイアログ
Future<void> showBulkAddonDialog({
  required BuildContext context,
  required String tournamentId,
  required String tableId,
}) async {
  // 外側のコンテキストを退避
  final outerCtx = context;
  
  // テーブルの座席情報を取得
  Map<String, dynamic>? tableData;
  String? errorMessage;

  try {
    final tableDoc = await FirebaseFirestore.instance
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get();
    
    if (!tableDoc.exists) {
      throw Exception('テーブルが見つかりません');
    }
    
    tableData = tableDoc.data()!;
  } catch (e) {
    errorMessage = e.toString();
  }

  if (errorMessage != null) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(outerCtx).showSnackBar(
        SnackBar(
          content: Text('エラー: $errorMessage'),
          backgroundColor: Colors.red,
          duration: const Duration(seconds: 5),
        ),
      );
    }
    return;
  }

  // 着席しているユーザーを抽出
  List<Map<String, dynamic>> seatedUsers = [];
  
  final maxSeats = tableData?['maxSeats'] as int? ?? 10;
  final seats = tableData?['seats'] as Map<String, dynamic>? ?? {};
  
  for (int i = 1; i <= maxSeats; i++) {
    final seatNoStr = i.toString().padLeft(2, '0');
    final seatUserId = seats['seat${seatNoStr}UserId'] as String?;
    final seatPokerName = seats['seat${seatNoStr}PokerName'] as String?;
    
    final isOccupied = seatUserId != null && seatUserId.isNotEmpty;
    
    if (isOccupied && seatPokerName != null) {
      seatedUsers.add({
        'userId': seatUserId,
        'pokerName': seatPokerName,
        'seatNumber': i,
      });
    }
  }

  if (seatedUsers.isEmpty) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(outerCtx).showSnackBar(
        const SnackBar(
          content: Text('このテーブルには着席しているユーザーがいません。'),
          backgroundColor: Colors.orange,
          duration: Duration(seconds: 3),
        ),
      );
    }
    return;
  }

  final tournamentScheduleDoc =
      await FirebaseFirestore.instance.collection('scheduledTournaments').doc(tournamentId).get();

  if (!tournamentScheduleDoc.exists || tournamentScheduleDoc.data() == null) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(outerCtx).showSnackBar(
        const SnackBar(content: Text('トーナメントが見つかりません'), backgroundColor: Colors.red),
      );
    }
    return;
  }

  final stData = tournamentScheduleDoc.data()!;
  final templateIdStr = (stData['templateId'] as String?) ?? '';
  final snap = stData['snapshot'] as Map<String, dynamic>? ?? {};
  final addonLimit = resolveAddonLimitPerPlayerUi(
    isAddon: snap['isAddon'] as bool? ?? false,
    addonLimitPerPlayer: snap['addonLimitPerPlayer'],
  );

  if (addonLimit <= 0) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(outerCtx).showSnackBar(
        const SnackBar(
          content: Text('このトーナメントではAddonができません'),
          backgroundColor: Colors.orange,
        ),
      );
    }
    return;
  }

  if (templateIdStr.isEmpty) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(outerCtx).showSnackBar(
        const SnackBar(
          content: Text('トーナメントの templateId が取得できません'),
          backgroundColor: Colors.red,
        ),
      );
    }
    return;
  }

  final seatUsersAddonRead = List<Map<String, dynamic>>.from(
    seatedUsers.map((u) => Map<String, dynamic>.from(u)),
  );

  for (final user in seatUsersAddonRead) {
    final userId = user['userId'] as String;
    try {
      final activeStayDoc =
          await FirebaseFirestore.instance.collection('activeStays').doc(userId).get();

      int addonCount = 0;
      if (activeStayDoc.exists && activeStayDoc.data()?['isActive'] == true) {
        final billId = activeStayDoc.data()!['billId'] as String?;
        if (billId != null) {
          final billTournamentDoc = await FirebaseFirestore.instance
              .collection('bills')
              .doc(billId)
              .collection('tournaments')
              .doc(templateIdStr)
              .get();
          if (billTournamentDoc.exists) {
            final bd = billTournamentDoc.data()!;
            addonCount =
                bd['addonCount'] is int
                    ? bd['addonCount'] as int
                    : ((bd['addonCount'] as num?)?.toInt() ?? 0);
          }
        }
      }
      user['_addonCount'] = addonCount;
    } catch (_) {
      user['_addonCount'] = 0;
    }
  }

  // リスト表示は読取結果付きリストを参照
  seatedUsers = seatUsersAddonRead;

  final selectableExists = seatedUsers.any((u) {
    final ac = u['_addonCount'];
    final n = ac is int ? ac : (ac as num?)?.toInt() ?? 0;
    return n < addonLimit;
  });

  if (!selectableExists) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(outerCtx).showSnackBar(
        const SnackBar(
          content: Text('全員が Addon 上限に達しています'),
          backgroundColor: Colors.orange,
          duration: Duration(seconds: 4),
        ),
      );
    }
    return;
  }

  if (!outerCtx.mounted) return;

  // ユーザー選択ダイアログを表示（直前まで非同期のため mounted を確認済み）
  await showDialog<void>(
    context: outerCtx,
    barrierDismissible: false,
    builder: (BuildContext dialogCtx) {
      Set<String> selectedUserIds = {};
      
      return StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: Row(
              children: [
                Icon(Icons.group_add, color: Colors.blue),
                const SizedBox(width: 8),
                const Text('まとめてAddon'),
              ],
            ),
            content: SizedBox(
              width: double.maxFinite,
              height: 300,
              child: Column(
                children: [
                  const Text(
                    'Addon処理を行うユーザーを選択してください:',
                    style: TextStyle(fontSize: 14),
                  ),
                  const SizedBox(height: 16),
                  Expanded(
                    child: ListView.builder(
                      itemCount: seatedUsers.length,
                      itemBuilder: (context, index) {
                        final user = seatedUsers[index];
                        final userId = user['userId'] as String;
                        final pokerName = user['pokerName'] as String;
                        final seatNumber = user['seatNumber'] as int;
                        final acRaw = user['_addonCount'];
                        final addonCount =
                            acRaw is int ? acRaw : (acRaw as num?)?.toInt() ?? 0;
                        final isAlreadyAddon = addonCount >= addonLimit;

                        return CheckboxListTile(
                          title: Text(
                            pokerName,
                            style: TextStyle(
                              color: isAlreadyAddon ? Colors.grey : null,
                            ),
                          ),
                          subtitle: Text(
                            isAlreadyAddon
                                ? '席番号: $seatNumber (上限到達 $addonCount / $addonLimit 回)'
                                : '席番号: $seatNumber ($addonCount / $addonLimit 回)',
                            style: TextStyle(
                              color: isAlreadyAddon ? Colors.grey : null,
                            ),
                          ),
                          value: isAlreadyAddon ? false : selectedUserIds.contains(userId),
                          onChanged: isAlreadyAddon ? null : (bool? value) {
                            setState(() {
                              if (value == true) {
                                selectedUserIds.add(userId);
                              } else {
                                selectedUserIds.remove(userId);
                              }
                            });
                          },
                          controlAffinity: ListTileControlAffinity.leading,
                        );
                      },
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
              ElevatedButton(
                onPressed: selectedUserIds.isEmpty
                    ? null
                    : () {
                        final selectedUsersList = seatedUsers
                            .where((user) => selectedUserIds.contains(user['userId']))
                            .toList();
                        
                        // ダイアログを先に閉じる
                        Navigator.of(dialogCtx).pop();
                        
                        // 非同期処理を開始（outerCtxを使用）
                        if (outerCtx.mounted) {
                          _processBulkAddon(
                            context: outerCtx,
                            tournamentId: tournamentId,
                            tableId: tableId,
                            selectedUsers: selectedUsersList,
                          ).catchError((error) {
                            // エラーハンドリング（outerCtxを使用）
                            if (outerCtx.mounted) {
                              _showErrorDialog(outerCtx, 'エラーが発生しました: $error');
                            }
                          });
                        }
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: selectedUserIds.isEmpty ? Colors.grey : Colors.blue,
                  foregroundColor: Colors.white,
                ),
                child: Text(selectedUserIds.isEmpty ? 'ユーザーを選択してください' : '確定'),
              ),
            ],
          );
        },
      );
    },
  );
}

/// まとめてAddon処理を実行（非同期）
Future<void> _processBulkAddon({
  required BuildContext context,
  required String tournamentId,
  required String tableId,
  required List<Map<String, dynamic>> selectedUsers,
}) async {
  // ローディングダイアログを表示
  OverlayEntry? loadingOverlay;
  
  try {
    // mountedチェック
    if (!context.mounted) return;
    
    // ローディング表示
    final overlayState = Overlay.maybeOf(context, rootOverlay: true);
    if (overlayState == null) {
      // Overlayが取得できない場合はSnackBarで代替
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('まとめてAddon処理中...'),
            duration: Duration(seconds: 2),
          ),
        );
      }
    } else {
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
                  Text('まとめてAddon処理中...'),
                ],
              ),
            ),
          ),
        ),
      );
      
      overlayState.insert(loadingOverlay);
    }

    // トーナメント情報を取得
    final tournamentDoc = await FirebaseFirestore.instance
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .get();
    
    if (!context.mounted) return;
    
    if (!tournamentDoc.exists) {
      if (context.mounted) {
        _showErrorDialog(context, 'トーナメントが見つかりません');
      }
      return;
    }
    
    final tournamentData = tournamentDoc.data()!;
    final snap = tournamentData['snapshot'] as Map<String, dynamic>? ?? {};
    final addonLimitQuick = resolveAddonLimitPerPlayerUi(
      isAddon: snap['isAddon'] as bool? ?? false,
      addonLimitPerPlayer: snap['addonLimitPerPlayer'],
    );

    if (!context.mounted) return;

    if (addonLimitQuick <= 0) {
      if (context.mounted) {
        _showErrorDialog(context, 'このトーナメントではAddonができません');
      }
      return;
    }

    // Cloud Function呼び出し
    final functions = FunctionsClient.instance;
    final callable = functions.httpsCallable('bulkAddon');
    
    print('=== Cloud Function呼び出し開始 ===');
    print('送信データ: ${selectedUsers.map((user) => {
      'userId': user['userId'],
      'pokerName': user['pokerName'],
    }).toList()}');
    
    final result = await callable.call({
      'tournamentId': tournamentId,
      'tableId': tableId,
      'users': selectedUsers.map((user) => {
        'userId': user['userId'],
        'pokerName': user['pokerName'],
      }).toList(),
    }).timeout(
      const Duration(seconds: 60),
      onTimeout: () {
        throw TimeoutException('Cloud Functionの呼び出しがタイムアウトしました');
      },
    );

    print('=== Cloud Function呼び出し完了 ===');
    print('result.data: ${result.data}');
    print('result.data type: ${result.data.runtimeType}');
    
    if (!context.mounted) return;
    
    final data = result.data as Map<String, dynamic>;
    print('=== レスポンス解析 ===');
    print('data: $data');
    print('data type: ${data.runtimeType}');
    print('data[\'success\']: ${data['success']}');
    print('data[\'success\'] type: ${data['success'].runtimeType}');
    print('data[\'success\'] == true: ${data['success'] == true}');
    print('data[\'success\'] is bool: ${data['success'] is bool}');
    
    if (data['success'] == true) {
      print('=== 成功パス ===');
      final processedNames = selectedUsers.map((user) => user['pokerName'] as String).join('様, ');
      final message = '$processedNames様のAddon処理は正常に完了しました';
      print('表示メッセージ: $message');
      print('context.mounted: ${context.mounted}');
      
      if (context.mounted) {
        // 成功ダイアログを表示
        _showSuccessDialog(context, message);
      }
    } else {
      print('=== 失敗パス ===');
      final errorMessage = 'まとめてAddon登録に失敗しました: ${data['error'] ?? '不明なエラー'}';
      print('エラーメッセージ: $errorMessage');
      
      if (context.mounted) {
        // エラーダイアログを表示
        _showErrorDialog(context, errorMessage);
      }
    }
  } catch (e) {
    print('=== 例外発生 ===');
    print('例外: $e');
    print('例外タイプ: ${e.runtimeType}');
    
    String errorMessage = 'まとめてAddon登録に失敗しました';
    
    if (e is TimeoutException) {
      errorMessage = '処理がタイムアウトしました。しばらく待ってから再試行してください。';
    } else if (e.toString().contains('network')) {
      errorMessage = 'ネットワークエラーが発生しました。接続を確認してください。';
    } else if (e.toString().contains('permission')) {
      errorMessage = '権限が不足しています。管理者に連絡してください。';
    }
    
    if (context.mounted) {
      _showErrorDialog(context, '$errorMessage\n詳細: $e');
    }
  } finally {
    // ローディングを確実に閉じる
    if (loadingOverlay != null) {
      loadingOverlay.remove();
    }
  }
}

/// 成功ダイアログを表示
void _showSuccessDialog(BuildContext context, String message) {
  print('=== 成功ダイアログ表示開始 ===');
  
  // Overlay.maybeOfを使用して安全にOverlayを取得
  final overlayState = Overlay.maybeOf(context, rootOverlay: true);
  
  if (overlayState == null) {
    // Overlayが取得できない場合はshowDialogで代替
    print('=== Overlay取得失敗、showDialogで代替 ===');
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            const Icon(Icons.check_circle, color: Colors.green),
            const SizedBox(width: 8),
            const Text('完了'),
          ],
        ),
        content: Text(message),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green,
              foregroundColor: Colors.white,
            ),
            child: const Text('OK'),
          ),
        ],
      ),
    );
    return;
  }
  
  // OverlayEntryを使用してダイアログを表示
  late final OverlayEntry overlayEntry;
  
  overlayEntry = OverlayEntry(
    builder: (context) => Material(
      color: Colors.black54,
      child: Center(
        child: Container(
          margin: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: const BoxDecoration(
                  color: Colors.green,
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(10),
                    topRight: Radius.circular(10),
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.check_circle, color: Colors.white),
                    const SizedBox(width: 8),
                    const Text(
                      '完了',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  message,
                  style: const TextStyle(fontSize: 16),
                ),
              ),
              Container(
                padding: const EdgeInsets.all(16),
                child: ElevatedButton(
                  onPressed: () {
                    overlayEntry.remove();
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('OK'),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
  
  overlayState.insert(overlayEntry);
  print('=== 成功ダイアログ表示完了 ===');
}

/// エラーダイアログを表示
void _showErrorDialog(BuildContext context, String message) {
  print('=== エラーダイアログ表示開始 ===');
  
  // Overlay.maybeOfを使用して安全にOverlayを取得
  final overlayState = Overlay.maybeOf(context, rootOverlay: true);
  
  if (overlayState == null) {
    // Overlayが取得できない場合はshowDialogで代替
    print('=== Overlay取得失敗、showDialogで代替 ===');
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            const Icon(Icons.error, color: Colors.red),
            const SizedBox(width: 8),
            const Text('エラー'),
          ],
        ),
        content: Text(message),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('OK'),
          ),
        ],
      ),
    );
    return;
  }
  
  // OverlayEntryを使用してダイアログを表示
  late final OverlayEntry overlayEntry;
  
  overlayEntry = OverlayEntry(
    builder: (context) => Material(
      color: Colors.black54,
      child: Center(
        child: Container(
          margin: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: const BoxDecoration(
                  color: Colors.red,
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(10),
                    topRight: Radius.circular(10),
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error, color: Colors.white),
                    const SizedBox(width: 8),
                    const Text(
                      'エラー',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  message,
                  style: const TextStyle(fontSize: 16),
                ),
              ),
              Container(
                padding: const EdgeInsets.all(16),
                child: ElevatedButton(
                  onPressed: () {
                    overlayEntry.remove();
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text('OK'),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
  
  overlayState.insert(overlayEntry);
  print('=== エラーダイアログ表示完了 ===');
}
