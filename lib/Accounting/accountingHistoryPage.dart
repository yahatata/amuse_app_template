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
        
        // デバッグログ
        print('会計履歴データ: $accountingData');
        if (accountingData is List && accountingData.isNotEmpty) {
          print('最初の履歴データ: ${accountingData[0]}');
          print('accountingCompletedAtの型: ${accountingData[0]['accountingCompletedAt'].runtimeType}');
          print('accountingCompletedAtの値: ${accountingData[0]['accountingCompletedAt']}');
        }
        
        if (accountingData is List) {
          // CastListを避けて実体化 + キーをStringに統一
          final List<dynamic> raw = List<dynamic>.from(accountingData);
          final convertedData = raw
              .whereType<Map>() // Map<Object?, Object?>でも通る
              .map<Map<String, dynamic>>((m) {
                final Map<String, dynamic> result = {};
                m.forEach((k, v) {
                  final key = k.toString();
                  // Dateオブジェクトはそのまま保持
                  if (v is DateTime) {
                    result[key] = v;
                  } else {
                    result[key] = v;
                  }
                });
                return result;
              })
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
    final pokerName = history['pokerName'] ?? '不明';
    final corrections = history['corrections'] as List<dynamic>? ?? [];
    final cancelRecord = history['cancelRecord'] as Map<dynamic, dynamic>?;
    
    // 修正後の合計額を計算（キャンセルされた場合は0、修正履歴がある場合は最新の修正後の金額を使用）
    int totalPrice;
    if (cancelRecord != null) {
      // キャンセルされた会計は合計額を0とする
      totalPrice = 0;
    } else if (corrections.isNotEmpty) {
      final latestCorrection = corrections.last as Map<dynamic, dynamic>;
      final newData = latestCorrection['newData'] as Map<dynamic, dynamic>? ?? {};
      totalPrice = (newData['totalPrice'] ?? 0).toInt();
    } else {
      totalPrice = (history['totalPrice'] ?? 0).toInt();
    }
    
    // DateTimeオブジェクトを安全に取得
    DateTime? completedAt;
    DateTime? startedAt;
    
    try {
      final completedAtData = history['accountingCompletedAt'];
      print('completedAtData: $completedAtData');
      print('completedAtDataの型: ${completedAtData.runtimeType}');
      if (completedAtData != null && completedAtData is String && completedAtData.isNotEmpty) {
        // ISO文字列の場合
        completedAt = DateTime.parse(completedAtData);
      } else if (completedAtData is DateTime) {
        completedAt = completedAtData;
      } else if (completedAtData is Map && completedAtData.isNotEmpty) {
        // FirestoreのTimestampオブジェクトの場合
        if (completedAtData['_seconds'] != null) {
          completedAt = DateTime.fromMillisecondsSinceEpoch(completedAtData['_seconds'] * 1000);
        }
      }
      // 空のMapやnullの場合はcompletedAtはnullのまま
      
      final startedAtData = history['accountingStartedAt'];
      if (startedAtData != null && startedAtData is String && startedAtData.isNotEmpty) {
        // ISO文字列の場合
        startedAt = DateTime.parse(startedAtData);
      } else if (startedAtData is DateTime) {
        startedAt = startedAtData;
      } else if (startedAtData is Map && startedAtData.isNotEmpty) {
        // FirestoreのTimestampオブジェクトの場合
        if (startedAtData['_seconds'] != null) {
          startedAt = DateTime.fromMillisecondsSinceEpoch(startedAtData['_seconds'] * 1000);
        }
      }
      // 空のMapやnullの場合はstartedAtはnullのまま
    } catch (e) {
      print('日時変換エラー: $e');
      // エラーの場合はnullのまま
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
                Row(
                  children: [
                    if (cancelRecord != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.red,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Text(
                          'キャンセル済み',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    if (cancelRecord != null) const SizedBox(width: 8),
                    if (corrections.isNotEmpty)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.orange,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          '修正済み (${corrections.length}回)',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    if (corrections.isNotEmpty) const SizedBox(width: 8),
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
              ],
            ),
            const SizedBox(height: 8),
            if (completedAt != null)
              Text(
                '完了日時: ${_formatDateTime(completedAt)}',
                style: TextStyle(
                  color: Colors.grey[600],
                  fontSize: 14,
                ),
              ),
            const SizedBox(height: 16),

            // 修正履歴の表示
            if (corrections.isNotEmpty) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.orange[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.orange[200]!),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '修正履歴',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.orange,
                      ),
                    ),
                    const SizedBox(height: 8),
                    ...corrections.map((correction) => _buildCorrectionCard(correction)).toList(),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // キャンセル記録の表示
            if (cancelRecord != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red[200]!),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'キャンセル記録',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.red,
                      ),
                    ),
                    const SizedBox(height: 8),
                    _buildCancelRecordCard(cancelRecord),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

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

          ],
        ),
      ),
    );
  }

  int _getTotalAmount() {
    return _accountingHistory.fold(0, (sum, history) {
      final corrections = history['corrections'] as List<dynamic>? ?? [];
      final cancelRecord = history['cancelRecord'] as Map<dynamic, dynamic>?;
      
      // 修正後の合計額を計算（キャンセルされた場合は0）
      int totalPrice;
      if (cancelRecord != null) {
        // キャンセルされた会計は合計額を0とする
        totalPrice = 0;
      } else if (corrections.isNotEmpty) {
        final latestCorrection = corrections.last as Map<dynamic, dynamic>;
        final newData = latestCorrection['newData'] as Map<dynamic, dynamic>? ?? {};
        totalPrice = (newData['totalPrice'] ?? 0).toInt();
      } else {
        totalPrice = (history['totalPrice'] as num? ?? 0).toInt();
      }
      
      return sum + totalPrice;
    });
  }

  String _formatDateTime(DateTime dateTime) {
    return '${dateTime.month}/${dateTime.day} ${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
  }

  Widget _buildCorrectionCard(dynamic correction) {
    // 型安全なキャスト
    final correctionMap = correction as Map<dynamic, dynamic>? ?? {};
    final correctedAt = correctionMap['correctedAt'];
    final reason = correctionMap['reason'] ?? '理由不明';
    final oldData = correctionMap['oldData'] as Map<dynamic, dynamic>? ?? {};
    final newData = correctionMap['newData'] as Map<dynamic, dynamic>? ?? {};
    
    DateTime? correctedDateTime;
    if (correctedAt != null && correctedAt is String) {
      try {
        correctedDateTime = DateTime.parse(correctedAt);
      } catch (e) {
        print('修正日時解析エラー: $e');
      }
    }
    
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: Colors.orange[300]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                '修正内容',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Colors.orange,
                ),
              ),
              if (correctedDateTime != null)
                Text(
                  _formatDateTime(correctedDateTime),
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '理由: $reason',
            style: const TextStyle(fontSize: 12),
          ),
          const SizedBox(height: 4),
          Text(
            '修正前: ¥${(oldData['totalPrice'] ?? 0).toString()}',
            style: const TextStyle(fontSize: 12, color: Colors.red),
          ),
          Text(
            '修正後: ¥${(newData['totalPrice'] ?? 0).toString()}',
            style: const TextStyle(fontSize: 12, color: Colors.green),
          ),
        ],
      ),
    );
  }

  Widget _buildCancelRecordCard(dynamic cancelRecord) {
    // 型安全なキャスト
    final cancelRecordMap = cancelRecord as Map<dynamic, dynamic>? ?? {};
    final cancelledAt = cancelRecordMap['cancelledAt'];
    final reason = cancelRecordMap['reason'] ?? '理由不明';
    
    DateTime? cancelledDateTime;
    if (cancelledAt != null && cancelledAt is String) {
      try {
        cancelledDateTime = DateTime.parse(cancelledAt);
      } catch (e) {
        print('キャンセル日時解析エラー: $e');
      }
    }
    
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: Colors.red[300]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'キャンセル詳細',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Colors.red,
                ),
              ),
              if (cancelledDateTime != null)
                Text(
                  _formatDateTime(cancelledDateTime),
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '理由: $reason',
            style: const TextStyle(fontSize: 12),
          ),
        ],
      ),
    );
  }

}
