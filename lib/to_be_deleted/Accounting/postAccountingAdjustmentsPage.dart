// このファイルは削除予定です。動作確認後に削除してください。
// 旧会計後調整導線の退避ファイルです。現行実装は lib/Accounting の postSettlement 系を参照してください。

/*
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/Accounting/postAccountingRefundDialog.dart';
import 'package:amuse_app_template/Accounting/postAccountingAdjustmentDialog.dart';
import 'package:amuse_app_template/Accounting/postAccountingCancelDialog.dart';
import 'package:amuse_app_template/Accounting/postAccountingReopenDialog.dart';
import 'package:intl/intl.dart';

class PostAccountingAdjustmentsPage extends StatefulWidget {
  final String? initialBillId; // 初期選択伝票ID（オプション）

  const PostAccountingAdjustmentsPage({
    super.key,
    this.initialBillId,
  });

  @override
  State<PostAccountingAdjustmentsPage> createState() => _PostAccountingAdjustmentsPageState();
}

class _PostAccountingAdjustmentsPageState extends State<PostAccountingAdjustmentsPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  
  List<Map<String, dynamic>> _bills = [];
  bool _isLoading = false;
  DateTime _selectedDate = DateTime.now();
  String _statusFilter = 'all'; // 'all', 'settled', 'partially_refunded', 'refunded'

  @override
  void initState() {
    super.initState();
    // 初期化時にstoreMeta/currentBusinessDayを取得（一度だけ）
    _initializeSelectedDate();
  }

  Future<void> _initializeSelectedDate() async {
    try {
      final stateDoc = await FirebaseFirestore.instance
          .collection('storeMeta')
          .doc('currentBusinessDay')
          .get();
      
      final stateData = stateDoc.data() as Map<String, dynamic>?;
      final status = stateData?['status'] as String?;
      final currentBusinessDateKey = stateData?['currentBusinessDateKey'] as String?;
      
      String businessDateKey;
      if (status == 'running' && currentBusinessDateKey != null) {
        businessDateKey = currentBusinessDateKey;
      } else {
        // 閉店中の場合は、現在の日時が属する日付をbusinessDateとして使用
        businessDateKey = DateFormat('yyyy-MM-dd').format(DateTime.now());
      }
      
      if (mounted) {
        setState(() {
          _selectedDate = DateTime.parse(businessDateKey);
        });
        _loadBills();
      }
    } catch (e) {
      // エラー時は現在日時を使用
      if (mounted) {
        setState(() {
          _selectedDate = DateTime.now();
        });
        _loadBills();
      }
    }
  }

  String _formatBusinessDate(DateTime date) {
    return date.toIso8601String().split('T')[0];
  }

  Future<void> _loadBills() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final businessDate = _formatBusinessDate(_selectedDate);
      
      // billsコレクションから会計完了済みの伝票を取得
      Query query = _firestore
          .collection('bills')
          .where('businessDate', isEqualTo: businessDate);
      
      // ステータスフィルターを適用
      if (_statusFilter != 'all') {
        query = query.where('status', isEqualTo: _statusFilter);
      } else {
        // 'all'の場合は、settled, partially_refunded, refundedのいずれか
        // FirestoreのINクエリを使用
        query = query.where('status', whereIn: ['settled', 'partially_refunded', 'refunded']);
      }
      
      // インデックスが作成されるまでの一時的な対応: orderByを削除し、クライアント側でソート
      // TODO: インデックス作成後は orderBy('updatedAt', descending: true) を復活させる
      // query = query.orderBy('updatedAt', descending: true);
      
      final querySnapshot = await query.get();

      // クライアント側でソート（updatedAt降順）
      final billsList = querySnapshot.docs.map((doc) {
        final data = doc.data() as Map<String, dynamic>;
        return {'id': doc.id, ...data};
      }).toList();
      
      // updatedAtでソート（降順）
      billsList.sort((a, b) {
        final aUpdatedAt = a['updatedAt'];
        final bUpdatedAt = b['updatedAt'];
        if (aUpdatedAt == null && bUpdatedAt == null) return 0;
        if (aUpdatedAt == null) return 1;
        if (bUpdatedAt == null) return -1;
        
        // Timestamp型の比較
        DateTime? aDate;
        DateTime? bDate;
        
        if (aUpdatedAt is Timestamp) {
          aDate = aUpdatedAt.toDate();
        } else if (aUpdatedAt is DateTime) {
          aDate = aUpdatedAt;
        }
        
        if (bUpdatedAt is Timestamp) {
          bDate = bUpdatedAt.toDate();
        } else if (bUpdatedAt is DateTime) {
          bDate = bUpdatedAt;
        }
        
        if (aDate == null && bDate == null) return 0;
        if (aDate == null) return 1;
        if (bDate == null) return -1;
        
        return bDate.compareTo(aDate);
      });

      setState(() {
        _bills = billsList;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('データの取得に失敗しました: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _selectDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2024),
      lastDate: DateTime.now(),
    );
    if (picked != null && picked != _selectedDate) {
      setState(() {
        _selectedDate = picked;
      });
      _loadBills();
    }
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'settled':
        return Colors.green;
      case 'partially_refunded':
        return Colors.orange;
      case 'refunded':
        return Colors.red;
      case 'voided':
        return Colors.grey;
      default:
        return Colors.grey;
    }
  }

  String _getStatusText(String status) {
    switch (status) {
      case 'settled':
        return '会計完了';
      case 'partially_refunded':
        return '部分返金';
      case 'refunded':
        return '全額返金';
      case 'voided':
        return 'キャンセル';
      default:
        return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 5, // メイン画面 + 4つのダイアログテスト
      child: Scaffold(
        appBar: AppBar(
          title: const Text('会計後調整'),
          backgroundColor: Colors.blue[600],
          foregroundColor: Colors.white,
          bottom: const TabBar(
            tabs: [
              Tab(text: '伝票一覧'),
              Tab(text: '返金テスト'),
              Tab(text: '調整テスト'),
              Tab(text: 'キャンセルテスト'),
              Tab(text: '再開テスト'),
            ],
          ),
          actions: [
            // ステータスフィルター
            PopupMenuButton<String>(
              icon: const Icon(Icons.filter_list),
              onSelected: (value) {
                setState(() {
                  _statusFilter = value;
                });
                _loadBills();
              },
              itemBuilder: (context) => [
                const PopupMenuItem(value: 'all', child: Text('全て')),
                const PopupMenuItem(value: 'settled', child: Text('会計完了')),
                const PopupMenuItem(value: 'partially_refunded', child: Text('部分返金')),
                const PopupMenuItem(value: 'refunded', child: Text('全額返金')),
              ],
            ),
            IconButton(
              icon: const Icon(Icons.calendar_today),
              onPressed: _selectDate,
              tooltip: '日付選択',
            ),
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: _loadBills,
              tooltip: '更新',
            ),
          ],
        ),
        body: TabBarView(
          children: [
            // タブ1: 伝票一覧
            _buildBillsList(),
            // タブ2: 返金ダイアログテスト
            _buildDialogTestTab(
              '返金ダイアログテスト',
              Icons.money_off,
              Colors.orange,
              () => _showRefundDialogTest(),
            ),
            // タブ3: 調整ダイアログテスト
            _buildDialogTestTab(
              '調整ダイアログテスト',
              Icons.tune,
              Colors.green,
              () => _showAdjustmentDialogTest(),
            ),
            // タブ4: キャンセルダイアログテスト
            _buildDialogTestTab(
              'キャンセルダイアログテスト',
              Icons.cancel,
              Colors.grey,
              () => _showCancelDialogTest(),
            ),
            // タブ5: 再開ダイアログテスト
            _buildDialogTestTab(
              '再開ダイアログテスト',
              Icons.refresh,
              Colors.blue,
              () => _showReopenDialogTest(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBillsList() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_bills.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.receipt_long, size: 64, color: Colors.grey),
            SizedBox(height: 16),
            Text(
              '会計完了済みの伝票はありません',
              style: TextStyle(fontSize: 18, color: Colors.grey),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _bills.length,
      itemBuilder: (context, index) {
        final bill = _bills[index];
        return _buildBillCard(bill);
      },
    );
  }

  Widget _buildBillCard(Map<String, dynamic> bill) {
    final billId = bill['id'] ?? 'unknown';
    final status = bill['status'] ?? 'settled';
    final pokerName = bill['party']?['pokerName'] ?? '不明';
    final grandTotalRounded = bill['amounts']?['grandTotalRounded'] ?? 0;
    final paidTotalIncl = bill['paymentsSummary']?['paidTotalIncl'] ?? 0;
    final balanceDueIncl = bill['paymentsSummary']?['balanceDueIncl'] ?? 0;
    final totalRefundedIncl = bill['postEvents']?['totalRefundedIncl'] ?? 0;
    final totalAdjustmentsIncl = bill['postEvents']?['totalAdjustmentsIncl'] ?? 0;
    final netSalesIncl = bill['postEvents']?['netSalesIncl'] ?? 0;
    final businessDate = bill['businessDate'] ?? '';
    final updatedAt = bill['updatedAt']?.toDate() ?? DateTime.now();

    return Card(
      elevation: 4,
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ヘッダー
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    pokerName,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: _getStatusColor(status),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _getStatusText(status),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 8),

            // 伝票ID・営業日・更新日時
            Text(
              '伝票ID: $billId',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
            Text(
              '営業日: $businessDate',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
            Text(
              '更新日時: ${updatedAt.year}年${updatedAt.month}月${updatedAt.day}日 ${updatedAt.hour.toString().padLeft(2, '0')}:${updatedAt.minute.toString().padLeft(2, '0')}',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),

            const SizedBox(height: 16),

            // 金額情報
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                children: [
                  _buildAmountRow('合計金額', grandTotalRounded, Colors.black),
                  _buildAmountRow('支払済み', paidTotalIncl, Colors.green),
                  if (totalRefundedIncl > 0)
                    _buildAmountRow('返金額', totalRefundedIncl, Colors.orange),
                  if (totalAdjustmentsIncl != 0)
                    _buildAmountRow(
                      '調整額',
                      totalAdjustmentsIncl,
                      totalAdjustmentsIncl > 0 ? Colors.green : Colors.red,
                    ),
                  _buildAmountRow('純売上', netSalesIncl, Colors.blue),
                  _buildAmountRow('残高', balanceDueIncl, Colors.purple),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // 操作ボタン
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // 左寄せ: 返金、減額、追加徴収
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    // 返金ボタン
                    if (_canRefund(bill))
                      ElevatedButton.icon(
                        onPressed: () => _showRefundDialog(bill),
                        icon: const Icon(Icons.money_off, size: 18),
                        label: const Text('返金'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.orange,
                          foregroundColor: Colors.white,
                        ),
                      ),
                    // 減額ボタン
                    if (_canAdjust(bill))
                      ElevatedButton.icon(
                        onPressed: () => _showAdjustmentDialog(bill, -1),
                        icon: const Icon(Icons.remove, size: 18),
                        label: const Text('減額'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red,
                          foregroundColor: Colors.white,
                        ),
                      ),
                    // 追加徴収ボタン
                    if (_canAdjust(bill))
                      ElevatedButton.icon(
                        onPressed: () => _showAdjustmentDialog(bill, 1),
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('追加徴収'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                        ),
                      ),
                  ],
                ),
                // 右寄せ: 会計前に戻すボタン
                if (_canReopen(bill))
                  ElevatedButton.icon(
                    onPressed: () => _showReopenDialog(bill),
                    icon: const Icon(Icons.refresh, size: 18),
                    label: const Text('会計前に戻す'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      foregroundColor: Colors.white,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAmountRow(String label, int amount, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 14),
          ),
          Text(
            '$amount円',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDialogTestTab(
    String title,
    IconData icon,
    Color color,
    VoidCallback onTap,
  ) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 64, color: color),
          const SizedBox(height: 16),
          Text(
            title,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 32),
          ElevatedButton.icon(
            onPressed: onTap,
            icon: Icon(icon),
            label: Text('$titleを開く'),
            style: ElevatedButton.styleFrom(
              backgroundColor: color,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            ),
          ),
          const SizedBox(height: 16),
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text(
              'テスト用: 伝票一覧から伝票を選択してから、このタブでダイアログを開いてください。',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey),
            ),
          ),
        ],
      ),
    );
  }

  // 操作可能判定
  bool _canRefund(Map<String, dynamic> bill) {
    final status = bill['status'] ?? '';
    final grandTotalRounded = bill['amounts']?['grandTotalRounded'] ?? 0;
    final totalRefundedIncl = bill['postEvents']?['totalRefundedIncl'] ?? 0;
    return ['settled', 'partially_refunded', 'refunded'].contains(status) &&
        totalRefundedIncl < grandTotalRounded;
  }

  bool _canAdjust(Map<String, dynamic> bill) {
    final status = bill['status'] ?? '';
    return ['settled', 'partially_refunded', 'refunded'].contains(status);
  }

  bool _canCancel(Map<String, dynamic> bill) {
    final status = bill['status'] ?? '';
    final paidTotalIncl = bill['paymentsSummary']?['paidTotalIncl'] ?? 0;
    final totalRefundedIncl = bill['postEvents']?['totalRefundedIncl'] ?? 0;
    return status == 'settled' && paidTotalIncl == 0 && totalRefundedIncl == 0;
  }

  bool _canReopen(Map<String, dynamic> bill) {
    final status = bill['status'] ?? '';
    return status == 'settled';
  }

  // ダイアログ表示
  void _showRefundDialog(Map<String, dynamic> bill) {
    showDialog(
      context: context,
      builder: (context) => PostAccountingRefundDialog(
        bill: bill,
        onUpdated: () {
          _loadBills();
          Navigator.of(context).pop();
        },
      ),
    );
  }

  void _showAdjustmentDialog(Map<String, dynamic> bill, int sign) {
    showDialog(
      context: context,
      builder: (context) => PostAccountingAdjustmentDialog(
        bill: bill,
        sign: sign,
        onUpdated: () {
          _loadBills();
          Navigator.of(context).pop();
        },
      ),
    );
  }

  void _showCancelDialog(Map<String, dynamic> bill) {
    showDialog(
      context: context,
      builder: (context) => PostAccountingCancelDialog(
        bill: bill,
        onUpdated: () {
          _loadBills();
          Navigator.of(context).pop();
        },
      ),
    );
  }

  void _showReopenDialog(Map<String, dynamic> bill) {
    showDialog(
      context: context,
      builder: (context) => PostAccountingReopenDialog(
        bill: bill,
        onUpdated: () {
          _loadBills();
          Navigator.of(context).pop();
        },
      ),
    );
  }

  // テスト用ダイアログ表示（伝票一覧から選択された伝票を使用）
  void _showRefundDialogTest() {
    if (_bills.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('伝票がありません。伝票一覧タブで伝票を確認してください。')),
      );
      return;
    }
    // 最初の伝票を使用
    _showRefundDialog(_bills[0]);
  }

  void _showAdjustmentDialogTest() {
    if (_bills.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('伝票がありません。伝票一覧タブで伝票を確認してください。')),
      );
      return;
    }
    // 最初の伝票を使用（追加徴収）
    _showAdjustmentDialog(_bills[0], 1);
  }

  void _showCancelDialogTest() {
    if (_bills.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('伝票がありません。伝票一覧タブで伝票を確認してください。')),
      );
      return;
    }
    _showCancelDialog(_bills[0]);
  }

  void _showReopenDialogTest() {
    if (_bills.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('伝票がありません。伝票一覧タブで伝票を確認してください。')),
      );
      return;
    }
    _showReopenDialog(_bills[0]);
  }
}


*/
