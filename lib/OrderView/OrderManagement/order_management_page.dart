import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';
import 'dart:async';
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
  final Map<String, String> _localOrderStatus = {};
  StoreMetaData? _latestMeta;
  Object? _metaError;
  Object? _ordersError;
  bool _isMetaLoading = true;
  bool _isOrdersLoading = false;

  String? _subscribedBusinessDateKey;
  bool _todayLoaded = false;
  bool _yesterdayLoaded = false;
  List<Map<String, dynamic>> _todayOrders = [];
  List<Map<String, dynamic>> _yesterdayOrders = [];

  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _businessDaySub;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _todayOrdersSub;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _yesterdayOrdersSub;

  @override
  void initState() {
    super.initState();
    _subscribeBusinessDay();
  }

  @override
  void dispose() {
    _businessDaySub?.cancel();
    _todayOrdersSub?.cancel();
    _yesterdayOrdersSub?.cancel();
    super.dispose();
  }

  void _subscribeBusinessDay() {
    _businessDaySub?.cancel();
    _businessDaySub = FirebaseFirestore.instance
        .collection('storeMeta')
        .doc('currentBusinessDay')
        .snapshots()
        .listen(
      (snapshot) {
        final meta = StoreMetaData.fromDocument(snapshot);
        if (!mounted) return;
        setState(() {
          _latestMeta = meta;
          _metaError = null;
          _isMetaLoading = false;
        });

        if (meta.isRunning && meta.currentBusinessDateKey != null) {
          _ensureOrderSubscriptions(meta.currentBusinessDateKey!);
        } else {
          _cancelOrderSubscriptions(clearData: true);
          if (!mounted) return;
          setState(() {
            _ordersError = null;
            _isOrdersLoading = false;
          });
        }
      },
      onError: (error) {
        if (!mounted) return;
        setState(() {
          _metaError = error;
          _isMetaLoading = false;
        });
      },
    );
  }

  void _cancelOrderSubscriptions({required bool clearData}) {
    _todayOrdersSub?.cancel();
    _todayOrdersSub = null;
    _yesterdayOrdersSub?.cancel();
    _yesterdayOrdersSub = null;
    _subscribedBusinessDateKey = null;
    _todayLoaded = false;
    _yesterdayLoaded = false;
    if (clearData) {
      _todayOrders = [];
      _yesterdayOrders = [];
    }
  }

  void _ensureOrderSubscriptions(String businessDateKey) {
    if (_subscribedBusinessDateKey == businessDateKey &&
        _todayOrdersSub != null &&
        _yesterdayOrdersSub != null) {
      return;
    }

    _cancelOrderSubscriptions(clearData: true);
    _subscribedBusinessDateKey = businessDateKey;
    _ordersError = null;
    _isOrdersLoading = true;

    final today = businessDateKey.replaceAll('-', '');
    final yesterday = DateFormat('yyyyMMdd')
        .format(DateTime.parse(businessDateKey).subtract(const Duration(days: 1)));

    _todayOrdersSub = FirebaseFirestore.instance
        .collection('orders')
        .doc(today)
        .collection('_TodaysOrders')
        .snapshots()
        .listen(
      (snapshot) {
        _todayOrders = snapshot.docs.map((doc) {
          final data = Map<String, dynamic>.from(doc.data());
          data['id'] = doc.id;
          data['date'] = today;
          return data;
        }).toList();
        _todayLoaded = true;
        _updateOrdersLoadingState();
      },
      onError: (error) {
        _todayLoaded = true;
        _ordersError = error;
        _updateOrdersLoadingState();
      },
    );

    _yesterdayOrdersSub = FirebaseFirestore.instance
        .collection('orders')
        .doc(yesterday)
        .collection('_TodaysOrders')
        .snapshots()
        .listen(
      (snapshot) {
        _yesterdayOrders = snapshot.docs.map((doc) {
          final data = Map<String, dynamic>.from(doc.data());
          data['id'] = doc.id;
          data['date'] = yesterday;
          return data;
        }).toList();
        _yesterdayLoaded = true;
        _updateOrdersLoadingState();
      },
      onError: (error) {
        _yesterdayLoaded = true;
        _ordersError = error;
        _updateOrdersLoadingState();
      },
    );
  }

  void _updateOrdersLoadingState() {
    if (!mounted) return;
    setState(() {
      _isOrdersLoading = !(_todayLoaded && _yesterdayLoaded);
    });
  }

  /// AppBar用: storeMeta の営業状態を表示（Phase6 Step1、青AppBar用に白表示）
  Widget _buildStoreStatusAction(BuildContext context) {
    const textColor = Colors.white;
    if (_isMetaLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(horizontal: 8),
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2, color: textColor),
        ),
      );
    }
    if (_metaError != null) {
      return const Padding(
        padding: EdgeInsets.symmetric(horizontal: 8),
        child: Icon(Icons.error, color: Colors.red, size: 20),
      );
    }
    final data = _latestMeta;
    if (data == null || data.isUnknownStatus) {
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
    if (_metaError != null) {
      return Center(
        child: Text(
          '営業情報の取得に失敗しました: $_metaError',
          style: const TextStyle(color: Colors.red),
        ),
      );
    }
    if (_isMetaLoading || _latestMeta == null) {
      return const Center(child: CircularProgressIndicator());
    }

    final meta = _latestMeta!;
    if (meta.status != 'running' || meta.currentBusinessDateKey == null) {
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

    if (_ordersError != null) {
      return Center(
        child: Text(
          '注文データ取得エラー: $_ordersError',
          style: const TextStyle(color: Colors.red),
        ),
      );
    }
    if (_isOrdersLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    final orders = _processOrders([
      ..._todayOrders,
      ..._yesterdayOrders,
    ]);
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
          isActiveTab: _selectedTabIndex == 0,
        );
      },
    );
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
