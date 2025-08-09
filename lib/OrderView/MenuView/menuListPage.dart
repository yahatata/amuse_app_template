import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
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
  final FirebaseFunctions _functions = FirebaseFunctions.instance;

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

  // When: 注文ダイアログ表示時
  // Where: menuListPage
  // What: 入店中ユーザー一覧の取得と数量選択、合計表示
  // How: Cloud Functions(getOpenBills)でユーザー取得し、ダイアログで選択
  void _showOrderDialog(MenuItem item) {
    int quantity = 1;
    String? selectedUserId;
    String? selectedUserName;

    showDialog(
      context: context,
      builder: (context) {
        final Future<HttpsCallableResult> future =
            _functions.httpsCallable('getOpenBills').call();

        return StatefulBuilder(builder: (context, setStateDialog) {
          final total = item.price * quantity;

          return AlertDialog(
            title: Text(item.name),
            content: FutureBuilder<HttpsCallableResult>(
              future: future,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const SizedBox(
                      height: 120, child: Center(child: CircularProgressIndicator()));
                }
                if (snapshot.hasError || snapshot.data == null) {
                  return const Text('入店中のユーザー取得に失敗しました');
                }
                final response = snapshot.data!.data;
                if (response is! Map || response['success'] != true) {
                  return const Text('入店中のユーザーが取得できません');
                }
                final List users = response['data'] as List;
                if (users.isEmpty) {
                  return const Text('入店中のユーザーがいません');
                }

                // 初期選択
                selectedUserId ??= users.first['userId'] as String?;
                selectedUserName = users
                    .firstWhere((u) => u['userId'] == selectedUserId)['pokerName'] as String?;

                return Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 注文者選択
                    const Text('注文者'),
                    const SizedBox(height: 8),
                    DropdownButton<String>(
                      isExpanded: true,
                      value: selectedUserId,
                      items: users.map<DropdownMenuItem<String>>((u) {
                        return DropdownMenuItem<String>(
                          value: u['userId'] as String,
                          child: Text(u['pokerName'] as String? ?? ''),
                        );
                      }).toList(),
                      onChanged: (val) {
                        setStateDialog(() {
                          selectedUserId = val;
                          selectedUserName = users
                              .firstWhere((u) => u['userId'] == val)['pokerName'] as String?;
                        });
                      },
                    ),
                    const SizedBox(height: 16),

                    // 個数選択
                    Row(
                      children: [
                        IconButton(
                          onPressed: () {
                            if (quantity > 1) setStateDialog(() => quantity--);
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
                        const Spacer(),
                        Text('合計: ¥$total'),
                      ],
                    ),
                  ],
                );
              },
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('キャンセル'),
              ),
              TextButton(
                onPressed: () {
                  if (selectedUserId == null) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('注文者を選択してください')),
                    );
                    return;
                  }
                  Navigator.pop(context);
                  _showConfirmDialog(item, selectedUserId!, selectedUserName ?? '', quantity,
                      item.price * quantity);
                },
                child: const Text('注文'),
              ),
            ],
          );
        });
      },
    );
  }

  // When: 注文確認時
  // Where: menuListPage
  // What: 内容確認とCloud Functions呼び出し
  // How: placeOrder を呼んでサーバーで登録
  void _showConfirmDialog(
      MenuItem item, String userId, String userName, int quantity, int total) {
    // When: SnackBar表示時に破棄されたcontextを参照しないようにする
    // Where: 親画面のcontextを事前に保持
    // What: SnackBar表示で利用
    // How: this.contextをローカルへ保持
    final BuildContext pageContext = context;
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('注文確認'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('注文者: $userName'),
              Text('メニュー: ${item.name}'),
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
                try {
                  final callable = _functions.httpsCallable('placeOrder');
                  final payload = {
                    'userId': userId,
                    'item': {
                      'menuItemId': item.id,
                      'category': item.category,
                      'name': item.name,
                      'price': item.price,
                      'quantity': quantity,
                    }
                  };
                  final result = await callable.call(payload);
                  if (!mounted) return; // 非同期後の安全確認
                  final res = result.data;
                  if (res is Map && res['success'] == true) {
                    ScaffoldMessenger.of(pageContext).showSnackBar(
                      const SnackBar(content: Text('注文を送信しました')),
                    );
                  } else {
                    final msg = (res is Map ? res['error'] : null) ?? '注文に失敗しました';
                    ScaffoldMessenger.of(pageContext).showSnackBar(
                      SnackBar(content: Text(msg)),
                    );
                  }
                } catch (e) {
                  if (!mounted) return;
                  ScaffoldMessenger.of(pageContext).showSnackBar(
                    SnackBar(content: Text('注文に失敗しました: $e')),
                  );
                }
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
                  ? Image.network(
                      item.imageUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stackTrace) {
                        print('Image error for ${item.name}: $error');
                        print('Image URL: ${item.imageUrl}');
                        return const Center(child: Icon(Icons.image_not_supported, color: Colors.grey));
                      },
                      loadingBuilder: (context, child, loadingProgress) {
                        if (loadingProgress == null) return child;
                        return const Center(child: CircularProgressIndicator());
                      },
                    )
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
