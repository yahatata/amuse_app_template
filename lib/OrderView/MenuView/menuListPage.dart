import 'package:flutter/material.dart';
import '../../Utils/menuItemsManager.dart';

class MenuListPage extends StatefulWidget {
  final String category;

  const MenuListPage({Key? key, required this.category}) : super(key: key);

  @override
  State<MenuListPage> createState() => _MenuListPageState();
}

class _MenuListPageState extends State<MenuListPage> {
  List<MenuItem> menuItems = [];
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadMenuItems();
  }

  // When: メニューアイテム読み込み時
  // Where: menuListPage
  // What: 選択されたカテゴリーのメニューアイテムを取得
  // How: MenuItemsManagerからカテゴリー別データを取得
  void _loadMenuItems() {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    // When: データ取得時
    // Where: menuListPage
    // What: カテゴリー別のメニューアイテムを取得
    // How: MenuItemsManagerのgetMenuItemsByCategory関数を使用
    final items = MenuItemsManager.getMenuItemsByCategory(widget.category);
    
    setState(() {
      menuItems = items;
      _isLoading = false;
    });
  }

  // When: 更新ボタン押下時
  // Where: menuListPage
  // What: メニューアイテムを再取得
  // How: MenuItemsManager経由でFireStoreから再取得
  Future<void> _refreshData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final success = await MenuItemsManager.fetchMenuItems();
    
    if (success) {
      _loadMenuItems();
    } else {
      setState(() {
        _isLoading = false;
        _errorMessage = MenuItemsManager.lastError;
      });
    }
  }

  void _showOrderDialog(MenuItem item) {
    int quantity = 1;

    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(builder: (context, setStateDialog) {
          final total = item.price * quantity;

          return AlertDialog(
            title: Text(item.name),
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
                  _showConfirmDialog(item.name, quantity, total);
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

  Widget _buildMenuItem(MenuItem item) {
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
              child: item.imageUrl.isNotEmpty
                  ? Image.network(item.imageUrl, fit: BoxFit.cover)
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
                      item.name,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    Text('¥${item.price}', style: const TextStyle(fontSize: 16)),
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
        actions: [
          // When: 更新ボタン表示時
          // Where: AppBar
          // What: 更新ボタンを表示
          // How: IconButtonで更新アイコンを配置
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _isLoading ? null : _refreshData,
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  // When: ボディ部分構築時
  // Where: menuListPage
  // What: エラー・ローディング・コンテンツを表示
  // How: 条件分岐で適切なWidgetを返却
  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_errorMessage != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              _errorMessage!,
              style: const TextStyle(color: Colors.red),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _refreshData,
              child: const Text('再試行'),
            ),
          ],
        ),
      );
    }

    if (menuItems.isEmpty) {
      return const Center(
        child: Text(
          'このカテゴリーにはメニューがありません',
          style: TextStyle(fontSize: 16),
        ),
      );
    }

    return ListView.builder(
      itemCount: menuItems.length,
      itemBuilder: (context, index) {
        final item = menuItems[index];
        return _buildMenuItem(item);
      },
    );
  }
}
