import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:amuse_app_template/tournament/ranking_reward_point_candidates.dart';
import 'order_from_user_action_popup.dart';
import 'bust_and_reentry_popup.dart';
import 'bust_and_exit_popup.dart';
import 'addon_popup.dart';
import 'side_game_chip_view_popup.dart';
import 'side_game_chip_withdraw_popup.dart';
import 'side_game_chip_deposit_popup.dart';
import 'side_game_chip_purchase_popup.dart';
import 'add_extra_popup.dart';
import 'chip_point_view_popup.dart';
import 'order_history_popup.dart';
import 'tournament_history_popup.dart';
import 'profile_popup.dart';
import 'current_seat_popup.dart';
import 'current_accounting_popup.dart';
import 'package:amuse_app_template/user_actions/user_action_validation_messages.dart';
import 'package:amuse_app_template/user_actions/user_action_load_errors.dart';
import 'package:amuse_app_template/user_actions/action_feedback_dialogs.dart';
import 'package:amuse_app_template/user_actions/tournament_user_addon_counter.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/user_actions/side_game_dialog_layout.dart';

/// When: ユーザー行をタップしてアクションを選択したいとき
/// Where: StayingUsersListPage などユーザー一覧系の画面
/// What: 呼び出し元ページに応じたメニュー構成のアクションポップを表示
/// How: 中央ダイアログでメニュー（Grid）を動的生成して表示
Future<void> showUserActionHome({
  required BuildContext context,
  required String sourcePage,
  required Map<String, dynamic> user,
}) async {
  // When: 表示メニューの決定時
  // Where: 本関数内部
  // What: 呼び出し元(sourcePage)に応じてメニューのリストを構築
  // How: switch相当の分岐でメニュー定義を返す
  final actions = _buildActionsForSource(sourcePage: sourcePage, user: user);

  final showAddonCounter = sourcePage == 'tableHomeInScheduledTournament' &&
      user['tournamentId'] is String &&
      (user['tournamentId'] as String).isNotEmpty &&
      user['userId'] is String &&
      (user['userId'] as String).isNotEmpty;

  await showDialog<void>(
    context: context,
    barrierDismissible: true,
    builder: (dialogContext) {
      const double scale = 1.2; // ポップの縦横スケール
      // USER-14: Addon 回数読込失敗時は操作を止める（失敗を 0 回扱いにしない）
      // 読込中も操作不可（waiting は failure 扱いしないが busy でロック）
      var addonCountLoadFailed = false;
      var addonCountBusy = false;

      return StatefulBuilder(
        builder: (context, setMenuState) {
          return Dialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
            child: KeyboardSafeDialogBody(
              maxWidth: 520 * scale,
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.person, size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              (user['pokerName'] ?? '(名前未設定)').toString(),
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close),
                            onPressed: () => Navigator.of(dialogContext).pop(),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      if (showAddonCounter) ...[
                        TournamentUserAddonCounter(
                          tournamentId: user['tournamentId'] as String,
                          userId: user['userId'] as String,
                          onLoadFailedChanged: (failed) {
                            if (addonCountLoadFailed == failed) return;
                            setMenuState(() => addonCountLoadFailed = failed);
                          },
                          onLoadBusyChanged: (busy) {
                            if (addonCountBusy == busy) return;
                            setMenuState(() => addonCountBusy = busy);
                          },
                        ),
                        const SizedBox(height: 12),
                      ],
                      GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        padding: EdgeInsets.zero,
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 4,
                          childAspectRatio: 0.9,
                          crossAxisSpacing: 8,
                          mainAxisSpacing: 8,
                        ),
                        itemCount: actions.length,
                        itemBuilder: (context, index) {
                          final a = actions[index];
                          final disableAddon =
                              showAddonCounter &&
                              (addonCountLoadFailed || addonCountBusy) &&
                              a.label == 'Addon';
                          return _ActionTile(
                            label: a.label,
                            iconData: a.icon,
                            color: disableAddon ? Colors.grey : a.color,
                            onTap: () {
                              if (disableAddon) {
                                if (addonCountLoadFailed) {
                                  ScaffoldMessenger.of(dialogContext).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                        kUserActionAddonCountLoadFailedMessage,
                                      ),
                                    ),
                                  );
                                }
                                return;
                              }
                              // 親メニューは開いたまま子ダイアログを重ねる（キャンセルで戻れる）
                              a.onSelected?.call(dialogContext, user);
                            },
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      );
    },
  );
}

