import 'package:amuse_app_template/Home/adminInitialPointSettingPage.dart';
import 'package:amuse_app_template/Home/home_list_load_errors.dart';
import 'package:amuse_app_template/user/user_type_display.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

/// 管理者向け・初期ポイント設定の対象ユーザー選択画面。
/// 設定本体は [AdminInitialPointSettingPage]（別 Route）。
class AdminInitialBalancePage extends StatefulWidget {
  const AdminInitialBalancePage({super.key});

  @override
  State<AdminInitialBalancePage> createState() =>
      _AdminInitialBalancePageState();
}

class _AdminInitialBalancePageState extends State<AdminInitialBalancePage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final TextEditingController _searchController = TextEditingController();

  bool _showOnlySetUsers = false;
  bool _usersLoading = true;
  String? _usersError;
  String _searchQuery = '';

  List<_CandidateUser> _allUsers = const [];

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadUsers() async {
    setState(() {
      _usersLoading = true;
      _usersError = null;
    });
    try {
      final snap = await _firestore.collection('users').get();
      if (!mounted) return;
      final list = snap.docs.map((d) {
        return _CandidateUser(uid: d.id, data: d.data());
      }).toList();
      setState(() {
        _allUsers = list;
        _usersLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _usersLoading = false;
        _usersError = kHomeUsersListLoadFailedMessage;
      });
    }
  }

  List<_CandidateUser> get _filteredUsers {
    final rows = _allUsers
        .where(
          (u) => matchesInitialBalanceSetDisplayFilter(
            u.data,
            showOnlySetUsers: _showOnlySetUsers,
          ),
        )
        .map(
          (u) => <String, dynamic>{
            ...u.data,
            'id': u.uid,
          },
        )
        .toList();
    // 表示切替は initialBalanceSetAt 基準。移行済み店舗管理は候補から除外（A-6）。
    final filtered = filterAdminUserListRows(
      rows: rows,
      searchQuery: _searchQuery,
    );
    final byId = {for (final u in _allUsers) u.uid: u};
    return filtered
        .map((row) => byId[(row['id'] ?? '').toString()])
        .whereType<_CandidateUser>()
        .toList();
  }

  Future<void> _openSetting(_CandidateUser user) async {
    final result = await Navigator.push<AdminInitialPointSettingResult>(
      context,
      MaterialPageRoute(
        builder: (_) => AdminInitialPointSettingPage(
          uid: user.uid,
          initialData: Map<String, dynamic>.from(user.data),
        ),
      ),
    );
    if (!mounted || result == null) return;
    setState(() {
      final idx = _allUsers.indexWhere((u) => u.uid == result.uid);
      if (idx >= 0) {
        _allUsers = List<_CandidateUser>.from(_allUsers)
          ..[idx] = _CandidateUser(uid: result.uid, data: result.data);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('初期ポイント設定'),
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
        actions: [
          Row(
            children: [
              const Text('設定済みユーザーのみ表示', style: TextStyle(fontSize: 12)),
              Switch(
                value: _showOnlySetUsers,
                onChanged: (v) => setState(() => _showOnlySetUsers = v),
              ),
            ],
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_usersLoading && _allUsers.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_usersError != null && _allUsers.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'ユーザー取得に失敗しました\n$_usersError',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _loadUsers,
                child: const Text('再試行'),
              ),
            ],
          ),
        ),
      );
    }

    final filtered = _filteredUsers;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
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
              isDense: true,
            ),
            onChanged: (v) => setState(() => _searchQuery = v),
          ),
        ),
        Expanded(
          child: filtered.isEmpty
              ? Center(
                  child: Text(
                    _searchQuery.trim().isNotEmpty
                        ? '検索条件に一致するユーザーがいません'
                        : '候補ユーザーがいません',
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: filtered.length,
                  itemBuilder: (context, index) {
                    final u = filtered[index];
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
                          displayOrUnset(u.data['pokerName']),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        trailing: const Icon(Icons.arrow_forward_ios),
                        onTap: () => _openSetting(u),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _CandidateUser {
  const _CandidateUser({required this.uid, required this.data});

  final String uid;
  final Map<String, dynamic> data;
}
