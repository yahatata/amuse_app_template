import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';

class RefundProcessingDialog extends StatefulWidget {
  final Map<String, dynamic> bill;
  final VoidCallback onUpdated;

  const RefundProcessingDialog({
    Key? key,
    required this.bill,
    required this.onUpdated,
  }) : super(key: key);

  @override
  State<RefundProcessingDialog> createState() => _RefundProcessingDialogState();
}

class _RefundProcessingDialogState extends State<RefundProcessingDialog> {
  final _formKey = GlobalKey<FormState>();
  final _refundAmountController = TextEditingController();
  final _refundReasonController = TextEditingController();
  final _functions = FirebaseFunctions.instance;
  
  String _refundMethod = 'cash';

  @override
  void initState() {
    super.initState();
    _refundAmountController.text = widget.bill['totalPrice'].toString();
  }

  @override
  void dispose() {
    _refundAmountController.dispose();
    _refundReasonController.dispose();
    super.dispose();
  }

  Future<void> _processRefund() async {
    if (!_formKey.currentState!.validate()) return;
    if (_refundReasonController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('返金理由を入力してください')),
      );
      return;
    }

    final refundAmount = int.tryParse(_refundAmountController.text) ?? 0;
    final totalPrice = widget.bill['totalPrice'] ?? 0;

    if (refundAmount > totalPrice) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('返金額が請求金額を超えています')),
      );
      return;
    }

    // 確認ダイアログ
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('返金処理'),
        content: Text('${widget.bill['pokerName']}に${refundAmount}円を返金しますか？\n\n返金方法: ${_getRefundMethodText(_refundMethod)}'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('いいえ'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('はい'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      final result = await _functions.httpsCallable('processRefund').call({
        'billId': widget.bill['id'],
        'refundAmount': refundAmount,
        'refundReason': _refundReasonController.text.trim(),
        'refundMethod': _refundMethod,
      });

      if (result.data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('返金処理を完了しました\n返金額: ${refundAmount}円')),
        );
        widget.onUpdated();
        Navigator.of(context).pop();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('返金処理に失敗しました: ${result.data['message']}')),
        );
      }
    } catch (e) {
      print('返金処理エラー: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('返金処理に失敗しました: $e')),
      );
    }
  }

  String _getRefundMethodText(String method) {
    switch (method) {
      case 'cash':
        return '現金';
      case 'bank_transfer':
        return '銀行振込';
      case 'other':
        return 'その他';
      default:
        return '現金';
    }
  }

  @override
  Widget build(BuildContext context) {
    final totalPrice = widget.bill['totalPrice'] ?? 0;
    
    return Dialog(
      child: Container(
        width: MediaQuery.of(context).size.width * 0.8,
        height: MediaQuery.of(context).size.height * 0.7,
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    '返金処理',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              
              // 請求書情報
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '請求書情報',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Colors.grey.shade700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text('顧客名: ${widget.bill['pokerName']}'),
                      Text('請求金額: ${totalPrice}円'),
                      Text('会計完了日時: ${_formatDateTime(widget.bill['accountingCompletedAt'])}'),
                    ],
                  ),
                ),
              ),
              
              const SizedBox(height: 16),
              
              // 返金額
              TextFormField(
                controller: _refundAmountController,
                decoration: const InputDecoration(
                  labelText: '返金額',
                  border: OutlineInputBorder(),
                  suffixText: '円',
                ),
                keyboardType: TextInputType.number,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return '返金額を入力してください';
                  }
                  final amount = int.tryParse(value);
                  if (amount == null || amount < 0) {
                    return '有効な金額を入力してください';
                  }
                  if (amount > totalPrice) {
                    return '返金額が請求金額を超えています';
                  }
                  return null;
                },
              ),
              
              const SizedBox(height: 16),
              
              // 返金方法
              DropdownButtonFormField<String>(
                value: _refundMethod,
                decoration: const InputDecoration(
                  labelText: '返金方法',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'cash', child: Text('現金')),
                  DropdownMenuItem(value: 'bank_transfer', child: Text('銀行振込')),
                  DropdownMenuItem(value: 'other', child: Text('その他')),
                ],
                onChanged: (value) {
                  setState(() {
                    _refundMethod = value ?? 'cash';
                  });
                },
              ),
              
              const SizedBox(height: 16),
              
              // 返金理由
              TextFormField(
                controller: _refundReasonController,
                decoration: const InputDecoration(
                  labelText: '返金理由',
                  border: OutlineInputBorder(),
                  hintText: '例: 商品不良、サービス不備など',
                ),
                maxLines: 3,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return '返金理由を入力してください';
                  }
                  return null;
                },
              ),
              
              const SizedBox(height: 16),
              
              // 注意事項
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.blue.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.info, color: Colors.blue.shade600, size: 20),
                        const SizedBox(width: 8),
                        Text(
                          '注意事項',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.blue.shade700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '• 返金処理は取り消せません\n'
                      '• 返金履歴は記録されます\n'
                      '• 現金返金の場合は、実際の現金の受け渡しを確認してください',
                      style: TextStyle(color: Colors.blue.shade700),
                    ),
                  ],
                ),
              ),
              
              const SizedBox(height: 24),
              
              // ボタン
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('キャンセル'),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: _processRefund,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('返金処理'),
                  ),
                ],
              ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _formatDateTime(dynamic timestamp) {
    if (timestamp == null) return '不明';
    try {
      final dateTime = timestamp.toDate();
      return '${dateTime.year}年${dateTime.month}月${dateTime.day}日 ${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
    } catch (e) {
      return '不明';
    }
  }
}
