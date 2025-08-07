import 'package:flutter/material.dart';

class MenuListPage extends StatefulWidget {
  final String category;

  const MenuListPage({Key? key, required this.category}) : super(key: key);

  @override
  State<MenuListPage> createState() => _MenuListPageState();
}

class _MenuListPageState extends State<MenuListPage> {
  List<Map<String, dynamic>> menuItems = [];

  @override
  void initState() {
    super.initState();

    // TODO: Cloud Functions経由でmenuItemsを取得（カテゴリーでフィルタ）
    // final callable = FirebaseFunctions.instance.httpsCallable('getMenuItemsByCategory');
    // final result = await callable({'category': widget.category});
    // setState(() {
    //   menuItems = List<Map<String, dynamic>>.from(result.data);
    // });

    final allMockItems = [
      {
        "menuItemId": "1",
        "name": "Cheeseburger",
        "price": 850,
        "isArchived": false,
        "itemCategory": "Food",
        "imageUrl": "",
      },
      {
        "menuItemId": "2",
        "name": "Fried Chicken",
        "price": 780,
        "isArchived": false,
        "itemCategory": "Food",
        "imageUrl": "",
      },
      {
        "menuItemId": "3",
        "name": "Cola",
        "price": 300,
        "isArchived": false,
        "itemCategory": "Drink",
        "imageUrl": "",
      },
      {
        "menuItemId": "4",
        "name": "Orange Juice",
        "price": 350,
        "isArchived": false,
        "itemCategory": "Drink",
        "imageUrl": "",
      },
      {
        "menuItemId": "5",
        "name": "Chocolate Cake",
        "price": 600,
        "isArchived": false,
        "itemCategory": "Dessert",
        "imageUrl": "",
      },
      {
        "menuItemId": "6",
        "name": "Ice Cream",
        "price": 500,
        "isArchived": false,
        "itemCategory": "Dessert",
        "imageUrl": "",
      },
    ];

    menuItems = allMockItems
        .where((item) =>
    item['itemCategory'].toString().toLowerCase() ==
        widget.category.toLowerCase())
        .toList();
  }

  void _showOrderDialog(Map<String, dynamic> item) {
    int quantity = 1;

    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(builder: (context, setStateDialog) {
          final total = item['price'] * quantity;

          return AlertDialog(
            title: Text(item['name']),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    IconButton(
                      onPressed: () {
                        if (quantity > 1) {
                          setStateDialog(() => quantity--);
                        }
                      },
                      icon: const Icon(Icons.remove),
                    ),
                    Text(quantity.toString()),
                    IconButton(
                      onPressed: () {
                        setStateDialog(() => quantity++);
                      },
                      icon: const Icon(Icons.add),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text('合計金額: ¥$total'),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('キャンセル'),
              ),
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                  _showConfirmDialog(item['name'], quantity, total);
                },
                child: const Text('注文'),
              ),
            ],
          );
        });
      },
    );
  }

  void _showConfirmDialog(String name, int quantity, int total) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('注文確認'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('メニュー: $name'),
              Text('個数: $quantity'),
              Text('合計: ¥$total'),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('キャンセル'),
            ),
            TextButton(
              onPressed: () async {
                Navigator.pop(context);

                // TODO: Cloud Functionsを使ってOrderを登録
                // final callable = FirebaseFunctions.instance.httpsCallable('createOrder');
                // await callable.call({
                //   'menuName': name,
                //   'quantity': quantity,
                //   'totalPrice': total,
                // });

                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('注文を送信しました')),
                );
              },
              child: const Text('注文確定'),
            ),
          ],
        );
      },
    );
  }

  Widget _buildMenuItem(Map<String, dynamic> item) {
    return Container(
      height: 108, // 高さ1.5倍
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Colors.grey.shade300, width: 1),
        ),
      ),
      child: InkWell(
        onTap: () => _showOrderDialog(item),
        child: Row(
          children: [
            // 左側：画像枠
            Container(
              width: 108,
              height: 108,
              color: Colors.grey.shade200,
              child: item['imageUrl'] != null && item['imageUrl'].toString().isNotEmpty
                  ? Image.network(item['imageUrl'], fit: BoxFit.cover)
                  : const Center(child: Icon(Icons.image_not_supported, color: Colors.grey)),
            ),
            // 右側：テキスト情報
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item['name'],
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    Text('¥${item['price']}', style: const TextStyle(fontSize: 16)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('${widget.category} メニュー'),
      ),
      body: ListView.builder(
        itemCount: menuItems.length,
        itemBuilder: (context, index) {
          final item = menuItems[index];
          return _buildMenuItem(item);
        },
      ),
    );
  }
}
