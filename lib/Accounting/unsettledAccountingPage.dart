import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/Accounting/accountingPage.dart';
import 'package:amuse_app_template/utils/sectioned_user_list_page.dart';

/// 未会計ラベル付き請求書のみを扱う会計ページ。
/// タブ1: 日付ごとの未会計bills（Step3以降で実装するため枠のみ）。
/// タブ2: users の unsettledBillsCount >= 1 の一覧 → ユーザータップでそのユーザーの未会計bills一覧 → 会計処理（AccountingPage と同じ関数を使用）。
class UnsettledAccountingPage extends StatefulWidget {
  const UnsettledAccountingPage({super.key});

  @override
  State<UnsettledAccountingPage> createState() => _UnsettledAccountingPageState();
}

class _UnsettledAccountingPageState extends State<UnsettledAccountingPage>
    with SingleTickerProviderStateMixin {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  late TabController _tabController;
  /// タブ2で選択したユーザー（null のときはユーザー一覧、設定時はそのユーザーの未会計bills一覧）
  Map<String, dynamic>? _selectedUser;
  List<Map<String, dynamic>> _unsettledBills = [];
  bool _billsLoading = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadUnsettledBillsForUser(String userId) async {
    setState(() => _billsLoading = true);
    try {
      final snapshot = await _firestore
          .collection('bills')
          .where('party.userId', isEqualTo: userId)
          .where('status', whereIn: ['open', 'settling'])
          .get();

      final list = snapshot.docs.where((doc) {
        final data = doc.data();
        final cs = data['closeSnapshot'];
        if (cs == null || cs is! Map) return false;
        return cs['unresolved'] == true;
      }).map((doc) {
        final data = doc.data();
        final ops = data['ops'] as Map<String, dynamic>?;
        final paymentsSummary = data['paymentsSummary'] as Map<String, dynamic>?;
        return <String, dynamic>{
          'id': doc.id,
          'userId': (data['party'] as Map<String, dynamic>?)?['userId'],
          'pokerName': (data['party'] as Map<String, dynamic>?)?['pokerName'],
          'businessDate': data['businessDate'],
          'currentTable': (data['place'] as Map<String, dynamic>?)?['table'],
          'currentSeat': (data['place'] as Map<String, dynamic>?)?['seat'],
          'status': data['status'],
          'createdAt': data['createdAt'],
          'updatedAt': data['updatedAt'],
          'accountingStartedAt': ops?['accountingStartedAt'],
          'paymentMethodsByAmount': paymentsSummary?['byMethod'],
          'totalPrice': null,
        };
      }).toList();

      if (mounted) {
        setState(() {
          _unsettledBills = list;
          _billsLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _billsLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('未会計一覧の取得に失敗しました: $e')),
        );
      }
    }
  }

  void _onUserSelected(Map<String, dynamic> user) {
    setState(() {
      _selectedUser = user;
      _unsettledBills = [];
    });
    final userId = user['userId'] as String?;
    if (userId != null && userId.isNotEmpty) {
      _loadUnsettledBillsForUser(userId);
    }
  }

  void _onBackToUserList() {
    setState(() {
      _selectedUser = null;
      _unsettledBills = [];
    });
  }

  void _onAccountingComplete() {
    final userId = _selectedUser?['userId'] as String?;
    if (userId != null) _loadUnsettledBillsForUser(userId);
  }

  /// 営業日キー（例: 2025-02-09）を表示用にフォーマット（2025/02/09）
  static String _formatBusinessDateForDisplay(String key) {
    if (key.isEmpty) return '—';
    return key.replaceAll('-', '/');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('未会計の会計'),
        backgroundColor: Colors.brown[700],
        foregroundColor: Colors.white,
        bottom: TabBar(
          controller: _tabController,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: const [
            Tab(text: '日付ごと'),
            Tab(text: 'ユーザー別'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildTabByDate(),
          _buildTabByUser(),
        ],
      ),
    );
  }

  /// タブ1: 日付ごとの未会計bills（Step3以降でデータ取得を実装するため枠のみ）
  Widget _buildTabByDate() {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Text(
          '日付ごとの未会計billsは Step3 以降で実装します。',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 16, color: Colors.grey),
        ),
      ),
    );
  }

  /// タブ2: ユーザー一覧（unsettledBillsCount >= 1）→ 選択時はそのユーザーの未会計bills一覧
  Widget _buildTabByUser() {
    if (_selectedUser != null) {
      return _buildUnsettledBillsList();
    }
    return _buildUserList();
  }

  /// users の unsettledBillsCount >= 1 のカード一覧
  Widget _buildUserList() {
    return StreamBuilder<QuerySnapshot>(
      stream: _firestore
          .collection('users')
          .where('unsettledBillsCount', isGreaterThanOrEqualTo: 1)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(child: Text('エラー: ${snapshot.error}'));
        }
        if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
          return const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.person_off, size: 64, color: Colors.grey),
                SizedBox(height: 16),
                Text(
                  '未会計の請求書があるユーザーはいません',
                  style: TextStyle(fontSize: 16, color: Colors.grey),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          );
        }
        final users = snapshot.data!.docs.map((doc) {
          final d = doc.data() as Map<String, dynamic>;
          final count = (d['unsettledBillsCount'] as num?)?.toInt() ?? 0;
          return <String, dynamic>{
            'userId': doc.id,
            'pokerName': d['pokerName'] ?? doc.id,
            'unsettledBillsCount': count,
          };
        }).toList();

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: users.length,
          itemBuilder: (context, index) {
            final user = users[index];
            final name = user['pokerName'] ?? '—';
            final count = user['unsettledBillsCount'] as int? ?? 0;
            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: ListTile(
                title: Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text('未会計の請求書: $count 件'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _onUserSelected(user),
              ),
            );
          },
        );
      },
    );
  }

  /// 選択したユーザーの未会計bills一覧（会計するで AccountingPage に遷移）。タブは親の AppBar に残る。
  Widget _buildUnsettledBillsList() {
    final user = _selectedUser!;
    final pokerName = user['pokerName'] ?? '—';

    if (_billsLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_unsettledBills.isEmpty) {
      return Column(
        children: [
          _buildBackBar(pokerName),
          const Expanded(
            child: Center(
              child: Text(
                '未会計の請求書はありません',
                style: TextStyle(fontSize: 16, color: Colors.grey),
              ),
            ),
          ),
        ],
      );
    }

    return Column(
      children: [
        _buildBackBar(pokerName),
        Expanded(
          child: buildSectionedUserListPage(
            users: _unsettledBills,
            nameKey: 'pokerName',
            itemBuilder: (context, bill) => _buildBillCard(context, bill),
          ),
        ),
      ],
    );
  }

  Widget _buildBackBar(String pokerName) {
    return Material(
      color: Colors.brown[100],
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: _onBackToUserList,
                tooltip: 'ユーザー一覧へ',
              ),
              Text('$pokerName の未会計', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBillCard(BuildContext context, Map<String, dynamic> bill) {
    final pokerName = bill['pokerName'] ?? '—';
    final billId = bill['id'] as String?;
    final userId = bill['userId'] as String?;
    final businessDateRaw = bill['businessDate'];
    final businessDateDisplay = businessDateRaw != null
        ? _formatBusinessDateForDisplay(businessDateRaw.toString())
        : '—';
    if (billId == null) return const SizedBox.shrink();

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: ListTile(
        title: Text(pokerName, style: const TextStyle(fontWeight: FontWeight.bold)),
        subtitle: Text('営業日: $businessDateDisplay'),
        trailing: const Icon(Icons.chevron_right),
        onTap: () async {
          await Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => AccountingPage(
                forUnsettledBillId: billId,
                forUnsettledUserId: userId,
              ),
            ),
          );
          _onAccountingComplete();
        },
      ),
    );
  }
}
