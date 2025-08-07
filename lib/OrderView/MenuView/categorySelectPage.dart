import 'package:flutter/material.dart';
import 'menuListPage.dart';
import '../../globalConstant.dart';
import '../../Utils/menuItemsManager.dart';

class CategorySelectPage extends StatefulWidget {
  const CategorySelectPage({Key? key}) : super(key: key);

  @override
  State<CategorySelectPage> createState() => _CategorySelectPageState();
}

class _CategorySelectPageState extends State<CategorySelectPage> {
  List<String> _categories = [];
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadCategories(); // 即座に実行（カテゴリー一覧表示）
    
    // 画面構築完了後にメニューアイテムを読み込み
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadMenuItems(); // 遅延実行
    });
  }

  // When: カテゴリー一覧読み込み時
  // Where: categorySelectPage
  // What: globalConstant.dartからカテゴリー一覧を取得
  // How: GlobalConstantsクラスから静的リストを取得
  void _loadCategories() {
    setState(() {
      _categories = GlobalConstants.menuCategories;
    });
  }

  // When: メニューアイテム読み込み時
  // Where: categorySelectPage
  // What: FireStoreからメニューアイテムを取得
  // How: MenuItemsManager経由でCloud Functionsを呼び出し
  Future<void> _loadMenuItems() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final success = await MenuItemsManager.fetchMenuItems();
    
    setState(() {
      _isLoading = false;
      if (!success) {
        _errorMessage = MenuItemsManager.lastError;
      }
    });
  }

  // When: 更新ボタン押下時
  // Where: categorySelectPage
  // What: メニューアイテムを再取得
  // How: _loadMenuItems関数を呼び出し
  Future<void> _refreshData() async {
    await _loadMenuItems();
  }

  Icon _getCategoryIcon(String category) {
    switch (category) {
      case 'フード':
        return const Icon(Icons.restaurant, color: Colors.brown);
      case 'ノンアルコール':
        return const Icon(Icons.local_drink, color: Colors.blue);
      case 'アルコール':
        return const Icon(Icons.local_bar, color: Colors.amber);
      case 'その他':
        return const Icon(Icons.category, color: Colors.grey);
      default:
        return const Icon(Icons.category, color: Colors.grey);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('メニューカテゴリー'),
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
  // Where: categorySelectPage
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

    return ListView.builder(
      itemCount: _categories.length,
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
      itemBuilder: (context, index) {
        final category = _categories[index];

        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: InkWell(
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => MenuListPage(category: category),
                ),
              );
            },
            child: Container(
              height: 100, // 通常のListTileの2倍相当
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.shade300, width: 1),
                borderRadius: BorderRadius.circular(12),
                color: Colors.white,
              ),
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  _getCategoryIcon(category),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Text(
                      category,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  const Icon(Icons.arrow_forward_ios, size: 18),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
