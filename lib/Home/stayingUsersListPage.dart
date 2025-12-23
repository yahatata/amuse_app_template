import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../user_actions/user_action_home.dart';
import '../services/active_stays_service.dart';
import '../utils/sectioned_user_list_page.dart';

class StayingUsersListPage extends StatefulWidget {
  const StayingUsersListPage({super.key});

  @override
  State<StayingUsersListPage> createState() => _StayingUsersListPageState();
}

class _StayingUsersListPageState extends State<StayingUsersListPage> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('入店中user一覧'),
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: ActiveStaysService.instance.stream,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          
          if (snapshot.hasError) {
            return Center(child: Text('取得に失敗しました: ${snapshot.error}'));
          }
          
          if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
            return const Center(child: Text('入店中のユーザーがいません'));
          }
          
          // activeStays から user リストを生成
          final users = snapshot.data!.docs.map((doc) {
            final data = doc.data() as Map<String, dynamic>;
            return {
              'billId': data['billId'] as String? ?? '',
              'userId': doc.id, // activeStays の docId = userId
              'pokerName': data['pokerName'] as String? ?? '',
              // currentTable と currentSeat は activeStays には含まれないため、表示時は '-' を表示
              'currentTable': null,
              'currentSeat': null,
            };
          }).toList();
          
          // セクション付きリスト表示（アルファベット順 → あいうえお順）
          return buildSectionedUserListPage(
            users: users,
            nameKey: 'pokerName',
            itemBuilder: (context, user) => _buildUserItem(user),
          );
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
        subtitle: Text('Table: ${currentTable ?? '-'}   Seat: ${currentSeat ?? '-'}'), // activeStays には含まれないため常に '-'
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


