import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';
import 'package:amuse_app_template/Home/terminalHomePage.dart';
import 'package:amuse_app_template/services/store_meta_service.dart';
import 'package:amuse_app_template/utils/store_assessment_utils.dart';
import 'package:amuse_app_template/utils/store_strong_warning_ui.dart';
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

  /// AppBar用: storeMeta の営業状態を表示（Phase6 Step1、青AppBar用に白表示）
  Widget _buildStoreStatusAction(BuildContext context) {
    const textColor = Colors.white;
    return StreamBuilder<StoreMetaData>(
      stream: StoreMetaService.instance.stream,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Padding(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2, color: textColor),
            ),
          );
        }
        if (snapshot.hasError) {
          return const Padding(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: Icon(Icons.error, color: Colors.red, size: 20),
          );
        }
        final data = snapshot.data!;
        if (data.isUnknownStatus) {
          return const Padding(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: Icon(Icons.help_outline, color: Colors.grey, size: 20),
          );
        }
        if (data.isRunning && data.currentBusinessDateKey != null) {
          final parts = data.currentBusinessDateKey!.split('-');
          if (parts.length == 3) {
            try {
              final year = int.parse(parts[0]);
              final month = int.parse(parts[1]);
              final day = int.parse(parts[2]);
              final date = DateTime(year, month, day);
              final formatted = DateFormat('M/d(E)', 'ja_JP').format(date);
              final warningLabel = getDateWarningLabel(data);
              return Padding(
                padding: const EdgeInsets.only(right: 4),
                child: Center(
                  child: warningLabel != null
                      ? Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.warning_amber_rounded, size: 18, color: Colors.orange),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                warningLabel,
                                style: const TextStyle(fontSize: 11, color: Colors.orange),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(formatted, style: const TextStyle(fontSize: 14, color: textColor)),
                          ],
                        )
                      : Text(formatted, style: const TextStyle(fontSize: 14, color: textColor)),
                ),
              );
            } catch (_) {}
          }
        }
        if (data.isClosed) {
          return const Padding(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: Center(
              child: Text('閉店中', style: TextStyle(fontSize: 14, color: textColor)),
            ),
          );
        }
        if (data.isError) {
          return const Padding(
            padding: EdgeInsets.symmetric(horizontal: 8),
            child: Icon(Icons.error_outline, color: Colors.orange, size: 20),
          );
        }
        return const SizedBox.shrink();
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('注文管理'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        actions: [
          _buildStoreStatusAction(context),
        ],
      ),
      body: StoreStrongWarningWrapper(
        onCloseStore: () {
          Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(builder: (_) => const terminalHomePage()),
            (route) => false,
          );
        },
        onBusinessContinue: () {
          Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(builder: (_) => const terminalHomePage()),
            (route) => false,
          );
        },
        child: Column(
        children: [
          // タブ切り替え
          _buildTabBar(),
          
          // 注文一覧
          Expanded(
            child: _buildOrderList(),
          ),
        ],
      ),
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
    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseFirestore.instance
          .collection('storeMeta')
          .doc('currentBusinessDay')
          .snapshots(),
      builder: (context, stateSnapshot) {
        if (!stateSnapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        
        final stateData = stateSnapshot.data?.data() as Map<String, dynamic>?;
        final status = stateData?['status'] as String?;
        final currentBusinessDateKey = stateData?['currentBusinessDateKey'] as String?;
        
        if (status != 'running' || currentBusinessDateKey == null) {
          // 閉店中は「閉店中」と表示（body部分を薄いグレーアウト）
          return Container(
            color: Colors.grey.withOpacity(0.3),
            child: const Center(
              child: Text(
                '閉店中',
                style: TextStyle(fontSize: 18, color: Colors.grey),
              ),
            ),
          );
        }
        
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
      },
    );
  }

  /// 注文ストリームを取得
  Stream<List<Map<String, dynamic>>> _getOrdersStream() {
    return FirebaseFirestore.instance
        .collection('storeMeta')
        .doc('currentBusinessDay')
        .snapshots()
        .asyncMap((stateSnapshot) async {
      if (!stateSnapshot.exists) {
        return <Map<String, dynamic>>[];
      }
      
      final stateData = stateSnapshot.data() as Map<String, dynamic>?;
      final status = stateData?['status'] as String?;
      final currentBusinessDateKey = stateData?['currentBusinessDateKey'] as String?;
      
      if (status != 'running' || currentBusinessDateKey == null) {
        return <Map<String, dynamic>>[];
      }
      
      // YYYY-MM-DD形式をYYYYMMDD形式に変換
      final today = currentBusinessDateKey.replaceAll('-', '');
      
      // 前日を計算（DateTime加算で暦日の繰り上がりを正しく処理）
      final currentDate = DateTime.parse(currentBusinessDateKey);
      final yesterdayDate = currentDate.subtract(const Duration(days: 1));
      final yesterday = DateFormat('yyyyMMdd').format(yesterdayDate);
      
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
