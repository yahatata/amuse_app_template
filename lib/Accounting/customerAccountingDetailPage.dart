import 'package:flutter/material.dart';

class CustomerAccountingDetailPage extends StatelessWidget {
  final Map<String, dynamic> customer;

  const CustomerAccountingDetailPage({
    Key? key,
    required this.customer,
  }) : super(key: key);

  // 支払い方法の表示名を取得
  String _getPaymentMethodName(String paymentMethod) {
    switch (paymentMethod) {
      case 'cash':
        return '現金';
      case 'credit_card':
        return 'クレジットカード';
      case 'electronic_money':
        return '電子マネー';
      case 'pointA':
        return 'ポイントA';
      case 'pointB':
        return 'ポイントB';
      case 'sideGameTip':
        return 'サイドゲームチップ';
      default:
        return '現金';
    }
  }

  // 支払い方法のアイコンを取得
  IconData _getPaymentMethodIcon(String paymentMethod) {
    switch (paymentMethod) {
      case 'cash':
        return Icons.attach_money;
      case 'credit_card':
        return Icons.credit_card;
      case 'electronic_money':
        return Icons.qr_code;
      case 'pointA':
        return Icons.star;
      case 'pointB':
        return Icons.stars;
      case 'sideGameTip':
        return Icons.casino;
      default:
        return Icons.attach_money;
    }
  }

  @override
  Widget build(BuildContext context) {
    final customerName = customer['customerName'] ?? '不明';
    final accountingRecords = customer['accountingRecords'] as List<dynamic>? ?? [];

    return Scaffold(
      appBar: AppBar(
        title: Text('$customerName の会計詳細'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: accountingRecords.length,
        itemBuilder: (context, index) {
          final recordData = accountingRecords[index];
          final record = recordData is Map<String, dynamic> 
              ? recordData 
              : Map<String, dynamic>.from(recordData as Map);
          return _buildAccountingRecordCard(record);
        },
      ),
    );
  }

  Widget _buildAccountingRecordCard(Map<String, dynamic> record) {
    final accountingCompletedAt = record['accountingCompletedAt'];
    final corrections = record['corrections'] as List<dynamic>? ?? [];
    final cancelRecord = record['cancelRecord'] as Map<dynamic, dynamic>?;
    final refundRecord = record['refundRecord'] as Map<dynamic, dynamic>?;
    final paymentMethod = record['paymentMethod'] ?? 'cash';
    
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
      totalPrice = (record['totalPrice'] ?? 0).toInt();
    }

    // 日時を取得
    DateTime? completedAt;
    try {
      if (accountingCompletedAt != null && accountingCompletedAt is String && accountingCompletedAt.isNotEmpty) {
        completedAt = DateTime.parse(accountingCompletedAt);
      } else if (accountingCompletedAt is DateTime) {
        completedAt = accountingCompletedAt;
      }
    } catch (e) {
      print('日時解析エラー: $e');
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
                if (completedAt != null)
                  Text(
                    '${completedAt.year}年${completedAt.month}月${completedAt.day}日 ${completedAt.hour.toString().padLeft(2, '0')}:${completedAt.minute.toString().padLeft(2, '0')}',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  )
                else
                  const Text(
                    '日時不明',
                    style: TextStyle(
                      fontSize: 18,
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
                    if (refundRecord != null)
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
                    if (refundRecord != null) const SizedBox(width: 8),
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

            const SizedBox(height: 16),

            // 支払い方法
            Row(
              children: [
                Icon(
                  _getPaymentMethodIcon(paymentMethod),
                  size: 20,
                  color: Colors.blue.shade600,
                ),
                const SizedBox(width: 8),
                Text(
                  '支払い方法: ${_getPaymentMethodName(paymentMethod)}',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey.shade700,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),

            const SizedBox(height: 16),

            // 注文商品の表示
            _buildOrderItems(record),

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

            // 返金記録の表示
            if (refundRecord != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.purple[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.purple[200]!),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      '返金記録',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.purple,
                      ),
                    ),
                    const SizedBox(height: 8),
                    _buildRefundRecordCard(refundRecord),
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
          ],
        ),
      ),
    );
  }

  Widget _buildOrderItems(Map<String, dynamic> record) {
    final items = record['items'] as List<dynamic>? ?? [];
    final extraCosts = record['extraCost'] as List<dynamic>? ?? [];
    final tournamentsData = record['tournaments'];

    if (items.isEmpty && extraCosts.isEmpty && tournamentsData == null) {
      return const SizedBox.shrink();
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.blue[50],
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.blue[200]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '注文内容',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Colors.blue,
            ),
          ),
          const SizedBox(height: 8),
          
          // 入店料
          if (extraCosts.isNotEmpty) ...[
            const Text(
              '入店料:',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            ...extraCosts.map((extraCost) => Padding(
              padding: const EdgeInsets.only(left: 16, top: 4),
              child: Text('¥${extraCost['price']} - ${extraCost['name'] ?? '入店料'}'),
            )),
            const SizedBox(height: 8),
          ],

          // トーナメント参加費
          if (tournamentsData != null) ...[
            const Text(
              'トーナメント参加費:',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            if (tournamentsData is Map<String, dynamic>) ...[
              ...tournamentsData.entries.map((entry) => Padding(
                padding: const EdgeInsets.only(left: 16, top: 4),
                child: Text('¥${entry.value['entryFee']} - ${entry.value['tournamentName'] ?? entry.key}'),
              )),
            ],
            const SizedBox(height: 8),
          ],

          // フード・ドリンク
          if (items.isNotEmpty) ...[
            const Text(
              'フード・ドリンク:',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            ...items.map((item) => Padding(
              padding: const EdgeInsets.only(left: 16, top: 4),
              child: Text('${item['quantity']}個 × ¥${item['price']} - ${item['name']}'),
            )),
          ],
        ],
      ),
    );
  }

  Widget _buildCorrectionCard(dynamic correction) {
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

  String _formatDateTime(DateTime dateTime) {
    return '${dateTime.month}/${dateTime.day} ${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
  }
}
