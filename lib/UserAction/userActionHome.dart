import 'package:flutter/material.dart';

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
                          Navigator.of(ctx).pop();
                          a.onSelected?.call(context, user);
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
        ScaffoldMessenger.of(ctx).showSnackBar(
          const SnackBar(content: Text('注文（仮）')),
        );
      },
    );

// 塊B: 追加料金
_UserActionItem _buildBlockB(Map<String, dynamic> user) => _UserActionItem(
      label: '追加料金',
      icon: Icons.attach_money,
      color: Colors.green,
      onSelected: (ctx, u) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          const SnackBar(content: Text('追加料金（仮）')),
        );
      },
    );

// 塊C: チップ
_UserActionItem _buildBlockC(Map<String, dynamic> user) => _UserActionItem(
      label: 'チップ',
      icon: Icons.volunteer_activism,
      color: Colors.orange,
      onSelected: (ctx, u) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          const SnackBar(content: Text('チップ（仮）')),
        );
      },
    );

// 塊D: 席移動
_UserActionItem _buildBlockD(Map<String, dynamic> user) => _UserActionItem(
      label: '席移動',
      icon: Icons.event_seat,
      color: Colors.purple,
      onSelected: (ctx, u) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          const SnackBar(content: Text('席移動（仮）')),
        );
      },
    );

// 塊E: 注文履歴
_UserActionItem _buildBlockE(Map<String, dynamic> user) => _UserActionItem(
      label: '注文履歴',
      icon: Icons.receipt_long,
      color: Colors.indigo,
      onSelected: (ctx, u) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          const SnackBar(content: Text('注文履歴（仮）')),
        );
      },
    );

// 塊F: 会計
_UserActionItem _buildBlockF(Map<String, dynamic> user) => _UserActionItem(
      label: '会計',
      icon: Icons.point_of_sale,
      color: Colors.teal,
      onSelected: (ctx, u) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          const SnackBar(content: Text('会計（仮）')),
        );
      },
    );

// 塊G: トーナメント
_UserActionItem _buildBlockG(Map<String, dynamic> user) => _UserActionItem(
      label: 'トーナメント',
      icon: Icons.emoji_events,
      color: Colors.redAccent,
      onSelected: (ctx, u) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          const SnackBar(content: Text('トーナメント（仮）')),
        );
      },
    );

// 塊H: プロフィール
_UserActionItem _buildBlockH(Map<String, dynamic> user) => _UserActionItem(
      label: 'プロフィール',
      icon: Icons.account_circle,
      color: Colors.brown,
      onSelected: (ctx, u) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          const SnackBar(content: Text('プロフィール（仮）')),
        );
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


