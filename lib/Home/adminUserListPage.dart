import 'package:amuse_app_template/Home/adminUserDetailPage.dart';
import 'package:amuse_app_template/services/active_stays_service.dart';
import 'package:amuse_app_template/user/user_type_display.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

/// 店舗運用向けユーザー一覧（参照専用）。
/// 入口: [AdminHomePage] → 「ユーザー一覧」
///
/// 入店状況は [ActiveStaysService]（`isActive == true` の一括 Stream）を正本とし、
/// `users` と結合して N+1 読取を避ける。
class AdminUserListPage extends StatefulWidget {
  const AdminUserListPage({super.key});

  @override
  State<AdminUserListPage> createState() => _AdminUserListPageState();
}

class _AdminUserListPageState extends State<AdminUserListPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final TextEditingController _searchController = TextEditingController();

  String _searchQuery = '';

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

  List<QueryDocumentSnapshot<Map<String, dynamic>>> _prepareList(
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ユーザー一覧'),
        backgroundColor: Colors.blue[600],
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
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
            child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              key: ValueKey(_reloadToken),
              stream: _firestore.collection('users').snapshots(),
              builder: (context, usersSnap) {
                if (usersSnap.connectionState == ConnectionState.waiting &&
                    !usersSnap.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }

                if (usersSnap.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'エラーが発生しました: ${usersSnap.error}',
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

                final allDocs = usersSnap.data?.docs ??
                    const <QueryDocumentSnapshot<Map<String, dynamic>>>[];
                if (allDocs.isEmpty) {
                  return const Center(child: Text('ユーザーが見つかりません'));
                }

                final filtered = _prepareList(allDocs);
                if (filtered.isEmpty) {
                  return Center(
                    child: Text(
                      _searchQuery.trim().isNotEmpty
                          ? '検索条件に一致するユーザーがいません'
                          : '表示対象のユーザーがいません',
                    ),
                  );
                }

                return StreamBuilder<QuerySnapshot>(
                  stream: ActiveStaysService.instance.stream,
                  builder: (context, staySnap) {
                    final activeIds = _activeStayUserIds(staySnap.data);
                    // activeStays 取得失敗時も一覧自体は表示し、状況は未入店扱い
                    // （正本が取れない場合は「入店中」と断言しない）
                    final staysFailed = staySnap.hasError;

                    return ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: filtered.length,
                      itemBuilder: (context, index) {
                        final doc = filtered[index];
                        final data = doc.data();
                        final pokerName = displayOrUnset(data['pokerName']);
                        final isInStore = !staysFailed &&
                            isUserInActiveStaySet(doc.id, activeIds);

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
                            subtitle: _stayStatusText(isInStore),
                            trailing: const Icon(Icons.arrow_forward_ios),
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
                          ),
                        );
                      },
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
