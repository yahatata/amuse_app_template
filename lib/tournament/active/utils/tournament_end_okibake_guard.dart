import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:amuse_app_template/tournament/active/tournament_service.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_callable_error_formatter.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_ops_user_facing_errors.dart';
import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_update_linked_user_dialog.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

/// 終了処理をブロックする未設定置きバケ。
class BlockingOkibakeEntry {
  const BlockingOkibakeEntry({
    required this.okibakeEntryId,
    required this.displayName,
    required this.entryStatus,
  });

  final String okibakeEntryId;
  final String displayName;
  final String entryStatus;

  String get entryStatusLabel {
    switch (entryStatus) {
      case 'registered':
        return '待機中';
      case 'seated':
        return '着席中';
      case 'busted':
        return '退席済み';
      default:
        return entryStatus;
    }
  }
}

/// 順位確定後など、通常終了時の結果。
enum TournamentNormalEndOutcome {
  /// 終了処理が完了した。
  ended,

  /// ユーザーが対象ユーザー設定ダイアログを閉じた等で中断した。
  cancelled,

  /// 検証または終了 API が okibake 以外の理由で失敗した。
  failed,
}

/// トーナメント終了前の置きバケ対象ユーザー必須チェックとダイアログ。
class TournamentEndOkibakeGuard {
  TournamentEndOkibakeGuard._();

  static List<BlockingOkibakeEntry> parseBlockingOkibakeEntries(dynamic raw) {
    if (raw is! List) return const [];
    final parsed = <BlockingOkibakeEntry>[];
    for (final item in raw) {
      if (item is! Map) continue;
      final m = Map<String, dynamic>.from(item);
      final entryId = (m['okibakeEntryId'] as String?)?.trim() ?? '';
      if (entryId.isEmpty) continue;
      parsed.add(
        BlockingOkibakeEntry(
          okibakeEntryId: entryId,
          displayName: ((m['displayName'] as String?) ?? '').trim(),
          entryStatus: ((m['entryStatus'] as String?) ?? '').trim(),
        ),
      );
    }
    return parsed;
  }

