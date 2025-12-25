import 'package:flutter/material.dart';
import 'order_from_user_action_popup.dart';
import 'bust_and_reentry_popup.dart';
import 'bust_and_exit_popup.dart';
import 'addon_popup.dart';
import 'side_game_tip_view_popup.dart';
import 'side_game_tip_withdraw_popup.dart';
import 'side_game_tip_deposit_popup.dart';
import 'side_game_chip_purchase_popup.dart';
import 'add_extra_popup.dart';
import 'chip_point_view_popup.dart';
import 'order_history_popup.dart';
import 'tournament_history_popup.dart';
import 'profile_popup.dart';
import 'current_seat_popup.dart';
import 'current_accounting_popup.dart';
import 'package:cloud_functions/cloud_functions.dart';

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

  final size = MediaQuery.of(context).size;
  // 次のポップを開くために親コンテキストを退避
  final BuildContext rootContext = context;
  await showDialog<void>(
    context: context,
    barrierDismissible: true,
    builder: (ctx) {
      const double scale = 1.2; // ポップの縦横スケール
      // 画面からはみ出さない最大高さ（スクロールさせない想定のため広めに確保）
      final double maxHeight = size.height - 48;

      return Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxWidth: 520 * scale,
            maxHeight: maxHeight,
          ),
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
                        onPressed: () => Navigator.of(ctx).pop(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    padding: EdgeInsets.zero,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 4,
                      childAspectRatio: 0.9,
                      crossAxisSpacing: 8,
                      mainAxisSpacing: 8,
                    ),
                    itemCount: actions.length,
                    itemBuilder: (context, index) {
                      final a = actions[index];
                      return _ActionTile(
                        label: a.label,
                        iconData: a.icon,
                        color: a.color,
                        onTap: () {
                          // 先にこのダイアログを閉じる
                          Navigator.of(ctx).pop();
                          // 閉じた直後に安全な親コンテキストで次の処理を起動
                          Future.microtask(() {
                            a.onSelected?.call(rootContext, user);
                          });
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
    return _buildActionsFromBlocks(blockIds: const ['A', 'I', 'J', 'K'], user: user);
  }

  // sideGameTableHome からの呼び出し時は 6 ブロックを表示
  if (sourcePage == 'sideGameTableHome') {
    return _buildActionsFromBlocks(blockIds: const ['L', 'M', 'N', 'O', 'P', 'Q'], user: user);
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
          onBackToUserActionHome: () {
            showUserActionHome(context: ctx, sourcePage: 'StayingUsersListPage', user: u);
          },
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
            const SnackBar(content: Text('ユーザー情報が不足しています')),
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
            const SnackBar(content: Text('ユーザー情報が不足しています')),
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
            const SnackBar(content: Text('ユーザー情報が不足しています')),
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
            const SnackBar(content: Text('ユーザー情報が不足しています')),
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
_UserActionItem _buildBlockI(Map<String, dynamic> user) => _UserActionItem(
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
            const SnackBar(content: Text('トーナメント情報が不足しています')),
          );
          return;
        }
        
        showBustAndReentryDialog(
          context: ctx,
          user: u,
          tournamentId: tournamentId,
          tableId: tableId,
          seatNumber: seatNumber,
        );
      },
    );

// 塊J: Bust&退席
_UserActionItem _buildBlockJ(Map<String, dynamic> user) => _UserActionItem(
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
            const SnackBar(content: Text('トーナメント情報が不足しています')),
          );
          return;
        }
        
        showBustAndExitDialog(
          context: ctx,
          user: u,
          tournamentId: tournamentId,
          tableId: tableId,
          seatNumber: seatNumber,
        );
      },
    );

