import 'dart:async';

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class OrderCard extends StatelessWidget {
  final Map<String, dynamic> order;
  final Function(String orderId, String newStatus) onStatusChanged;
  final Function(String orderId, String? billId) onEdit;
  final String? localStatus;
  final bool isActiveTab; // 準備中・提供中タブかどうか

  /// 提供済み更新処理中（親が [orderId] と突き合わせて指定。changeSpec 103）
  final bool isMarkingServed;
  final VoidCallback? onMarkServeStart;
  final VoidCallback? onMarkServeEnd;

  /// スワイプで [Dismissible.onDismissed] が呼ばれた直後に、親がリストから即除外する（同期）。
  /// 省略時は Dismissible が「dismiss 済みだがツリーに残る」アサーションになる。
  final void Function(String orderId)? onDismissedSwipeCompleted;

  /// スワイプ経路で Firestore 更新に失敗したとき、楽観更新を戻す。
  final void Function(String orderId)? onSwipeServeFailed;

  const OrderCard({
    super.key,
    required this.order,
    required this.onStatusChanged,
    required this.onEdit,
    this.localStatus,
    this.isActiveTab = false,
    this.isMarkingServed = false,
    this.onMarkServeStart,
    this.onMarkServeEnd,
    this.onDismissedSwipeCompleted,
    this.onSwipeServeFailed,
  });

  @override
  Widget build(BuildContext context) {
    // order オブジェクトからデータを取得
    // _TodaysOrders には items 配列ではなく、個別フィールドがある
    final userName = order['userName'] ?? '不明';
    final currentTable = order['currentTable'];
    final currentSeat = order['currentSeat'];
    final status = localStatus ?? order['status'] ?? 'preparing';
    final orderedAt = order['orderedAt'] as Timestamp?;
    final updatedAt = order['updatedAt'] as Timestamp?;
    
    // 商品情報（_TodaysOrders には個別フィールドとして保存されている）
    final name = order['name'] ?? '';
    final quantity = order['quantity'] ?? 1;
    
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
        if (isMarkingServed) return false;
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
      onDismissed: (direction) {
        final id = order['id']?.toString();
        if (id != null) {
          onDismissedSwipeCompleted?.call(id);
        }
        unawaited(_markAsServed(context, skipOverlayCallbacks: true));
      },
      child: Stack(
        clipBehavior: Clip.hardEdge,
        children: [
          Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              // 左側: ユーザー情報、商品情報、注文時間
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // userName(table,seat) - デフォルトの書式
                    Text(
                      _formatUserName(userName, currentTable, currentSeat),
                      style: const TextStyle(
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 8),
                    // Name(商品名)  数量:quantity - 商品名を太文字、数量の前後から""を外す、間に半角スペース2つ、文字サイズを大きく
                    Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: name,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const TextSpan(text: '  '), // 半角スペース2つ
                          TextSpan(
                            text: '数量:$quantity',
                            style: const TextStyle(
                              fontSize: 16,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 4),
                    // orderedAt
                    Text(
                      _formatOrderedAt(orderedAt),
                      style: TextStyle(
                        color: Colors.grey[600],
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              // 右側: ステータス（タップ可能）と編集ボタン
              isActiveTab
                  ? _buildStatusSwitch(context, status)
                  : _buildStatusChip(context, status),
              const SizedBox(width: 8),
              IconButton(
                onPressed: isMarkingServed
                    ? null
                    : () => onEdit(order['id'], order['billId'] as String?),
                icon: const Icon(Icons.edit, color: Colors.blue),
              ),
            ],
          ),
        ),
      ),
          if (isMarkingServed)
            Positioned.fill(
              child: Material(
                color: Colors.black26,
                child: const Center(
                  child: CircularProgressIndicator(),
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// ステータススイッチを構築（準備中・提供中タブ用）
  Widget _buildStatusSwitch(BuildContext context, String currentStatus) {
    final isPreparing = currentStatus == 'preparing';
    final isInProgress = currentStatus == 'in_progress';
    
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        // 準備中ボタン
        GestureDetector(
          onTap: () => _handleStatusSwitchTap(context, 'preparing'),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: isPreparing ? Colors.orange.withOpacity(0.2) : Colors.grey.withOpacity(0.1),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(12),
                bottomLeft: Radius.circular(12),
              ),
              border: Border.all(
                color: isPreparing ? Colors.orange : Colors.grey,
                width: isPreparing ? 2 : 1,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.restaurant,
                  size: 14,
                  color: isPreparing ? Colors.orange : Colors.grey,
                ),
                const SizedBox(width: 4),
                Text(
                  '準備中',
                  style: TextStyle(
                    color: isPreparing ? Colors.orange : Colors.grey,
                    fontSize: 12,
                    fontWeight: isPreparing ? FontWeight.bold : FontWeight.normal,
                  ),
                ),
              ],
            ),
          ),
        ),
        // 作成・提供中ボタン
        GestureDetector(
          onTap: () => _handleStatusSwitchTap(context, 'in_progress'),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: isInProgress ? Colors.blue.withOpacity(0.2) : Colors.grey.withOpacity(0.1),
              borderRadius: const BorderRadius.only(
                topRight: Radius.circular(12),
                bottomRight: Radius.circular(12),
              ),
              border: Border.all(
                color: isInProgress ? Colors.blue : Colors.grey,
                width: isInProgress ? 2 : 1,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.local_dining,
                  size: 14,
                  color: isInProgress ? Colors.blue : Colors.grey,
                ),
                const SizedBox(width: 4),
                Text(
                  '作成・提供中',
                  style: TextStyle(
                    color: isInProgress ? Colors.blue : Colors.grey,
                    fontSize: 12,
                    fontWeight: isInProgress ? FontWeight.bold : FontWeight.normal,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  /// ステータスチップを構築（提供済みタブ用）
  Widget _buildStatusChip(BuildContext context, String status) {
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

  /// ユーザー名をフォーマット (userName(table,seat))
  String _formatUserName(String userName, dynamic currentTable, dynamic currentSeat) {
    // currentTable と currentSeat が両方 null の場合は「未着席」と表示
    final isTableNull = currentTable == null || (currentTable is String && currentTable.isEmpty);
    final isSeatNull = currentSeat == null;
    
    if (isTableNull && isSeatNull) {
      return '$userName(未着席)';
    }
    
    final tableSeat = <String>[];
    if (!isTableNull) {
      tableSeat.add(currentTable.toString());
    }
    if (!isSeatNull) {
      tableSeat.add(currentSeat.toString());
    }
    
    if (tableSeat.isEmpty) {
      return userName;
    }
    
    return '$userName(${tableSeat.join(',')})';
  }

  /// 注文時間をフォーマット
  String _formatOrderedAt(Timestamp? orderedAt) {
    if (orderedAt == null) return '';
    
    final dateTime = orderedAt.toDate();
    return '${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
  }

  /// ステータススイッチタップ処理
  void _handleStatusSwitchTap(BuildContext context, String targetStatus) {
    if (isMarkingServed) return;
    final currentStatus = localStatus ?? order['status'] ?? 'preparing';
    
    // 現在のステータスと異なる場合のみ変更
    if (currentStatus != targetStatus) {
      onStatusChanged(order['id'], targetStatus);
      final message = targetStatus == 'preparing'
          ? '準備中に変更しました'
          : '作成・提供中に変更しました';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: targetStatus == 'preparing' ? Colors.orange : Colors.blue,
        ),
      );
    }
  }

  /// 提供済み確認ダイアログを表示
  Future<void> _showServedConfirmation(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.check_circle, color: Colors.green),
            SizedBox(width: 8),
            Text('提供済みにしますか？'),
          ],
        ),
        content: const Text('この注文を提供済みとしてマークします。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('キャンセル'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green,
              foregroundColor: Colors.white,
            ),
            child: const Text('提供済みにする'),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      await _markAsServed(context);
    }
  }

  /// 提供済みにマーク
  Future<void> _markAsServed(
    BuildContext context, {
    bool skipOverlayCallbacks = false,
  }) async {
    if (!skipOverlayCallbacks) {
      onMarkServeStart?.call();
    }
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
      if (skipOverlayCallbacks) {
        final id = order['id']?.toString();
        if (id != null) {
          onSwipeServeFailed?.call(id);
        }
      }
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('エラーが発生しました: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (!skipOverlayCallbacks) {
        onMarkServeEnd?.call();
      }
    }
  }

  /// 日付文字列を取得
  String _getDateString() {
    return order['date'] ?? DateTime.now().toIso8601String().split('T')[0].replaceAll('-', '');
  }
}
