import 'package:flutter/material.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:amuse_app_template/Accounting/bill_line_items_for_edit.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';

class AccountingEditDialog extends StatefulWidget {
  final Map<String, dynamic> bill;
  final VoidCallback onUpdated;

  const AccountingEditDialog({
    Key? key,
    required this.bill,
    required this.onUpdated,
  }) : super(key: key);

  @override
  State<AccountingEditDialog> createState() => _AccountingEditDialogState();
}

class _AccountingEditDialogState extends State<AccountingEditDialog> {
  final _formKey = GlobalKey<FormState>();
  final _reasonController = TextEditingController();
  final _functions = FunctionsClient.instance;
  final _firestore = FirebaseFirestore.instance;

  // 入店料の管理
  List<Map<String, dynamic>> _extraCosts = [];
  
  // トーナメント参加費の管理
  Map<String, Map<String, dynamic>> _tournaments = {};
  
  // フード・ドリンクの管理
  List<Map<String, dynamic>> _items = [];

  // サイドゲームチップの管理
  List<Map<String, dynamic>> _sideGameChips = [];

  // 選択肢用データ
  List<Map<String, dynamic>> _availableTournaments = [];
  List<Map<String, dynamic>> _availableFoodItems = [];
  List<Map<String, dynamic>> _availableChipItems = [];

  // 会計前かどうか
  late bool _isBeforeAccounting;

  /// 選択肢読込中（changeSpec: 読込 CPI）
  bool _isLoadingOptions = true;

  /// 会計前の明細読込中（サブコレクション）
  bool _isLoadingBillDetails = false;

  /// 会計前の明細読込完了
  bool _billDetailsLoaded = false;

  String? _billDetailsLoadError;

  /// 会計修正送信中（changeSpec: 更新ロック＋CPI）
  bool _isSubmitting = false;

  bool get _isLoadingEditor =>
      _isLoadingOptions || (_isBeforeAccounting && _isLoadingBillDetails);

  bool get _canSubmitEdit =>
      !_isSubmitting &&
      !_isLoadingEditor &&
      (!_isBeforeAccounting || _billDetailsLoaded);

  @override
  void initState() {
    super.initState();
    _isBeforeAccounting = widget.bill['accountingStartedAt'] == null;
    if (_isBeforeAccounting) {
      _isLoadingBillDetails = true;
      _loadBillLineItems();
    } else {
      _initializeDataFromBillMap();
      _billDetailsLoaded = true;
    }
    _loadAvailableOptions();
  }

  // 選択肢データを読み込む
  Future<void> _loadAvailableOptions() async {
    if (mounted) {
      setState(() => _isLoadingOptions = true);
    }
    try {
    // storeMeta/currentBusinessDayを取得してcurrentBusinessDateKeyを取得
    final stateDoc = await FirebaseFirestore.instance
        .collection('storeMeta')
        .doc('currentBusinessDay')
        .get();
    
    final stateData = stateDoc.data() as Map<String, dynamic>?;
    final status = stateData?['status'] as String?;
    final currentBusinessDateKey = stateData?['currentBusinessDateKey'] as String?;
    
    String businessDateKey;
    if (status == 'running' && currentBusinessDateKey != null) {
      businessDateKey = currentBusinessDateKey;
    } else {
      // 閉店中の場合は、現在の日時が属する日付をbusinessDateとして使用
      businessDateKey = DateFormat('yyyy-MM-dd').format(DateTime.now());
    }

    // businessDateでフィルタリング
    final tournamentsSnapshot = await _firestore
        .collection('scheduledTournaments')
        .where('businessDate', isEqualTo: businessDateKey)
        .get();

    setState(() {
      _availableTournaments = tournamentsSnapshot.docs.map((doc) {
        final data = doc.data();
        return {
          'id': doc.id,
          'templateName': data['snapshot']?['name'] ?? data['snapshot']?['templateName'] ?? '',
          'entryFee': data['snapshot']?['entryFee'] ?? 0,
        };
      }).toList();
    });

    // メニューアイテムを取得
    final menuItemsSnapshot = await _firestore
        .collection('menuItems')
        .get();

    final foodItems = <Map<String, dynamic>>[];
    final chipItems = <Map<String, dynamic>>[];

    for (final doc in menuItemsSnapshot.docs) {
      final data = doc.data();
      final isArchive = data['isArchive'] ?? false;
      
      // isArchiveがfalseのもののみ追加
      if (isArchive) continue;
      
      final category = data['category'] ?? '';
      final item = {
        'id': doc.id,
        'name': data['name'] ?? '',
        'price': data['price'] ?? 0,
        'category': category,
      };

      if (category == 'Chip') {
        chipItems.add(item);
      } else {
        foodItems.add(item);
      }
    }

    setState(() {
      _availableFoodItems = foodItems;
      _availableChipItems = chipItems;
    });
    } finally {
      if (mounted) {
        setState(() => _isLoadingOptions = false);
      }
    }
  }

