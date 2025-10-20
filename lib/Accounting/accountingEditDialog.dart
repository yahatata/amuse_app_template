import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';

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
  final _functions = FirebaseFunctions.instance;

  // 入店料の管理
  List<Map<String, dynamic>> _extraCosts = [];
  
  // トーナメント参加費の管理
  Map<String, Map<String, dynamic>> _tournaments = {};
  
  // フード・ドリンクの管理
  List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    _initializeData();
  }

  void _initializeData() {
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
  }

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
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
    
    return total;
  }

  Future<void> _updateAccounting() async {
    if (!_formKey.currentState!.validate()) return;
    if (_reasonController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('修正理由を入力してください')),
      );
      return;
    }

    try {
      final result = await _functions.httpsCallable('updateAccounting').call({
        'billId': widget.bill['id'],
        'extraCost': _extraCosts,
        'tournaments': _tournaments,
        'items': _items,
        'reason': _reasonController.text.trim(),
      });

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
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: Container(
        width: MediaQuery.of(context).size.width * 0.9,
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.8,
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
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              
              // 修正理由
              TextFormField(
                controller: _reasonController,
                decoration: const InputDecoration(
                  labelText: '修正理由',
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
              
              // タブ
              SizedBox(
                height: 400, // 固定の高さを設定
                child: DefaultTabController(
                  length: 3,
                  child: Column(
                    children: [
                      const TabBar(
                        tabs: [
                          Tab(text: '入店料'),
                          Tab(text: 'トーナメント'),
                          Tab(text: 'フード・ドリンク'),
                        ],
                      ),
                      Expanded(
                        child: TabBarView(
                          children: [
                            _buildExtraCostTab(),
                            _buildTournamentTab(),
                            _buildItemsTab(),
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
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('キャンセル'),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: _updateAccounting,
                    child: const Text('修正'),
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
            const Text('トーナメント参加費', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            IconButton(
              onPressed: () {
                setState(() {
                  final key = 'tournament_${_tournaments.length + 1}';
                  _tournaments[key] = {'entryFee': 0, 'tournamentName': ''};
                });
              },
              icon: const Icon(Icons.add),
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
            const Text('フード・ドリンク', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            IconButton(
              onPressed: () {
                setState(() {
                  _items.add({'name': '', 'price': 0, 'quantity': 1});
                });
              },
              icon: const Icon(Icons.add),
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
}
