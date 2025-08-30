import 'package:flutter/material.dart';
import '../repositories/firestore_scheduled_tournament_repository.dart';
import '../widgets/waiting_list_view.dart';
import '../models/waiting_list.dart';

class ScheduledTournamentWaitingPage extends StatefulWidget {
  final String tournamentId;

  const ScheduledTournamentWaitingPage({
    super.key,
    required this.tournamentId,
  });

  @override
  State<ScheduledTournamentWaitingPage> createState() => _ScheduledTournamentWaitingPageState();
}

class _ScheduledTournamentWaitingPageState extends State<ScheduledTournamentWaitingPage> {
  late final FirestoreScheduledTournamentRepository _repository;
  late final Stream<WaitingList> _waitingListStream;

  @override
  void initState() {
    super.initState();
    _repository = FirestoreScheduledTournamentRepository();
    _repository.initialize(widget.tournamentId);
    _waitingListStream = _repository.getWaitingListStream(widget.tournamentId);
  }

  @override
  void dispose() {
    _repository.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('待機リスト #${widget.tournamentId}'),
        backgroundColor: Colors.orange,
        foregroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: '更新',
            onPressed: () {
              setState(() {});
            },
          ),
        ],
      ),
              body: StreamBuilder<WaitingList>(
          stream: _waitingListStream,
          builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error, size: 64, color: Colors.red),
                  const SizedBox(height: 16),
                  Text(
                    'エラーが発生しました: ${snapshot.error}',
                    style: const TextStyle(color: Colors.red),
                  ),
                ],
              ),
            );
          }

          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('待機リストを読み込み中...'),
                ],
              ),
            );
          }

          final waitingList = snapshot.data!;
          
          return SingleChildScrollView(
            child: Column(
              children: [
                WaitingListView(waitingList: waitingList),
                
                // アクションボタン
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    children: [
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: () {
                            _showAddWaitingUserDialog(context);
                          },
                          icon: const Icon(Icons.person_add),
                          label: const Text('待機リストに追加'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.orange,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: () {
                            _showRemoveWaitingUserDialog(context, waitingList);
                          },
                          icon: const Icon(Icons.person_remove),
                          label: const Text('待機リストから削除'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.red,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }



  // 待機リストに追加するダイアログ
  void _showAddWaitingUserDialog(BuildContext context) {
    final textController = TextEditingController();
    
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('待機リストに追加'),
          content: TextField(
            controller: textController,
            decoration: const InputDecoration(
              labelText: 'ユーザーID',
              hintText: '例: user123',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: () {
                if (textController.text.isNotEmpty) {
                  // ここで実際の追加処理を行う（後フェーズで実装）
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('${textController.text}を待機リストに追加しました'),
                    ),
                  );
                  Navigator.of(context).pop();
                }
              },
              child: const Text('追加'),
            ),
          ],
        );
      },
    );
  }

  // 待機リストから削除するダイアログ
  void _showRemoveWaitingUserDialog(BuildContext context, WaitingList waitingList) {
    final waitingUsers = waitingList.waitingUserIds;
    
    if (waitingUsers.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('待機リストが空です')),
      );
      return;
    }
    
    String? selectedUserId;
    
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('待機リストから削除'),
          content: StatefulBuilder(
            builder: (BuildContext context, StateSetter setState) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('削除するユーザーを選択してください:'),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    value: selectedUserId,
                    decoration: const InputDecoration(
                      labelText: 'ユーザー',
                      border: OutlineInputBorder(),
                    ),
                    items: waitingUsers.map((userId) {
                      return DropdownMenuItem(
                        value: userId,
                        child: Text(userId),
                      );
                    }).toList(),
                    onChanged: (value) {
                      setState(() {
                        selectedUserId = value;
                      });
                    },
                  ),
                ],
              );
            },
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: selectedUserId != null ? () {
                // ここで実際の削除処理を行う（後フェーズで実装）
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('$selectedUserIdを待機リストから削除しました'),
                  ),
                );
                Navigator.of(context).pop();
              } : null,
              child: const Text('削除'),
            ),
          ],
        );
      },
    );
  }
}
