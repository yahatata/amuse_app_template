import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../UserAction/userActionHome.dart';

class StayingUsersListPage extends StatefulWidget {
  const StayingUsersListPage({super.key});

  @override
  State<StayingUsersListPage> createState() => _StayingUsersListPageState();
}

class _StayingUsersListPageState extends State<StayingUsersListPage> {
  final FirebaseFunctions _functions = FirebaseFunctions.instance;
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _users = [];

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final callable = _functions.httpsCallable('getOpenBills');
      final result = await callable.call();
      final data = result.data;
      if (data is Map && data['success'] == true) {
        final list = data['data'];
        if (list is List) {
          _users = list
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
          // 並び順: pokerName でアルファベット順/アイウエオ順
          _users.sort((a, b) {
            final an = (a['pokerName'] ?? '').toString();
            final bn = (b['pokerName'] ?? '').toString();
            return an.toLowerCase().compareTo(bn.toLowerCase());
          });
        } else {
          _error = '取得データ形式が不正です';
        }
      } else {
        _error = (data is Map ? data['error'] : null) ?? '取得に失敗しました';
      }
    } catch (e) {
      _error = '取得に失敗しました: $e';
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('入店中user一覧'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetch,
          )
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : ListView.builder(
                  itemCount: _users.length,
                  itemBuilder: (context, index) {
                    final u = _users[index];
                    return _buildUserItem(u);
                  },
                ),
    );
  }

  // When: 入店中ユーザー一覧の各行を描画する時
  // Where: StayingUsersListPage
  // What: menuEditorListPage風のCard UIでユーザー情報を表示
  // How: Card + ListTile で、先頭にアバター、タイトルにpokerName、サブに席情報
  Widget _buildUserItem(Map<String, dynamic> user) {
    final pokerName = (user['pokerName'] ?? '').toString();
    final currentTable = user['currentTable'];
    final currentSeat = user['currentSeat'];

    String initials() {
      if (pokerName.isEmpty) return '—';
      // 先頭2文字を抽出（英数/かな等を問わず）
      return pokerName.characters.take(2).toString();
    }

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: Colors.blueGrey.shade100,
          child: Text(
            initials(),
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
        ),
        title: Text(
          pokerName.isEmpty ? '(名前未設定)' : pokerName,
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: Text('Table: ${currentTable ?? '-'}   Seat: ${currentSeat ?? '-'}'),
        // trailing は削除（アイコン非表示）
        onTap: () {
          showUserActionHome(
            context: context,
            sourcePage: 'StayingUsersListPage',
            user: user,
          );
        },
      ),
    );
  }
}


