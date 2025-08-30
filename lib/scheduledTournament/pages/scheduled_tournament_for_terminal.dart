import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'blind_timer_page.dart';
import 'tableHomeInScheduledTournament.dart';

/// Terminal用のトーナメント一覧画面
class ScheduledTournamentForTerminal extends StatefulWidget {
  const ScheduledTournamentForTerminal({super.key});

  @override
  State<ScheduledTournamentForTerminal> createState() => _ScheduledTournamentForTerminalState();
}

class _ScheduledTournamentForTerminalState extends State<ScheduledTournamentForTerminal> {
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

      // 翌日までの日付を計算
      final now = DateTime.now();
      final tomorrow = DateTime(now.year, now.month, now.day + 1, 23, 59, 59);

      final snapshot = await _firestore
          .collection('scheduledTournaments')
          .where('isArchived', isEqualTo: false)
          .where('status', whereIn: ['running', 'registered', 'scheduled'])
          .where('startAt', isLessThanOrEqualTo: Timestamp.fromDate(tomorrow))
          .get();

      final tournaments = snapshot.docs.map((doc) {
        final data = doc.data();
        final snapshot = data['snapshot'] as Map<String, dynamic>? ?? {};
        
        return {
          'id': doc.id,
          'name': snapshot['name'] ?? '名前なし',
          'status': data['status'] ?? 'unknown',
          'startAt': data['startAt'],
          'templateId': data['templateId'] ?? '',
          'regEndAt': data['regEndAt'],
          'entryFee': snapshot['entryFee'] ?? 0,
        };
      }).toList();