// 塊K: Addon
_UserActionItem _buildBlockK(Map<String, dynamic> user) => _UserActionItem(
      label: 'Addon',
      icon: Icons.add_circle_outline,
      color: Colors.green,
      onSelected: (ctx, u) {
        // トーナメント情報を取得（userから）
        final tournamentId = u['tournamentId'] as String?;
        
        if (tournamentId == null) {
          ScaffoldMessenger.of(ctx).showSnackBar(
            const SnackBar(content: Text('トーナメント情報が不足しています')),
          );
          return;
        }
        
        showAddonDialog(
          context: ctx,
          user: u,
          tournamentId: tournamentId,
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
          onBackToUserActionHome: () {
            showUserActionHome(context: ctx, sourcePage: 'sideGameTableHome', user: u);
          },
        );
      },
    );

// 塊M: Tipの参照
_UserActionItem _buildBlockM(Map<String, dynamic> user) => _UserActionItem(
      label: 'Tipの参照',
      icon: Icons.visibility,
      color: Colors.orange,
      onSelected: (ctx, u) {
        final userId = u['userId'] as String?;
        final pokerName = u['pokerName'] as String?;
        
        if (userId == null || pokerName == null) {
          ScaffoldMessenger.of(ctx).showSnackBar(
            const SnackBar(content: Text('ユーザー情報が不足しています')),
          );
          return;
        }
        
        showSideGameTipViewDialog(
          context: ctx,
          userId: userId,
          pokerName: pokerName,
        );
      },
    );

// 塊N: Tipの引き出し
_UserActionItem _buildBlockN(Map<String, dynamic> user) => _UserActionItem(
      label: 'Tipの引き出し',
      icon: Icons.account_balance_wallet,
      color: Colors.red,
      onSelected: (ctx, u) {
        final userId = u['userId'] as String?;
        final pokerName = u['pokerName'] as String?;
        
        if (userId == null || pokerName == null) {
          ScaffoldMessenger.of(ctx).showSnackBar(
            const SnackBar(content: Text('ユーザー情報が不足しています')),
          );
          return;
        }
        
        showSideGameTipWithdrawDialog(
          context: ctx,
          userId: userId,
          pokerName: pokerName,
        );
      },
    );

// 塊O: Tipの預入と退席
_UserActionItem _buildBlockO(Map<String, dynamic> user) => _UserActionItem(
      label: 'Tipの預入と退席',
      icon: Icons.account_balance,
      color: Colors.green,
      onSelected: (ctx, u) {
        final userId = u['userId'] as String?;
        final pokerName = u['pokerName'] as String?;
        final tableId = u['tableId'] as String?;
        final seatNumber = u['seatNumber'] as int?;
        
        if (userId == null || pokerName == null || tableId == null || seatNumber == null) {
          ScaffoldMessenger.of(ctx).showSnackBar(
            const SnackBar(content: Text('SideGame情報が不足しています')),
          );
          return;
        }
        
        showSideGameTipDepositDialog(
          context: ctx,
          userId: userId,
          pokerName: pokerName,
          tableId: tableId,
          seatNumber: seatNumber,
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
            const SnackBar(content: Text('ユーザー情報が不足しています')),
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
            const SnackBar(content: Text('SideGame情報が不足しています')),
          );
          return;
        }
        
        // 退席確認ダイアログを表示
        final confirmed = await showDialog<bool>(
          context: ctx,
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
          try {
            final functions = FirebaseFunctions.instance;
            final callable = functions.httpsCallable('leaveSeat');
            
            await callable.call({
              'tableId': tableId,
              'seatNumber': seatNumber,
              'userId': userId,
            });
            
            if (ctx.mounted) {
              ScaffoldMessenger.of(ctx).showSnackBar(
                SnackBar(
                  content: Text('${pokerName}様を退席させました'),
                  backgroundColor: Colors.green,
                ),
              );
            }
          } catch (e) {
            if (ctx.mounted) {
              ScaffoldMessenger.of(ctx).showSnackBar(
                SnackBar(
                  content: Text('退席処理に失敗しました: $e'),
                  backgroundColor: Colors.red,
                ),
              );
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
  'M': _buildBlockM, // Tipの参照
  'N': _buildBlockN, // Tipの引き出し
  'O': _buildBlockO, // Tipの預入と退席
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


