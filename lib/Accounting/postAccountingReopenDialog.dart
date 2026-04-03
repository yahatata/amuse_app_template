import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import '../utils/business_date_ambiguous_dialog.dart';

class PostAccountingReopenDialog extends StatefulWidget {
  final Map<String, dynamic> bill;
  final VoidCallback onUpdated;

  const PostAccountingReopenDialog({
    super.key,
    required this.bill,
    required this.onUpdated,
  });

  @override
  State<PostAccountingReopenDialog> createState() => _PostAccountingReopenDialogState();
}

class _PostAccountingReopenDialogState extends State<PostAccountingReopenDialog> {
  final _formKey = GlobalKey<FormState>();
  final _reopenReasonController = TextEditingController();
  final _functions = FunctionsClient.instance;
  
  bool _isProcessing = false;

  @override
  void dispose() {
    _reopenReasonController.dispose();
    super.dispose();
  }

  /// 選択された営業日キーで再試行
  Future<void> _retryWithSelectedBusinessDate(String selectedBusinessDateKey) async {
    if (!mounted) return;
    
    setState(() {
      _isProcessing = true;
    });

    try {
      final billId = widget.bill['id'] ?? '';
      final idempotencyKey = '$billId:reopen:${DateTime.now().millisecondsSinceEpoch}';

      final result = await _functions.httpsCallable('updateAccounting').call({
        'billId': billId,
        'idempotencyKey': idempotencyKey,
        'eventType': 'reopen',
        'reason': _reopenReasonController.text.trim(),
        'selectedBusinessDateKey': selectedBusinessDateKey, // 選択された営業日キーを追加
      });

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('伝票再開処理を完了しました')),
          );
          widget.onUpdated();
          Navigator.of(context).pop();
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('再開処理に失敗しました: ${result.data['message'] ?? '不明なエラー'}')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        String errorMessage = '再開処理に失敗しました';
        if (e.toString().contains('failed-precondition')) {
          errorMessage = '再開処理に失敗しました: この伝票は再開できません（ステータスが「settled」である必要があります）';
        } else if (e.toString().contains('invalid-argument')) {
          errorMessage = '再開処理に失敗しました: 入力値が無効です';
        } else if (e.toString().contains('not-found')) {
          errorMessage = '再開処理に失敗しました: 伝票が見つかりません';
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$errorMessage: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isProcessing = false;
        });
      }
    }
  }

  Future<void> _processReopen() async {
    if (!_formKey.currentState!.validate()) return;
    if (_reopenReasonController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('再開理由を入力してください')),
      );
      return;
    }

    // 確認ダイアログ
    final pokerName = widget.bill['party']?['pokerName'] ?? '不明';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('伝票再開'),
        content: Text(
          '$pokerNameの伝票を再開（in_progress）にしますか？\n\n再度会計フローに戻ります。',
        ),
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

    setState(() {
      _isProcessing = true;
    });

    try {
      final billId = widget.bill['id'] ?? '';
      final idempotencyKey = '$billId:reopen:${DateTime.now().millisecondsSinceEpoch}';

      final result = await _functions.httpsCallable('updateAccounting').call({
        'billId': billId,
        'idempotencyKey': idempotencyKey,
        'eventType': 'reopen',
        'reason': _reopenReasonController.text.trim(),
      });

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('伝票再開処理を完了しました')),
          );
          widget.onUpdated();
          Navigator.of(context).pop();
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('再開処理に失敗しました: ${result.data['message'] ?? '不明なエラー'}')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        String errorMessage = '再開処理に失敗しました';
        if (e.toString().contains('failed-precondition')) {
          errorMessage = '再開処理に失敗しました: この伝票は再開できません（ステータスが「settled」である必要があります）';
        } else if (e.toString().contains('invalid-argument')) {
          errorMessage = '再開処理に失敗しました: 入力値が無効です';
        } else if (e.toString().contains('not-found')) {
          errorMessage = '再開処理に失敗しました: 伝票が見つかりません';
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$errorMessage: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isProcessing = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final grandTotalRounded = widget.bill['amounts']?['grandTotalRounded'] ?? 0;
    final status = widget.bill['status'] ?? '';
    final pokerName = widget.bill['party']?['pokerName'] ?? '不明';

    final size = MediaQuery.sizeOf(context);
    return PopScope(
      canPop: !_isProcessing,
      child: SizedBox(
        width: size.width,
        height: size.height,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Center(
              child: Dialog(
      child: Container(
        width: MediaQuery.of(context).size.width * 0.8,
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.8,
        ),
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
                      '伝票再開',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                    ),
                    IconButton(
                      onPressed: _isProcessing ? null : () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                
                // 伝票情報
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '顧客名: $pokerName',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 4),
                        Text('合計金額: ${grandTotalRounded}円'),
                        Text('現在のステータス: $status'),
                        if (status != 'settled')
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              '⚠️ ステータスが「settled」の伝票のみ再開できます',
                              style: TextStyle(
                                color: Colors.orange.shade700,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                
                const SizedBox(height: 16),
                
                // 再開理由
                TextFormField(
                  controller: _reopenReasonController,
                  decoration: const InputDecoration(
                    labelText: '再開理由',
                    border: OutlineInputBorder(),
                    hintText: '例: 会計をやり直す必要がある、追加注文があるなど',
                  ),
                  maxLines: 3,
                  enabled: !_isProcessing,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return '再開理由を入力してください';
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
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.info, color: Colors.blue, size: 20),
                          SizedBox(width: 8),
                          Text(
                            '注意事項',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.blue,
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 8),
                      Text(
                        '• 伝票のステータスが「in_progress」に変更されます\n'
                        '• 再度会計フローに戻ります\n'
                        '• ステータスが「settled」の伝票のみ再開できます',
                        style: TextStyle(color: Colors.blue),
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
                      onPressed: _isProcessing ? null : () => Navigator.of(context).pop(),
                      child: const Text('キャンセル'),
                    ),
                    const SizedBox(width: 8),
                    ElevatedButton(
                      onPressed: _isProcessing ? null : _processReopen,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue,
                        foregroundColor: Colors.white,
                      ),
                      child: const Text('再開処理'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
              ),
            ),
            if (_isProcessing)
              Positioned.fill(
                child: AbsorbPointer(
                  child: ColoredBox(
                    color: Colors.black.withValues(alpha: 0.35),
                    child: const Center(
                      child: CircularProgressIndicator(),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

