import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import '../utils/business_date_ambiguous_dialog.dart';

class PostAccountingCancelDialog extends StatefulWidget {
  final Map<String, dynamic> bill;
  final VoidCallback onUpdated;

  const PostAccountingCancelDialog({
    super.key,
    required this.bill,
    required this.onUpdated,
  });

  @override
  State<PostAccountingCancelDialog> createState() => _PostAccountingCancelDialogState();
}

class _PostAccountingCancelDialogState extends State<PostAccountingCancelDialog> {
  final _formKey = GlobalKey<FormState>();
  final _cancelReasonController = TextEditingController();
  final _functions = FunctionsClient.instance;
  
  bool _isProcessing = false;

  @override
  void dispose() {
    _cancelReasonController.dispose();
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
      final idempotencyKey = '$billId:cancel:${DateTime.now().millisecondsSinceEpoch}';

      final result = await _functions.httpsCallable('updateAccounting').call({
        'billId': billId,
        'idempotencyKey': idempotencyKey,
        'eventType': 'cancel',
        'reason': _cancelReasonController.text.trim(),
        'selectedBusinessDateKey': selectedBusinessDateKey, // 選択された営業日キーを追加
      });

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('会計後キャンセル処理を完了しました')),
          );
          widget.onUpdated();
          Navigator.of(context).pop();
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('キャンセル処理に失敗しました: ${result.data['message'] ?? '不明なエラー'}')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        String errorMessage = 'キャンセル処理に失敗しました';
        if (e.toString().contains('failed-precondition')) {
          errorMessage = 'キャンセル処理に失敗しました: この伝票はキャンセルできません（支払い済みまたは返金済みの可能性があります）';
        } else if (e.toString().contains('invalid-argument')) {
          errorMessage = 'キャンセル処理に失敗しました: 入力値が無効です';
        } else if (e.toString().contains('not-found')) {
          errorMessage = 'キャンセル処理に失敗しました: 伝票が見つかりません';
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

  Future<void> _processCancel() async {
    if (!_formKey.currentState!.validate()) return;
    if (_cancelReasonController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('キャンセル理由を入力してください')),
      );
      return;
    }

    // 確認ダイアログ
    final pokerName = widget.bill['party']?['pokerName'] ?? '不明';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('会計後キャンセル'),
        content: Text(
          '$pokerNameの伝票をキャンセル（voided）にしますか？\n\nこの操作は取り消せません。',
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
      final idempotencyKey = '$billId:cancel:${DateTime.now().millisecondsSinceEpoch}';

      final result = await _functions.httpsCallable('updateAccounting').call({
        'billId': billId,
        'idempotencyKey': idempotencyKey,
        'eventType': 'cancel',
        'reason': _cancelReasonController.text.trim(),
      });

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('会計後キャンセル処理を完了しました')),
          );
          widget.onUpdated();
          Navigator.of(context).pop();
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('キャンセル処理に失敗しました: ${result.data['message'] ?? '不明なエラー'}')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        String errorMessage = 'キャンセル処理に失敗しました';
        if (e.toString().contains('failed-precondition')) {
          errorMessage = 'キャンセル処理に失敗しました: この伝票はキャンセルできません（支払い済みまたは返金済みの可能性があります）';
        } else if (e.toString().contains('invalid-argument')) {
          errorMessage = 'キャンセル処理に失敗しました: 入力値が無効です';
        } else if (e.toString().contains('not-found')) {
          errorMessage = 'キャンセル処理に失敗しました: 伝票が見つかりません';
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
    final paidTotalIncl = widget.bill['paymentsSummary']?['paidTotalIncl'] ?? 0;
    final totalRefundedIncl = widget.bill['postEvents']?['totalRefundedIncl'] ?? 0;
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
                      '会計後キャンセル',
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
                        Text('支払済み: ${paidTotalIncl}円'),
                        Text('返金額: ${totalRefundedIncl}円'),
                        if (paidTotalIncl != 0 || totalRefundedIncl != 0)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              '⚠️ 支払い済みまたは返金済みの伝票はキャンセルできません',
                              style: TextStyle(
                                color: Colors.red.shade700,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                
                const SizedBox(height: 16),
                
                // キャンセル理由
                TextFormField(
                  controller: _cancelReasonController,
                  decoration: const InputDecoration(
                    labelText: 'キャンセル理由',
                    border: OutlineInputBorder(),
                    hintText: '例: 誤って会計確定してしまった、顧客の要望など',
                  ),
                  maxLines: 3,
                  enabled: !_isProcessing,
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
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red.shade200),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.warning, color: Colors.red, size: 20),
                          SizedBox(width: 8),
                          Text(
                            '重要',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.red,
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 8),
                      Text(
                        '• この操作は取り消せません\n'
                        '• 伝票のステータスが「voided」に変更されます\n'
                        '• 支払い済みまたは返金済みの伝票はキャンセルできません\n'
                        '• キャンセル後は返金・調整などの操作ができなくなります',
                        style: TextStyle(color: Colors.red),
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
                      onPressed: _isProcessing ? null : _processCancel,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.grey,
                        foregroundColor: Colors.white,
                      ),
                      child: const Text('キャンセル処理'),
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

