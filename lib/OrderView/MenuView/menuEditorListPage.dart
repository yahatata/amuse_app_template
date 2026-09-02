import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:flutter/rendering.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../../Utils/menuItemsManager.dart';
import '../../services/store_config_defaults.dart';
import '../../services/store_config_service.dart';
import 'createMenuPage.dart';

class MenuEditorListPage extends StatefulWidget {
  const MenuEditorListPage({Key? key}) : super(key: key);

  @override
  State<MenuEditorListPage> createState() => _MenuEditorListPageState();
}

class _MenuEditorListPageState extends State<MenuEditorListPage> {
  String _selectedCategory = 'All';
  List<MenuItem> _displayedItems = [];
  bool _isLoading = false;
  /// 売り切れスイッチ操作時（主領域オーバーレイ＋UIロック）
  bool _isSoldOutToggleLoading = false;
  String? _errorMessage;
  final ScrollController _scrollController = ScrollController();
  bool _showFloatingButton = true;
  final FirebaseFunctions _functions = FunctionsClient.instance;

  @override
  void initState() {
    super.initState();
    _loadCategories();
    // 初期表示時にアーカイブされたアイテムも含めて取得
    _initializeMenuItems();
    
    // When: スクロール監視開始時
    // Where: MenuEditorListPage
    // What: スクロール状態を監視してボタン表示を制御
    // How: ScrollControllerでスクロールイベントを監視
    _scrollController.addListener(_onScroll);
  }

  // When: メニューアイテム初期化時
  // Where: MenuEditorListPage
  // What: アーカイブされたアイテムも含めてメニューアイテムを取得
  // How: MenuItemsManager経由でFireStoreから再取得（アーカイブされたアイテムも含める）
  Future<void> _initializeMenuItems() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final success = await MenuItemsManager.fetchMenuItems(includeArchived: true);
    
    if (success) {
      _loadMenuItems();
    } else {
      setState(() {
        _isLoading = false;
        _errorMessage = MenuItemsManager.lastError;
      });
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  // When: スクロール時
  // Where: MenuEditorListPage
  // What: スクロール方向に応じてボタン表示を制御
  // How: スクロール方向を判定してボタン表示を切り替え
  void _onScroll() {
    final scrollDirection = _scrollController.position.userScrollDirection;
    
    if (scrollDirection == ScrollDirection.reverse) {
      if (_showFloatingButton) {
        setState(() {
          _showFloatingButton = false;
        });
      }
    } else if (scrollDirection == ScrollDirection.forward) {
      if (!_showFloatingButton) {
        setState(() {
          _showFloatingButton = true;
        });
      }
    }
  }

  // When: カテゴリー一覧読み込み時
  // Where: MenuEditorListPage
  // What: カテゴリー一覧を準備（build で StoreConfigService から取得）
  void _loadCategories() {
    // カテゴリーは build 内で StoreConfigService.instance.latestData?.menuCategories から取得
  }

  // When: メニューアイテム読み込み時
  // Where: MenuEditorListPage
  // What: 選択されたカテゴリーのメニューアイテムを取得
  // How: MenuItemsManagerからデータを取得
  void _loadMenuItems() {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    setState(() {
      _updateDisplayedItemsFromManager();
      _isLoading = false;
    });
  }

  /// MenuItemsManager の現在値から一覧表示用リストだけ更新（全画面スピナーは出さない）
  void _updateDisplayedItemsFromManager() {
    final allItems = MenuItemsManager.allMenuItems;
    if (_selectedCategory == 'All') {
      _displayedItems = allItems;
    } else {
      _displayedItems = allItems
          .where((item) => item.category == _selectedCategory)
          .toList();
    }
  }

  // When: カテゴリー選択時
  // Where: MenuEditorListPage
  // What: 選択されたカテゴリーのメニューを表示
  // How: カテゴリーを変更してメニュー一覧を更新
  void _onCategorySelected(String category) {
    setState(() {
      _selectedCategory = category;
    });
    _loadMenuItems();
  }

  // When: 更新ボタン押下時
  // Where: MenuEditorListPage
  // What: メニューアイテムを再取得
  // How: MenuItemsManager経由でFireStoreから再取得（アーカイブされたアイテムも含める）
  Future<void> _refreshData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final success = await MenuItemsManager.fetchMenuItems(includeArchived: true);
    
    if (success) {
      _loadMenuItems();
    } else {
      setState(() {
        _isLoading = false;
        _errorMessage = MenuItemsManager.lastError;
      });
    }
  }

