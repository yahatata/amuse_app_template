import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'createMenuPage.dart';

class MenuEditorPage extends StatefulWidget {
  const MenuEditorPage({Key? key}) : super(key: key);

  @override
  State<MenuEditorPage> createState() => _MenuEditorPageState();
}

class _MenuEditorPageState extends State<MenuEditorPage> {
  List<Map<String, dynamic>> menuItems = [];
  String _selectedCategory = 'All';
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadMenuItems();
  }

  Future<void> _loadMenuItems() async {
    try {
      setState(() {
        _isLoading = true;
      });

      final callable = FirebaseFunctions.instance.httpsCallable('getMenuItems');
      final result = await callable.call({
        'showArchived': true,
        'showSoldOut': true,
      });

      final data = result.data;
      if (data['success'] == true) {
        setState(() {
          // 型安全な変換
          final rawMenuItems = data['menuItems'] as List;
          menuItems = rawMenuItems.map((item) => Map<String, dynamic>.from(item as Map)).toList();
          _isLoading = false;
        });
      } else {
        throw Exception("メニュー取得に失敗しました");
      }
    } on FirebaseFunctionsException catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('メニュー取得に失敗しました: ${e.message}')),
      );
      setState(() {
        _isLoading = false;
      });
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('メニュー取得に失敗しました: $e')),
      );
      setState(() {
        _isLoading = false;
      });
    }
  }

  List<Map<String, dynamic>> get _filteredMenuItems {
    List<Map<String, dynamic>> activeItems = [];
    List<Map<String, dynamic>> archivedItems = [];
    
    // アイテムをアクティブとアーカイブに分離
    for (var item in menuItems) {
      if (_selectedCategory == 'All' || item['category'] == _selectedCategory) {
        if (item['isArchive'] == true) {
          archivedItems.add(item);
        } else {
          activeItems.add(item);
        }
      }
    }
    
    // アクティブアイテムを先に、アーカイブアイテムを後に配置
    return [...activeItems, ...archivedItems];
  }

  Future<void> _toggleStatus(int index, bool newValue) async {
    final filteredIndex = menuItems.indexOf(_filteredMenuItems[index]);
    final menuItem = _filteredMenuItems[index];
    
    try {
      final callable = FirebaseFunctions.instance.httpsCallable('updateMenuItem');
      final result = await callable.call({
        'menuItemId': menuItem['id'],
        'isSoldOut': newValue,
      });

      final data = result.data;
      if (data['success'] == true) {
        setState(() {
          menuItems[filteredIndex]['isSoldOut'] = newValue;
        });
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(data['message'])),
        );
      } else {
        throw Exception("ステータス更新に失敗しました");
      }
    } on FirebaseFunctionsException catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('ステータス更新に失敗しました: ${e.message}')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('ステータス更新に失敗しました: $e')),
      );
    }
  }

  void _editMenu(Map<String, dynamic> item) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CreateMenuPage(editItem: item),
      ),
    );
  }

  void _goToCreateMenuPage() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const CreateMenuPage(editItem: null),
      ),
    );
  }

  Widget _buildCategoryButtons() {
    final categories = ['All', 'アルコール', 'ノンアルコール', 'フード', 'その他'];

    return SizedBox(
      height: 48,
      child: Row(
        children: [
          Flexible(
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              itemBuilder: (context, index) {
                final cat = categories[index];
                final isSelected = _selectedCategory == cat;
                return ChoiceChip(
                  label: Text(cat),
                  selected: isSelected,
                  onSelected: (_) {
                    setState(() {
                      _selectedCategory = cat;
                    });
                  },
                );
              },
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemCount: categories.length,
            ),
          ),
          Container(
            margin: const EdgeInsets.only(right: 35),
            child: const Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '一時',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
                Text(
                  '非表示',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('メニュー編集'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: _buildCategoryButtons(),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _filteredMenuItems.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.restaurant_menu, size: 64, color: Colors.grey),
                      SizedBox(height: 16),
                      Text(
                        'メニューがありません',
                        style: TextStyle(fontSize: 18, color: Colors.grey),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  itemCount: _filteredMenuItems.length,
                  itemBuilder: (context, index) {
                    final item = _filteredMenuItems[index];
                    final isArchived = item['isArchive'] == true;
                    
                    // アーカイブ済みアイテムの場合は日付を取得
                    String? archivedDate;
                    if (isArchived && item['archivedAt'] != null) {
                      try {
                        // Cloud Functionから文字列として返されるため、DateTime.parseを使用
                        final date = DateTime.parse(item['archivedAt']);
                        archivedDate = '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
                      } catch (e) {
                        debugPrint('archivedAtのパースエラー: $e');
                        archivedDate = '日付不明';
                      }
                    }
                    
                    return Container(
                      decoration: BoxDecoration(
                        border: Border(
                          bottom: BorderSide(color: Colors.grey.shade300, width: 1),
                        ),
                      ),
                      child: Stack(
                        children: [
                          // メインのListTile
                          ListTile(
                            leading: Container(
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(
                                color: Colors.grey.shade200,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: item['imageUrl'] != null &&
                                  item['imageUrl'].toString().isNotEmpty
                                  ? ClipRRect(
                                      borderRadius: BorderRadius.circular(8),
                                      child: Image.network(
                                        item['imageUrl'],
                                        fit: BoxFit.cover,
                                        errorBuilder: (context, error, stackTrace) {
                                          return const Icon(Icons.fastfood, color: Colors.grey);
                                        },
                                      ),
                                    )
                                  : const Icon(Icons.fastfood, color: Colors.grey),
                            ),
                            title: Text(
                              item['name'],
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: isArchived ? Colors.grey : null,
                              ),
                            ),
                            subtitle: Text(
                              '¥${item['price']} - ${item['category']}',
                              style: TextStyle(
                                color: isArchived ? Colors.grey : null,
                              ),
                            ),
                            trailing: isArchived
                                ? null
                                : Switch(
                                    value: item['isSoldOut'] ?? false,
                                    onChanged: (value) => _toggleStatus(index, value),
                                  ),
                            onTap: isArchived ? null : () => _editMenu(item),
                          ),
                          // アーカイブ済みの場合のオーバーレイ
                          if (isArchived)
                            Positioned.fill(
                              child: Container(
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: 0.3),
                                ),
                                child: Center(
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: Colors.black.withValues(alpha: 0.7),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      'アーカイブ済み（~${archivedDate ?? '日付不明'}）',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 12,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    );
                  },
                ),
      floatingActionButton: FloatingActionButton(
        onPressed: _goToCreateMenuPage,
        child: const Icon(Icons.add),
      ),
    );
  }
}
