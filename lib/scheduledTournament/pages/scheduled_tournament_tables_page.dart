import 'package:flutter/material.dart';
import '../repositories/scheduled_tournament_repository_factory.dart';
import '../repositories/scheduled_tournament_repository_interface.dart';
import '../widgets/table_grid.dart';
import 'scheduled_tournament_table_detail_page.dart';
import '../models/table_seats.dart';

class ScheduledTournamentTablesPage extends StatefulWidget {
  final String tournamentId;

  const ScheduledTournamentTablesPage({
    super.key,
    required this.tournamentId,
  });

  @override
  State<ScheduledTournamentTablesPage> createState() => _ScheduledTournamentTablesPageState();
}

class _ScheduledTournamentTablesPageState extends State<ScheduledTournamentTablesPage> {
  late final ScheduledTournamentRepositoryInterface _repository;
  late final Stream<Map<String, TableSeats>> _tableSeatsStream;

  @override
  void initState() {
    super.initState();
    _repository = ScheduledTournamentRepositoryFactory.createFromEnvironment();
    _repository.initialize(widget.tournamentId);
    _tableSeatsStream = _repository.getAllTableSeatsStream(widget.tournamentId);
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
        title: Text('卓一覧 #${widget.tournamentId}'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
      ),
              body: StreamBuilder<Map<String, TableSeats>>(
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

          if (tableSeats.isEmpty) {
            return const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.table_restaurant, size: 64, color: Colors.grey),
                  SizedBox(height: 16),
                  Text(
                    '卓が設定されていません',
                    style: TextStyle(fontSize: 18, color: Colors.grey),
                  ),
                ],
              ),
            );
          }

          return TableGrid(
            tableSeats: tableSeats,
            onTableTap: (tableId) {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => ScheduledTournamentTableDetailPage(
                    tournamentId: widget.tournamentId,
                    tableId: tableId,
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