  // When: 売り切れ状態切り替え時
  // Where: MenuEditorListPage
  // What: Cloud Functionsを呼び出して売り切れ状態を更新
  // How: toggleSoldOutForMenuItem関数を呼び出し
  Future<void> _toggleSoldOut(String menuItemId, bool isSoldOut) async {
    setState(() {
      _isSoldOutToggleLoading = true;
    });
    try {
      final callable = _functions.httpsCallable('toggleSoldOutForMenuItem');
      final result = await callable.call({
        'menuItemId': menuItemId,
        'isSoldOut': isSoldOut,
      });

      final response = result.data;
      if (isCallableSuccessResponse(response)) {
        // MenuItemsManagerを更新（アーカイブされたアイテムも含める）
        await MenuItemsManager.fetchMenuItems(includeArchived: true);
        if (!mounted) return;
        setState(() {
          _updateDisplayedItemsFromManager();
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(isSoldOut ? '売り切れに設定しました' : '販売中に設定しました'),
          ),
        );
      } else {
        // MENU-03 soft-fail: raw 非表示、売切状態は再取得しない（成功確定しない）
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(mapCallableSoftFailMessage(response))),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(mapCallableError(e).message)),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isSoldOutToggleLoading = false;
        });
      }
    }
  }

  // When: メニューアイテム表示時
  // Where: MenuEditorListPage
  // What: メニューアイテムのUIを構築
  // How: ListTileでメニュー情報を表示
  Widget _buildMenuItem(MenuItem item) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: ListTile(
        leading: Container(
          width: 60,
          height: 60,
          decoration: BoxDecoration(
            color: Colors.grey.shade200,
            borderRadius: BorderRadius.circular(8),
          ),
          child: item.imageUrl.isNotEmpty
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.network(
                    item.imageUrl,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) {
                      print('Image error for ${item.name}: $error');
                      print('Image URL: ${item.imageUrl}');
                      return const Icon(Icons.image_not_supported, color: Colors.grey);
                    },
                    loadingBuilder: (context, child, loadingProgress) {
                      if (loadingProgress == null) return child;
                      return const Center(child: CircularProgressIndicator());
                    },
                  ),
                )
              : const Icon(Icons.image_not_supported, color: Colors.grey),
        ),
        title: Text(
          item.name,
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('カテゴリー: ${item.category}'),
            Text('価格: ¥${item.price}'),
            if (item.isArchive) 
              const Text('アーカイブ済み', style: TextStyle(color: Colors.red)),
            if (item.isSoldOut) 
              const Text('売り切れ', style: TextStyle(color: Colors.orange)),
          ],
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.edit),
              onPressed: () {
                // When: メニュー編集ボタン押下時
                // Where: MenuEditorListPage
                // What: createMenuPageに遷移してメニューデータを渡す
                // How: Navigator.pushでメニューデータを渡して遷移
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => CreateMenuPage(menuItem: item),
                  ),
                ).then((_) {
                  // 遷移後にデータを更新
                  _refreshData();
                });
              },
            ),
            const SizedBox(width: 8),
            // 売り切れ状態切り替えスイッチ
            Switch(
              value: item.isSoldOut,
              onChanged: _isSoldOutToggleLoading
                  ? null
                  : (value) {
                      _toggleSoldOut(item.id, value);
                    },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_isSoldOutToggleLoading,
      child: Stack(
        children: [
          Scaffold(
            appBar: AppBar(
              title: const Text('メニュー管理用リスト'),
            ),
            body: Column(
              children: [
          // When: カテゴリー選択UI表示時
          // Where: MenuEditorListPage
          // What: カテゴリー選択用のUIを表示
          // How: SingleChildScrollViewで横スクロール可能なカテゴリー一覧を表示
          Container(
            height: 60,
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  const SizedBox(width: 16),
                  // Allカテゴリー
                  _buildCategoryChip('All'),
                  const SizedBox(width: 8),
                  // 各カテゴリー
                  ...(StoreConfigService.instance.latestData?.menuCategories ?? kDefaultMenuCategories).map((category) => 
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: _buildCategoryChip(category),
                    ),
                  ),
                  const SizedBox(width: 16),
                ],
              ),
            ),
          ),
          // When: メニュー一覧表示時
          // Where: MenuEditorListPage
          // What: 選択されたカテゴリーのメニュー一覧を表示
          // How: ExpandedとListView.builderでメニュー一覧を表示
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _errorMessage != null
                    ? Center(
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
                      )
                    : _displayedItems.isEmpty
                        ? const Center(
                            child: Text(
                              'このカテゴリーにはメニューがありません',
                              style: TextStyle(fontSize: 16),
                            ),
                          )
                        : ListView.builder(
                            controller: _scrollController,
                            itemCount: _displayedItems.length,
                            itemBuilder: (context, index) {
                              return _buildMenuItem(_displayedItems[index]);
                            },
                          ),
          ),
              ],
            ),
            // When: フローティングアクションボタン表示時
            // Where: MenuEditorListPage
            // What: スクロール中は消える更新ボタンとメニュー追加ボタンを表示
            // How: AnimatedOpacityでボタンの表示/非表示を制御
            floatingActionButton: AnimatedOpacity(
              opacity: _showFloatingButton ? 1.0 : 0.0,
              duration: const Duration(milliseconds: 300),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  FloatingActionButton.extended(
                    heroTag: 'refresh_button',
                    onPressed: (_isLoading || _isSoldOutToggleLoading)
                        ? null
                        : _refreshData,
                    icon: const Icon(Icons.refresh),
                    label: const Text('更新'),
                  ),
                  const SizedBox(width: 16),
                  FloatingActionButton.extended(
                    heroTag: 'add_button',
                    onPressed: _isSoldOutToggleLoading
                        ? null
                        : () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (context) => const CreateMenuPage(),
                              ),
                            );
                          },
                    icon: const Icon(Icons.add),
                    label: const Text('メニューの追加'),
                  ),
                ],
              ),
            ),
          ),
          if (_isSoldOutToggleLoading)
            Positioned.fill(
              child: AbsorbPointer(
                child: ColoredBox(
                  color: Colors.black.withValues(alpha: 0.35),
                  child: const Center(
                    child: CircularProgressIndicator(),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  // When: カテゴリーチップ構築時
  // Where: MenuEditorListPage
  // What: カテゴリー選択用のチップを構築
  // How: FilterChipでカテゴリー選択UIを構築
  Widget _buildCategoryChip(String category) {
    final isSelected = _selectedCategory == category;
    return FilterChip(
      label: Text(category),
      selected: isSelected,
      onSelected: _isSoldOutToggleLoading
          ? null
          : (selected) {
              if (selected) {
                _onCategorySelected(category);
              }
            },
      selectedColor: Theme.of(context).primaryColor.withOpacity(0.3),
      checkmarkColor: Theme.of(context).primaryColor,
    );
  }
}
