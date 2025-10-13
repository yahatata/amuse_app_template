import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../Utils/menuItemsManager.dart';
import '../globalConstant.dart';

/// When: 「注文」ブロックから注文フローを開始したい時
/// Where: userActionHome（別ダイアログ）
/// What: カテゴリー選択とメニュー一覧、アイテムタップで数量→確定
/// How: MenuItemsManager と GlobalConstants を参照し、placeOrder を呼び出す
Future<void> showOrderFromUserDialog({
  required BuildContext pageContext,
  required Map<String, dynamic> user,
  VoidCallback? onBackToUserActionHome,
}) async {
  final String userId = (user['userId'] ?? '').toString();
  if (userId.isEmpty) {
    ScaffoldMessenger.of(pageContext).showSnackBar(
      const SnackBar(content: Text('ユーザー識別子が見つかりません')),
    );
    return;
  }

  // 初期カテゴリーは All 相当
  String selectedCategory = 'All';
  bool loading = false;
  String? loadError;

  // データが無ければロード
  if (MenuItemsManager.allMenuItems.isEmpty) {
    loading = true;
    final ok = await MenuItemsManager.fetchMenuItems();
    loading = false;
    if (!ok) {
      loadError = MenuItemsManager.lastError ?? 'メニュー取得に失敗しました';
    }
  }

  if (loadError != null) {
    if (pageContext.mounted) {
      ScaffoldMessenger.of(pageContext).showSnackBar(
        SnackBar(content: Text(loadError!)),
      );
    }
    return;
  }

  debugPrint('[OrderPop] open for userId=$userId');
  await showDialog<void>(
    context: pageContext,
    barrierDismissible: true,
    builder: (ctx) {
      return StatefulBuilder(
        builder: (ctx, setState) {
          debugPrint('[OrderPop] build stateful dialog selectedCategory=$selectedCategory');
          // 表示対象メニューの抽出
          final items = selectedCategory == 'All'
              ? MenuItemsManager.getDisplayableMenuItems()
              : MenuItemsManager
                  .getDisplayableMenuItems()
                  .where((e) => e.category == selectedCategory)
                  .toList();

          return Dialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            insetPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720, maxHeight: 640),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        // 左上「戻る」
                        IconButton(
                          icon: const Icon(Icons.arrow_back),
                          onPressed: () {
                            Navigator.of(ctx).pop();
                            if (onBackToUserActionHome != null) {
                              Future.microtask(onBackToUserActionHome);
                            }
                          },
                        ),
                        const SizedBox(width: 4),
                        const Icon(Icons.shopping_bag_outlined, size: 20),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '注文 - ${(user['pokerName'] ?? '(名前未設定)').toString()}',
                            style: const TextStyle(fontWeight: FontWeight.bold),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () => Navigator.of(ctx).pop(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 48,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        children: [
                          const SizedBox(width: 8),
                          ChoiceChip(
                            label: const Text('All'),
                            selected: selectedCategory == 'All',
                            onSelected: (_) => setState(() => selectedCategory = 'All'),
                          ),
                          const SizedBox(width: 8),
                          ...GlobalConstants.menuCategories.map((c) => Padding(
                                padding: const EdgeInsets.only(right: 8),
                                child: ChoiceChip(
                                  label: Text(c),
                                  selected: selectedCategory == c,
                                  onSelected: (_) => setState(() => selectedCategory = c),
                                ),
                              )),
                          const SizedBox(width: 8),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    Expanded(
                      child: loading
                          ? const Center(child: CircularProgressIndicator())
                          : items.isEmpty
                              ? const Center(child: Text('メニューがありません'))
                              : ListView.builder(
                                  itemCount: items.length,
                                  itemBuilder: (context, index) {
                                    final item = items[index];
                                    return Card(
                                      margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                                      child: ListTile(
                                        leading: SizedBox(
                                          width: 56,
                                          height: 56,
                                          child: item.imageUrl.isNotEmpty
                                              ? ClipRRect(
                                                  borderRadius: BorderRadius.circular(8),
                                                  child: Image.network(
                                                    item.imageUrl,
                                                    fit: BoxFit.cover,
                                                  ),
                                                )
                                              : const Icon(Icons.image_not_supported, color: Colors.grey),
                                        ),
                                        title: Text(item.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                                        subtitle: Text('¥${item.price} • ${item.category}'),
                                        onTap: () async {
                                          debugPrint('[OrderPop] tap item id=${item.id} name=${item.name}');
                                          // 一覧ポップは閉じず、その上に数量ポップを重ねて表示
                                          await _showQuantityAndConfirm(
                                            pageContext: pageContext,
                                            userId: userId,
                                            item: item,
                                          );
                                        },
                                      ),
                                    );
                                  },
                                ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      );
    },
  );
}

/// When: アイテムを選択し数量を確定したい時
/// Where: 注文ダイアログ
/// What: 数量入力→Cloud Functions placeOrder の呼び出し
/// How: showDialog + TextField/Step 後に httpsCallable('placeOrder') を実行
Future<void> _showQuantityAndConfirm({
  required BuildContext pageContext,
  required String userId,
  required MenuItem item,
}) async {
  int quantity = 1;
  await showDialog<void>(
    context: pageContext,
    barrierDismissible: true,
    builder: (ctx) {
      return StatefulBuilder(
        builder: (ctx, setState) {
          final totalPrice = item.price * quantity;
          return AlertDialog(
            title: Text('${item.name} を注文'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('単価: ¥${item.price}'),
                const SizedBox(height: 8),
                Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.remove_circle_outline),
                      onPressed: quantity > 1 ? () => setState(() => quantity -= 1) : null,
                    ),
                    Text('$quantity', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    IconButton(
                      icon: const Icon(Icons.add_circle_outline),
                      onPressed: () => setState(() => quantity += 1),
                    ),
                    const Spacer(),
                    Text('合計: ¥$totalPrice', style: const TextStyle(fontWeight: FontWeight.bold)),
                  ],
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('キャンセル'),
              ),
              ElevatedButton(
                onPressed: () async {
                  debugPrint('[OrderPop] confirm order for item=${item.id} qty=$quantity userId=$userId');
                  try {
                    final functions = FirebaseFunctions.instance;
                    final callable = functions.httpsCallable('placeOrder');
                    final resp = await callable.call({
                      'userId': userId,
                      'item': {
                        'menuItemId': item.id,
                        'category': item.category,
                        'name': item.name,
                        'price': item.price,
                        'quantity': quantity,
                      },
                    });

                    final data = resp.data;
                    if (data is Map && data['success'] == true) {
                      if (pageContext.mounted) {
                        ScaffoldMessenger.of(pageContext).showSnackBar(
                          const SnackBar(content: Text('注文を送信しました')),
                        );
                      }
                      // 数量ダイアログを閉じる
                      Navigator.of(ctx).pop();
                      // 一覧ダイアログ（orderFromUserActionPop）も閉じる
                      Navigator.of(pageContext).pop();
                    } else {
                      final err = (data is Map ? data['error'] : null) ?? '注文に失敗しました';
                      if (pageContext.mounted) {
                        ScaffoldMessenger.of(pageContext).showSnackBar(
                          SnackBar(content: Text(err)),
                        );
                      }
                    }
                  } catch (e) {
                    if (pageContext.mounted) {
                      ScaffoldMessenger.of(pageContext).showSnackBar(
                        SnackBar(content: Text('注文に失敗しました: $e')),
                      );
                    }
                  }
                },
                child: const Text('注文確定'),
              ),
            ],
          );
        },
      );
    },
  );
}


