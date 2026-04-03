import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import '../utils/business_date_ambiguous_dialog.dart';

class PostAccountingRefundDialog extends StatefulWidget {
  final Map<String, dynamic> bill;
  final VoidCallback onUpdated;

  const PostAccountingRefundDialog({
    super.key,
    required this.bill,
    required this.onUpdated,
  });

  @override
  State<PostAccountingRefundDialog> createState() => _PostAccountingRefundDialogState();
}

class _PostAccountingRefundDialogState extends State<PostAccountingRefundDialog> {
  final _formKey = GlobalKey<FormState>();
  final _refundAmountController = TextEditingController();
  final _refundReasonController = TextEditingController();
  final _functions = FunctionsClient.instance;
  
  String _refundMethod = 'cash';
  bool _isProcessing = false;

  @override
  void initState() {
    super.initState();
    // 最大返金額を初期値に設定
    final grandTotalRounded = widget.bill['amounts']?['grandTotalRounded'] ?? 0;
    final totalRefundedIncl = widget.bill['postEvents']?['totalRefundedIncl'] ?? 0;
    final maxRefund = grandTotalRounded - totalRefundedIncl;
    _refundAmountController.text = maxRefund > 0 ? maxRefund.toString() : '0';
  }

  @override
  void dispose() {
    _refundAmountController.dispose();
    _refundReasonController.dispose();
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
      final idempotencyKey = '$billId:refund:${DateTime.now().millisecondsSinceEpoch}';
      final refundAmount = int.tryParse(_refundAmountController.text) ?? 0;

      final result = await _functions.httpsCallable('processRefund').call({
        'billId': billId,
        'idempotencyKey': idempotencyKey,
        'eventPayload': {
          'amountIncl': refundAmount,
          'reason': _refundReasonController.text.trim(),
          'method': _refundMethod,
        },
        'selectedBusinessDateKey': selectedBusinessDateKey, // 選択された営業日キーを追加
      });

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('返金処理を完了しました\n返金額: ${refundAmount}円')),
          );
          widget.onUpdated();
          Navigator.of(context).pop();
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('返金処理に失敗しました: ${result.data['message'] ?? '不明なエラー'}')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        String errorMessage = '返金処理に失敗しました';
        if (e.toString().contains('failed-precondition')) {
          errorMessage = '返金処理に失敗しました: この伝票は返金できません';
        } else if (e.toString().contains('invalid-argument')) {
          errorMessage = '返金処理に失敗しました: 入力値が無効です';
        } else if (e.toString().contains('not-found')) {
          errorMessage = '返金処理に失敗しました: 伝票が見つかりません';
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

  Future<void> _processRefund() async {
    if (!_formKey.currentState!.validate()) return;
    if (_refundReasonController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('返金理由を入力してください')),
      );
      return;
    }

    final refundAmount = int.tryParse(_refundAmountController.text) ?? 0;
    final grandTotalRounded = widget.bill['amounts']?['grandTotalRounded'] ?? 0;
    final totalRefundedIncl = widget.bill['postEvents']?['totalRefundedIncl'] ?? 0;
    final maxRefund = grandTotalRounded - totalRefundedIncl;

    if (refundAmount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('返金額は0より大きい値である必要があります')),
      );
      return;
    }

    if (refundAmount > maxRefund) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('返金額が最大返金額（$maxRefund円）を超えています')),
      );
      return;
    }

    // 確認ダイアログ
    final pokerName = widget.bill['party']?['pokerName'] ?? '不明';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('返金処理'),
        content: Text(
          '$pokerNameに${refundAmount}円を返金しますか？\n\n返金方法: ${_getRefundMethodText(_refundMethod)}',
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
      final idempotencyKey = '$billId:refund:${DateTime.now().millisecondsSinceEpoch}';

      final result = await _functions.httpsCallable('processRefund').call({
        'billId': billId,
        'idempotencyKey': idempotencyKey,
        'eventPayload': {
          'amountIncl': refundAmount,
          'reason': _refundReasonController.text.trim(),
          'method': _refundMethod,
        },
      });

      if (result.data['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('返金処理を完了しました\n返金額: ${refundAmount}円')),
          );
          widget.onUpdated();
          Navigator.of(context).pop();
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('返金処理に失敗しました: ${result.data['message'] ?? '不明なエラー'}')),
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
        
        String errorMessage = '返金処理に失敗しました';
        if (e.toString().contains('failed-precondition')) {
          errorMessage = '返金処理に失敗しました: この伝票は返金できません';
        } else if (e.toString().contains('invalid-argument')) {
          errorMessage = '返金処理に失敗しました: 入力値が無効です';
        } else if (e.toString().contains('not-found')) {
          errorMessage = '返金処理に失敗しました: 伝票が見つかりません';
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
    final grandTotalRounded = widget.bill['amounts']?['grandTotalRounded'] ?? 0;
    final totalRefundedIncl = widget.bill['postEvents']?['totalRefundedIncl'] ?? 0;
    final maxRefund = grandTotalRounded - totalRefundedIncl;
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
                      '返金処理',
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
                        Text('既返金額: ${totalRefundedIncl}円'),
                        Text(
                          '最大返金額: ${maxRefund}円',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.orange.shade700,
                          ),
                        ),
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
                  enabled: !_isProcessing,
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return '返金額を入力してください';
                    }
                    final amount = int.tryParse(value);
                    if (amount == null || amount <= 0) {
                      return '有効な金額を入力してください';
                    }
                    if (amount > maxRefund) {
                      return '返金額が最大返金額（$maxRefund円）を超えています';
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
                  onChanged: _isProcessing ? null : (value) {
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
                  enabled: !_isProcessing,
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
                        '• 返金処理は取り消せません\n'
                        '• 返金履歴は記録されます\n'
                        '• 現金返金の場合は、実際の現金の受け渡しを確認してください',
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
                      onPressed: _isProcessing ? null : _processRefund,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange,
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

