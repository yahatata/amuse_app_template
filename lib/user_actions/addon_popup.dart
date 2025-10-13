import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:async'; // For TimeoutException

/// Addon確認ダイアログ
Future<void> showAddonDialog({
  required BuildContext context,
  required Map<String, dynamic> user,
  required String tournamentId,
}) async {
  // 外側（ページ側）のコンテキストを退避。以降のUI操作は必ずこれを使う
  final outerCtx = context;

  final String userId = (user['userId'] ?? '').toString();
  final String pokerName = (user['pokerName'] ?? '').toString();

  if (userId.isEmpty) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(outerCtx).showSnackBar(
        const SnackBar(content: Text('ユーザー識別子が見つかりません')),
      );
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
      throw Exception('トーナメントが見つかりません');
    }

    tournamentData = tournamentDoc.data()!;
    isLoading = false;
  } catch (e) {
    isLoading = false;
    errorMessage = e.toString();
  }

  if (errorMessage != null) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(outerCtx).showSnackBar(
        SnackBar(content: Text('エラー: $errorMessage')),
      );
    }
    return;
  }

  // isAddonがfalseの場合はエラーメッセージを表示
  final isAddon = tournamentData?['snapshot']?['isAddon'] as bool? ?? false;
  if (!isAddon) {
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

  // 既にAddon済みかチェック
  try {
    final todayBillsQuery = await FirebaseFirestore.instance
        .collection('todaysBills')
        .where('userId', isEqualTo: userId)
        .where('status', isEqualTo: 'open')
        .limit(1)
        .get();

    if (todayBillsQuery.docs.isNotEmpty) {
      final todayBillsData = todayBillsQuery.docs[0].data();
      final tournaments = todayBillsData['tournaments'] as Map<String, dynamic>? ?? {};
      final tournamentInfo = tournaments[tournamentId] as Map<String, dynamic>? ?? {};
      final addonCount = tournamentInfo['addonCount'] as int? ?? 0;

      if (addonCount >= 1) {
        if (outerCtx.mounted) {
          await showDialog(
            context: outerCtx,
            builder: (dCtx) => AlertDialog(
              title: Row(
                children: const [
                  Icon(Icons.info, color: Colors.orange),
                  SizedBox(width: 8),
                  Text('Addon済み'),
                ],
              ),
              content: Text('$pokerName様は既にAddon処理済みです。'),
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
    }
  } catch (e) {
    // 重複チェック失敗時はログのみ、処理は継続
    // ignore: avoid_print
    print('Addon重複チェックエラー: $e');
  }

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
                  Text('Addonフィー: ¥${tournamentData?['snapshot']?['addonFee'] ?? 0}'),
                  const SizedBox(height: 8),
                  Text('Addonスタック: ${tournamentData?['snapshot']?['addonStack'] ?? 0}'),
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
}) async {
  if (!context.mounted) return;

  // Overlayを安全に取得（nullならSnackbarのみでフォールバック）
  final overlayState = Overlay.maybeOf(context, rootOverlay: true);
  OverlayEntry? loadingOverlay;
  bool loadingShown = false;

  // ローディングを閉じるユーティリティ（二重remove防止）
  void hideLoading() {
    if (loadingShown) {
      try {
        loadingOverlay?.remove();
      } catch (_) {
        // noop
      }
      loadingOverlay = null;
      loadingShown = false;
    }
  }

  try {
    // ローディング表示（可能な場合のみ）
    loadingOverlay = OverlayEntry(
      builder: (_) => Material(
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
                Text('Addon処理中...'),
              ],
            ),
          ),
        ),
      ),
    );
    if (overlayState != null) {
      overlayState.insert(loadingOverlay!);
      loadingShown = true;
    }

    // Cloud Function呼び出し（タイムアウト付き）
    final functions = FirebaseFunctions.instance;
    final callable = functions.httpsCallable('addon');

    final result = await callable.call({
      'tournamentId': tournamentId,
      'userId': userId,
      'pokerName': pokerName,
    }).timeout(
      const Duration(seconds: 30),
      onTimeout: () => throw TimeoutException('Cloud Functionの呼び出しがタイムアウトしました'),
    );

    if (!context.mounted) {
      hideLoading();
      return;
    }

    final data = result.data as Map<String, dynamic>? ?? {};
    final bool ok = data['success'] == true;

    // ✅ 成功/失敗UIを出す前にローディングを閉じる
    hideLoading();

    if (ok) {
      // 成功メッセージを標準ダイアログで表示
      await showDialog(
        context: context,
        builder: (dCtx) => AlertDialog(
          title: Row(
            children: const [
              Icon(Icons.check_circle, color: Colors.green),
              SizedBox(width: 8),
              Text('完了'),
            ],
          ),
          content: Text('$pokerName様のAddon処理が完了しました'),
          actions: [
            ElevatedButton(
              onPressed: () => Navigator.of(dCtx).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    } else {
      final err = data['error'] ?? '不明なエラー';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Addon登録に失敗しました: $err'),
          backgroundColor: Colors.red,
        ),
      );
    }
  } on TimeoutException {
    hideLoading(); // 先に閉じる
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('処理がタイムアウトしました。しばらく待ってから再試行してください。'),
          backgroundColor: Colors.red,
          duration: Duration(seconds: 5),
        ),
      );
    }
  } catch (e) {
    hideLoading(); // 先に閉じる
    if (context.mounted) {
      final msg = e.toString();
      String ui = 'Addon登録に失敗しました';
      if (msg.contains('network')) {
        ui = 'ネットワークエラーが発生しました。接続を確認してください。';
      } else if (msg.contains('permission')) {
        ui = '権限が不足しています。管理者に連絡してください。';
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ui),
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
    // 念のため（既に閉じていれば何もしない）
    hideLoading();
  }
}
