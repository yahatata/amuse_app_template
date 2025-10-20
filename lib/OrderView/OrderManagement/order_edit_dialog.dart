import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class OrderEditDialog extends StatefulWidget {
  final String orderId;
  final VoidCallback onOrderUpdated;

  const OrderEditDialog({
    super.key,
    required this.orderId,
    required this.onOrderUpdated,
  });

  @override
  State<OrderEditDialog> createState() => _OrderEditDialogState();
}

class _OrderEditDialogState extends State<OrderEditDialog> {
  List<Map<String, dynamic>> _items = [];
  bool _isLoading = true;
  bool _isUpdating = false;

  @override
  void initState() {
    super.initState();
    _loadOrderData();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('注文編集'),
      content: SizedBox(
        width: double.maxFinite,
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('注文内容を編集してください'),
                  const SizedBox(height: 16),
                  ..._items.asMap().entries.map((entry) {
                    final index = entry.key;
                    final item = entry.value;
                    return _buildItemEditor(index, item);
                  }).toList(),
                ],
              ),
      ),
      actions: [
        TextButton(
          onPressed: _isUpdating ? null : () => Navigator.of(context).pop(),
          child: const Text('キャンセル'),
        ),
        TextButton(
          onPressed: _isUpdating ? null : _cancelOrder,
          child: const Text('注文取り消し', style: TextStyle(color: Colors.red)),
        ),
        ElevatedButton(
          onPressed: _isUpdating ? null : _updateOrder,
          child: _isUpdating
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('更新'),
        ),
      ],
    );
  }

  /// アイテムエディターを構築
  Widget _buildItemEditor(int index, Map<String, dynamic> item) {
    final quantityController = TextEditingController(
      text: (item['quantity'] ?? 1).toString(),
    );

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    item['name'] ?? '',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: _getCategoryColor(item['category'] ?? ''),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    _getCategoryDisplayName(item['category'] ?? ''),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Text('数量: '),
                SizedBox(
                  width: 80,
                  child: TextField(
                    controller: quantityController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    ),
                    onChanged: (value) {
                      final quantity = int.tryParse(value) ?? 1;
                      if (quantity > 0) {
                        setState(() {
                          _items[index]['quantity'] = quantity;
                        });
                      }
                    },
                  ),
                ),
                const Spacer(),
                IconButton(
                  onPressed: () => _removeItem(index),
                  icon: const Icon(Icons.delete, color: Colors.red),
                  tooltip: 'このアイテムを削除',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// カテゴリー色を取得
  Color _getCategoryColor(String category) {
    switch (category) {
      case 'food':
        return Colors.orange;
      case 'drink':
        return Colors.blue;
      case 'Chip':
        return Colors.purple;
      default:
        return Colors.grey;
    }
  }

  /// カテゴリー表示名を取得
  String _getCategoryDisplayName(String category) {
    switch (category) {
      case 'food':
        return 'フード';
      case 'drink':
        return 'ドリンク';
      case 'Chip':
        return 'チップ';
      default:
        return category;
    }
  }

  /// アイテムを削除
  void _removeItem(int index) {
    setState(() {
      _items.removeAt(index);
    });
  }

  /// 注文データを読み込み
  Future<void> _loadOrderData() async {
    try {
      final today = DateTime.now();
      final dateString = '${today.year}${today.month.toString().padLeft(2, '0')}${today.day.toString().padLeft(2, '0')}';
      
      final doc = await FirebaseFirestore.instance
          .collection('orders')
          .doc(dateString)
          .collection('_TodaysOrders')
          .doc(widget.orderId)
          .get();

      if (doc.exists) {
        final data = doc.data()!;
        setState(() {
          _items = List<Map<String, dynamic>>.from(data['items'] ?? []);
          _isLoading = false;
        });
      } else {
        setState(() {
          _isLoading = false;
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('注文データが見つかりません')),
          );
          Navigator.of(context).pop();
        }
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('データの読み込みに失敗しました: $e')),
        );
        Navigator.of(context).pop();
      }
    }
  }

  /// 注文を更新
  Future<void> _updateOrder() async {
    if (_items.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('注文アイテムがありません')),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('注文を更新しますか？'),
        content: const Text('この変更を確定しますか？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('確定'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() {
      _isUpdating = true;
    });

    try {
      final today = DateTime.now();
      final dateString = '${today.year}${today.month.toString().padLeft(2, '0')}${today.day.toString().padLeft(2, '0')}';
      
      await FirebaseFirestore.instance
          .collection('orders')
          .doc(dateString)
          .collection('_TodaysOrders')
          .doc(widget.orderId)
          .update({
        'items': _items,
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (mounted) {
        Navigator.of(context).pop();
        widget.onOrderUpdated();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('注文を更新しました')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('更新に失敗しました: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isUpdating = false;
        });
      }
    }
  }

  /// 注文を取り消し
  Future<void> _cancelOrder() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('注文を取り消しますか？'),
        content: const Text('この注文を完全に削除します。この操作は取り消せません。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('削除', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() {
      _isUpdating = true;
    });

    try {
      final today = DateTime.now();
      final dateString = '${today.year}${today.month.toString().padLeft(2, '0')}${today.day.toString().padLeft(2, '0')}';
      
      await FirebaseFirestore.instance
          .collection('orders')
          .doc(dateString)
          .collection('_TodaysOrders')
          .doc(widget.orderId)
          .delete();

      if (mounted) {
        Navigator.of(context).pop();
        widget.onOrderUpdated();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('注文を取り消しました')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('取り消しに失敗しました: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isUpdating = false;
        });
      }
    }
  }
}
