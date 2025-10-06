import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

class AccountingHistoryPage extends StatefulWidget {
  const AccountingHistoryPage({super.key});

  @override
  State<AccountingHistoryPage> createState() => _AccountingHistoryPageState();
}

class _AccountingHistoryPageState extends State<AccountingHistoryPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  
  List<Map<String, dynamic>> _accountingHistory = [];
  bool _isLoading = false;
  DateTime _selectedDate = DateTime.now();

  @override
  void initState() {
    super.initState();
    _loadAccountingHistory();
  }

  Future<void> _loadAccountingHistory() async {
    setState(() {
      _isLoading = true;
    });

    try {
      // Cloud Function経由で会計履歴を取得
      final dateString = _selectedDate.toIso8601String().split('T')[0];
      final result = await _functions.httpsCallable('getAccountingHistory').call({
        'date': dateString,
      });

      if (result.data['success'] == true) {
        final accountingData = result.data['accountingHistory'];
        
        if (accountingData is List) {
          // CastListを避けて実体化 + キーをStringに統一
          final List<dynamic> raw = List<dynamic>.from(accountingData);
          final convertedData = raw
              .whereType<Map>() // Map<Object?, Object?>でも通る
              .map<Map<String, dynamic>>((m) => m.map((k, v) => MapEntry(k.toString(), v)))
              .toList(growable: false);
          
          setState(() {
            _accountingHistory = convertedData;
          });
        } else {
          setState(() {
            _accountingHistory = [];
          });
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('データの取得に失敗しました: ${result.data['error'] ?? '不明なエラー'}')),
          );
        }
      }
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
      _loadAccountingHistory();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('会計履歴'),
        backgroundColor: Colors.blue[600],
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.calendar_today),
            onPressed: _selectDate,
            tooltip: '日付選択',
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadAccountingHistory,
            tooltip: '更新',
          ),
        ],
      ),
      body: Column(
        children: [
          // 日付表示と統計
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            color: Colors.blue[50],
            child: Column(
              children: [
                Text(
                  '${_selectedDate.month}/${_selectedDate.day} の会計履歴',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _buildStatCard(
                      '会計件数',
                      '${_accountingHistory.length}件',
                      Icons.receipt_long,
                      Colors.blue,
                    ),
                    _buildStatCard(
                      '合計金額',
                      '¥${_getTotalAmount().toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                      Icons.attach_money,
                      Colors.green,
                    ),
                  ],
                ),
              ],
            ),
          ),
          
          // 履歴一覧
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _accountingHistory.isEmpty
                    ? const Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.history,
                              size: 64,
                              color: Colors.grey,
                            ),
                            SizedBox(height: 16),
                            Text(
                              '会計履歴がありません',
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
                        itemCount: _accountingHistory.length,
                        itemBuilder: (context, index) {
                          final history = _accountingHistory[index];
                          return _buildHistoryCard(history);
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatCard(String title, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: Colors.grey.withOpacity(0.2),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          Text(
            title,
            style: const TextStyle(
              fontSize: 12,
              color: Colors.grey,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryCard(Map<String, dynamic> history) {
    final totalPrice = history['totalPrice'] ?? 0;
    final pokerName = history['pokerName'] ?? '不明';
    
    // ISO文字列をDateTimeに変換
    DateTime? completedAt;
    DateTime? startedAt;
    
    try {
      if (history['accountingCompletedAt'] != null) {
        completedAt = DateTime.parse(history['accountingCompletedAt']);
      }
      if (history['accountingStartedAt'] != null) {
        startedAt = DateTime.parse(history['accountingStartedAt']);
      }
    } catch (e) {
      // パースエラーの場合は現在時刻を使用
      completedAt = DateTime.now();
    }

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
                    color: Colors.green,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    '会計済み',
                    style: TextStyle(
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
              '完了日時: ${_formatDateTime(completedAt ?? DateTime.now())}',
              style: TextStyle(
                color: Colors.grey[600],
                fontSize: 14,
              ),
            ),
            if (startedAt != null) ...[
              const SizedBox(height: 4),
              Text(
                '開始日時: ${_formatDateTime(startedAt)}',
                style: TextStyle(
                  color: Colors.grey[600],
                  fontSize: 14,
                ),
              ),
            ],
            const SizedBox(height: 16),

            // 会計額表示
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.green[50],
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.green[200]!),
              ),
              child: Column(
                children: [
                  Text(
                    '¥${totalPrice.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                    style: const TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                      color: Colors.green,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    '会計額',
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.green,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // 処理時間表示
            if (startedAt != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blue[50],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.access_time, color: Colors.blue),
                    const SizedBox(width: 8),
                    Text(
                      '処理時間: ${_calculateProcessingTime(startedAt ?? DateTime.now(), completedAt ?? DateTime.now())}',
                      style: const TextStyle(
                        fontSize: 14,
                        color: Colors.blue,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  int _getTotalAmount() {
    return _accountingHistory.fold(0, (sum, history) {
      return sum + (history['totalPrice'] as num? ?? 0).toInt();
    });
  }

  String _formatDateTime(DateTime dateTime) {
    return '${dateTime.month}/${dateTime.day} ${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
  }

  String _calculateProcessingTime(DateTime startedAt, DateTime completedAt) {
    final duration = completedAt.difference(startedAt);
    if (duration.inMinutes < 1) {
      return '${duration.inSeconds}秒';
    } else if (duration.inHours < 1) {
      return '${duration.inMinutes}分';
    } else {
      return '${duration.inHours}時間${duration.inMinutes % 60}分';
    }
  }
}
