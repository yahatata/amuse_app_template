import 'dart:async';
import 'package:amuse_app_template/OrderView/OrderManagement/order_user_facing_errors.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class OrderEditDialog extends StatefulWidget {
  final String orderId;
  final String? billId;
  /// orders/{orderDocId}/_TodaysOrders 用（yyyyMMdd）。bill 更新時の投影同期に使用。
  final String? orderDocId;
  final VoidCallback onOrderUpdated;

  const OrderEditDialog({
    super.key,
    required this.orderId,
    this.billId,
    this.orderDocId,
    required this.onOrderUpdated,
  });

  @override
  State<OrderEditDialog> createState() => _OrderEditDialogState();
}

class _OrderEditDialogState extends State<OrderEditDialog> {
  List<Map<String, dynamic>> _items = [];
  final List<TextEditingController> _quantityControllers = [];
  bool _isLoading = true;
  bool _isUpdating = false;
  /// ORDER-06: 読込失敗（見つからないとは別）。null でなし。
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _loadOrderData();
  }

  @override
  void dispose() {
    _disposeQuantityControllers();
    super.dispose();
  }

  void _disposeQuantityControllers() {
    for (final controller in _quantityControllers) {
      controller.dispose();
    }
    _quantityControllers.clear();
  }

  void _syncQuantityControllers() {
    _disposeQuantityControllers();
    for (final item in _items) {
      _quantityControllers.add(
        TextEditingController(text: (item['quantity'] ?? 1).toString()),
      );
    }
  }

  int? _readQuantityAt(int index) {
    if (index < 0 || index >= _quantityControllers.length) return null;
    final raw = _quantityControllers[index].text.trim();
    if (raw.isEmpty) return null;
    final quantity = int.tryParse(raw);
    if (quantity == null || quantity <= 0) return null;
    return quantity;
  }

  bool _applyQuantitiesFromControllers({required bool showError}) {
    for (var i = 0; i < _items.length; i++) {
      final quantity = _readQuantityAt(i);
      if (quantity == null) {
        if (showError && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text(kOrderQuantityValidationMessage)),
          );
        }
        return false;
      }
      _items[i]['quantity'] = quantity;
    }
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return PopScope(
      canPop: !_isUpdating,
      child: SizedBox(
        width: size.width,
        height: size.height,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Center(
              child: AlertDialog(
                title: const Text('注文編集'),
                content: SizedBox(
                  width: double.maxFinite,
                  child: _buildDialogContent(),
                ),
                actions: [
                  TextButton(
                    onPressed: _isUpdating ? null : () => Navigator.of(context).pop(),
                    child: const Text('キャンセル'),
                  ),
                  TextButton(
                    onPressed: (_isUpdating || _isLoading || _loadError != null || _items.isEmpty)
                        ? null
                        : _cancelOrder,
                    child: const Text('注文取り消し', style: TextStyle(color: Colors.red)),
                  ),
                  ElevatedButton(
                    onPressed: (_isUpdating || _isLoading || _loadError != null || _items.isEmpty)
                        ? null
                        : _updateOrder,
                    child: const Text('更新'),
                  ),
                ],
              ),
            ),
            if (_isUpdating)
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

  Widget _buildDialogContent() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    // ORDER-06: 読込失敗時は編集 UI に入らず再試行可能
    if (_loadError != null) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            _loadError!,
            style: const TextStyle(color: Colors.red),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _isUpdating ? null : _loadOrderData,
            child: const Text('再試行'),
          ),
        ],
      );
    }
    if (_quantityControllers.length != _items.length) {
      return const Center(child: CircularProgressIndicator());
    }
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text('注文内容を編集してください'),
        const SizedBox(height: 16),
        ..._items.asMap().entries.map((entry) {
          final index = entry.key;
          final item = entry.value;
          return _buildItemEditor(index, item);
        }),
      ],
    );
  }
  /// アイテムエディターを構築
  Widget _buildItemEditor(int index, Map<String, dynamic> item) {
    final quantityController = _quantityControllers[index];

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    item['name'] ?? '',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: _getCategoryColor(item['category'] ?? ''),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    _getCategoryDisplayName(item['category'] ?? ''),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Text('数量: '),
                SizedBox(
                  width: 80,
                  child: TextField(
                    controller: quantityController,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    ),
                  ),
                ),
                const Spacer(),
                IconButton(
                  onPressed: () => _removeItem(index),
                  icon: const Icon(Icons.delete, color: Colors.red),
                  tooltip: 'このアイテムを削除',
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// カテゴリー色を取得
  Color _getCategoryColor(String category) {
    switch (category) {
      case 'food':
        return Colors.orange;
      case 'drink':
        return Colors.blue;
      case 'Chip':
        return Colors.purple;
      default:
        return Colors.grey;
    }
  }

  /// カテゴリー表示名を取得
  String _getCategoryDisplayName(String category) {
    switch (category) {
      case 'food':
        return 'フード';
      case 'drink':
        return 'ドリンク';
      case 'Chip':
        return 'チップ';
      default:
        return category;
    }
  }

  /// アイテムを削除
  void _removeItem(int index) {
    setState(() {
      _items.removeAt(index);
      _syncQuantityControllers();
    });
  }

  /// 注文データを読み込み
  Future<void> _loadOrderData() async {
    // initState からの初回は既に _isLoading=true のため setState しない
    final needsLoadingUi =
        !_isLoading || _loadError != null || _items.isNotEmpty;
    if (needsLoadingUi) {
      if (!mounted) return;
      setState(() {
        _isLoading = true;
        _loadError = null;
        _items = [];
      });
    } else {
      _loadError = null;
      _items = [];
    }
    _disposeQuantityControllers();

    try {
      // billId がある場合は /bills/{billId}/items/{orderId} から取得
      // ない場合は /orders/{date}/_TodaysOrders/{orderId} から取得（後方互換性）
      if (widget.billId != null && widget.billId!.isNotEmpty) {
        final itemDoc = await FirebaseFirestore.instance
            .collection('bills')
            .doc(widget.billId)
            .collection('items')
            .doc(widget.orderId)
            .get();

        if (itemDoc.exists) {
          final data = itemDoc.data()!;
          setState(() {
            _items = [{
              'name': data['name'] ?? '',
              'category': data['category'] ?? '',
              'quantity': data['quantity'] ?? 1,
              'unitPriceIncl': data['unitPriceIncl'] ?? 0,
              'totalPriceIncl': data['totalPriceIncl'] ?? 0,
            }];
            _isLoading = false;
            _loadError = null;
            _syncQuantityControllers();
          });
        } else {
          // ORDER-06: 欠落（見つからない）は失敗と区別。編集状態には入らない。
          setState(() {
            _isLoading = false;
            _items = [];
            _loadError = kOrderEditNotFoundMessage;
          });
        }
      } else {
        // 後方互換性: _TodaysOrders から取得
        final today = DateTime.now();
        final dateString = '${today.year}${today.month.toString().padLeft(2, '0')}${today.day.toString().padLeft(2, '0')}';
        
        final doc = await FirebaseFirestore.instance
            .collection('orders')
            .doc(dateString)
            .collection('_TodaysOrders')
            .doc(widget.orderId)
            .get();

        if (doc.exists) {
          final data = doc.data()!;
          setState(() {
            // _TodaysOrders には個別フィールドとして保存されている
            _items = [{
              'name': data['name'] ?? '',
              'category': data['category'] ?? '',
              'quantity': data['quantity'] ?? 1,
            }];
            _isLoading = false;
            _loadError = null;
            _syncQuantityControllers();
          });
        } else {
          setState(() {
            _isLoading = false;
            _items = [];
            _loadError = kOrderEditNotFoundMessage;
          });
        }
      }
    } catch (_) {
      // ORDER-06: raw 非表示。編集 UI に入らず再試行可能。
      setState(() {
        _isLoading = false;
        _items = [];
        _disposeQuantityControllers();
        _loadError = kOrderEditLoadFailedMessage;
      });
    }
  }

  /// 注文を更新
  Future<void> _updateOrder() async {
    if (_isUpdating) return;
    if (_items.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('注文アイテムがありません')),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('注文を更新しますか？'),
        content: const Text('この変更を確定しますか？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('確定'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    if (!_applyQuantitiesFromControllers(showError: true)) return;

    setState(() {
      _isUpdating = true;
    });

    try {
      final quantity = _items.first['quantity'] as int;
      final functions = FunctionsClient.instance;
      final callable = functions.httpsCallable('updateOrderQuantity');

      final payload = <String, dynamic>{
        'orderId': widget.orderId,
        'quantity': quantity,
      };
      if (widget.billId != null && widget.billId!.isNotEmpty) {
        payload['billId'] = widget.billId;
      }
      if (widget.orderDocId != null && widget.orderDocId!.isNotEmpty) {
        payload['orderDocId'] = widget.orderDocId;
      }

      final result = await callable.call(payload).timeout(
        const Duration(seconds: 30),
        onTimeout: () {
          throw TimeoutException('Cloud Functionの呼び出しがタイムアウトしました');
        },
      );

      final data = result.data;
      // ORDER-04: success==true のみ確定。ダイアログは閉じず入力保持。
      if (!isCallableSuccessResponse(data)) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(mapUpdateOrderQuantitySoftFail(data))),
          );
        }
        return;
      }

      if (mounted) {
        Navigator.of(context).pop();
        widget.onOrderUpdated();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('注文を更新しました')),
        );
      }
    } catch (e) {
      // ORDER-04: D-1。ダイアログ維持・入力維持・ロック解除は finally。
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(mapUpdateOrderQuantityError(e))),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isUpdating = false;
        });
      }
    }
  }

  /// 注文を取り消し
  Future<void> _cancelOrder() async {
    if (_isUpdating) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('注文を取り消しますか？'),
        content: const Text('この注文を完全に削除します。この操作は取り消せません。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('キャンセル'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('削除', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() {
      _isUpdating = true;
    });

    try {
      // Cloud Functions経由で注文を取り消し
      final functions = FunctionsClient.instance;
      final callable = functions.httpsCallable('cancelOrder');

      final result = await callable.call({
        'orderId': widget.orderId,
        'billId': widget.billId,
      }).timeout(
        const Duration(seconds: 30),
        onTimeout: () {
          throw TimeoutException('Cloud Functionの呼び出しがタイムアウトしました');
        },
      );

      final data = result.data;
      // ORDER-05: success のみ一覧から外す（pop）。失敗時は注文を残す。
      if (isCallableSuccessResponse(data)) {
        if (mounted) {
          Navigator.of(context).pop();
          widget.onOrderUpdated();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('注文を取り消しました')),
          );
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(mapCancelOrderSoftFail(data))),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(mapCancelOrderError(e))),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isUpdating = false;
        });
      }
    }
  }
}
