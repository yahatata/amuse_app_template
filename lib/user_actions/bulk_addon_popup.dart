import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:amuse_app_template/tournament/template/template_addon_limit_helpers.dart';
import 'package:amuse_app_template/user_actions/action_feedback_dialogs.dart';
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

  // 着席している対象を抽出（通常ユーザー + 置きバケ）
  List<Map<String, dynamic>> seatedTargets = [];

  final maxSeats = tableData?['maxSeats'] as int? ?? 10;
  final seats = tableData?['seats'] as Map<String, dynamic>? ?? {};

  for (int i = 1; i <= maxSeats; i++) {
    final seatNoStr = i.toString().padLeft(2, '0');
    final seatUserId = seats['seat${seatNoStr}UserId'] as String?;
    final seatOkibakeEntryId =
        seats['seat${seatNoStr}OkibakeEntryId'] as String?;
    final seatPokerName = seats['seat${seatNoStr}PokerName'] as String?;

    final hasNormalUser = seatUserId != null && seatUserId.isNotEmpty;
    final hasOkibake =
        seatOkibakeEntryId != null && seatOkibakeEntryId.isNotEmpty;

    if (hasNormalUser && seatPokerName != null) {
      seatedTargets.add({
        'targetType': 'normal',
        'targetKey': 'normal:$seatUserId',
        'userId': seatUserId,
        'pokerName': seatPokerName,
        'seatNumber': i,
      });
    } else if (hasOkibake && seatPokerName != null) {
      seatedTargets.add({
        'targetType': 'okibake',
        'targetKey': 'okibake:$seatOkibakeEntryId',
        'okibakeEntryId': seatOkibakeEntryId,
        'pokerName': seatPokerName,
        'seatNumber': i,
      });
    }
  }

  if (seatedTargets.isEmpty) {
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

  final tournamentScheduleDoc = await FirebaseFirestore.instance
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .get();

  if (!tournamentScheduleDoc.exists || tournamentScheduleDoc.data() == null) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(outerCtx).showSnackBar(
        const SnackBar(
          content: Text('トーナメントが見つかりません'),
          backgroundColor: Colors.red,
        ),
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

  final seatTargetsAddonRead = List<Map<String, dynamic>>.from(
    seatedTargets.map((u) => Map<String, dynamic>.from(u)),
  );

  // 通常参加者は activeStay/bill から Addon回数を読む
  for (final target in seatTargetsAddonRead.where(
    (t) => t['targetType'] == 'normal',
  )) {
    final userId = target['userId'] as String;
    try {
      final activeStayDoc = await FirebaseFirestore.instance
          .collection('activeStays')
          .doc(userId)
          .get();

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
            addonCount = bd['addonCount'] is int
                ? bd['addonCount'] as int
                : ((bd['addonCount'] as num?)?.toInt() ?? 0);
          }
        }
      }
      target['_addonCount'] = addonCount;
      target['_eligible'] = true;
    } catch (_) {
      target['_addonCount'] = 0;
      target['_eligible'] = false;
      target['_ineligibleReason'] = '通常ユーザー情報を確認できません';
    }
  }

  // 置きバケは okibakeTemporaryEntries を確認（seated + unlinked のみ対象）
  final okibakeTargets = seatTargetsAddonRead
      .where((t) => t['targetType'] == 'okibake')
      .toList();
  for (final target in okibakeTargets) {
    final okibakeEntryId = target['okibakeEntryId'] as String;
    try {
      final entryDoc = await FirebaseFirestore.instance
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('okibakeTemporaryEntries')
          .doc(okibakeEntryId)
          .get();
      if (!entryDoc.exists) {
        target['_eligible'] = false;
        target['_ineligibleReason'] = '置きバケ情報が見つかりません';
        continue;
      }
      final e = entryDoc.data() ?? {};
      final entryStatus = (e['entryStatus'] as String?) ?? '';
      final billLinkStatus = (e['billLinkStatus'] as String?) ?? '';
      final addonCount = (e['okibakeAddonCount'] as num?)?.toInt() ?? 0;
      final addonIntentRaw = (e['addonIntent'] as String?)?.trim() ?? '';
      final addonIntentLabel = addonIntentRaw == 'yes'
          ? '希望'
          : addonIntentRaw == 'no'
          ? '希望しない'
          : '未設定';
      target['_addonCount'] = addonCount;
      target['_addonIntentLabel'] = addonIntentLabel;
      if (entryStatus == 'seated' && billLinkStatus == 'unlinked') {
        target['_eligible'] = addonCount < addonLimit;
        if (addonCount >= addonLimit) {
          target['_ineligibleReason'] = '上限到達';
        }
      } else {
        target['_eligible'] = false;
        target['_ineligibleReason'] = '対象外状態';
      }
    } catch (_) {
      target['_eligible'] = false;
      target['_ineligibleReason'] = '置きバケ情報の確認に失敗';
    }
  }

  seatedTargets = seatTargetsAddonRead;

  final selectableExists = seatedTargets.any((u) => u['_eligible'] == true);

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
      Set<String> selectedTargetKeys = {};

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
                  Builder(
                    builder: (context) {
                      final normalCount = seatedTargets
                          .where((t) => t['targetType'] == 'normal')
                          .length;
                      final okibakeCount = seatedTargets
                          .where((t) => t['targetType'] == 'okibake')
                          .length;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          '対象: 通常参加者 $normalCount名 / 置きバケ $okibakeCount名',
                          style: const TextStyle(
                            fontSize: 12,
                            color: Colors.black54,
                          ),
                        ),
                      );
                    },
                  ),
                  Expanded(
                    child: ListView.builder(
                      itemCount: seatedTargets.length,
                      itemBuilder: (context, index) {
                        final target = seatedTargets[index];
                        final targetKey = target['targetKey'] as String;
                        final pokerName = target['pokerName'] as String;
                        final seatNumber = target['seatNumber'] as int;
                        final targetType = target['targetType'] as String;
                        final isEligible = target['_eligible'] == true;
                        final acRaw = target['_addonCount'];
                        final addonCount = acRaw is int
                            ? acRaw
                            : (acRaw as num?)?.toInt() ?? 0;
                        final isAlreadyAddon =
                            !isEligible || addonCount >= addonLimit;
                        final reason =
                            (target['_ineligibleReason'] as String?) ?? '対象外';
                        final addonIntentLabel =
                            (target['_addonIntentLabel'] as String?) ?? '未設定';
                        final baseLine = isAlreadyAddon
                            ? '席番号: $seatNumber (${reason == '上限到達' ? '上限到達 $addonCount / $addonLimit 回' : reason})'
                            : '席番号: $seatNumber ($addonCount / $addonLimit 回)';
                        final subtitleText = targetType == 'okibake'
                            ? '$baseLine\nアドオン: $addonIntentLabel'
                            : baseLine;

                        return CheckboxListTile(
                          title: Text(
                            targetType == 'okibake'
                                ? '$pokerName（置きバケ）'
                                : pokerName,
                            style: TextStyle(
                              color: isAlreadyAddon ? Colors.grey : null,
                            ),
                          ),
                          subtitle: Text(
                            subtitleText,
                            style: TextStyle(
                              color: isAlreadyAddon ? Colors.grey : null,
                            ),
                          ),
                          value: isAlreadyAddon
                              ? false
                              : selectedTargetKeys.contains(targetKey),
                          onChanged: isAlreadyAddon
                              ? null
                              : (bool? value) {
                                  setState(() {
                                    if (value == true) {
                                      selectedTargetKeys.add(targetKey);
                                    } else {
                                      selectedTargetKeys.remove(targetKey);
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
                onPressed: selectedTargetKeys.isEmpty
                    ? null
                    : () {
                        final selectedTargetsList = seatedTargets
                            .where(
                              (target) => selectedTargetKeys.contains(
                                target['targetKey'],
                              ),
                            )
                            .toList();

                        // ダイアログを先に閉じる
                        Navigator.of(dialogCtx).pop();

                        // 非同期処理を開始（outerCtxを使用）
                        if (outerCtx.mounted) {
                          _processBulkAddon(
                            context: outerCtx,
                            tournamentId: tournamentId,
                            tableId: tableId,
                            selectedTargets: selectedTargetsList,
                          ).catchError((error) {
                            // エラーハンドリング（outerCtxを使用）
                            if (outerCtx.mounted) {
                              showActionErrorDialog(
                                outerCtx,
                                message: 'エラーが発生しました: $error',
                              );
                            }
                          });
                        }
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: selectedTargetKeys.isEmpty
                      ? Colors.grey
                      : Colors.blue,
                  foregroundColor: Colors.white,
                ),
                child: Text(selectedTargetKeys.isEmpty ? '対象を選択してください' : '確定'),
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
  required List<Map<String, dynamic>> selectedTargets,
}) async {
  final feedback = ActionProgressDialogController(context);

  try {
    if (!context.mounted) return;

    await feedback.showLoading(message: 'まとめてAddon処理中...');

    // トーナメント情報を取得
    final tournamentDoc = await FirebaseFirestore.instance
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .get();

    if (!context.mounted) return;

    if (!tournamentDoc.exists) {
      if (context.mounted) {
        feedback.hideLoading();
        await showActionErrorDialog(context, message: 'トーナメントが見つかりません');
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
        feedback.hideLoading();
        await showActionErrorDialog(context, message: 'このトーナメントではAddonができません');
      }
      return;
    }

    // Cloud Function呼び出し
    final functions = FunctionsClient.instance;
    final callable = functions.httpsCallable('bulkAddon');

    debugPrint('=== Cloud Function呼び出し開始 ===');
    final normalUsers = selectedTargets
        .where((t) => t['targetType'] == 'normal')
        .map(
          (user) => {'userId': user['userId'], 'pokerName': user['pokerName']},
        )
        .toList();
    final okibakeEntries = selectedTargets
        .where((t) => t['targetType'] == 'okibake')
        .map(
          (t) => {
            'okibakeEntryId': t['okibakeEntryId'],
            'pokerName': t['pokerName'],
          },
        )
        .toList();

    debugPrint(
      '送信データ: normal=${normalUsers.length}, okibake=${okibakeEntries.length}',
    );

    final result = await callable
        .call({
          'tournamentId': tournamentId,
          'tableId': tableId,
          // 互換維持: 既存 users は normalUsers を渡す
          'users': normalUsers,
          'normalUsers': normalUsers,
          'okibakeEntries': okibakeEntries,
        })
        .timeout(
          const Duration(seconds: 60),
          onTimeout: () {
            throw TimeoutException('Cloud Functionの呼び出しがタイムアウトしました');
          },
        );

    debugPrint('=== Cloud Function呼び出し完了 ===');
    debugPrint('result.data: ${result.data}');
    debugPrint('result.data type: ${result.data.runtimeType}');

    if (!context.mounted) return;

    final data = result.data as Map<String, dynamic>;
    debugPrint('=== レスポンス解析 ===');
    debugPrint('data: $data');
    debugPrint('data type: ${data.runtimeType}');
    debugPrint('data[\'success\']: ${data['success']}');
    debugPrint('data[\'success\'] type: ${data['success'].runtimeType}');
    debugPrint('data[\'success\'] == true: ${data['success'] == true}');
    debugPrint('data[\'success\'] is bool: ${data['success'] is bool}');

    feedback.hideLoading();

    if (data['success'] == true) {
      debugPrint('=== 成功パス ===');
      final processedNormalCount =
          (data['processedNormalCount'] as num?)?.toInt() ??
          (data['processedCount'] as num?)?.toInt() ??
          normalUsers.length;
      final processedOkibakeCount =
          (data['processedOkibakeCount'] as num?)?.toInt() ??
          okibakeEntries.length;
      final message =
          'まとめてAddonを実行しました。\n通常参加者: $processedNormalCount名\n置きバケ: $processedOkibakeCount名';
      debugPrint('表示メッセージ: $message');
      debugPrint('context.mounted: ${context.mounted}');

      if (context.mounted) {
        await showActionSuccessDialog(context, message: message);
      }
    } else {
      debugPrint('=== 失敗パス ===');
      final errorMessage = 'まとめてAddon登録に失敗しました: ${data['error'] ?? '不明なエラー'}';
      debugPrint('エラーメッセージ: $errorMessage');

      if (context.mounted) {
        await showActionErrorDialog(context, message: errorMessage);
      }
    }
  } catch (e) {
    debugPrint('=== 例外発生 ===');
    debugPrint('例外: $e');
    debugPrint('例外タイプ: ${e.runtimeType}');

    String errorMessage = 'まとめてAddon登録に失敗しました';

    if (e is TimeoutException) {
      errorMessage = '処理がタイムアウトしました。しばらく待ってから再試行してください。';
    } else if (e.toString().contains('network')) {
      errorMessage = 'ネットワークエラーが発生しました。接続を確認してください。';
    } else if (e.toString().contains('permission')) {
      errorMessage = '権限が不足しています。管理者に連絡してください。';
    }

    if (context.mounted) {
      feedback.hideLoading();
      await showActionErrorDialog(context, message: '$errorMessage\n詳細: $e');
    }
  } finally {
    feedback.hideLoading();
  }
}
