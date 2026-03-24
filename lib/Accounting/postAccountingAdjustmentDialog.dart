import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../utils/business_date_ambiguous_dialog.dart';

class PostAccountingAdjustmentDialog extends StatefulWidget {
  final Map<String, dynamic> bill;
  final int sign; // +1: 追加徴収, -1: 減額
  final VoidCallback onUpdated;

  const PostAccountingAdjustmentDialog({
    super.key,
    required this.bill,
    required this.sign,
    required this.onUpdated,
  });

  @override
  State<PostAccountingAdjustmentDialog> createState() => _PostAccountingAdjustmentDialogState();
}

class _PostAccountingAdjustmentDialogState extends State<PostAccountingAdjustmentDialog> {
  final _formKey = GlobalKey<FormState>();
  final _adjustmentAmountController = TextEditingController();
  final _adjustmentReasonController = TextEditingController();
  final _functions = FirebaseFunctions.instance;
  
  bool _isProcessing = false;

  @override
  void dispose() {
    _adjustmentAmountController.dispose();
    _adjustmentReasonController.dispose();
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
      final idempotencyKey = '$billId:adjustment:${DateTime.now().millisecondsSinceEpoch}';
      final adjustmentAmount = int.tryParse(_adjustmentAmountController.text) ?? 0;
      final operationText = widget.sign > 0 ? '追加徴収' : '減額';

      final result = await _functions.httpsCallable('updateAccounting').call({
        'billId': billId,
        'idempotencyKey': idempotencyKey,
        'eventType': 'adjustment',
        'eventPayload': {
          'sign': widget.sign,
          'amountIncl': adjustmentAmount,
          'reason': _adjustmentReasonController.text.trim(),
        },
        'selectedBusinessDateKey': selectedBusinessDateKey, // 選択された営業日キーを追加
      });

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('$operationText処理を完了しました\n調整額: ${adjustmentAmount}円')),
          );
          widget.onUpdated();
          Navigator.of(context).pop();
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('$operationText処理に失敗しました: ${result.data['message'] ?? '不明なエラー'}')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        String errorMessage = '${widget.sign > 0 ? '追加徴収' : '減額'}処理に失敗しました';
        if (e.toString().contains('failed-precondition')) {
          errorMessage = '${widget.sign > 0 ? '追加徴収' : '減額'}処理に失敗しました: この伝票は調整できません（金額矛盾の可能性があります）';
        } else if (e.toString().contains('invalid-argument')) {
          errorMessage = '${widget.sign > 0 ? '追加徴収' : '減額'}処理に失敗しました: 入力値が無効です';
        } else if (e.toString().contains('not-found')) {
          errorMessage = '${widget.sign > 0 ? '追加徴収' : '減額'}処理に失敗しました: 伝票が見つかりません';
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

  Future<void> _processAdjustment() async {
    if (!_formKey.currentState!.validate()) return;
    if (_adjustmentReasonController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('調整理由を入力してください')),
      );
      return;
    }

    final adjustmentAmount = int.tryParse(_adjustmentAmountController.text) ?? 0;

    if (adjustmentAmount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('調整額は0より大きい値である必要があります')),
      );
      return;
    }

    // 確認ダイアログ
    final pokerName = widget.bill['party']?['pokerName'] ?? '不明';
    final operationText = widget.sign > 0 ? '追加徴収' : '減額';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('$operationText処理'),
        content: Text(
          '$pokerNameに${adjustmentAmount}円の$operationTextを行いますか？',
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
      final idempotencyKey = '$billId:adjustment:${DateTime.now().millisecondsSinceEpoch}';

      final result = await _functions.httpsCallable('updateAccounting').call({
        'billId': billId,
        'idempotencyKey': idempotencyKey,
        'eventType': 'adjustment',
        'eventPayload': {
          'sign': widget.sign,
          'amountIncl': adjustmentAmount,
          'reason': _adjustmentReasonController.text.trim(),
        },
      });

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('$operationText処理を完了しました\n調整額: ${adjustmentAmount}円')),
          );
          widget.onUpdated();
          Navigator.of(context).pop();
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('$operationText処理に失敗しました: ${result.data['message'] ?? '不明なエラー'}')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        // AMBIGUOUSエラーの場合、ダイアログを表示
        final candidates = extractAmbiguousCandidates(e);
        if (candidates != null && candidates.isNotEmpty) {
          final selectedBusinessDateKey = await showBusinessDateAmbiguousDialog(
            context: context,
            candidates: candidates,
            onSelected: (selectedKey) {
              // 選択された営業日キーで再試行
              _retryWithSelectedBusinessDate(selectedKey);
            },
          );
          
          if (selectedBusinessDateKey != null) {
            // 選択された営業日キーで再試行
            await _retryWithSelectedBusinessDate(selectedBusinessDateKey);
            return;
          } else {
            // キャンセルされた場合は処理を終了
            return;
          }
        }
        
        String errorMessage = '${widget.sign > 0 ? '追加徴収' : '減額'}処理に失敗しました';
        if (e.toString().contains('failed-precondition')) {
          errorMessage = '${widget.sign > 0 ? '追加徴収' : '減額'}処理に失敗しました: この伝票は調整できません（金額矛盾の可能性があります）';
        } else if (e.toString().contains('invalid-argument')) {
          errorMessage = '${widget.sign > 0 ? '追加徴収' : '減額'}処理に失敗しました: 入力値が無効です';
        } else if (e.toString().contains('not-found')) {
          errorMessage = '${widget.sign > 0 ? '追加徴収' : '減額'}処理に失敗しました: 伝票が見つかりません';
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
    final totalRefundedIncl = widget.bill['postEvents']?['totalRefundedIncl'] ?? 0;
    final totalAdjustmentsIncl = widget.bill['postEvents']?['totalAdjustmentsIncl'] ?? 0;
    final netSalesIncl = widget.bill['postEvents']?['netSalesIncl'] ?? 0;
    final pokerName = widget.bill['party']?['pokerName'] ?? '不明';
    final operationText = widget.sign > 0 ? '追加徴収' : '減額';
    final operationColor = widget.sign > 0 ? Colors.green : Colors.red;

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
                    Text(
                      '$operationText処理',
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
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
                        Text('返金額: ${totalRefundedIncl}円'),
                        Text('調整額: ${totalAdjustmentsIncl}円'),
                        Text(
                          '純売上: ${netSalesIncl}円',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: operationColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                
                const SizedBox(height: 16),
                
                // 調整額
                TextFormField(
                  controller: _adjustmentAmountController,
                  decoration: InputDecoration(
                    labelText: '$operationText額',
                    border: const OutlineInputBorder(),
                    suffixText: '円',
                    prefixIcon: Icon(
                      widget.sign > 0 ? Icons.add : Icons.remove,
                      color: operationColor,
                    ),
                  ),
                  keyboardType: TextInputType.number,
                  enabled: !_isProcessing,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return '$operationText額を入力してください';
                    }
                    final amount = int.tryParse(value);
                    if (amount == null || amount <= 0) {
                      return '有効な金額を入力してください';
                    }
                    return null;
                  },
                ),
                
                const SizedBox(height: 16),
                
                // 調整理由
                TextFormField(
                  controller: _adjustmentReasonController,
                  decoration: InputDecoration(
                    labelText: '$operationText理由',
                    border: const OutlineInputBorder(),
                    hintText: widget.sign > 0
                        ? '例: 追加サービス料、延長料など'
                        : '例: サービス不備による減額、割引など',
                  ),
                  maxLines: 3,
                  enabled: !_isProcessing,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return '$operationText理由を入力してください';
                    }
                    return null;
                  },
                ),
                
                const SizedBox(height: 16),
                
                // 注意事項
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: operationColor.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: operationColor.shade200),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.info, color: operationColor, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            '注意事項',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: operationColor,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        widget.sign > 0
                            ? '• 追加徴収処理は取り消せません\n'
                                '• 調整履歴は記録されます\n'
                                '• 純売上が負の値にならないことを確認してください'
                            : '• 減額処理は取り消せません\n'
                                '• 調整履歴は記録されます\n'
                                '• 純売上と残高が負の値にならないことを確認してください',
                        style: TextStyle(color: operationColor),
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
                      onPressed: _isProcessing ? null : _processAdjustment,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: operationColor,
                        foregroundColor: Colors.white,
                      ),
                      child: Text('$operationText処理'),
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

