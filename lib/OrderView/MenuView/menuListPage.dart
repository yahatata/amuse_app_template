import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';

class MenuListPage extends StatefulWidget {
  final String category;

  const MenuListPage({Key? key, required this.category}) : super(key: key);

  @override
  State<MenuListPage> createState() => _MenuListPageState();
}

class _MenuListPageState extends State<MenuListPage> {
  List<Map<String, dynamic>> menuItems = [];
  List<Map<String, dynamic>> todaysBills = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadMenuItems();
    _loadTodaysBills();
  }

  Future<void> _loadMenuItems() async {
    try {
      final callable = FirebaseFunctions.instance.httpsCallable('getMenuItems');
      final result = await callable.call({
        'category': widget.category,
        'showArchived': false,
        'showSoldOut': false,
      });

      final data = result.data;
      debugPrint('menuListPage: レスポンス受信 - success: ${data['success']}');
      debugPrint('menuListPage: menuItems count: ${data['menuItems']?.length ?? 0}');
      debugPrint('menuListPage: menuItems: ${data['menuItems']}');
      
      if (data['success'] == true) {
        setState(() {
          // 型安全な変換
          final rawMenuItems = data['menuItems'] as List;
          menuItems = rawMenuItems.map((item) => Map<String, dynamic>.from(item as Map)).toList();
          _isLoading = false;
        });
        debugPrint('menuListPage: 状態更新完了 - menuItems count: ${menuItems.length}');
        
        // アプリ内でログを表示
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('メニュー取得成功: ${menuItems.length}件'),
            duration: const Duration(seconds: 2),
          ),
        );
      } else {
        throw Exception("メニュー取得に失敗しました");
      }
    } on FirebaseFunctionsException catch (e) {
      debugPrint('FirebaseFunctionsException: ${e.code} - ${e.message}');
      debugPrint('FirebaseFunctionsException details: ${e.details}');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('メニュー取得に失敗しました: ${e.message} (${e.code})')),
      );
      setState(() {
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Unexpected error: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('メニュー取得に失敗しました: $e')),
      );
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _loadTodaysBills() async {
    try {
      final callable = FirebaseFunctions.instance.httpsCallable('getTodaysBills');
      final result = await callable.call();

      final data = result.data;
      if (data['success'] == true) {
        setState(() {
          // 型安全な変換
          final rawTodaysBills = data['todaysBills'] as List;
          todaysBills = rawTodaysBills.map((item) => Map<String, dynamic>.from(item as Map)).toList();
        });
        debugPrint('menuListPage: todaysBills取得完了 - ${todaysBills.length}件');
        if (todaysBills.isNotEmpty) {
          debugPrint('menuListPage: todaysBills内容: ${todaysBills.map((bill) => '${bill['pokerName']} (${bill['status']})')}');
        }
      }
    } catch (e) {
      // todaysBillsの取得に失敗しても注文処理は続行
      debugPrint('TodaysBills取得エラー: $e');
    }
  }

  void _showOrderDialog(Map<String, dynamic> item) {
    int quantity = 1;
    Map<String, dynamic>? selectedBill;

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
                // 注文者選択
                if (todaysBills.isNotEmpty) ...[
                  const Text('注文者を選択してください', style: TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<Map<String, dynamic>>(
                    value: selectedBill,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      labelText: '注文者',
                    ),
                    items: todaysBills.map((bill) {
                      return DropdownMenuItem(
                        value: bill,
                        child: Text(bill['pokerName'] ?? '不明'),
                      );
                    }).toList(),
                    onChanged: (value) {
                      setStateDialog(() {
                        selectedBill = value;
                      });
                    },
                  ),
                  const SizedBox(height: 16),
                ] else ...[
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.red.shade200),
                    ),
                    child: const Column(
                      children: [
                        Icon(Icons.warning, color: Colors.red),
                        SizedBox(height: 8),
                        Text('注文者がいません', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.red)),
                        SizedBox(height: 4),
                        Text('先にユーザーのチェックインを行ってください', style: TextStyle(color: Colors.grey, fontSize: 12)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                // 個数選択
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton(
                      onPressed: () {
                        if (quantity > 1) {
                          setStateDialog(() => quantity--);
                        }
                      },
                      icon: const Icon(Icons.remove_circle_outline),
                    ),
                    Text(
                      quantity.toString(),
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    IconButton(
                      onPressed: () {
                        setStateDialog(() => quantity++);
                      },
                      icon: const Icon(Icons.add_circle_outline),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text('合計金額: ¥$total', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('キャンセル'),
              ),
              TextButton(
                onPressed: todaysBills.isNotEmpty ? () {
                  if (selectedBill == null) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('注文者を選択してください')),
                    );
                    return;
                  }
                  Navigator.pop(context);
                  _showConfirmDialog(item, quantity, total, selectedBill);
                } : null,
                child: const Text('注文'),
              ),
            ],
          );
        });
      },
    );
  }

  void _showConfirmDialog(Map<String, dynamic> item, int quantity, int total, Map<String, dynamic>? selectedBill) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('注文確認'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('メニュー: ${item['name']}'),
              Text('個数: $quantity'),
              Text('単価: ¥${item['price']}'),
              Text('合計: ¥$total', style: const TextStyle(fontWeight: FontWeight.bold)),
              if (selectedBill != null) ...[
                const SizedBox(height: 8),
                Text('注文者: ${selectedBill['pokerName']}'),
              ],
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
                await _createOrder(item, quantity, total, selectedBill);
              },
              child: const Text('注文確定'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _createOrder(Map<String, dynamic> item, int quantity, int total, Map<String, dynamic>? selectedBill) async {
    try {
      final callable = FirebaseFunctions.instance.httpsCallable('createOrder');
      final result = await callable.call({
        'menuItem': item,
        'quantity': quantity,
        'totalPrice': total,
        'todaysBillId': selectedBill?['id'],
        'pokerName': selectedBill?['pokerName'],
      });

      final data = result.data;
      if (data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(data['message'])),
        );
        // todaysBillsを再読み込み
        _loadTodaysBills();
      } else {
        throw Exception("注文作成に失敗しました");
      }
    } on FirebaseFunctionsException catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('注文作成に失敗しました: ${e.message}')),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('注文作成に失敗しました: $e')),
      );
    }
  }

  Widget _buildMenuItem(Map<String, dynamic> item) {
    return Container(
      height: 120,
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
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                color: Colors.grey.shade200,
                borderRadius: BorderRadius.circular(8),
              ),
              child: item['imageUrl'] != null && item['imageUrl'].toString().isNotEmpty
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.network(
                        item['imageUrl'],
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) {
                          return const Center(child: Icon(Icons.fastfood, color: Colors.grey));
                        },
                      ),
                    )
                  : const Center(child: Icon(Icons.fastfood, color: Colors.grey)),
            ),
            // 右側：テキスト情報
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item['name'],
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '¥${item['price']}',
                      style: const TextStyle(fontSize: 16, color: Colors.blue),
                    ),
                    if (item['description'] != null && item['description'].toString().isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        item['description'],
                        style: const TextStyle(fontSize: 12, color: Colors.grey),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
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
        elevation: 4.0,
        shadowColor: Colors.grey,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : menuItems.isEmpty
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
                  itemCount: menuItems.length,
                  itemBuilder: (context, index) {
                    final item = menuItems[index];
                    return _buildMenuItem(item);
                  },
                ),
    );
  }
}
