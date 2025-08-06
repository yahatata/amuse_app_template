import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'menuListPage.dart';

class CategorySelectPage extends StatefulWidget {
  const CategorySelectPage({Key? key}) : super(key: key);

  @override
  State<CategorySelectPage> createState() => _CategorySelectPageState();
}

class _CategorySelectPageState extends State<CategorySelectPage> {
  List<String> _categories = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadCategories();
  }

  Future<void> _loadCategories() async {
    try {
      setState(() {
        _isLoading = true;
      });

      final callable = FirebaseFunctions.instance.httpsCallable('getMenuItems');
      final result = await callable.call({
        'showArchived': false,
        'showSoldOut': false,
      });

      final data = result.data;
      debugPrint('categorySelectPage: レスポンス受信 - success: ${data['success']}');
      debugPrint('categorySelectPage: menuItems count: ${data['menuItems']?.length ?? 0}');
      debugPrint('categorySelectPage: menuItems: ${data['menuItems']}');
      
      if (data['success'] == true) {
        // 型安全な変換
        final rawMenuItems = data['menuItems'] as List;
        final menuItems = rawMenuItems.map((item) => Map<String, dynamic>.from(item as Map)).toList();
        
        // カテゴリーを抽出して重複を除去
        final categories = menuItems
            .map((item) => item['category'] as String)
            .where((category) => category.isNotEmpty)
            .toSet()
            .toList();
        
        debugPrint('categorySelectPage: 抽出されたカテゴリー: $categories');
        
        setState(() {
          _categories = categories;
          _isLoading = false;
        });
        debugPrint('categorySelectPage: 状態更新完了 - categories count: ${_categories.length}');
        
        // アプリ内でログを表示
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('カテゴリー取得成功: ${_categories.length}件'),
            duration: const Duration(seconds: 2),
          ),
        );
      } else {
        throw Exception("カテゴリー取得に失敗しました");
      }
    } on FirebaseFunctionsException catch (e) {
      debugPrint('FirebaseFunctionsException: ${e.code} - ${e.message}');
      debugPrint('FirebaseFunctionsException details: ${e.details}');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('カテゴリー取得に失敗しました: ${e.message} (${e.code})')),
      );
      setState(() {
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Unexpected error: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('カテゴリー取得に失敗しました: $e')),
      );
      setState(() {
        _isLoading = false;
      });
    }
  }

  Icon _getCategoryIcon(String category) {
    switch (category.toLowerCase()) {
      case 'フード':
        return const Icon(Icons.restaurant, color: Colors.brown);
      case 'アルコール':
        return const Icon(Icons.local_bar, color: Colors.orange);
      case 'ノンアルコール':
        return const Icon(Icons.local_drink, color: Colors.blue);
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
        elevation: 4.0,
        shadowColor: Colors.grey,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _categories.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.category, size: 64, color: Colors.grey),
                      SizedBox(height: 16),
                      Text(
                        'カテゴリーがありません',
                        style: TextStyle(fontSize: 18, color: Colors.grey),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
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
                          height: 100,
                          decoration: BoxDecoration(
                            border: Border.all(color: Colors.grey.shade300, width: 1),
                            borderRadius: BorderRadius.circular(12),
                            color: Colors.white,
                            boxShadow: [
                              BoxShadow(
                                color: Colors.grey.withValues(alpha: 0.2),
                                spreadRadius: 1,
                                blurRadius: 3,
                                offset: const Offset(0, 2),
                              ),
                            ],
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
                ),
    );
  }
}