  /// 未設定置きバケ一覧から対象ユーザー設定ダイアログを開く。
  static Future<bool> showLinkedUserRequiredDialog({
    required BuildContext context,
    required String tournamentId,
    required TournamentService service,
    required List<BlockingOkibakeEntry> blockingEntries,
    VoidCallback? onLinkedUserUpdated,
  }) async {
    final pending = List<BlockingOkibakeEntry>.from(blockingEntries);
    if (pending.isEmpty) return true;

    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogCtx) {
        return StatefulBuilder(
          builder: (ctx, setInnerState) {
            return AlertDialog(
              title: const Text('対象ユーザー設定が必要です'),
              content: SizedBox(
                width: 480,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '終了前に、以下の置きバケへ対象ユーザーを設定してください。',
                    ),
                    const SizedBox(height: 12),
                    Flexible(
                      child: ListView.separated(
                        shrinkWrap: true,
                        itemCount: pending.length,
                        separatorBuilder: (_, __) => const Divider(height: 12),
                        itemBuilder: (itemCtx, index) {
                          final entry = pending[index];
                          return ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            title: Text(
                              entry.displayName.isNotEmpty
                                  ? entry.displayName
                                  : '置きバケ',
                            ),
                            subtitle: Text('状態: ${entry.entryStatusLabel}'),
                            trailing: FilledButton(
                              onPressed: () async {
                                final updated = await showDialog<bool>(
                                  context: itemCtx,
                                  barrierDismissible: false,
                                  builder: (_) => OkibakeUpdateLinkedUserDialog(
                                    tournamentId: tournamentId,
                                    okibakeEntryId: entry.okibakeEntryId,
                                    displayName: entry.displayName,
                                    service: service,
                                  ),
                                );
                                if (updated == true && context.mounted) {
                                  setInnerState(() {
                                    pending.removeAt(index);
                                  });
                                  if (pending.isEmpty && context.mounted) {
                                    Navigator.of(dialogCtx).pop(true);
                                  }
                                  onLinkedUserUpdated?.call();
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text('対象ユーザーを設定しました'),
                                      ),
                                    );
                                  }
                                }
                              },
                              child: const Text('対象ユーザー設定'),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogCtx).pop(false),
                  child: const Text('閉じる'),
                ),
              ],
            );
          },
        );
      },
    );
    return result == true;
  }

  /// `validateEndTournament` → 置きバケ解消 → `endTournament`（normal）の流れ。
  ///
  /// 順位確定画面からの終了では、最終確認ダイアログは呼び出し側で済ませている前提。
  ///
  /// [showProgressUi] が false のとき Guard 内 progress dialog は出さない。
  /// RankingSetupPage のように呼び出し元が全画面 loading を持つ場合に使う。
  static Future<TournamentNormalEndOutcome> executeNormalEnd({
    required BuildContext context,
    required String tournamentId,
    required TournamentService service,
    bool showProgressUi = true,
  }) async {
    var progressDialogOpen = false;

    Future<void> closeProgressDialog() async {
      if (progressDialogOpen && context.mounted) {
        Navigator.of(context, rootNavigator: true).pop();
        progressDialogOpen = false;
      }
    }

    void showProgressDialog() {
      if (!showProgressUi) return;
      if (!context.mounted) return;
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (_) => const Center(child: CircularProgressIndicator()),
      );
      progressDialogOpen = true;
    }

    try {
      final functions = FunctionsClient.instance;
      final validateCallable = functions.httpsCallable('validateEndTournament');

      while (true) {
        showProgressDialog();

        final validateResult = await validateCallable.call({
          'tournamentId': tournamentId,
        });
        await closeProgressDialog();

        if (!context.mounted) return TournamentNormalEndOutcome.cancelled;

        if (!isCallableSuccessResponse(validateResult.data)) {
          final errorKey = validateResult.data['errorKey'] as String?;
          if (errorKey == 'TOURNAMENT_OKIBAKE_LINKED_USER_REQUIRED') {
            final blockingEntries = parseBlockingOkibakeEntries(
              validateResult.data['blockingOkibakeEntries'],
            );
            final resolvedAll = await showLinkedUserRequiredDialog(
              context: context,
              tournamentId: tournamentId,
              service: service,
              blockingEntries: blockingEntries,
            );
            if (resolvedAll) {
              continue;
            }
            return TournamentNormalEndOutcome.cancelled;
          }

          final message = mapCallableSoftFailMessage(validateResult.data);
          await showDialog<void>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('エラー'),
              content: Text(message),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  child: const Text('OK'),
                ),
              ],
            ),
          );
          return TournamentNormalEndOutcome.failed;
        }

        break;
      }

      showProgressDialog();

      final endCallable = functions.httpsCallable('endTournament');
      final endResult = await endCallable.call({
        'tournamentId': tournamentId,
        'endType': 'normal',
      });
      await closeProgressDialog();

      if (!context.mounted) return TournamentNormalEndOutcome.cancelled;

      if (isCallableSuccessResponse(endResult.data)) {
        return TournamentNormalEndOutcome.ended;
      }

      final error = mapCallableSoftFailMessage(endResult.data);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error)),
      );
      return TournamentNormalEndOutcome.failed;
    } on FirebaseFunctionsException catch (e) {
      await closeProgressDialog();
      if (!context.mounted) return TournamentNormalEndOutcome.cancelled;

      final details = e.details;
      final detailsMap =
          details is Map ? Map<String, dynamic>.from(details) : null;
      final errorKey = detailsMap?['errorKey'] as String?;
      if (errorKey == 'TOURNAMENT_OKIBAKE_LINKED_USER_REQUIRED') {
        final blockingEntries = parseBlockingOkibakeEntries(
          detailsMap?['blockingOkibakeEntries'],
        );
        final resolvedAll = await showLinkedUserRequiredDialog(
          context: context,
          tournamentId: tournamentId,
          service: service,
          blockingEntries: blockingEntries,
        );
        if (resolvedAll && context.mounted) {
          return executeNormalEnd(
            context: context,
            tournamentId: tournamentId,
            service: service,
            showProgressUi: showProgressUi,
          );
        }
        return TournamentNormalEndOutcome.cancelled;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(formatTournamentCallableError(e))),
      );
      return TournamentNormalEndOutcome.failed;
    } catch (e) {
      await closeProgressDialog();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapTournamentOpsCallableError(e, operation: 'endTournament'),
            ),
          ),
        );
      }
      return TournamentNormalEndOutcome.failed;
    }
  }
}
