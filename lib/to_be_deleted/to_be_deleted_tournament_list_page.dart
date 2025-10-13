// このファイルは削除予定です。動作確認後に削除してください。
// Runtime Debug機能専用のため不要と判断されました。

/*
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'tournament_runtime_debug_page.dart';

/// トーナメント一覧を表示し、選択できるページ
class TournamentListPage extends StatefulWidget {
  const TournamentListPage({super.key});

  @override
  State<TournamentListPage> createState() => _TournamentListPageState();
}

class _TournamentListPageState extends State<TournamentListPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  bool _isLoading = true;
  List<Map<String, dynamic>> _tournaments = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadTournaments();
  }

  Future<void> _loadTournaments() async {
    try {
      setState(() {
        _isLoading = true;
        _error = null;
      });

      final snapshot = await _firestore
          .collection('scheduledTournaments')
          .orderBy('createdAt', descending: true)
          .limit(50) // 最新50件に制限
          .get();

      final tournaments = snapshot.docs.map((doc) {
        final data = doc.data();
        return {
          'id': doc.id,
          'name': data['snapshot']?['name'] ?? '名前なし',
          'status': data['status'] ?? 'unknown',
          'startAt': data['startAt'],
          'createdAt': data['createdAt'],
          'templateId': data['templateId'] ?? '',
        };
      }).toList();

      setState(() {
        _tournaments = tournaments;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  void _navigateToRuntimeDebug(String tournamentId) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => TournamentRuntimeDebugPage(
          tournamentId: tournamentId,
        ),
      ),
    );
  }

  String _formatTimestamp(dynamic timestamp) {
    if (timestamp == null) return 'N/A';
    
    try {
      if (timestamp is Timestamp) {
        return timestamp.toDate().toLocal().toString().substring(0, 19);
      }
      return 'N/A';
    } catch (e) {
      return 'N/A';
    }
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'scheduled':
        return Colors.blue[600]!;
      case 'running':
        return Colors.green[600]!;
      case 'paused':
        return Colors.orange[600]!;
      case 'ended':
        return Colors.red[600]!;
      default:
        return Colors.grey[600]!;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('トーナメント一覧'),
        backgroundColor: Colors.blue[700],
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadTournaments,
            tooltip: '更新',
          ),
        ],
      ),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            color: Colors.blue[50],
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Runtime Debug - トーナメント選択',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.blue,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '表示中のトーナメント数: ${_tournaments.length}',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[600],
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'トーナメントを選択してRuntime状態を確認してください',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey,
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _buildTournamentList(),
          ),
        ],
      ),
    );
  }

  Widget _buildTournamentList() {
    if (_isLoading) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('トーナメント一覧を読み込み中...'),
          ],
        ),
      );
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 64,
              color: Colors.red[400],
            ),
            const SizedBox(height: 16),
            Text(
              'エラーが発生しました',
              style: TextStyle(
                fontSize: 18,
                color: Colors.red[600],
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _error!,
              style: TextStyle(color: Colors.red[600]),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loadTournaments,
              child: const Text('再試行'),
            ),
          ],
        ),
      );
    }

    if (_tournaments.isEmpty) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.info_outline,
              size: 64,
              color: Colors.orange,
            ),
            SizedBox(height: 16),
            Text(
              'トーナメントが見つかりません',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            SizedBox(height: 8),
            Text(
              '新しいトーナメントを作成してください',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _tournaments.length,
      itemBuilder: (context, index) {
        final tournament = _tournaments[index];
        return _buildTournamentCard(tournament);
      },
    );
  }

  Widget _buildTournamentCard(Map<String, dynamic> tournament) {
    final status = tournament['status'] as String;
    final statusColor = _getStatusColor(status);
    
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      child: InkWell(
        onTap: () => _navigateToRuntimeDebug(tournament['id']),
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      tournament['name'] as String,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      status.toUpperCase(),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Text(
                    'ID: ',
                    style: TextStyle(
                      fontWeight: FontWeight.w500,
                      color: Colors.grey,
                    ),
                  ),
                  Expanded(
                    child: Text(
                      tournament['id'] as String,
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 12,
                        color: Colors.grey,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Text(
                    '開始時刻: ',
                    style: TextStyle(
                      fontWeight: FontWeight.w500,
                      color: Colors.grey,
                    ),
                  ),
                  Text(
                    _formatTimestamp(tournament['startAt']),
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Text(
                    '作成時刻: ',
                    style: TextStyle(
                      fontWeight: FontWeight.w500,
                      color: Colors.grey,
                    ),
                  ),
                  Text(
                    _formatTimestamp(tournament['createdAt']),
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Icon(
                    Icons.touch_app,
                    size: 16,
                    color: Colors.blue[600],
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'タップしてRuntime状態を確認',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.blue[600],
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
*/