// When: 呼び出し元ごとのメニュー定義が必要な時
// Where: 本ファイル
// What: sourcePageごとのメニュー構成を返却
// How: 分岐でList<_UserActionItem>を構築
List<_UserActionItem> _buildActionsForSource({
  required String sourcePage,
  required Map<String, dynamic> user,
}) {
  // stayingUsersListPage からの呼び出し時は 8 ブロック（A〜H）を表示（仮）
  if (sourcePage == 'StayingUsersListPage') {
    return _buildActionsFromBlocks(blockIds: const ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], user: user);
  }

  // tableHomeInScheduledTournament からの呼び出し時は 4 ブロックを表示
  if (sourcePage == 'tableHomeInScheduledTournament') {
    return [
      _buildBlockA(user),
      _buildBlockI(user, closeUserActionMenuOnSuccess: true),
      _buildBlockJ(user, closeUserActionMenuOnSuccess: true),
      _buildBlockK(user, closeUserActionMenuOnSuccess: true),
    ];
  }

  // sideGameTableHome からの呼び出し時は 6 ブロックを表示
  // A-7: sideGameChipSettings.enabled=false のとき引出(N)・預入(O)は出さない
  if (sourcePage == 'sideGameTableHome') {
    final chipEnabled = isSideGameChipEnabled();
    final blockIds = <String>[
      'L',
      'M',
      if (chipEnabled) 'N',
      if (chipEnabled) 'O',
      'P',
      'Q',
    ];
    return _buildActionsFromBlocks(blockIds: blockIds, user: user);
  }

  // 将来: 他の呼び出し元ごとのメニュー構成はここに追加する
  // 例)
  // if (sourcePage == 'UserDirectoryPage') {
  //   // 例: B と C のみ
  //   return _buildActionsFromBlocks(blockIds: const ['B', 'C'], user: user);
  // }
  // if (sourcePage == 'SomeOtherPage') {
  //   // 例: C と A の順で
  //   return _buildActionsFromBlocks(blockIds: const ['C', 'A'], user: user);
  // }

  // デフォルト（未知の呼び出し元）: 何も表示しない
  return const [];
}

// ========================= 再利用可能なアクションブロック定義 =========================

// When: ブロックの再利用を行いたい時
// Where: 本ファイル
// What: ブロックID（A/B/C...）とその意味の対応を定義
// How: ビルダー関数をIDにマッピング
typedef UserActionBuilder = _UserActionItem Function(Map<String, dynamic> user);

// 塊A: 注文
_UserActionItem _buildBlockA(Map<String, dynamic> user) => _UserActionItem(
      label: '注文',
      icon: Icons.shopping_bag_outlined,
      color: Colors.blue,
      onSelected: (ctx, u) {
        // When: 「注文」ブロック選択時
        // Where: userActionHome（ダイアログ内）
        // What: 選択ユーザー向けの注文フローを表示
        // How: カテゴリー→メニュー選択→数量指定→placeOrder 呼び出し
        showOrderFromUserDialog(
          pageContext: ctx,
          user: u,
        );
      },
    );

// 塊B: 追加料金
_UserActionItem _buildBlockB(Map<String, dynamic> user) => _UserActionItem(
      label: '追加料金',
      icon: Icons.attach_money,
      color: Colors.green,
      onSelected: (ctx, u) {
        showAddExtraDialog(
          context: ctx,
          user: u,
        );
      },
    );

