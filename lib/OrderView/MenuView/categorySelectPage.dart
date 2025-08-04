import 'package:flutter/material.dart';
import 'menuListPage.dart';

class CategorySelectPage extends StatefulWidget {
  const CategorySelectPage({Key? key}) : super(key: key);

  @override
  State<CategorySelectPage> createState() => _CategorySelectPageState();
}

class _CategorySelectPageState extends State<CategorySelectPage> {
  List<String> _categories = [];

  @override
  void initState() {
    super.initState();

    // TODO: Cloud Functions経由でFireStoreからカテゴリー一覧を取得
    // 例:
    // final callable = FirebaseFunctions.instance.httpsCallable('getCategories');
    // final result = await callable();
    // setState(() {
    //   _categories = List<String>.from(result.data);
    // });

    // 一時的な仮データ
    _categories = ['Food', 'Drink', 'Dessert'];
  }

  Icon _getCategoryIcon(String category) {
    switch (category.toLowerCase()) {
      case 'food':
        return const Icon(Icons.restaurant, color: Colors.brown);
      case 'drink':
        return const Icon(Icons.local_drink, color: Colors.blue);
      case 'dessert':
        return const Icon(Icons.cake, color: Colors.pink);
      default:
        return const Icon(Icons.category, color: Colors.grey);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('メニューカテゴリー')),
      body: ListView.builder(
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
      ),
    );
  }
}
