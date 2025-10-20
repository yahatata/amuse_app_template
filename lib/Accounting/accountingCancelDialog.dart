import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';

class AccountingCancelDialog extends StatefulWidget {
  final Map<String, dynamic> bill;
  final VoidCallback onUpdated;

  const AccountingCancelDialog({
    Key? key,
    required this.bill,
    required this.onUpdated,
  }) : super(key: key);

  @override
  State<AccountingCancelDialog> createState() => _AccountingCancelDialogState();
}

class _AccountingCancelDialogState extends State<AccountingCancelDialog> {
  final _formKey = GlobalKey<FormState>();
  final _reasonController = TextEditingController();
  final _functions = FirebaseFunctions.instance;

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _cancelAccounting() async {
    if (!_formKey.currentState!.validate()) return;
    if (_reasonController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('キャンセル理由を入力してください')),
      );
      return;
    }

    // 確認ダイアログ
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('会計キャンセル'),
        content: Text('${widget.bill['pokerName']}の会計をキャンセルしますか？\n\nこの操作により、ユーザーは再び退店可能な状態になります。'),
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
      final result = await _functions.httpsCallable('cancelAccounting').call({
        'billId': widget.bill['id'],
        'reason': _reasonController.text.trim(),
      });

      if (result.data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('会計をキャンセルしました')),
        );
        widget.onUpdated();
        Navigator.of(context).pop();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('キャンセルに失敗しました: ${result.data['message']}')),
        );
      }
    } catch (e) {
      print('会計キャンセルエラー: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('キャンセルに失敗しました: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: Container(
        width: MediaQuery.of(context).size.width * 0.8,
        height: MediaQuery.of(context).size.height * 0.7,
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    '会計キャンセル',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              
              // スクロール可能な内容
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
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
                      Text('合計金額: ${widget.bill['totalPrice']}円'),
                      Text('会計完了日時: ${_formatDateTime(widget.bill['accountingCompletedAt'])}'),
                    ],
                  ),
                ),
              ),
              
              const SizedBox(height: 16),
              
              // キャンセル理由
              TextFormField(
                controller: _reasonController,
                decoration: const InputDecoration(
                  labelText: 'キャンセル理由',
                  border: OutlineInputBorder(),
                  hintText: '例: 顧客の要求、システムエラーなど',
                ),
                maxLines: 3,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'キャンセル理由を入力してください';
                  }
                  return null;
                },
              ),
              
              const SizedBox(height: 16),
              
              // 注意事項
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.orange.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.warning, color: Colors.orange.shade600, size: 20),
                        const SizedBox(width: 8),
                        Text(
                          '注意事項',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.orange.shade700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '• キャンセル後、ユーザーは再び退店可能な状態になります\n'
                      '• この操作は取り消せません\n'
                      '• キャンセル履歴は会計履歴に記録されます',
                      style: TextStyle(color: Colors.orange.shade700),
                    ),
                  ],
                ),
                      ),
                    ],
                  ),
                ),
              ),
              
              const SizedBox(height: 16),
              
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
                    onPressed: _cancelAccounting,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('会計をキャンセル'),
                  ),
                ],
              ),
            ],
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