// 塊C: チップ（所持チップ・所持ポイント）
_UserActionItem _buildBlockC(Map<String, dynamic> user) => _UserActionItem(
      label: '所持チップ・ポイント',
      icon: Icons.volunteer_activism,
      color: Colors.orange,
      onSelected: (ctx, u) {
        final userId = u['userId'] as String?;
        final pokerName = u['pokerName'] as String? ?? '(名前未設定)';
        
        if (userId == null || userId.isEmpty) {
          ScaffoldMessenger.of(ctx).showSnackBar(
            SnackBar(content: Text(kUserActionUserInfoInsufficientMessage)),
          );
          return;
        }
        
        showChipPointViewDialog(
          context: ctx,
          userId: userId,
          pokerName: pokerName,
        );
      },
    );

// 塊D: 席移動（現在の座席確認）
_UserActionItem _buildBlockD(Map<String, dynamic> user) => _UserActionItem(
      label: '現在の座席確認',
      icon: Icons.event_seat,
      color: Colors.purple,
      onSelected: (ctx, u) {
        showCurrentSeatDialog(
          context: ctx,
          user: u,
        );
      },
    );

// 塊E: 注文履歴
_UserActionItem _buildBlockE(Map<String, dynamic> user) => _UserActionItem(
      label: '注文履歴',
      icon: Icons.receipt_long,
      color: Colors.indigo,
      onSelected: (ctx, u) {
        final userId = u['userId'] as String?;
        final pokerName = u['pokerName'] as String? ?? '(名前未設定)';
        
        if (userId == null || userId.isEmpty) {
          ScaffoldMessenger.of(ctx).showSnackBar(
            SnackBar(content: Text(kUserActionUserInfoInsufficientMessage)),
          );
          return;
        }
        
        showOrderHistoryDialog(
          context: ctx,
          userId: userId,
          pokerName: pokerName,
        );
      },
    );

// 塊F: 現在の会計参照
_UserActionItem _buildBlockF(Map<String, dynamic> user) => _UserActionItem(
      label: '現在の会計参照',
      icon: Icons.point_of_sale,
      color: Colors.teal,
      onSelected: (ctx, u) {
        showCurrentAccountingDialog(
          context: ctx,
          user: u,
        );
      },
    );

// 塊G: トーナメント（トーナメント履歴）
_UserActionItem _buildBlockG(Map<String, dynamic> user) => _UserActionItem(
      label: 'トーナメント履歴',
      icon: Icons.emoji_events,
      color: Colors.redAccent,
      onSelected: (ctx, u) {
        final userId = u['userId'] as String?;
        final pokerName = u['pokerName'] as String? ?? '(名前未設定)';
        
        if (userId == null || userId.isEmpty) {
          ScaffoldMessenger.of(ctx).showSnackBar(
            SnackBar(content: Text(kUserActionUserInfoInsufficientMessage)),
          );
          return;
        }
        
        showTournamentHistoryDialog(
          context: ctx,
          userId: userId,
          pokerName: pokerName,
        );
      },
    );

// 塊H: プロフィール
_UserActionItem _buildBlockH(Map<String, dynamic> user) => _UserActionItem(
      label: 'プロフィール',
      icon: Icons.account_circle,
      color: Colors.brown,
      onSelected: (ctx, u) {
        final userId = u['userId'] as String?;
        final pokerName = u['pokerName'] as String? ?? '(名前未設定)';
        
        if (userId == null || userId.isEmpty) {
          ScaffoldMessenger.of(ctx).showSnackBar(
            SnackBar(content: Text(kUserActionUserInfoInsufficientMessage)),
          );
          return;
        }
        
        showProfileDialog(
          context: ctx,
          userId: userId,
          pokerName: pokerName,
        );
      },
    );

