import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class OrderCard extends StatelessWidget {
  final Map<String, dynamic> order;
  final Function(String orderId, String newStatus) onStatusChanged;
  final Function(String orderId) onEdit;
  final String? localStatus;

  const OrderCard({
    super.key,
    required this.order,
    required this.onStatusChanged,
    required this.onEdit,
    this.localStatus,
  });

  @override
  Widget build(BuildContext context) {
    final items = order['items'] as List<dynamic>? ?? [];
    final userName = order['userName'] ?? '不明';
    final currentTable = order['currentTable'] ?? '';
    final currentSeat = order['currentSeat'] ?? '';
    final status = localStatus ?? order['status'] ?? 'preparing';
    final createdAt = order['createdAt'] as Timestamp?;
    final updatedAt = order['updatedAt'] as Timestamp?;
    
    return Dismissible(
      key: Key(order['id'] ?? ''),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        color: Colors.green,
        child: const Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.check_circle, color: Colors.white, size: 32),
            Text(
              '提供済み',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
      confirmDismiss: (direction) async {
        return await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('提供済みにしますか？'),
            content: const Text('この注文を提供済みとしてマークします。'),
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
      },
      onDismissed: (direction) async {
        await _markAsServed(context);
      },
      child: Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: InkWell(
          onTap: () => _handleCardTap(context),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ヘッダー部分
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            userName,
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          if (currentTable.isNotEmpty || currentSeat != null)
                            Text(
                              '${currentTable.isNotEmpty ? '卓: $currentTable' : ''}${currentSeat != null ? ' シート: $currentSeat' : ''}',
                              style: TextStyle(
                                color: Colors.grey[600],
                                fontSize: 14,
                              ),
                            )
                          else
                            Text(
                              '現在はテーブルに着席されていません',
                              style: TextStyle(
                                color: Colors.orange[600],
                                fontSize: 14,
                                fontStyle: FontStyle.italic,
                              ),
                            ),
                        ],
                      ),
                    ),
                    // ステータス表示
                    _buildStatusChip(status),
                    const SizedBox(width: 8),
                    // 編集ボタン
                    IconButton(
                      onPressed: () => onEdit(order['id']),
                      icon: const Icon(Icons.edit, color: Colors.blue),
                    ),
                  ],
                ),
                
                const SizedBox(height: 12),
                
                // 注文アイテム一覧
                ...items.map<Widget>((item) {
                  final name = item['name'] ?? '';
                  final quantity = item['quantity'] ?? 1;
                  final category = item['category'] ?? '';
                  
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: _getCategoryColor(category),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            _getCategoryDisplayName(category),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            name,
                            style: const TextStyle(fontSize: 14),
                          ),
                        ),
                        Text(
                          '×$quantity',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: Colors.blue[700],
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
                
                const SizedBox(height: 8),
                
                // 時間表示
                Row(
                  children: [
                    Icon(Icons.access_time, size: 16, color: Colors.grey[600]),
                    const SizedBox(width: 4),
                    Text(
                      _formatTime(createdAt, updatedAt, status),
                      style: TextStyle(
                        color: Colors.grey[600],
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// ステータスチップを構築
  Widget _buildStatusChip(String status) {
    Color color;
    String text;
    IconData icon;
    
    switch (status) {
      case 'preparing':
        color = Colors.orange;
        text = '準備中';
        icon = Icons.restaurant;
        break;
      case 'in_progress':
        color = Colors.blue;
        text = '作成・提供中';
        icon = Icons.local_dining;
        break;
      case 'served':
        color = Colors.green;
        text = '提供済み';
        icon = Icons.check_circle;
        break;
      default:
        color = Colors.grey;
        text = '不明';
        icon = Icons.help;
    }
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
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

  /// 時間をフォーマット
  String _formatTime(Timestamp? createdAt, Timestamp? updatedAt, String status) {
    final time = status == 'served' ? updatedAt : createdAt;
    if (time == null) return '';
    
    final dateTime = time.toDate();
    return '${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
  }

  /// カードタップ処理
  void _handleCardTap(BuildContext context) {
    final currentStatus = localStatus ?? order['status'] ?? 'preparing';
    
    if (currentStatus == 'preparing') {
      onStatusChanged(order['id'], 'in_progress');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('作成・提供中に変更しました'),
          backgroundColor: Colors.blue,
        ),
      );
    }
  }

  /// 提供済みにマーク
  Future<void> _markAsServed(BuildContext context) async {
    try {
      // Firestoreのステータスを更新
      await FirebaseFirestore.instance
          .collection('orders')
          .doc(_getDateString())
          .collection('_TodaysOrders')
          .doc(order['id'])
          .update({
        'status': 'served',
        'updatedAt': FieldValue.serverTimestamp(),
      });
      
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('提供済みにマークしました'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('エラーが発生しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  /// 日付文字列を取得
  String _getDateString() {
    return order['date'] ?? DateTime.now().toIso8601String().split('T')[0].replaceAll('-', '');
  }
}
