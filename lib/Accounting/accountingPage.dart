import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:amuse_app_template/Accounting/accountingHistoryPage.dart';

class AccountingPage extends StatefulWidget {
  const AccountingPage({super.key});

  @override
  State<AccountingPage> createState() => _AccountingPageState();
}

class _AccountingPageState extends State<AccountingPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  
  List<Map<String, dynamic>> _activeBills = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadActiveBills();
  }

  Future<void> _loadActiveBills() async {
    setState(() {
      _isLoading = true;
    });

    try {
      // 今日の未会計・会計中の請求書を取得
      final today = DateTime.now().toIso8601String().split('T')[0];
      final querySnapshot = await _firestore
          .collection('todaysBills')
          .where('date', isEqualTo: today)
          .where('accountingStatus', whereIn: ['pending', 'in_progress'])
          .get();

      setState(() {
        _activeBills = querySnapshot.docs.map((doc) {
          final data = doc.data();
          return {
            'id': doc.id,
            ...data,
          };
        }).toList();
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

  Future<void> _startAccounting(String billId) async {
    try {
      final result = await _functions.httpsCallable('startAccounting').call({
        'billId': billId,
      });

      if (result.data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('会計を開始しました')),
        );
        _loadActiveBills(); // データを再読み込み
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('会計開始に失敗しました: ${result.data['message']}')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('会計開始に失敗しました: $e')),
      );
    }
  }

  Future<void> _completeAccounting(String billId) async {
    try {
      final result = await _functions.httpsCallable('completeAccounting').call({
        'billId': billId,
      });

      if (result.data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('会計を完了しました')),
        );
        _loadActiveBills(); // データを再読み込み
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('会計完了に失敗しました: ${result.data['message']}')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('会計完了に失敗しました: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('会計管理'),
        backgroundColor: Colors.blue[600],
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.history),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const AccountingHistoryPage(),
                ),
              );
            },
            tooltip: '会計履歴',
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadActiveBills,
            tooltip: '更新',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _activeBills.isEmpty
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.receipt_long,
                        size: 64,
                        color: Colors.grey,
                      ),
                      SizedBox(height: 16),
                      Text(
                        '未会計の請求書はありません',
                        style: TextStyle(
                          fontSize: 18,
                          color: Colors.grey,
                        ),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _activeBills.length,
                  itemBuilder: (context, index) {
                    final bill = _activeBills[index];
                    return _buildBillCard(bill);
                  },
                ),
    );
  }

  Widget _buildBillCard(Map<String, dynamic> bill) {
    final totalPrice = bill['totalPrice'] ?? 0;
    final accountingStatus = bill['accountingStatus'] ?? 'pending';
    final pokerName = bill['pokerName'] ?? '不明';
    final createdAt = bill['createdAt']?.toDate() ?? DateTime.now();

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
                Text(
                  pokerName,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _getStatusColor(accountingStatus),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    _getStatusText(accountingStatus),
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
            Text(
              '作成日時: ${_formatDateTime(createdAt)}',
              style: TextStyle(
                color: Colors.grey[600],
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 16),

            // 会計額表示
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.blue[50],
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.blue[200]!),
              ),
              child: Column(
                children: [
                  Text(
                    '¥${totalPrice.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                    style: const TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                      color: Colors.blue,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    '会計額',
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.blue,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // 内訳表示
            _buildBillBreakdown(bill),

            const SizedBox(height: 16),

            // アクションボタン
            Row(
              children: [
                if (accountingStatus == 'pending')
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _startAccounting(bill['id']),
                      icon: const Icon(Icons.play_arrow),
                      label: const Text('会計開始'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                if (accountingStatus == 'in_progress')
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _completeAccounting(bill['id']),
                      icon: const Icon(Icons.check),
                      label: const Text('会計完了'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBillBreakdown(Map<String, dynamic> bill) {
    final breakdown = <Widget>[];

    // 入店料（extraCost配列から取得）
    final extraCosts = bill['extraCost'] as List<dynamic>? ?? [];
    int totalExtraCost = 0;
    for (final extraCost in extraCosts) {
      totalExtraCost += (extraCost['price'] as num? ?? 0).toInt();
    }
    if (totalExtraCost > 0) {
      breakdown.add(_buildBreakdownItem('入店料', totalExtraCost));
    }

    // トーナメント参加費
    final tournaments = bill['tournaments'] as Map<String, dynamic>? ?? {};
    int totalTournamentFee = 0;
    for (final tournamentEntry in tournaments.values) {
      if (tournamentEntry is Map<String, dynamic>) {
        totalTournamentFee += (tournamentEntry['entryFee'] as num? ?? 0).toInt();
      }
    }
    if (totalTournamentFee > 0) {
      breakdown.add(_buildBreakdownItem('トーナメント参加費', totalTournamentFee));
    }

    // フード・ドリンク（items配列から取得）
    final items = bill['items'] as List<dynamic>? ?? [];
    int totalOrderAmount = 0;
    for (final item in items) {
      final price = (item['price'] as num? ?? 0).toInt();
      final quantity = (item['quantity'] as num? ?? 0).toInt();
      totalOrderAmount += price * quantity;
    }
    if (totalOrderAmount > 0) {
      breakdown.add(_buildBreakdownItem('フード・ドリンク', totalOrderAmount));
    }

    if (breakdown.isEmpty) {
      breakdown.add(const Text(
        '内訳なし',
        style: TextStyle(color: Colors.grey),
      ));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '内訳',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        ...breakdown,
      ],
    );
  }

  Widget _buildBreakdownItem(String label, int amount) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label),
          Text(
            '¥${amount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
            style: const TextStyle(fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'pending':
        return Colors.grey;
      case 'in_progress':
        return Colors.orange;
      case 'completed':
        return Colors.green;
      default:
        return Colors.grey;
    }
  }

  String _getStatusText(String status) {
    switch (status) {
      case 'pending':
        return '未会計';
      case 'in_progress':
        return '会計中';
      case 'completed':
        return '会計済み';
      default:
        return '不明';
    }
  }

  String _formatDateTime(DateTime dateTime) {
    return '${dateTime.month}/${dateTime.day} ${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
  }
}