// 塊I: Bust＆リエントリー
_UserActionItem _buildBlockI(
  Map<String, dynamic> user, {
  bool closeUserActionMenuOnSuccess = false,
}) =>
    _UserActionItem(
      label: 'Bust＆リエントリー',
      icon: Icons.refresh,
      color: Colors.orange,
      onSelected: (ctx, u) {
        // トーナメント情報を取得（userから）
        final tournamentId = u['tournamentId'] as String?;
        final tableId = u['tableId'] as String?;
        final seatNumber = u['seatNumber'] as int?;
        
        if (tournamentId == null || tableId == null || seatNumber == null) {
          ScaffoldMessenger.of(ctx).showSnackBar(
            SnackBar(content: Text(kUserActionTournamentInfoInsufficientMessage)),
          );
          return;
        }
        
        showBustAndReentryDialog(
          context: ctx,
          user: u,
          tournamentId: tournamentId,
          tableId: tableId,
          seatNumber: seatNumber,
          closeUserActionMenuOnSuccess: closeUserActionMenuOnSuccess,
        );
      },
    );

// 塊J: Bust&退席
_UserActionItem _buildBlockJ(
  Map<String, dynamic> user, {
  bool closeUserActionMenuOnSuccess = false,
}) =>
    _UserActionItem(
      label: 'Bust&退席',
      icon: Icons.exit_to_app,
      color: Colors.red,
      onSelected: (ctx, u) {
        // トーナメント情報を取得（userから）
        final tournamentId = u['tournamentId'] as String?;
        final tableId = u['tableId'] as String?;
        final seatNumber = u['seatNumber'] as int?;
        
        if (tournamentId == null || tableId == null || seatNumber == null) {
          ScaffoldMessenger.of(ctx).showSnackBar(
            SnackBar(content: Text(kUserActionTournamentInfoInsufficientMessage)),
          );
          return;
        }
        
        showBustAndExitDialog(
          context: ctx,
          user: u,
          tournamentId: tournamentId,
          tableId: tableId,
          seatNumber: seatNumber,
          closeUserActionMenuOnSuccess: closeUserActionMenuOnSuccess,
        );
      },
    );

// 塊K: Addon
_UserActionItem _buildBlockK(
  Map<String, dynamic> user, {
  bool closeUserActionMenuOnSuccess = false,
}) =>
    _UserActionItem(
      label: 'Addon',
      icon: Icons.add_circle_outline,
      color: Colors.green,
      onSelected: (ctx, u) {
        // トーナメント情報を取得（userから）
        final tournamentId = u['tournamentId'] as String?;
        
        if (tournamentId == null) {
          ScaffoldMessenger.of(ctx).showSnackBar(
            SnackBar(content: Text(kUserActionTournamentInfoInsufficientMessage)),
          );
          return;
        }
        
        showAddonDialog(
          context: ctx,
          user: u,
          tournamentId: tournamentId,
          closeUserActionMenuOnSuccess: closeUserActionMenuOnSuccess,
        );
      },
    );

// 塊L: SideGame注文
_UserActionItem _buildBlockL(Map<String, dynamic> user) => _UserActionItem(
      label: '注文',
      icon: Icons.shopping_bag_outlined,
      color: Colors.blue,
      onSelected: (ctx, u) {
        // When: 「注文」ブロック選択時
        // Where: userActionHome（ダイアログ内）
        // What: 選択ユーザー向けの注文フローを表示
        // How: カテゴリー→メニュー選択→数量指定→placeOrder 呼び出し
        showOrderFromUserDialog(
          pageContext: ctx,
          user: u,
        );
      },
    );

// 塊M: chipの参照
_UserActionItem _buildBlockM(Map<String, dynamic> user) => _UserActionItem(
      label: 'chipの参照',
      icon: Icons.visibility,
      color: Colors.orange,
      onSelected: (ctx, u) {
        final userId = u['userId'] as String?;
        final pokerName = u['pokerName'] as String?;
        
        if (userId == null || pokerName == null) {
          ScaffoldMessenger.of(ctx).showSnackBar(
            SnackBar(content: Text(kUserActionUserInfoInsufficientMessage)),
          );
          return;
        }
        
        showSideGameChipViewDialog(
          context: ctx,
          userId: userId,
          pokerName: pokerName,
        );
      },
    );

