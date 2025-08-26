// 待機者情報のダミーデータ
// TODO: 今後、scheduledTournamentのusersサブコレクションから取得するように置き換え予定

class DummyWaitingPlayer {
  final String userId;
  final String displayName;
  final int waitingMinutes;
  final DateTime joinedAt;

  DummyWaitingPlayer({
    required this.userId,
    required this.displayName,
    required this.waitingMinutes,
    required this.joinedAt,
  });
}

// ダミーの待機者リスト
final List<DummyWaitingPlayer> dummyWaitingPlayers = [
  DummyWaitingPlayer(
    userId: 'user001',
    displayName: '田中太郎',
    waitingMinutes: 25,
    joinedAt: DateTime.now().subtract(const Duration(minutes: 25)),
  ),
  DummyWaitingPlayer(
    userId: 'user002',
    displayName: '佐藤花子',
    waitingMinutes: 18,
    joinedAt: DateTime.now().subtract(const Duration(minutes: 18)),
  ),
  DummyWaitingPlayer(
    userId: 'user003',
    displayName: '鈴木一郎',
    waitingMinutes: 32,
    joinedAt: DateTime.now().subtract(const Duration(minutes: 32)),
  ),
  DummyWaitingPlayer(
    userId: 'user004',
    displayName: '高橋美咲',
    waitingMinutes: 15,
    joinedAt: DateTime.now().subtract(const Duration(minutes: 15)),
  ),
  DummyWaitingPlayer(
    userId: 'user005',
    displayName: '渡辺健太',
    waitingMinutes: 28,
    joinedAt: DateTime.now().subtract(const Duration(minutes: 28)),
  ),
];

// テーブル情報のダミーデータ
class DummyTable {
  final String tableId;
  final String name;
  final int maxSeats;
  final String status;
  final bool isOpen;

  DummyTable({
    required this.tableId,
    required this.name,
    required this.maxSeats,
    required this.status,
    required this.isOpen,
  });
}

// ダミーのテーブルリスト
final List<DummyTable> dummyTables = [
  DummyTable(
    tableId: 'table001',
    name: 'テーブル1',
    maxSeats: 6,
    status: 'open',
    isOpen: true,
  ),
  DummyTable(
    tableId: 'table002',
    name: 'テーブル2',
    maxSeats: 8,
    status: 'tournament',
    isOpen: false,
  ),
  DummyTable(
    tableId: 'table003',
    name: 'テーブル3',
    maxSeats: 6,
    status: 'open',
    isOpen: true,
  ),
  DummyTable(
    tableId: 'table004',
    name: 'テーブル4',
    maxSeats: 8,
    status: 'sideGame',
    isOpen: false,
  ),
  DummyTable(
    tableId: 'table005',
    name: 'テーブル5',
    maxSeats: 6,
    status: 'open',
    isOpen: true,
  ),
];
