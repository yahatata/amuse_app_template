import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:amuse_app_template/Accounting/postSettlementOperationDetailPage.dart';

class PostSettlementOperationsPage extends StatefulWidget {
  const PostSettlementOperationsPage({super.key});

  @override
  State<PostSettlementOperationsPage> createState() =>
      _PostSettlementOperationsPageState();
}

class _PostSettlementOperationsPageState
    extends State<PostSettlementOperationsPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  DateTime _selectedDate = DateTime.now();
  bool _initializing = true;
  bool _loading = false;
  String? _error;
  List<Map<String, dynamic>> _bills = [];

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    setState(() {
      _initializing = true;
      _error = null;
    });
    try {
      final stateDoc = await _firestore
          .collection('storeMeta')
          .doc('currentBusinessDay')
          .get();
      final stateData = stateDoc.data();
      final status = stateData?['status'] as String?;
      final currentBusinessDateKey =
          stateData?['currentBusinessDateKey'] as String?;

      if (status == 'running' &&
          currentBusinessDateKey != null &&
          currentBusinessDateKey.isNotEmpty) {
        _selectedDate = DateTime.parse(currentBusinessDateKey);
      } else {
        _selectedDate = DateTime.now();
      }
      await _loadBills();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '営業日の初期化に失敗しました: $e';
      });
      await _loadBills();
    } finally {
      if (mounted) {
        setState(() {
          _initializing = false;
        });
      }
    }
  }

  String get _selectedBusinessDateKey =>
      DateFormat('yyyy-MM-dd').format(_selectedDate);

  String get _selectedBusinessDateLabel =>
      DateFormat('yyyy/MM/dd').format(_selectedDate);

  Future<void> _loadBills() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final querySnapshot = await _firestore
          .collection('bills')
          .where('businessDate', isEqualTo: _selectedBusinessDateKey)
          .get();

      final bills = querySnapshot.docs
          .map((doc) => {'id': doc.id, ...doc.data()})
          .where((bill) {
            final status = bill['status'] as String? ?? '';
            return status == 'settled' || status == 'post_settlement_pending';
          })
          .toList();

      bills.sort((a, b) {
        final aTime = _extractSortDate(a);
        final bTime = _extractSortDate(b);
        if (aTime == null && bTime == null) return 0;
        if (aTime == null) return 1;
        if (bTime == null) return -1;
        return bTime.compareTo(aTime);
      });

      if (!mounted) return;
      setState(() {
        _bills = bills;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'bill 一覧の取得に失敗しました: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  DateTime? _extractSortDate(Map<String, dynamic> bill) {
    final ops = (bill['ops'] as Map<String, dynamic>?) ?? const {};
    final candidate =
        ops['accountingCompletedAt'] ?? bill['updatedAt'] ?? bill['createdAt'];
    if (candidate is Timestamp) return candidate.toDate();
    if (candidate is DateTime) return candidate;
    return null;
  }

  Future<void> _changeDay(int delta) async {
    setState(() {
      _selectedDate = _selectedDate.add(Duration(days: delta));
    });
    await _loadBills();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2024),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (picked == null) return;
    setState(() {
      _selectedDate = picked;
    });
    await _loadBills();
  }

  Future<void> _jumpToCurrentBusinessDay() async {
    await _initialize();
  }

  int _grandTotalInclOf(Map<String, dynamic> bill) {
    final settlementSnapshot =
        (bill['settlementSnapshot'] as Map<String, dynamic>?) ?? const {};
    final snapshotAmounts =
        (settlementSnapshot['amounts'] as Map<String, dynamic>?) ?? const {};
    final rootAmounts = (bill['amounts'] as Map<String, dynamic>?) ?? const {};
    return ((snapshotAmounts['grandTotalIncl'] ?? rootAmounts['grandTotalIncl'])
                as num?)
            ?.toInt() ??
        0;
  }

  Map<String, dynamic> _postSettlementStateOf(Map<String, dynamic> bill) =>
      (bill['postSettlementState'] as Map<String, dynamic>?) ?? const {};

  int _totalRefundedInclOf(Map<String, dynamic> bill) =>
      (_postSettlementStateOf(bill)['totalRefundedIncl'] as num?)?.toInt() ?? 0;

  int _totalCollectedInclOf(Map<String, dynamic> bill) =>
      (_postSettlementStateOf(bill)['totalCollectedIncl'] as num?)?.toInt() ??
      0;

  bool _hasRefundHistory(Map<String, dynamic> bill) =>
      _totalRefundedInclOf(bill) > 0;

  bool _hasCollectionHistory(Map<String, dynamic> bill) =>
      _totalCollectedInclOf(bill) > 0;

  String _statusLabelOf(String status) {
    switch (status) {
      case 'settled':
        return '会計済み';
      case 'post_settlement_pending':
        return '会計後要対応';
      default:
        return status;
    }
  }

  Color _statusColorOf(String status) {
    switch (status) {
      case 'settled':
        return Colors.green;
      case 'post_settlement_pending':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  String _requiredActionLabelOf(Map<String, dynamic> bill) {
    final postSettlementState = _postSettlementStateOf(bill);
    final type = postSettlementState['requiredActionType'] as String? ?? 'none';
    final amount =
        (postSettlementState['requiredActionIncl'] as num?)?.toInt() ?? 0;
    switch (type) {
      case 'collection':
        return '追加徴収待ち ¥$amount';
      case 'refund':
        return '要返金 ¥$amount';
      default:
        if (_hasRefundHistory(bill) || _hasCollectionHistory(bill)) {
          return '差額対応完了';
        }
        return '未解消の差額なし';
    }
  }

  Widget _buildHistoryChip({required String label, required Color color}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          color: color,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  Future<void> _openBillDetail(Map<String, dynamic> bill) async {
    final updated = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) =>
            PostSettlementOperationDetailPage(billId: bill['id'] as String),
      ),
    );
    if (updated == true) {
      await _loadBills();
    }
  }

  @override
  Widget build(BuildContext context) {
    final settledCount = _bills
        .where((bill) => (bill['status'] as String?) == 'settled')
        .length;
    final pendingCount = _bills.length - settledCount;

    return Scaffold(
      appBar: AppBar(
        title: const Text('会計後操作'),
        backgroundColor: Colors.indigo[700],
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            onPressed: _loading ? null : _loadBills,
            icon: const Icon(Icons.refresh),
            tooltip: '再読み込み',
          ),
        ],
      ),
      body: Column(
        children: [
          _buildDateHeader(),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Row(
              children: [
                _buildCountChip('対象 ${_bills.length}件'),
                const SizedBox(width: 8),
                _buildCountChip('会計済み $settledCount件'),
                const SizedBox(width: 8),
                _buildCountChip('要対応 $pendingCount件'),
              ],
            ),
          ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildDateHeader() {
    return Container(
      width: double.infinity,
      color: Colors.indigo[50],
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '表示営業日',
            style: TextStyle(fontSize: 12, color: Colors.black54),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              IconButton(
                onPressed: _loading ? null : () => _changeDay(-1),
                icon: const Icon(Icons.chevron_left),
                tooltip: '前日',
              ),
              Expanded(
                child: InkWell(
                  onTap: _loading ? null : _pickDate,
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 14,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.indigo.shade100),
                    ),
                    child: Column(
                      children: [
                        Text(
                          _selectedBusinessDateLabel,
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'タップで日付を変更',
                          style: TextStyle(fontSize: 12, color: Colors.black54),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              IconButton(
                onPressed: _loading ? null : () => _changeDay(1),
                icon: const Icon(Icons.chevron_right),
                tooltip: '翌日',
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: _loading ? null : _jumpToCurrentBusinessDay,
                icon: const Icon(Icons.today),
                label: const Text('当日営業日に戻る'),
              ),
              Text(
                'settled / post_settlement_pending の伝票を表示します',
                style: TextStyle(fontSize: 12, color: Colors.indigo[800]),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCountChip(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.indigo[50],
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.indigo.shade100),
      ),
      child: Text(text, style: const TextStyle(fontSize: 12)),
    );
  }

  Widget _buildBody() {
    if (_initializing || _loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!, style: const TextStyle(color: Colors.red)),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: _loadBills, child: const Text('再試行')),
            ],
          ),
        ),
      );
    }
    if (_bills.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'この営業日に操作対象の伝票はありません。',
            style: TextStyle(fontSize: 16, color: Colors.black54),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _loadBills,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
        itemCount: _bills.length,
        itemBuilder: (context, index) {
          final bill = _bills[index];
          return _buildBillCard(bill);
        },
      ),
    );
  }

  Widget _buildBillCard(Map<String, dynamic> bill) {
    final party = (bill['party'] as Map<String, dynamic>?) ?? const {};
    final name = party['pokerName'] as String? ?? '名前未設定';
    final status = bill['status'] as String? ?? '';
    final total = _grandTotalInclOf(bill);
    final completedAt = _extractSortDate(bill);
    final refunded = _totalRefundedInclOf(bill);
    final collected = _totalCollectedInclOf(bill);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'billId: ${(bill['id'] as String).substring(0, 8)}…',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Colors.black54,
                        ),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: _statusColorOf(status).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        _statusLabelOf(status),
                        style: TextStyle(
                          fontSize: 12,
                          color: _statusColorOf(status),
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    if (status == 'settled' &&
                        (_hasRefundHistory(bill) ||
                            _hasCollectionHistory(bill))) ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        alignment: WrapAlignment.end,
                        children: [
                          if (_hasRefundHistory(bill))
                            _buildHistoryChip(
                              label: '返金履歴あり',
                              color: Colors.blue,
                            ),
                          if (_hasCollectionHistory(bill))
                            _buildHistoryChip(
                              label: '追加徴収履歴あり',
                              color: Colors.deepOrange,
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                Text('初回会計: ¥$total'),
                if (status == 'settled' && refunded > 0)
                  Text('返金済み: ¥$refunded'),
                if (status == 'settled' && collected > 0)
                  Text('追加徴収済み: ¥$collected'),
                if (completedAt != null)
                  Text('最終更新: ${DateFormat('HH:mm:ss').format(completedAt)}'),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              _requiredActionLabelOf(bill),
              style: const TextStyle(fontSize: 13, color: Colors.black87),
            ),
            const SizedBox(height: 12),
            const Text(
              'この伝票の会計後操作を開き、減額・増額の操作を行います。',
              style: TextStyle(fontSize: 12, color: Colors.black54),
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.icon(
                onPressed: () => _openBillDetail(bill),
                icon: const Icon(Icons.open_in_new),
                label: const Text('この伝票を操作'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
