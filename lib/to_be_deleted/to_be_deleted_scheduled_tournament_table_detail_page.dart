// このファイルは削除予定です。動作確認後に削除してください。
// 削除理由: Runtime Debug機能/未使用/機能重複のため不要と判断されました。

/*
import 'package:flutter/material.dart';
import '../repositories/firestore_scheduled_tournament_repository.dart';
import '../widgets/table_seat_cell.dart';
import '../models/table_seats.dart';

class ScheduledTournamentTableDetailPage extends StatefulWidget {
  final String tournamentId;
  final String tableId;

  const ScheduledTournamentTableDetailPage({
    super.key,
    required this.tournamentId,
    required this.tableId,
  });

  @override
  State<ScheduledTournamentTableDetailPage> createState() => _ScheduledTournamentTableDetailPageState();
}

class _ScheduledTournamentTableDetailPageState extends State<ScheduledTournamentTableDetailPage> {
  late final FirestoreScheduledTournamentRepository _repository;
  late final Stream<TableSeats> _tableSeatsStream;

  @override
  void initState() {
    super.initState();
    _repository = FirestoreScheduledTournamentRepository();
    _repository.initialize(widget.tournamentId);
    _tableSeatsStream = _repository.getTableSeatsStream(widget.tournamentId, widget.tableId);
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
        title: Text('テーブル ${widget.tableId}'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
      ),
              body: StreamBuilder<TableSeats>(
          stream: _tableSeatsStream,
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
                  Text('卓データを読み込み中...'),
                ],
              ),
            );
          }

          final tableSeats = snapshot.data!;
          final seats = tableSeats.seats;
          
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // テーブル情報ヘッダー
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'テーブル ${widget.tableId}',
                          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.bold,
                            color: Colors.blue,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Icon(Icons.event_seat, color: Colors.grey[600]),
                            const SizedBox(width: 8),
                            Text(
                              '座席数: ${seats.length}',
                              style: TextStyle(
                                fontSize: 16,
                                color: Colors.grey[600],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Icon(Icons.person, color: Colors.grey[600]),
                            const SizedBox(width: 8),
                            Text(
                              '着席中: ${seats.values.where((seat) => seat != null).length}',
                              style: TextStyle(
                                fontSize: 16,
                                color: Colors.grey[600],
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                
                const SizedBox(height: 24),
                
                // 座席グリッド
                Text(
                  '座席配置',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 16),
                
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    childAspectRatio: 1.0,
                    crossAxisSpacing: 8,
                    mainAxisSpacing: 8,
                  ),
                  itemCount: seats.length,
                  itemBuilder: (context, index) {
                    final seatNo = index + 1;
                    final seatNoStr = seatNo.toString().padLeft(2, '0');
                    final userId = seats['seat${seatNoStr}UserId'] as String?;
                    final pokerName = seats['seat${seatNoStr}PokerName'] as String?;
                    final isOccupied = userId != null;
                    
                    return TableSeatCell(
                      seatNo: seatNo,
                      userId: userId,
                      pokerName: pokerName,
                      isOccupied: isOccupied,
                    );
                  },
                ),
                
                const SizedBox(height: 24),
                
                // 座席詳細リスト
                Text(
                  '座席詳細',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 16),
                
                ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: seats.length,
                  itemBuilder: (context, index) {
                    final seatNo = index + 1;
                    final seatNoStr = seatNo.toString().padLeft(2, '0');
                    final userId = seats['seat${seatNoStr}UserId'] as String?;
                    final isOccupied = userId != null;
                    
                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: isOccupied ? Colors.blue : Colors.grey,
                          child: Text(
                            seatNo.toString(),
                            style: TextStyle(
                              color: isOccupied ? Colors.white : Colors.grey[600],
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        title: Text(
                          isOccupied ? '座席 $seatNo' : '座席 $seatNo (空席)',
                          style: TextStyle(
                            fontWeight: isOccupied ? FontWeight.bold : FontWeight.normal,
                          ),
                        ),
                        subtitle: Text(
                          isOccupied ? 'ユーザー: ${(seats['seat${seatNo.toString().padLeft(2, '0')}PokerName'] as String?) ?? userId}' : '空席',
                          style: TextStyle(
                            color: isOccupied ? Colors.blue : Colors.grey[600],
                          ),
                        ),
                        trailing: Icon(
                          isOccupied ? Icons.person : Icons.event_seat,
                          color: isOccupied ? Colors.blue : Colors.grey,
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
*/
