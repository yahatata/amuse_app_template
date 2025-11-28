import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

/// トーナメント選択ダイアログ
/// 開催中と今後開催で分けて表示
class TournamentSelectDialog extends StatefulWidget {
  const TournamentSelectDialog({super.key});

  /// ダイアログを表示し、選択されたトーナメントを返す
  static Future<Map<String, dynamic>?> show(BuildContext context) {
    return showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => const TournamentSelectDialog(),
    );
  }

  @override
  State<TournamentSelectDialog> createState() => _TournamentSelectDialogState();
}

class _TournamentSelectDialogState extends State<TournamentSelectDialog>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  // 開催中: running, registered, paused
  // 今後開催: scheduled
  static const _activeStatuses = ['running', 'registered', 'paused'];
  static const _upcomingStatuses = ['scheduled'];

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

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('トーナメントを選択'),
      contentPadding: const EdgeInsets.only(top: 16),
      content: SizedBox(
        width: 400,
        height: 400,
        child: Column(
          children: [
            TabBar(
              controller: _tabController,
              labelColor: Theme.of(context).primaryColor,
              unselectedLabelColor: Colors.grey,
              tabs: const [
                Tab(text: '開催中'),
                Tab(text: '今後開催'),
              ],
            ),
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _buildTournamentList(_activeStatuses),
                  _buildTournamentList(_upcomingStatuses),
                ],
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('キャンセル'),
        ),
      ],
    );
  }

  Widget _buildTournamentList(List<String> statuses) {
    return StreamBuilder<QuerySnapshot>(
      stream: _firestore
          .collection('scheduledTournaments')
          .orderBy('startAt', descending: false)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(child: Text('エラー: ${snapshot.error}'));
        }

        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        // クライアント側でstatusをフィルタリング
        final allDocs = snapshot.data?.docs ?? [];
        debugPrint('全トーナメント数: ${allDocs.length}');
        for (final d in allDocs) {
          final dd = d.data() as Map<String, dynamic>;
          debugPrint('ID: ${d.id}, status: ${dd['status']}');
        }
        final docs = allDocs.where((doc) {
          final data = doc.data() as Map<String, dynamic>;
          final status = data['status'] as String? ?? '';
          debugPrint('フィルタ対象statuses: $statuses, 現在のstatus: $status, 含まれる: ${statuses.contains(status)}');
          return statuses.contains(status);
        }).toList();
        debugPrint('フィルタ後: ${docs.length}件');

        if (docs.isEmpty) {
          return const Center(
            child: Text(
              '該当するトーナメントがありません',
              style: TextStyle(color: Colors.grey),
            ),
          );
        }

        return ListView.builder(
          itemCount: docs.length,
          itemBuilder: (context, index) {
            final doc = docs[index];
            final data = doc.data() as Map<String, dynamic>;
            final snapshotData = data['snapshot'] as Map<String, dynamic>? ?? {};
            final name = snapshotData['name'] as String? ?? '無名のトーナメント';
            final status = data['status'] as String? ?? '';
            final startAt = data['startAt'] as Timestamp?;

            return ListTile(
              title: Text(name),
              subtitle: Text('${doc.id}\n${_formatStartAt(startAt)}'),
              isThreeLine: true,
              trailing: _buildStatusChip(status),
              onTap: () {
                Navigator.of(context).pop({
                  'id': doc.id,
                  'name': name,
                  'status': status,
                  ...data,
                });
              },
            );
          },
        );
      },
    );
  }

  String _formatStartAt(Timestamp? timestamp) {
    if (timestamp == null) return '開始時刻未設定';
    final dt = timestamp.toDate();
    return '${dt.month}/${dt.day} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }

  Widget _buildStatusChip(String status) {
    final (label, color) = switch (status) {
      'running' => ('実施中', Colors.orange),
      'registered' => ('レジスト済', Colors.green),
      'paused' => ('一時停止', Colors.amber),
      'scheduled' => ('予定', Colors.blue),
      _ => (status, Colors.grey),
    };

    return Chip(
      label: Text(label, style: const TextStyle(fontSize: 12)),
      backgroundColor: color.withValues(alpha: 0.2),
      side: BorderSide(color: color),
      padding: EdgeInsets.zero,
      labelPadding: const EdgeInsets.symmetric(horizontal: 8),
    );
  }
}

