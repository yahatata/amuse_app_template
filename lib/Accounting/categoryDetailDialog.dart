import 'package:flutter/material.dart';

class CategoryDetailDialog extends StatelessWidget {
  final String categoryName;
  final List<dynamic> items;
  final int totalAmount;

  const CategoryDetailDialog({
    Key? key,
    required this.categoryName,
    required this.items,
    required this.totalAmount,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    // 同一商品をまとめる処理
    final groupedItems = _groupItemsByCategory(items, categoryName);

    return AlertDialog(
      title: Row(
        children: [
          Icon(
            _getCategoryIcon(categoryName),
            color: Colors.blue.shade600,
            size: 24,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              categoryName,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // アイテム一覧
            if (groupedItems.isNotEmpty) ...[
              const Text(
                '詳細',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.black87,
                ),
              ),
              const SizedBox(height: 12),
              ...groupedItems.map((item) => _buildItemRow(item)).toList(),
              const Divider(thickness: 2),
            ],
            // 合計金額
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  '合計',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
                Text(
                  '¥${totalAmount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Colors.blue,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('閉じる'),
        ),
      ],
    );
  }

  // 同一商品をまとめる処理
  List<Map<String, dynamic>> _groupItemsByCategory(List<dynamic> items, String categoryName) {
    Map<String, Map<String, dynamic>> grouped = {};

    for (final item in items) {
      if (item is Map<String, dynamic>) {
        String name = '';
        int price = 0;
        int quantity = 1;

        // カテゴリによって異なる処理
        if (categoryName == 'トーナメント参加費') {
          // トーナメントはtemplateNameを使用
          name = item['templateName'] ?? '';
          price = (item['entryFee'] as num? ?? 0).toInt();
          quantity = 1;
          
          // トーナメントは名前でグループ化
          if (grouped.containsKey(name)) {
            grouped[name]!['quantity'] = (grouped[name]!['quantity'] as int) + 1;
            grouped[name]!['totalPrice'] = (grouped[name]!['totalPrice'] as int) + price;
          } else {
            grouped[name] = {
              'name': name,
              'price': price,
              'quantity': 1,
              'totalPrice': price,
            };
          }
        } else {
          // その他のカテゴリはnameフィールドを使用
          name = item['name'] ?? '';
          price = (item['price'] as num? ?? 0).toInt();
          quantity = (item['quantity'] as num? ?? 1).toInt();
          
          // その他のカテゴリは名前と価格でグループ化
          String key = '$name-${price}';
          if (grouped.containsKey(key)) {
            grouped[key]!['quantity'] = (grouped[key]!['quantity'] as int) + quantity;
            grouped[key]!['totalPrice'] = (grouped[key]!['totalPrice'] as int) + (price * quantity);
          } else {
            grouped[key] = {
              'name': name,
              'price': price,
              'quantity': quantity,
              'totalPrice': price * quantity,
            };
          }
        }
      }
    }

    return grouped.values.toList();
  }

  Widget _buildItemRow(dynamic item) {
    String name = '';
    int price = 0;
    int quantity = 1;
    int totalPrice = 0;

    // データ構造に応じて値を取得
    if (item is Map<String, dynamic>) {
      name = item['name'] ?? '';
      price = (item['price'] as num? ?? 0).toInt();
      quantity = (item['quantity'] as num? ?? 1).toInt();
      totalPrice = (item['totalPrice'] as num? ?? price).toInt();
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Row(
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.black87,
                  ),
                ),
                if (quantity > 1) ...[
                  const SizedBox(width: 8),
                  Text(
                    '×$quantity',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.black87,
                    ),
                  ),
                ],
              ],
            ),
          ),
          Expanded(
            flex: 2,
            child: Text(
              '¥${(quantity > 1 ? totalPrice : price).toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.black87,
              ),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }

  IconData _getCategoryIcon(String categoryName) {
    switch (categoryName) {
      case '入店料':
        return Icons.door_front_door;
      case 'トーナメント参加費':
        return Icons.emoji_events;
      case 'フード・ドリンク':
        return Icons.restaurant;
      case 'サイドゲームチップ':
        return Icons.casino;
      default:
        return Icons.category;
    }
  }
}