// 塊N: chipの引き出し
_UserActionItem _buildBlockN(Map<String, dynamic> user) => _UserActionItem(
      label: 'chipの引き出し',
      icon: Icons.account_balance_wallet,
      color: Colors.red,
      onSelected: (ctx, u) {
        final userId = u['userId'] as String?;
        final pokerName = u['pokerName'] as String?;
        
        if (userId == null || pokerName == null) {
          ScaffoldMessenger.of(ctx).showSnackBar(
            SnackBar(content: Text(kUserActionUserInfoInsufficientMessage)),
          );
          return;
        }
        
        showSideGameChipWithdrawDialog(
          context: ctx,
          userId: userId,
          pokerName: pokerName,
        );
      },
    );

// 塊O: chipの預入と退席
_UserActionItem _buildBlockO(Map<String, dynamic> user) => _UserActionItem(
      label: 'chipの預入と退席',
      icon: Icons.account_balance,
      color: Colors.green,
      onSelected: (ctx, u) {
        final userId = u['userId'] as String?;
        final pokerName = u['pokerName'] as String?;
        final tableId = u['tableId'] as String?;
        final seatNumber = u['seatNumber'] as int?;
        
        if (userId == null || pokerName == null || tableId == null || seatNumber == null) {
          ScaffoldMessenger.of(ctx).showSnackBar(
            SnackBar(content: Text(kUserActionSideGameInfoMissingMessage)),
          );
          return;
        }
        
        showSideGameChipDepositDialog(
          context: ctx,
          userId: userId,
          pokerName: pokerName,
          tableId: tableId,
          seatNumber: seatNumber,
          closeUserActionMenuOnLeaveSuccess: true,
        );
      },
    );

// 塊P: Chipの購入
_UserActionItem _buildBlockP(Map<String, dynamic> user) => _UserActionItem(
      label: 'Chipの購入',
      icon: Icons.shopping_cart,
      color: Colors.teal,
      onSelected: (ctx, u) {
        final userId = u['userId'] as String?;
        final pokerName = u['pokerName'] as String?;
        
        if (userId == null || pokerName == null) {
          ScaffoldMessenger.of(ctx).showSnackBar(
            SnackBar(content: Text(kUserActionUserInfoInsufficientMessage)),
          );
          return;
        }
        
        showSideGameChipPurchaseDialog(
          context: ctx,
          user: u, // ✅ user オブジェクト全体を渡す（billId を含む）
        );
      },
    );

