import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';
import 'order_card.dart';
import 'order_edit_dialog.dart';

class OrderManagementPage extends StatefulWidget {
  const OrderManagementPage({super.key});

  @override
  State<OrderManagementPage> createState() => _OrderManagementPageState();
}

class _OrderManagementPageState extends State<OrderManagementPage> {
  int _selectedTabIndex = 0;
  
  // ローカル状態管理
  Map<String, String> _localOrderStatus = {};

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('注文管理'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          // タブ切り替え
          _buildTabBar(),
          
          // 注文一覧
          Expanded(
            child: _buildOrderList(),
          ),
        ],
      ),
    );
  }


  /// タブバーを構築
  Widget _buildTabBar() {
    return Container(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: Colors.grey[300]!)),
      ),
      child: Row(
        children: [
          Expanded(
            child: _buildTabButton(
              index: 0,
              title: '準備中・提供中',
              icon: Icons.restaurant,
              color: Colors.orange,
            ),
          ),
          Expanded(
            child: _buildTabButton(
              index: 1,
              title: '提供済み',
              icon: Icons.check_circle,
              color: Colors.green,
            ),
          ),
        ],
      ),
    );
  }

  /// タブボタンを構築
  Widget _buildTabButton({
    required int index,
    required String title,
    required IconData icon,
    required Color color,
  }) {
    final isSelected = _selectedTabIndex == index;
    return InkWell(
      onTap: () {
        setState(() {
          _selectedTabIndex = index;
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
        decoration: BoxDecoration(
          color: isSelected ? color.withOpacity(0.1) : Colors.transparent,
          border: isSelected 
              ? Border(bottom: BorderSide(color: color, width: 3))
              : null,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: isSelected ? color : Colors.grey),
            const SizedBox(width: 8),
            Text(
              title,
              style: TextStyle(
                color: isSelected ? color : Colors.grey,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// 注文一覧を構築
  Widget _buildOrderList() {
    return StreamBuilder<List<Map<String, dynamic>>>(
      stream: _getOrdersStream(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(
            child: Text('エラー: ${snapshot.error}', style: const TextStyle(color: Colors.red)),
          );
        }

        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final orders = snapshot.data ?? [];
        
        if (orders.isEmpty) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  _selectedTabIndex == 0 ? Icons.restaurant : Icons.check_circle,
                  size: 64,
                  color: Colors.grey,
                ),
                const SizedBox(height: 16),
                Text(
                  _selectedTabIndex == 0 
                      ? '準備中・提供中の注文はありません'
                      : '提供済みの注文はありません',
                  style: const TextStyle(color: Colors.grey, fontSize: 16),
                ),
              ],
            ),
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: orders.length,
          itemBuilder: (context, index) {
            final order = orders[index];
            return OrderCard(
              order: order,
              onStatusChanged: (orderId, newStatus) {
                _updateOrderStatus(orderId, newStatus);
              },
              onEdit: (orderId, billId) {
                _showEditDialog(orderId, billId);
              },
              localStatus: _localOrderStatus[order['id']],
              isActiveTab: _selectedTabIndex == 0, // 準備中・提供中タブの場合 true
            );
          },
        );
      },
    );
  }

  /// 注文ストリームを取得
  Stream<List<Map<String, dynamic>>> _getOrdersStream() {
    final today = DateFormat('yyyyMMdd').format(DateTime.now());
    final yesterday = DateFormat('yyyyMMdd').format(DateTime.now().subtract(const Duration(days: 1)));
    
    return Stream.periodic(const Duration(seconds: 1)).asyncMap((_) async {
      List<Map<String, dynamic>> allOrders = [];
      
      // 当日と前日の注文を取得
      for (final dateString in [today, yesterday]) {
        try {
          final subCollectionSnapshot = await FirebaseFirestore.instance
              .collection('orders')
              .doc(dateString)
              .collection('_TodaysOrders')
              .get();
          
          for (final doc in subCollectionSnapshot.docs) {
            final data = doc.data();
            data['id'] = doc.id;
            data['date'] = dateString;
            allOrders.add(data);
          }
        } catch (e) {
          debugPrint('注文データ取得エラー ($dateString): $e');
        }
      }
      
      return _processOrders(allOrders);
    });
  }

  /// 注文データを処理
  List<Map<String, dynamic>> _processOrders(List<Map<String, dynamic>> allOrders) {
    // ステータスでフィルタリング
    final targetStatuses = _selectedTabIndex == 0 
        ? ['preparing', 'in_progress'] 
        : ['served'];
    
    allOrders = allOrders.where((order) => 
        targetStatuses.contains(order['status'])).toList();
    
    
    // ソート
    allOrders.sort((a, b) {
      if (_selectedTabIndex == 0) {
        // 準備中・提供中: createdAtが古い順
        final aTime = (a['createdAt'] as Timestamp?)?.toDate() ?? DateTime(0);
        final bTime = (b['createdAt'] as Timestamp?)?.toDate() ?? DateTime(0);
        return aTime.compareTo(bTime);
      } else {
        // 提供済み: updatedAtが新しい順
        final aTime = (a['updatedAt'] as Timestamp?)?.toDate() ?? DateTime(0);
        final bTime = (b['updatedAt'] as Timestamp?)?.toDate() ?? DateTime(0);
        return bTime.compareTo(aTime);
      }
    });
    
    return allOrders;
  }

  /// 注文ステータスを更新
  void _updateOrderStatus(String orderId, String newStatus) {
    setState(() {
      _localOrderStatus[orderId] = newStatus;
    });
  }

  /// 編集ダイアログを表示
  void _showEditDialog(String orderId, String? billId) {
    showDialog(
      context: context,
      builder: (context) => OrderEditDialog(
        orderId: orderId,
        billId: billId,
        onOrderUpdated: () {
          // 注文更新後の処理
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('注文を更新しました')),
          );
        },
      ),
    );
  }
}
