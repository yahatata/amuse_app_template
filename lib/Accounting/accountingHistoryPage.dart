import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/globalConstant.dart';
import 'customerAccountingDetailPage.dart';

class AccountingHistoryPage extends StatefulWidget {
  const AccountingHistoryPage({super.key});

  @override
  State<AccountingHistoryPage> createState() => _AccountingHistoryPageState();
}

class _AccountingHistoryPageState extends State<AccountingHistoryPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  
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
    final closeHour = GlobalConstants.normalizeStoreCloseHour(GlobalConstants.STORE_CLOSE_HOUR);
    
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
      // billsコレクションから直接会計履歴を取得
      final businessDate = _selectedDate.toIso8601String().split('T')[0];
      debugPrint('[_loadAccountingHistory] 検索営業日: $businessDate');
      
      // billsコレクションから会計完了済みの伝票を取得
      // settled, partially_refunded, refunded, voided のいずれか
      final querySnapshot = await _firestore
          .collection('bills')
          .where('businessDate', isEqualTo: businessDate)
          .where('status', whereIn: ['settled', 'partially_refunded', 'refunded', 'voided'])
          .orderBy('ops.accountingCompletedAt', descending: true)
          .get();

      debugPrint('[_loadAccountingHistory] 取得件数: ${querySnapshot.docs.length}');

      // 顧客単位でグループ化
      final Map<String, List<Map<String, dynamic>>> customerGroups = {};
      
      for (var doc in querySnapshot.docs) {
        final data = doc.data();
        final pokerName = (data['party'] as Map<String, dynamic>?)?['pokerName'] as String?;
        final userId = (data['party'] as Map<String, dynamic>?)?['userId'] as String?;
        
        // 顧客名を決定（pokerName があればそれを使用、なければ userId）
        final customerName = pokerName ?? userId ?? '不明';
        
        // 会計記録データを構築
        final postEvents = data['postEvents'] as Map<String, dynamic>? ?? {};
        final amounts = data['amounts'] as Map<String, dynamic>? ?? {};
        final ops = data['ops'] as Map<String, dynamic>? ?? {};
        final paymentsSummary = data['paymentsSummary'] as Map<String, dynamic>? ?? {};
        final status = data['status'] as String? ?? 'settled';
        
        final accountingRecord = <String, dynamic>{
          'id': doc.id,
          'billId': doc.id,
          'accountingCompletedAt': ops['accountingCompletedAt'],
          'accountingStartedAt': ops['accountingStartedAt'],
          'totalPrice': amounts['grandTotalRounded'] ?? 0,
          'status': status,
          'paymentMethod': 'cash', // TODO: paymentsSummary.byMethod から主要な支払い方法を取得
          'paymentMethodsByAmount': paymentsSummary['byMethod'] ?? {},
          // 修正履歴、キャンセル記録、返金記録は events サブコレクションから取得する必要があるが、
          // 今回は親ドキュメントの情報のみで判定
          'corrections': [], // TODO: /bills/{billId}/events から adjustment イベントを取得
          'cancelRecord': status == 'voided' ? {
            'cancelledAt': ops['accountingCompletedAt'],
            'reason': 'キャンセル',
          } : null,
          'refundRecord': (postEvents['totalRefundedIncl'] as num? ?? 0) > 0 ? {
            'refundedAt': ops['accountingCompletedAt'], // TODO: 実際の返金日時を events から取得
            'amount': postEvents['totalRefundedIncl'],
            'reason': '返金',
          } : null,
        };
        
        if (!customerGroups.containsKey(customerName)) {
          customerGroups[customerName] = [];
        }
        customerGroups[customerName]!.add(accountingRecord);
      }

      // 顧客単位のデータを配列に変換
      final customerBasedHistory = customerGroups.entries.map((entry) {
        final customerName = entry.key;
        final accountingRecords = entry.value;
        
        // 会計記録を accountingCompletedAt でソート（降順）
        accountingRecords.sort((a, b) {
          final aDate = a['accountingCompletedAt'] as Timestamp?;
          final bDate = b['accountingCompletedAt'] as Timestamp?;
          if (aDate == null && bDate == null) return 0;
          if (aDate == null) return 1;
          if (bDate == null) return -1;
          return bDate.compareTo(aDate);
        });
        
        // 顧客の統計情報を計算
        int totalAmount = 0;
        int totalRefundAmount = 0;
        bool hasCancelled = false;
        bool hasCorrections = false;
        bool hasRefunds = false;
        
        for (final record in accountingRecords) {
          final status = record['status'] as String? ?? 'settled';
          final totalPrice = (record['totalPrice'] as num? ?? 0).toInt();
          final refundRecord = record['refundRecord'] as Map<String, dynamic>?;
          final corrections = record['corrections'] as List<dynamic>? ?? [];
          
          // キャンセルされた会計は合計額に含めない
          if (status == 'voided') {
            hasCancelled = true;
          } else {
            // 修正履歴がある場合は最新の修正後の金額を使用
            if (corrections.isNotEmpty) {
              hasCorrections = true;
              final latestCorrection = corrections.last as Map<String, dynamic>;
              final newData = latestCorrection['newData'] as Map<String, dynamic>? ?? {};
              totalAmount += (newData['totalPrice'] as num? ?? 0).toInt();
            } else {
              totalAmount += totalPrice;
            }
          }
          
          if (refundRecord != null) {
            hasRefunds = true;
            totalRefundAmount += (refundRecord['amount'] as num? ?? 0).toInt();
          }
        }
        
        // 最新の会計完了日時
        final latestAccountingDate = accountingRecords.isNotEmpty
            ? accountingRecords[0]['accountingCompletedAt'] as Timestamp?
            : null;
        
        return <String, dynamic>{
          'customerName': customerName,
          'accountingRecords': accountingRecords,
          'totalAmount': totalAmount,
          'totalRefundAmount': totalRefundAmount,
          'recordCount': accountingRecords.length,
          'hasCancelled': hasCancelled,
          'hasCorrections': hasCorrections,
          'hasRefunds': hasRefunds,
          'latestAccountingDate': latestAccountingDate?.toDate(),
        };
      }).toList();
      
      // 最新の会計完了日時でソート（降順）
      customerBasedHistory.sort((a, b) {
        final aDate = a['latestAccountingDate'] as DateTime?;
        final bDate = b['latestAccountingDate'] as DateTime?;
        if (aDate == null && bDate == null) return 0;
        if (aDate == null) return 1;
        if (bDate == null) return -1;
        return bDate.compareTo(aDate);
      });
      
      debugPrint('[_loadAccountingHistory] 顧客単位データ件数: ${customerBasedHistory.length}');
      
      setState(() {
        _accountingHistory = customerBasedHistory;
      });
    } catch (e, stackTrace) {
      debugPrint('[_loadAccountingHistory] エラー: $e');
      debugPrint('[_loadAccountingHistory] スタックトレース: $stackTrace');
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
