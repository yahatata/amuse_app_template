import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:amuse_app_template/globalConstant.dart';
import 'customerAccountingDetailPage.dart';

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
    // 初期化時に営業日を計算
    _selectedDate = _getBusinessDate();
    _loadAccountingHistory();
  }

  // 営業日を計算する関数
  DateTime _getBusinessDate() {
    final now = DateTime.now();
    final closeHour = GlobalConstants.STORE_CLOSE_HOUR;
    
    // 現在時刻が店舗締め時間より前の場合は前日の営業日
    if (now.hour < closeHour) {
      return now.subtract(const Duration(days: 1));
    } else {
      // 店舗締め時間以降は当日の営業日
      return now;
    }
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
        final customerBasedData = result.data['customerBasedHistory'];
        
        // デバッグログ
        print('顧客単位会計履歴データ: $customerBasedData');
        if (customerBasedData is List && customerBasedData.isNotEmpty) {
          print('最初の顧客データ: ${customerBasedData[0]}');
          print('顧客名: ${customerBasedData[0]['customerName']}');
          print('会計記録数: ${customerBasedData[0]['recordCount']}');
        }
        
        if (customerBasedData is List) {
          // CastListを避けて実体化 + キーをStringに統一
          final List<dynamic> raw = List<dynamic>.from(customerBasedData);
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

  Widget _buildHistoryCard(Map<String, dynamic> customer) {
    final customerName = customer['customerName'] ?? '不明';
    final totalAmount = customer['totalAmount'] ?? 0;
    final totalRefundAmount = customer['totalRefundAmount'] ?? 0;
    final recordCount = customer['recordCount'] ?? 0;
    final hasCancelled = customer['hasCancelled'] ?? false;
    final hasCorrections = customer['hasCorrections'] ?? false;
    final hasRefunds = customer['hasRefunds'] ?? false;
    final accountingRecords = customer['accountingRecords'] as List<dynamic>? ?? [];
    final latestAccountingDate = customer['latestAccountingDate'];
    
    // DateTimeオブジェクトを安全に取得
    DateTime? completedAt;
    
    try {
      if (latestAccountingDate != null && latestAccountingDate is String && latestAccountingDate.isNotEmpty) {
        // ISO文字列の場合
        completedAt = DateTime.parse(latestAccountingDate);
      } else if (latestAccountingDate is DateTime) {
        completedAt = latestAccountingDate;
      }
    } catch (e) {
      print('日時変換エラー: $e');
    }

    return Card(
      elevation: 4,
      margin: const EdgeInsets.only(bottom: 16),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => CustomerAccountingDetailPage(customer: customer),
            ),
          );
        },
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
            // ヘッダー
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Text(
                      customerName,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Icon(
                      Icons.arrow_forward_ios,
                      size: 16,
                      color: Colors.grey[600],
                    ),
                  ],
                ),
                Row(
                  children: [
                    if (hasCancelled)
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
                    if (hasCancelled) const SizedBox(width: 8),
                    if (hasCorrections)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.orange,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Text(
                          '修正済み',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    if (hasCorrections) const SizedBox(width: 8),
                    if (hasRefunds)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.purple,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Text(
                          '返金済み',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    if (hasRefunds) const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.green,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        '会計済み (${recordCount}回)',
                        style: const TextStyle(
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

            // 統計情報
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.green[50],
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.green[200]!),
                    ),
                    child: Column(
                      children: [
                        Text(
                          '¥${totalAmount.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},')}',
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                            color: Colors.green,
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          '合計会計額',
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.green,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.blue[50],
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.blue[200]!),
                    ),
                    child: Column(
                      children: [
                        Text(
                          '${recordCount}回',
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                            color: Colors.blue,
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          '会計回数',
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.blue,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),


            const SizedBox(height: 16),

            ],
          ),
        ),
      ),
    );
  }

  int _getTotalAmount() {
    return _accountingHistory.fold(0, (sum, customer) {
      // 顧客単位のデータから合計額を取得
      return sum + (customer['totalAmount'] as num? ?? 0).toInt();
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

  Widget _buildRefundRecordCard(dynamic refundRecord) {
    // 型安全なキャスト
    final refundRecordMap = refundRecord as Map<dynamic, dynamic>? ?? {};
    final refundedAt = refundRecordMap['refundedAt'];
    final amount = refundRecordMap['amount'] ?? 0;
    final reason = refundRecordMap['reason'] ?? '理由不明';
    
    DateTime? refundedDateTime;
    if (refundedAt != null && refundedAt is String) {
      try {
        refundedDateTime = DateTime.parse(refundedAt);
      } catch (e) {
        print('返金日時解析エラー: $e');
      }
    }
    
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: Colors.purple[300]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                '返金詳細',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Colors.purple,
                ),
              ),
              if (refundedDateTime != null)
                Text(
                  _formatDateTime(refundedDateTime),
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '返金額: ¥${amount.toString()}',
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.purple),
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
