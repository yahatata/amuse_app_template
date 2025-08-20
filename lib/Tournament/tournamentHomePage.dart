import 'package:flutter/material.dart';
import 'tournamentTemplateList.dart';

class TournamentHomePage extends StatefulWidget {
  const TournamentHomePage({super.key});

  @override
  State<TournamentHomePage> createState() => _TournamentHomePageState();
}

class _TournamentHomePageState extends State<TournamentHomePage> {
  List<Map<String, dynamic>> _upcomingTournaments = [];
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadUpcomingTournaments();
  }

  /// 開催予定のトーナメントを読み込む
  Future<void> _loadUpcomingTournaments() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      // TODO: Firestoreから開催予定のトーナメントを取得
      // 現在はダミーデータを使用
      await Future.delayed(const Duration(milliseconds: 500));
      
      setState(() {
        _upcomingTournaments = [
          {
            'id': '1',
            'name': '週末トーナメント',
            'date': DateTime.now().add(const Duration(days: 2)),
            'status': 'upcoming',
            'participants': 0,
            'maxParticipants': 20,
          },
          {
            'id': '2',
            'name': '月曜夜トーナメント',
            'date': DateTime.now().add(const Duration(days: 5)),
            'status': 'upcoming',
            'participants': 5,
            'maxParticipants': 15,
          },
        ];
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = 'トーナメント情報の取得に失敗しました';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('トーナメント管理'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(_errorMessage!, style: const TextStyle(color: Colors.red)),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadUpcomingTournaments,
                        child: const Text('再試行'),
                      ),
                    ],
                  ),
                )
              : Column(
                  children: [
                    // 開催予定トーナメント一覧
                    Expanded(
                      child: _upcomingTournaments.isEmpty
                          ? const Center(
                              child: Text(
                                '開催予定のトーナメントはありません',
                                style: TextStyle(fontSize: 16, color: Colors.grey),
                              ),
                            )
                          : ListView.builder(
                              padding: const EdgeInsets.all(16),
                              itemCount: _upcomingTournaments.length,
                              itemBuilder: (context, index) {
                                final tournament = _upcomingTournaments[index];
                                return Card(
                                  margin: const EdgeInsets.only(bottom: 12),
                                  child: ListTile(
                                    title: Text(
                                      tournament['name'],
                                      style: const TextStyle(fontWeight: FontWeight.bold),
                                    ),
                                    subtitle: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          '開催日: ${_formatDate(tournament['date'])}',
                                          style: const TextStyle(color: Colors.grey),
                                        ),
                                        Text(
                                          '参加者: ${tournament['participants']}/${tournament['maxParticipants']}',
                                          style: const TextStyle(color: Colors.blue),
                                        ),
                                      ],
                                    ),
                                    trailing: const Icon(Icons.arrow_forward_ios),
                                    onTap: () {
                                      // TODO: トーナメント詳細ページへの遷移
                                    },
                                  ),
                                );
                              },
                            ),
                    ),
                    // テンプレート管理ボタン
                    Container(
                      padding: const EdgeInsets.all(16),
                      child: SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (context) => const TournamentTemplateList(),
                              ),
                            );
                          },
                          icon: const Icon(Icons.list_alt),
                          label: const Text('トーナメントテンプレート管理'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.green,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          // TODO: 新規トーナメント作成ページへの遷移
        },
        backgroundColor: Colors.orange,
        foregroundColor: Colors.white,
        child: const Icon(Icons.add),
      ),
    );
  }

  /// 日付をフォーマットする
  String _formatDate(DateTime date) {
    return '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}';
  }
}