// 塊Q: 退席
_UserActionItem _buildBlockQ(Map<String, dynamic> user) => _UserActionItem(
      label: '退席',
      icon: Icons.exit_to_app,
      color: Colors.red,
      onSelected: (ctx, u) async {
        final userId = u['userId'] as String?;
        final pokerName = u['pokerName'] as String?;
        final tableId = u['tableId'] as String?;
        final seatNumber = u['seatNumber'] as int?;
        
        if (userId == null || pokerName == null || tableId == null || seatNumber == null) {
          ScaffoldMessenger.of(ctx).showSnackBar(
            SnackBar(content: Text(kUserActionSideGameInfoMissingMessage)),
          );
          return;
        }
        
        // 退席確認ダイアログを表示
        final confirmed = await showDialog<bool>(
          context: ctx,
          barrierDismissible: false,
          builder: (context) => AlertDialog(
            title: const Text('退席確認'),
            content: Text('${pokerName}様を退席させますか？'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('キャンセル'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.of(context).pop(true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  foregroundColor: Colors.white,
                ),
                child: const Text('退席'),
              ),
            ],
          ),
        );
        
        if (confirmed == true) {
          if (!ctx.mounted) return;
          // 更新系: 全面ロック + CPI（成功・失敗とも finally で解除）
          showDialog<void>(
            context: ctx,
            barrierDismissible: false,
            useRootNavigator: true,
            builder: (loadingCtx) {
              final size = MediaQuery.sizeOf(loadingCtx);
              return PopScope(
                canPop: false,
                child: SizedBox(
                  width: size.width,
                  height: size.height,
                  child: Material(
                    color: Colors.black.withValues(alpha: 0.35),
                    child: const Center(
                      child: CircularProgressIndicator(),
                    ),
                  ),
                ),
              );
            },
          );
          var leaveSucceeded = false;
          try {
            final functions = FunctionsClient.instance;
            final callable = functions.httpsCallable('leaveSeat');

            final result = await callable.call({
              'tableId': tableId,
              'seatNumber': seatNumber,
              'userId': userId,
            });

            // USER-13: success==true のときのみ退席完了扱い。
            leaveSucceeded = isCallableSuccessResponse(result.data);
            if (!ctx.mounted) return;
            if (!leaveSucceeded) {
              ScaffoldMessenger.of(ctx).showSnackBar(
                SnackBar(
                  content: Text(mapCallableSoftFailMessage(result.data)),
                  backgroundColor: Colors.red,
                ),
              );
            }
          } catch (e) {
            leaveSucceeded = false;
            if (ctx.mounted) {
              ScaffoldMessenger.of(ctx).showSnackBar(
                SnackBar(
                  content: Text(
                    buildAsyncActionErrorMessage(
                      e,
                      defaultMessage: kUserActionLeaveSeatFailedMessage,
                    ),
                  ),
                  backgroundColor: Colors.red,
                ),
              );
            }
          } finally {
            if (ctx.mounted) {
              Navigator.of(ctx, rootNavigator: true).pop();
            }
          }

          if (!ctx.mounted) return;
          if (leaveSucceeded) {
            ScaffoldMessenger.of(ctx).showSnackBar(
              SnackBar(
                content: Text('${pokerName}様を退席させました'),
                backgroundColor: Colors.green,
              ),
            );
            // CLN-B3: 退席成功後は参加前提の操作メニューを閉じる（失敗時は残す）。
            if (shouldCloseUserActionMenuAfterLeave(
              operationSucceeded: true,
              leftSeat: true,
            )) {
              Navigator.of(ctx).pop();
            }
          }
        }
      },
    );

final Map<String, UserActionBuilder> _blockRegistry = <String, UserActionBuilder>{
  // ブロックID → ビルダー
  'A': _buildBlockA, // 注文
  'B': _buildBlockB, // 追加料金
  'C': _buildBlockC, // チップ
  'D': _buildBlockD, // 席移動
  'E': _buildBlockE, // 注文履歴
  'F': _buildBlockF, // 会計
  'G': _buildBlockG, // トーナメント
  'H': _buildBlockH, // プロフィール
  'I': _buildBlockI, // Bust＆リエントリー
  'J': _buildBlockJ, // Bust&退席
  'K': _buildBlockK, // Addon
  'L': _buildBlockL, // SideGame注文
  'M': _buildBlockM, // chipの参照
  'N': _buildBlockN, // chipの引き出し
  'O': _buildBlockO, // chipの預入と退席
  'P': _buildBlockP, // Chipの購入
  'Q': _buildBlockQ, // 退席
};

List<_UserActionItem> _buildActionsFromBlocks({
  required List<String> blockIds,
  required Map<String, dynamic> user,
}) {
  return blockIds
      .where((id) => _blockRegistry.containsKey(id))
      .map((id) => _blockRegistry[id]!(user))
      .toList(growable: false);
}

class _UserActionItem {
  final String label;
  final IconData icon;
  final Color color;
  final void Function(BuildContext context, Map<String, dynamic> user)? onSelected;

  const _UserActionItem({
    required this.label,
    required this.icon,
    required this.color,
    this.onSelected,
  });
}

class _ActionTile extends StatelessWidget {
  final String label;
  final IconData iconData;
  final Color color;
  final VoidCallback onTap;

  const _ActionTile({
    required this.label,
    required this.iconData,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(12),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircleAvatar(
              backgroundColor: color.withOpacity(0.15),
              foregroundColor: color,
              radius: 22,
              child: Icon(iconData),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

