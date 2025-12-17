import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../../Utils/menuItemsManager.dart';

/// SideGame用Chip購入ポップアップ
Future<void> showSideGameChipPurchaseDialog({
  required BuildContext context,
  required String userId,
  required String pokerName,
}) async {
  // 外側（ページ側）のコンテキストを退避。以降のUI操作は必ずこれを使う
  final outerCtx = context;

  if (userId.isEmpty) {
    if (outerCtx.mounted) {
      ScaffoldMessenger.of(outerCtx).showSnackBar(
        const SnackBar(content: Text('ユーザー識別子が見つかりません')),
      );
    }
    return;
  }

  await showDialog<void>(
    context: context,
    barrierDismissible: true,
    builder: (ctx) => _SideGameChipPurchaseDialog(
      userId: userId,
      pokerName: pokerName,
    ),
  );
}

class _SideGameChipPurchaseDialog extends StatefulWidget {
  final String userId;
  final String pokerName;

  const _SideGameChipPurchaseDialog({
    required this.userId,
    required this.pokerName,
  });

  @override
  State<_SideGameChipPurchaseDialog> createState() => _SideGameChipPurchaseDialogState();
}

class _SideGameChipPurchaseDialogState extends State<_SideGameChipPurchaseDialog> {
  bool _isLoading = false;
  // ✅ ダイアログが開いている間は固定の clientNonce（画面セッションで固定）
  late final String _clientNonce;

  @override
  void initState() {
    super.initState();
    // ダイアログが開いた時点で生成し、閉じるまで同じ値を使い回す
    _clientNonce = 'chip_${DateTime.now().millisecondsSinceEpoch}_${widget.userId.substring(0, 8)}';
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Row(
        children: [
          const Icon(Icons.shopping_cart, color: Colors.teal),
          const SizedBox(width: 8),
          const Text('Chip購入'),
        ],
      ),
      content: SizedBox(
        width: 350,
        height: 400,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ユーザー情報表示
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.blue.shade200),
              ),
              child: Column(
                children: [
                  const Icon(
                    Icons.person,
                    color: Colors.blue,
                    size: 32,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.pokerName,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.blue,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Chipメニュー一覧
            Expanded(
              child: _buildChipMenuList(),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('キャンセル'),
        ),
      ],
    );
  }

  Widget _buildChipMenuList() {
    // MenuItemsManagerからChipカテゴリーのメニューを取得
    final chipMenus = MenuItemsManager.getMenuItemsByCategory('Chip');

    if (chipMenus.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.shopping_cart_outlined, size: 48, color: Colors.grey),
            SizedBox(height: 16),
            Text(
              'Chipメニューがありません',
              style: TextStyle(
                fontSize: 16,
                color: Colors.grey,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      itemCount: chipMenus.length,
      itemBuilder: (context, index) {
        final menu = chipMenus[index];
        return Card(
          margin: const EdgeInsets.symmetric(vertical: 4),
          child: ListTile(
            leading: Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                color: Colors.teal.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.teal.shade200),
              ),
              child: const Icon(
                Icons.casino,
                color: Colors.teal,
                size: 24,
              ),
            ),
            title: Text(
              menu.name,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
            subtitle: Text(
              '¥${menu.price}',
              style: const TextStyle(
                fontSize: 14,
                color: Colors.grey,
              ),
            ),
            trailing: const Icon(Icons.arrow_forward_ios, size: 16),
            onTap: (_isLoading) ? null : () => _showConfirmDialog(menu),
          ),
        );
      },
    );
  }

  Future<void> _showConfirmDialog(MenuItem menu) async {
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('購入確認'),
        content: Text(
          '${widget.pokerName}様の${menu.name}の購入でお間違い無いですか？',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('キャンセル'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              _processPurchase(menu);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.teal,
              foregroundColor: Colors.white,
            ),
            child: const Text('購入'),
          ),
        ],
      ),
    );
  }

  Future<void> _processPurchase(MenuItem menu) async {
    // 二重タップ対策：既に送信中なら何もしない
    if (_isLoading) {
      return;
    }

    setState(() {
      _isLoading = true;
    });

    // 処理中ダイアログを表示
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => const AlertDialog(
        content: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(width: 16),
            Text('Chip購入処理中...'),
          ],
        ),
      ),
    );

    try {
      final functions = FirebaseFunctions.instance;
      final callable = functions.httpsCallable('placeOrder');

      final result = await callable.call({
        'userId': widget.userId,
        'item': {
          'menuItemId': menu.id,
          'quantity': 1,
        },
        'clientNonce': _clientNonce, // ✅ トップレベルに追加（State が生きている間は固定）
      });

      // 処理中ダイアログを閉じる
      Navigator.of(context).pop();

      if (mounted) {
        // Chip購入ポップアップを閉じる
        Navigator.of(context).pop();
        
        // 成功メッセージを表示
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${widget.pokerName}様の${menu.name}の購入処理が完了しました。chipをお渡しください。',
            ),
            backgroundColor: Colors.green,
            duration: const Duration(seconds: 5),
          ),
        );
      }
    } catch (e) {
      // 処理中ダイアログを閉じる
      if (mounted) {
        Navigator.of(context).pop();
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Chip購入処理に失敗しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }
}