  Future<void> _loadBillLineItems() async {
    final billId = widget.bill['id'] as String?;
    if (billId == null || billId.isEmpty) {
      if (mounted) {
        setState(() {
          _isLoadingBillDetails = false;
          _billDetailsLoadError = '請求書IDが不明です';
        });
      }
      return;
    }

    try {
      final lineItems = await loadBillLineItemsForEdit(_firestore, billId);
      if (!mounted) return;
      setState(() {
        _applyLineItems(lineItems);
        _billDetailsLoaded = true;
        _billDetailsLoadError = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _billDetailsLoadError = '明細の取得に失敗しました: $e';
      });
    } finally {
      if (mounted) {
        setState(() => _isLoadingBillDetails = false);
      }
    }
  }

  void _applyLineItems(BillLineItemsForEdit lineItems) {
    _extraCosts = lineItems.extraCosts
        .map((cost) => Map<String, dynamic>.from(cost))
        .toList();
    _tournaments = lineItems.tournaments.map(
      (key, value) => MapEntry(key, Map<String, dynamic>.from(value)),
    );
    _items = lineItems.items
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    _sideGameChips = lineItems.sideGameChips
        .map((chip) => Map<String, dynamic>.from(chip))
        .toList();
  }

  void _initializeDataFromBillMap() {
    // 入店料の初期化
    final extraCosts = widget.bill['extraCost'] as List<dynamic>? ?? [];
    _extraCosts = extraCosts.map((cost) => {
      'name': cost['name'] ?? '',
      'price': cost['price'] ?? 0,
    }).toList();

    // トーナメント参加費の初期化
    final tournamentsData = widget.bill['tournaments'];
    if (tournamentsData is Map<String, dynamic>) {
      _tournaments = tournamentsData.map((key, value) => MapEntry(key, {
        'entryFee': value['entryFee'] ?? 0,
        'tournamentName': value['tournamentName'] ?? '',
      }));
    } else if (tournamentsData is List) {
      // リストの場合は空のMapとして初期化
      _tournaments = {};
    } else {
      _tournaments = {};
    }

    // フード・ドリンクの初期化
    final items = widget.bill['items'] as List<dynamic>? ?? [];
    _items = items.map((item) => {
      'name': item['name'] ?? '',
      'price': item['price'] ?? 0,
      'quantity': item['quantity'] ?? 1,
    }).toList();

    // サイドゲームチップの初期化
    final sideGameChips = widget.bill['sideGameChip'] as List<dynamic>? ?? [];
    _sideGameChips = sideGameChips.map((chip) => {
      'name': chip['name'] ?? '',
      'price': chip['price'] ?? 0,
    }).toList();
  }

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  // トーナメント選択ポップアップを表示
  Future<void> _showTournamentSelectionDialog() async {
    final selected = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('トーナメントを選択'),
        content: SizedBox(
          width: double.maxFinite,
          child: _availableTournaments.isEmpty
              ? const Text('当日開催のトーナメントがありません')
              : ListView.builder(
                  shrinkWrap: true,
                  itemCount: _availableTournaments.length,
                  itemBuilder: (context, index) {
                    final tournament = _availableTournaments[index];
                    return ListTile(
                      leading: const Icon(Icons.emoji_events, color: Colors.blue),
                      title: Text(tournament['templateName']),
                      subtitle: Text('参加費: ¥${tournament['entryFee']}'),
                      onTap: () => Navigator.of(context).pop(tournament),
                    );
                  },
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('キャンセル'),
          ),
        ],
      ),
    );

    if (selected != null) {
      setState(() {
        final key = selected['id'];
        if (!_tournaments.containsKey(key)) {
          _tournaments[key] = {
            'entryFee': selected['entryFee'],
            'tournamentName': selected['templateName'],
          };
        }
      });
    }
  }

  // フード・ドリンク選択ポップアップを表示
  Future<void> _showFoodItemSelectionDialog() async {
    final selected = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('メニューから選択'),
        content: SizedBox(
          width: double.maxFinite,
          child: _availableFoodItems.isEmpty
              ? const Text('利用可能なメニューがありません')
              : ListView.builder(
                  shrinkWrap: true,
                  itemCount: _availableFoodItems.length,
                  itemBuilder: (context, index) {
                    final item = _availableFoodItems[index];
                    return ListTile(
                      leading: const Icon(Icons.restaurant, color: Colors.orange),
                      title: Text(item['name']),
                      subtitle: Text('¥${item['price']}'),
                      onTap: () => Navigator.of(context).pop(item),
                    );
                  },
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('キャンセル'),
          ),
        ],
      ),
    );

    if (selected != null) {
      setState(() {
        _items.add({
          'name': selected['name'],
          'price': selected['price'],
          'quantity': 1,
        });
      });
    }
  }

  // サイドゲームチップ選択ポップアップを表示
  Future<void> _showChipSelectionDialog() async {
    final selected = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('チップメニューから選択'),
        content: SizedBox(
          width: double.maxFinite,
          child: _availableChipItems.isEmpty
              ? const Text('利用可能なチップがありません')
              : ListView.builder(
                  shrinkWrap: true,
                  itemCount: _availableChipItems.length,
                  itemBuilder: (context, index) {
                    final chip = _availableChipItems[index];
                    return ListTile(
                      leading: const Icon(Icons.casino, color: Colors.teal),
                      title: Text(chip['name']),
                      subtitle: Text('¥${chip['price']}'),
                      onTap: () => Navigator.of(context).pop(chip),
                    );
                  },
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('キャンセル'),
          ),
        ],
      ),
    );

    if (selected != null) {
      setState(() {
        _sideGameChips.add({
          'name': selected['name'],
          'price': selected['price'],
        });
      });
    }
  }

  double _calculateTotalPrice() {
    double total = 0;
    
    // 入店料の合計
    for (final cost in _extraCosts) {
      total += (cost['price'] as num).toDouble();
    }
    
    // トーナメント参加費の合計
    for (final tournament in _tournaments.values) {
      total += (tournament['entryFee'] as num).toDouble();
    }
    
    // フード・ドリンクの合計
    for (final item in _items) {
      total += (item['price'] as num).toDouble() * (item['quantity'] as num).toInt();
    }

    // サイドゲームチップの合計
    for (final chip in _sideGameChips) {
      total += (chip['price'] as num).toDouble();
    }
    
    return total;
  }

  Future<void> _updateAccounting() async {
    if (!_canSubmitEdit) return;
    if (!_formKey.currentState!.validate()) return;
    
    // 会計完了済みの場合は修正理由が必要
    if (!_isBeforeAccounting && _reasonController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('修正理由を入力してください')),
      );
      return;
    }

    setState(() => _isSubmitting = true);
    // ローディング用の rebuild が描画されるまで待つ（失敗が速いとオーバーレイが一度も出ない）
    await WidgetsBinding.instance.endOfFrame;
    try {
      // 会計前の場合はupdateActiveBill、会計完了済みの場合はupdateAccountingを使用
      final functionName = _isBeforeAccounting ? 'updateActiveBill' : 'updateAccounting';
      final callData = <String, dynamic>{
        'billId': widget.bill['id'],
        'extraCost': _extraCosts,
        'tournaments': _tournaments,
        'items': _items,
        'sideGameChip': _sideGameChips,
      };
      
      // 会計完了済みの場合のみ修正理由を追加
      if (!_isBeforeAccounting) {
        callData['reason'] = _reasonController.text.trim();
      }

      final result = await _functions.httpsCallable(functionName).call(callData);

      if (result.data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('会計内容を修正しました\n差額: ${result.data['priceDifference']}円')),
        );
        widget.onUpdated();
        Navigator.of(context).pop();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('修正に失敗しました: ${result.data['message']}')),
        );
      }
    } catch (e) {
      print('会計修正エラー: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('修正に失敗しました: $e')),
      );
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return PopScope(
      canPop: !_isSubmitting,
      child: SizedBox(
        width: size.width,
        height: size.height,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Center(
              child: Dialog(
                child: Container(
                  width: size.width * 0.9,
                  constraints: BoxConstraints(
                    maxHeight: size.height * 0.8,
                  ),
                  padding: const EdgeInsets.all(16),
                  child: Form(
                    key: _formKey,
                    child: SingleChildScrollView(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                '会計内容修正',
                                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                              ),
                              IconButton(
                                onPressed: _isSubmitting
                                    ? null
                                    : () => Navigator.of(context).pop(),
                                icon: const Icon(Icons.close),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),

                          // 修正理由（会計完了済みの場合のみ必須）
                          if (!_isBeforeAccounting) ...[
                        TextFormField(
                          controller: _reasonController,
                          readOnly: _isSubmitting,
                          decoration: const InputDecoration(
                            labelText: '修正理由 *',
                            border: OutlineInputBorder(),
                          ),
                          validator: (value) {
                            if (value == null || value.trim().isEmpty) {
                              return '修正理由を入力してください';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 16),
                      ] else ...[
                        TextFormField(
                          controller: _reasonController,
                          readOnly: _isSubmitting,
                          decoration: const InputDecoration(
                            labelText: '修正理由（任意）',
                            border: OutlineInputBorder(),
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // タブ（読込中は主領域 CPI）
                      SizedBox(
                        height: 400,
                        child: _isLoadingEditor
                            ? const Center(child: CircularProgressIndicator())
                            : _billDetailsLoadError != null
                            ? Center(
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      _billDetailsLoadError!,
                                      textAlign: TextAlign.center,
                                    ),
                                    const SizedBox(height: 12),
                                    OutlinedButton(
                                      onPressed: _isSubmitting
                                          ? null
                                          : () {
                                              setState(() {
                                                _isLoadingBillDetails = true;
                                                _billDetailsLoadError = null;
                                              });
                                              _loadBillLineItems();
                                            },
                                      child: const Text('再読込'),
                                    ),
                                  ],
                                ),
                              )
                            : DefaultTabController(
                                length: 4,
                                child: Column(
                                  children: [
                                    const TabBar(
                                      tabs: [
                                        Tab(text: '入店料'),
                                        Tab(text: 'トーナメント'),
                                        Tab(text: 'フード・ドリンク'),
                                        Tab(text: 'サイドゲームチップ'),
                                      ],
                                    ),
                                    Expanded(
                                      child: TabBarView(
                                        children: [
                                          _buildExtraCostTab(),
                                          _buildTournamentTab(),
                                          _buildItemsTab(),
                                          _buildSideGameChipTab(),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                      ),

                      const SizedBox(height: 16),

                      // 合計金額
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.blue.shade50,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              '合計金額:',
                              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                            ),
                            Text(
                              '${_calculateTotalPrice().toInt()}円',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: Colors.blue.shade700,
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 16),

                      // ボタン
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          TextButton(
                            onPressed: _isSubmitting
                                ? null
                                : () => Navigator.of(context).pop(),
                            child: const Text('キャンセル'),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton(
                            onPressed: _canSubmitEdit ? _updateAccounting : null,
                            child: const Text('修正'),
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
            // ダイアログ内ではなく、ルート全体（背面の会計画面含む）を半透明＋ロック
            if (_isSubmitting)
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

  Widget _buildExtraCostTab() {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('入店料', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            IconButton(
              onPressed: () {
                setState(() {
                  _extraCosts.add({'name': '', 'price': 0});
                });
              },
              icon: const Icon(Icons.add),
            ),
          ],
        ),
        Expanded(
          child: ListView.builder(
            itemCount: _extraCosts.length,
            itemBuilder: (context, index) {
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          initialValue: _extraCosts[index]['name'],
                          decoration: const InputDecoration(
                            labelText: '項目名',
                            border: OutlineInputBorder(),
                          ),
                          onChanged: (value) {
                            _extraCosts[index]['name'] = value;
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 100,
                        child: TextFormField(
                          initialValue: _extraCosts[index]['price'].toString(),
                          decoration: const InputDecoration(
                            labelText: '金額',
                            border: OutlineInputBorder(),
                          ),
                          keyboardType: TextInputType.number,
                          onChanged: (value) {
                            _extraCosts[index]['price'] = int.tryParse(value) ?? 0;
                          },
                        ),
                      ),
                      IconButton(
                        onPressed: () {
                          setState(() {
                            _extraCosts.removeAt(index);
                          });
                        },
                        icon: const Icon(Icons.delete),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildTournamentTab() {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('追加済みトーナメント', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            IconButton(
              onPressed: _showTournamentSelectionDialog,
              icon: const Icon(Icons.add),
              tooltip: 'トーナメントを追加',
            ),
          ],
        ),
        Expanded(
          child: ListView.builder(
            itemCount: _tournaments.length,
            itemBuilder: (context, index) {
              final key = _tournaments.keys.elementAt(index);
              final tournament = _tournaments[key]!;
              
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          initialValue: tournament['tournamentName'],
                          decoration: const InputDecoration(
                            labelText: 'トーナメント名',
                            border: OutlineInputBorder(),
                          ),
                          onChanged: (value) {
                            tournament['tournamentName'] = value;
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 100,
                        child: TextFormField(
                          initialValue: tournament['entryFee'].toString(),
                          decoration: const InputDecoration(
                            labelText: '参加費',
                            border: OutlineInputBorder(),
                          ),
                          keyboardType: TextInputType.number,
                          onChanged: (value) {
                            tournament['entryFee'] = int.tryParse(value) ?? 0;
                          },
                        ),
                      ),
                      IconButton(
                        onPressed: () {
                          setState(() {
                            _tournaments.remove(key);
                          });
                        },
                        icon: const Icon(Icons.delete),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildItemsTab() {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('追加済みアイテム', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            IconButton(
              onPressed: _showFoodItemSelectionDialog,
              icon: const Icon(Icons.add),
              tooltip: 'メニューから追加',
            ),
          ],
        ),
        Expanded(
          child: ListView.builder(
            itemCount: _items.length,
            itemBuilder: (context, index) {
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          initialValue: _items[index]['name'],
                          decoration: const InputDecoration(
                            labelText: '商品名',
                            border: OutlineInputBorder(),
                          ),
                          onChanged: (value) {
                            _items[index]['name'] = value;
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 80,
                        child: TextFormField(
                          initialValue: _items[index]['price'].toString(),
                          decoration: const InputDecoration(
                            labelText: '単価',
                            border: OutlineInputBorder(),
                          ),
                          keyboardType: TextInputType.number,
                          onChanged: (value) {
                            _items[index]['price'] = int.tryParse(value) ?? 0;
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 60,
                        child: TextFormField(
                          initialValue: _items[index]['quantity'].toString(),
                          decoration: const InputDecoration(
                            labelText: '数量',
                            border: OutlineInputBorder(),
                          ),
                          keyboardType: TextInputType.number,
                          onChanged: (value) {
                            _items[index]['quantity'] = int.tryParse(value) ?? 1;
                          },
                        ),
                      ),
                      IconButton(
                        onPressed: () {
                          setState(() {
                            _items.removeAt(index);
                          });
                        },
                        icon: const Icon(Icons.delete),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildSideGameChipTab() {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('追加済みチップ', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            IconButton(
              onPressed: _showChipSelectionDialog,
              icon: const Icon(Icons.add),
              tooltip: 'チップメニューから追加',
            ),
          ],
        ),
        Expanded(
          child: ListView.builder(
            itemCount: _sideGameChips.length,
            itemBuilder: (context, index) {
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          initialValue: _sideGameChips[index]['name'],
                          decoration: const InputDecoration(
                            labelText: 'チップ名',
                            border: OutlineInputBorder(),
                          ),
                          onChanged: (value) {
                            _sideGameChips[index]['name'] = value;
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 100,
                        child: TextFormField(
                          initialValue: _sideGameChips[index]['price'].toString(),
                          decoration: const InputDecoration(
                            labelText: '金額',
                            border: OutlineInputBorder(),
                          ),
                          keyboardType: TextInputType.number,
                          onChanged: (value) {
                            _sideGameChips[index]['price'] = int.tryParse(value) ?? 0;
                          },
                        ),
                      ),
                      IconButton(
                        onPressed: () {
                          setState(() {
                            _sideGameChips.removeAt(index);
                          });
                        },
                        icon: const Icon(Icons.delete),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
