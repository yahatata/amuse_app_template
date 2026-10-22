import 'package:amuse_app_template/Home/adminUserDetailPage.dart';
import 'package:amuse_app_template/Home/home_list_load_errors.dart';
import 'package:amuse_app_template/services/active_stays_service.dart';
import 'package:amuse_app_template/user/user_type_display.dart';
import 'package:amuse_app_template/user_actions/user_action_home.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

/// Terminal「入店中ユーザー一覧」統合画面。
///
/// - OFF（初期）: 入店中ユーザー（[ActiveStaysService]）→ [showUserActionHome]
/// - ON: 全ユーザー（`users` Stream）→ [AdminUserDetailPage]
///
/// `sourcePage: 'StayingUsersListPage'` は [UserActionHome] のメニュー分岐キーのため維持する。
class AdminUserListPage extends StatefulWidget {
  const AdminUserListPage({super.key});

  @override
  State<AdminUserListPage> createState() => _AdminUserListPageState();
}

class _AdminUserListPageState extends State<AdminUserListPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final TextEditingController _searchController = TextEditingController();

  String _searchQuery = '';

  /// false = 入店中ユーザー / true = 全ユーザー（永続化なし）
  bool _showAllUsers = false;

  /// 再取得用（エラー時の再試行で Stream を張り直す）
  int _reloadToken = 0;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _retry() {
    setState(() => _reloadToken++);
  }

  List<QueryDocumentSnapshot<Map<String, dynamic>>> _prepareUserDocs(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> docs,
  ) {
    final rows = docs
        .map((doc) => <String, dynamic>{...doc.data(), 'id': doc.id})
        .toList();
    final prepared = filterAdminUserListRows(
      rows: rows,
      searchQuery: _searchQuery,
    );
    final idToDoc = {for (final doc in docs) doc.id: doc};
    return prepared
        .map((row) => idToDoc[(row['id'] ?? '').toString()])
        .whereType<QueryDocumentSnapshot<Map<String, dynamic>>>()
        .toList();
  }

  /// 入店中モード用。activeStays の行を検索・ソート（移行済み除外はフィールド欠落時は実質スキップ）。
  List<Map<String, dynamic>> _prepareStayRows(
    List<QueryDocumentSnapshot> docs,
  ) {
    final rows = docs.map((doc) {
      final data = doc.data() as Map<String, dynamic>;
      return <String, dynamic>{
        ...data,
        'id': doc.id,
        'billId': data['billId'] as String? ?? '',
        'userId': doc.id,
        'pokerName': data['pokerName'] as String? ?? '',
        'currentTable': null,
        'currentSeat': null,
      };
    }).toList();
    return filterAdminUserListRows(
      rows: rows,
      searchQuery: _searchQuery,
    );
  }

  Set<String> _activeStayUserIds(QuerySnapshot? staySnap) {
    if (staySnap == null) return {};
    return staySnap.docs.map((d) => d.id).toSet();
  }

  Widget _stayStatusText(bool isInStore) {
    return Text(
      adminStayStatusLabel(isInStore),
      style: TextStyle(
        color: isInStore ? Colors.green : Colors.red,
        fontWeight: FontWeight.w500,
      ),
    );
  }

  Widget _userCard({
    required String pokerName,
    required Widget subtitle,
    required VoidCallback onTap,
  }) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 4,
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: Colors.blue[100],
          child: Icon(
            Icons.person,
            color: Colors.blue[600],
          ),
        ),
        title: Text(
          pokerName,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
        subtitle: subtitle,
        trailing: const Icon(Icons.arrow_forward_ios),
        onTap: onTap,
      ),
    );
  }

  Widget _errorView(Object? error) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              kHomeUsersListLoadFailedMessage,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _retry,
              child: const Text('再試行'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _emptyView({required bool hasSearch}) {
    return Center(
      child: Text(
        hasSearch
            ? '検索条件に一致するユーザーがいません'
            : '表示対象のユーザーがいません',
      ),
    );
  }

  Widget _buildStayingListBody() {
    return StreamBuilder<QuerySnapshot>(
      key: ValueKey('staying-$_reloadToken'),
      stream: ActiveStaysService.instance.stream,
      builder: (context, staySnap) {
        if (staySnap.connectionState == ConnectionState.waiting &&
            !staySnap.hasData) {
          return const Center(child: CircularProgressIndicator());
        }

        if (staySnap.hasError) {
          return _errorView(staySnap.error);
        }

        final docs = staySnap.data?.docs ?? const <QueryDocumentSnapshot>[];
        if (docs.isEmpty) {
          return const Center(child: Text('ユーザーが見つかりません'));
        }

        final filtered = _prepareStayRows(docs);
        if (filtered.isEmpty) {
          return _emptyView(hasSearch: _searchQuery.trim().isNotEmpty);
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: filtered.length,
          itemBuilder: (context, index) {
            final user = filtered[index];
            final pokerName = displayOrUnset(user['pokerName']);
            return _userCard(
              pokerName: pokerName,
              subtitle: _stayStatusText(true),
              onTap: () {
                showUserActionHome(
                  context: context,
                  sourcePage: 'StayingUsersListPage',
                  user: user,
                );
              },
            );
          },
        );
      },
    );
  }

  Widget _buildAllUsersListBody() {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      key: ValueKey('users-$_reloadToken'),
      stream: _firestore.collection('users').snapshots(),
      builder: (context, usersSnap) {
        if (usersSnap.connectionState == ConnectionState.waiting &&
            !usersSnap.hasData) {
          return const Center(child: CircularProgressIndicator());
        }

        if (usersSnap.hasError) {
          return _errorView(usersSnap.error);
        }

        final allDocs = usersSnap.data?.docs ??
            const <QueryDocumentSnapshot<Map<String, dynamic>>>[];
        if (allDocs.isEmpty) {
          return const Center(child: Text('ユーザーが見つかりません'));
        }

        final filtered = _prepareUserDocs(allDocs);
        if (filtered.isEmpty) {
          return _emptyView(hasSearch: _searchQuery.trim().isNotEmpty);
        }

        return StreamBuilder<QuerySnapshot>(
          stream: ActiveStaysService.instance.stream,
          builder: (context, staySnap) {
            final activeIds = _activeStayUserIds(staySnap.data);
            final staysFailed = staySnap.hasError;

            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: filtered.length,
              itemBuilder: (context, index) {
                final doc = filtered[index];
                final data = doc.data();
                final pokerName = displayOrUnset(data['pokerName']);
                final isInStore =
                    !staysFailed && isUserInActiveStaySet(doc.id, activeIds);

                return _userCard(
                  pokerName: pokerName,
                  subtitle: _stayStatusText(isInStore),
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => AdminUserDetailPage(
                          userId: doc.id,
                          initialData: data,
                        ),
                      ),
                    );
                  },
                );
              },
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('入店中ユーザー一覧'),
        backgroundColor: Colors.blue[600],
        foregroundColor: Colors.white,
        actions: [
          Row(
            children: [
              const Text(
                '全ユーザーを表示',
                style: TextStyle(fontSize: 12),
              ),
              Switch(
                value: _showAllUsers,
                onChanged: (v) => setState(() => _showAllUsers = v),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          if (_showAllUsers)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'カードをタップするとユーザー詳細を表示します',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            ),
          Padding(
            padding: EdgeInsets.fromLTRB(16, _showAllUsers ? 8 : 16, 16, 8),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'ポーカーネームで検索',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchQuery.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _searchQuery = '');
                        },
                      ),
                border: const OutlineInputBorder(),
                filled: true,
                fillColor: Colors.grey[50],
              ),
              onChanged: (value) {
                setState(() => _searchQuery = value);
              },
            ),
          ),
          Expanded(
            child: _showAllUsers
                ? _buildAllUsersListBody()
                : _buildStayingListBody(),
          ),
        ],
      ),
    );
  }
}
