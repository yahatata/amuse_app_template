import 'dart:async'; // For TimeoutException
import 'dart:math';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:amuse_app_template/tournament/template/template_addon_limit_helpers.dart';
import 'package:amuse_app_template/user_actions/action_feedback_dialogs.dart';
import 'package:amuse_app_template/user_actions/user_action_validation_messages.dart';
import 'package:amuse_app_template/user_actions/user_action_load_errors.dart';

/// Addon確認ダイアログ
Future<void> showAddonDialog({
  required BuildContext context,
  required Map<String, dynamic> user,
  required String tournamentId,
  bool closeUserActionMenuOnSuccess = false,
}) async {
  // 外側（ページ側）のコンテキストを退避。以降のUI操作は必ずこれを使う
  final outerCtx = context;

  final String userId = (user['userId'] ?? '').toString();
  final String pokerName = (user['pokerName'] ?? '').toString();

  if (userId.isEmpty) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(
        outerCtx,
      ).showSnackBar(SnackBar(content: Text(kUserActionUserIdMissingMessage)));
    }
    return;
  }

  // トーナメント情報を取得
  Map<String, dynamic>? tournamentData;
  bool isLoading = true;
  String? errorMessage;

  try {
    final tournamentDoc = await FirebaseFirestore.instance
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .get();

    if (!tournamentDoc.exists) {
      // 不在 ≠ 読込失敗
      isLoading = false;
      errorMessage = 'トーナメントが見つかりません';
    } else {
      tournamentData = tournamentDoc.data()!;
      isLoading = false;
    }
  } catch (_) {
    // USER-28: raw / e.toString 非表示。失敗時は Addon 不可
    isLoading = false;
    errorMessage = kUserActionTournamentLoadFailedMessage;
  }

  if (errorMessage != null) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(
        outerCtx,
      ).showSnackBar(SnackBar(content: Text(errorMessage)));
    }
    return;
  }

  final td = tournamentData!;
  final snapshot = td['snapshot'] as Map<String, dynamic>? ?? {};
  final templateIdStr = (td['templateId'] as String?) ?? '';

  final addonLimit = resolveAddonLimitPerPlayerUi(
    isAddon: snapshot['isAddon'] as bool? ?? false,
    addonLimitPerPlayer: snapshot['addonLimitPerPlayer'],
  );

  // addonLimit が 0（Addon 機能オフ）は Functions の TOURNAMENT_ADDON_NOT_ALLOWED と揃える
  if (addonLimit <= 0) {
    if (outerCtx.mounted) {
      await showDialog(
        context: outerCtx,
        builder: (dCtx) => AlertDialog(
          title: Row(
            children: const [
              Icon(Icons.error, color: Colors.red),
              SizedBox(width: 8),
              Text('Addon不可'),
            ],
          ),
          content: const Text('このトーナメントではAddonができません'),
          actions: [
            ElevatedButton(
              onPressed: () => Navigator.of(dCtx).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    }
    return;
  }

  if (templateIdStr.isEmpty) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(outerCtx).showSnackBar(
        SnackBar(content: Text(kUserActionTournamentTemplateMissingMessage)),
      );
    }
    return;
  }

  // Addon 実施可否の事前チェック（bills 側ドキュメント ID は Callable と同様 templateId）
  int addonCount = 0;
  try {
    final activeStayDoc = await FirebaseFirestore.instance
        .collection('activeStays')
        .doc(userId)
        .get();

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

    if (addonCount >= addonLimit) {
      if (outerCtx.mounted) {
        await showDialog(
          context: outerCtx,
          builder: (dCtx) => AlertDialog(
            title: Row(
              children: const [
                Icon(Icons.info, color: Colors.orange),
                SizedBox(width: 8),
                Text('Addon上限'),
              ],
            ),
            content: Text(
              '$pokerName様は Addon 上限に達しています（$addonCount / $addonLimit 回）。',
            ),
            actions: [
              ElevatedButton(
                onPressed: () => Navigator.of(dCtx).pop(),
                child: const Text('OK'),
              ),
            ],
          ),
        );
      }
      return;
    }
  } catch (e) {
    // 重複チェック失敗時はログのみ、処理は継続（最終判定は Callable）
    // ignore: avoid_print
    print('Addon事前チェックエラー: $e');
  }

  final addonSummaryLine = '現在 $addonCount / $addonLimit 回';

  if (!outerCtx.mounted) return;

  // Addon確認ダイアログを表示（builderのcontext=dialogCtx。UI操作はouterCtxで行う）
  await showDialog<void>(
    context: outerCtx,
    barrierDismissible: false,
    builder: (dialogCtx) {
      return AlertDialog(
        title: Row(
          children: const [
            Icon(Icons.add_circle, color: Colors.blue),
            SizedBox(width: 8),
            Text('Addon確認'),
          ],
        ),
        content: isLoading
            ? const Center(child: CircularProgressIndicator())
            : Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('対象ユーザー: $pokerName'),
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
                        Text(addonSummaryLine),
                        const SizedBox(height: 8),
                        Text(
                          'Addonフィー: ¥${tournamentData?['snapshot']?['addonFee'] ?? 0}',
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Addonスタック: ${tournamentData?['snapshot']?['addonStack'] ?? 0}',
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'この操作により、ユーザーのAddonが記録され、トーナメント統計が更新されます。',
                    style: TextStyle(color: Colors.blue.shade700),
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
              // ダイアログを先に閉じる（dialogCtxはここでのみ使用）
              Navigator.of(dialogCtx).pop();

              if (!outerCtx.mounted) return;
              await _executeAddon(
                context: outerCtx, // 外側のコンテキストのみ渡す
                userId: userId,
                pokerName: pokerName,
                tournamentId: tournamentId,
                tableId: user['tableId'] as String?,
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

/// Addon処理を実行（外側context前提）
Future<void> _executeAddon({
  required BuildContext context, // outerCtxを受け取る
  required String userId,
  required String pokerName,
  required String tournamentId,
  String? tableId,
  bool closeUserActionMenuOnSuccess = false,
}) async {
  if (!context.mounted) return;

  final feedback = ActionProgressDialogController(context);

  try {
    await feedback.showLoading(message: 'Addon処理中...');

    // 操作記録用の operationId（1 試行 1 ドキュメント）
    final operationId =
        '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(0x7FFFFFFF).toRadixString(16)}';

    final device = await DeviceService().getCurrentDevice();
    final deviceName = device?.name;
    final functions = FunctionsClient.instance;
    final callable = functions.httpsCallable('addon');

    final result = await callable
        .call({
          'operationId': operationId,
          'tournamentId': tournamentId,
          'userId': userId,
          'pokerName': pokerName,
          if (deviceName != null && deviceName.isNotEmpty)
            'deviceName': deviceName,
          if (tableId != null && tableId.isNotEmpty) 'tableId': tableId,
        })
        .timeout(
          const Duration(seconds: 30),
          onTimeout: () =>
              throw TimeoutException('Cloud Functionの呼び出しがタイムアウトしました'),
        );

    if (!context.mounted) {
      feedback.hideLoading();
      return;
    }

    final data = result.data as Map<String, dynamic>? ?? {};
    final bool ok = isCallableSuccessResponse(data);

    feedback.hideLoading();

    if (ok) {
      await showActionSuccessDialog(
        context,
        message: '$pokerName様のAddon処理が完了しました',
      );
      if (closeUserActionMenuOnSuccess && context.mounted) {
        Navigator.of(context).pop();
      }
    } else {
      // USER-32 soft-fail: raw error 非表示
      await showActionErrorDialog(
        context,
        message: mapCallableSoftFailMessage(data),
      );
    }
  } catch (e) {
    feedback.hideLoading();
    if (context.mounted) {
      await showActionErrorDialog(
        context,
        message: buildAsyncActionErrorMessage(
          e,
          defaultMessage: 'Addon登録に失敗しました',
        ),
      );
    }
  } finally {
    feedback.hideLoading();
  }
}