      // ソート: status優先度(registered > running > scheduled)、その後startAt昇順
      tournaments.sort((a, b) {
        final statusOrder = {'registered': 0, 'running': 1, 'scheduled': 2};
        final aStatusOrder = statusOrder[a['status']] ?? 3;
        final bStatusOrder = statusOrder[b['status']] ?? 3;
        
        if (aStatusOrder != bStatusOrder) {
          return aStatusOrder.compareTo(bStatusOrder);
        }
        
        // 同じstatusの場合、startAtで昇順ソート
        final aStartAt = a['startAt'] as Timestamp?;
        final bStartAt = b['startAt'] as Timestamp?;
        
        if (aStartAt == null && bStartAt == null) return 0;
        if (aStartAt == null) return 1;
        if (bStartAt == null) return -1;
        
        return aStartAt.compareTo(bStartAt);
      });

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
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('トーナメントを読み込み中...'),
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
              Icons.event_busy,
              size: 64,
              color: Colors.grey,
            ),
            SizedBox(height: 16),
            Text(
              '表示するトーナメントがありません',
              style: TextStyle(
                fontSize: 18,
                color: Colors.grey,
              ),
            ),
          ],
        ),
      );
    }

    return _buildTournamentList();
  }

  Widget _buildTournamentList() {
    // トーナメントをステータス別にグループ化
    final runningTournaments = _tournaments.where((t) => t['status'] == 'running').toList();
    final registeredTournaments = _tournaments.where((t) => t['status'] == 'registered').toList();
    final scheduledTournaments = _tournaments.where((t) => t['status'] == 'scheduled').toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Registered セクション
          if (registeredTournaments.isNotEmpty) ...[
            _buildStatusTab('REGISTERED', Colors.orange),
            const SizedBox(height: 8),
            ...registeredTournaments.map((tournament) => 
              _buildTournamentCard(tournament)
            ),
            const SizedBox(height: 16),
          ],

          // Running セクション
          if (runningTournaments.isNotEmpty) ...[
            _buildStatusTab('RUNNING', Colors.green),
            const SizedBox(height: 8),
            ...runningTournaments.map((tournament) => 
              _buildTournamentCard(tournament)
            ),
            const SizedBox(height: 16),
          ],

          // Scheduled セクション
          if (scheduledTournaments.isNotEmpty) ...[
            _buildScheduledSection(scheduledTournaments),
          ],
        ],
      ),
    );
  }

  Widget _buildStatusTab(String status, Color color) {
    return Container(
      width: double.infinity,
      height: 60, // カードの1/6の高さ
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Center(
        child: Text(
          status,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }

  Widget _buildScheduledSection(List<Map<String, dynamic>> scheduledTournaments) {
    // 当日と翌日に分ける
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final tomorrow = DateTime(now.year, now.month, now.day + 1);

    final todayTournaments = scheduledTournaments.where((t) {
      final startAt = t['startAt'] as Timestamp?;
      if (startAt == null) return false;
      final startDate = startAt.toDate();
      return startDate.isAfter(today.subtract(const Duration(days: 1))) && 
             startDate.isBefore(tomorrow);
    }).toList();

    final tomorrowTournaments = scheduledTournaments.where((t) {
      final startAt = t['startAt'] as Timestamp?;
      if (startAt == null) return false;
      final startDate = startAt.toDate();
      return startDate.isAfter(today) && 
             startDate.isBefore(tomorrow.add(const Duration(days: 1)));
    }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // 今日のトーナメント
        if (todayTournaments.isNotEmpty) ...[
          _buildDateTab('今日 (${_formatDate(today)})'),
          const SizedBox(height: 8),
          ...todayTournaments.map((tournament) => 
            _buildTournamentCard(tournament)
          ),
          const SizedBox(height: 16),
        ],

        // 明日のトーナメント
        if (tomorrowTournaments.isNotEmpty) ...[
          _buildDateTab('明日 (${_formatDate(tomorrow)})'),
          const SizedBox(height: 8),
          ...tomorrowTournaments.map((tournament) => 
            _buildTournamentCard(tournament)
          ),
        ],
      ],
    );
  }

  Widget _buildDateTab(String dateText) {
    return Container(
      width: double.infinity,
      height: 60, // カードの1/6の高さ
      decoration: BoxDecoration(
        color: Colors.blue[600],
        borderRadius: BorderRadius.circular(8),
      ),
      child: Center(
        child: Text(
          dateText,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }

  Widget _buildTournamentCard(Map<String, dynamic> tournament) {
    final startAt = tournament['startAt'] as Timestamp?;
    final regEndAt = tournament['regEndAt'] as Timestamp?;
    final entryFee = tournament['entryFee'] as int? ?? 0;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      elevation: 2,
      child: InkWell(
        onTap: () => _navigateToTournament(tournament),
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // トーナメント名
              Text(
                tournament['name'] ?? '名前なし',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              
              // ステータス
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: _getStatusColor(tournament['status']),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  _getStatusText(tournament['status']),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              
              // 開始時刻
              if (startAt != null)
                Row(
                  children: [
                    const Icon(Icons.schedule, size: 16, color: Colors.grey),
                    const SizedBox(width: 4),
                    Text(
                      '開始: ${_formatDateTime(startAt.toDate())}',
                      style: const TextStyle(fontSize: 14, color: Colors.grey),
                    ),
                  ],
                ),
              
              // レジスト終了時刻
              if (regEndAt != null)
                Row(
                  children: [
                    const Icon(Icons.person_add, size: 16, color: Colors.grey),
                    const SizedBox(width: 4),
                    Text(
                      'レジスト終了: ${_formatDateTime(regEndAt.toDate())}',
                      style: const TextStyle(fontSize: 14, color: Colors.grey),
                    ),
                  ],
                ),
              
              // エントリーフィー
              Row(
                children: [
                  const Icon(Icons.attach_money, size: 16, color: Colors.grey),
                  const SizedBox(width: 4),
                  Text(
                    'エントリーフィー: ¥${entryFee.toString()}',
                    style: const TextStyle(fontSize: 14, color: Colors.grey),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'running':
        return Colors.green;
      case 'registered':
        return Colors.orange;
      case 'scheduled':
        return Colors.blue;
      default:
        return Colors.grey;
    }
  }

  String _getStatusText(String status) {
    switch (status) {
      case 'running':
        return '進行中';
      case 'registered':
        return 'レジスト済み';
      case 'scheduled':
        return '予定';
      default:
        return status;
    }
  }

  String _formatDate(DateTime date) {
    return '${date.month}/${date.day}';
  }

  String _formatDateTime(DateTime dateTime) {
    return '${dateTime.month}/${dateTime.day} ${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
  }

  void _navigateToTournament(Map<String, dynamic> tournament) {
    final status = tournament['status'] as String;
    
    if (status == 'running' || status == 'registered') {
      // ブラインドタイマー画面に遷移
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => BlindTimerPage(
            tournamentId: tournament['id'],
          ),
        ),
      );
    } else {
      // テーブルホーム画面に遷移
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => TableHomeInScheduledTournament(
            tournamentId: tournament['id'],
            tableId: 'default', // デフォルトテーブルID
          ),
        ),
      );
    }
  }
}
