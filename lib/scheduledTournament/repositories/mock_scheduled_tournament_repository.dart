import 'dart:async';
import 'dart:math';
import '../models/main_view.dart';
import '../models/table_seats.dart';
import '../models/waiting_list.dart';
import '../models/seat_data.dart';
import '../models/waiting_user_data.dart';
import 'scheduled_tournament_repository_interface.dart';

class MockScheduledTournamentRepository implements ScheduledTournamentRepositoryInterface {
  static final MockScheduledTournamentRepository _instance = MockScheduledTournamentRepository._internal();
  factory MockScheduledTournamentRepository() => _instance;
  MockScheduledTournamentRepository._internal();

  // Mockデータ
  late MainView _mainView;
  late Map<String, TableSeats> _tableSeats;
  late WaitingList _waitingList;
  
  // 擬似タイマー
  Timer? _mockTimer;
  final Random _random = Random();

  // 初期化
  @override
  void initialize(String tournamentId) {
    _mainView = MainView(
      entries: 24,
      reentries: 3,
      addons: 2,
      playersIn: 29,
      playersBusted: 8,
      seatedCount: 21,
      waitingCount: 8,
      currentLevel: 3,
      levelEndsAt: DateTime.now().add(const Duration(minutes: 15)),
      lastEventAt: DateTime.now(),
    );

    _tableSeats = {
      'table1': TableSeats(
        tableId: 'table1',
        seats: {
          1: SeatData(userId: 'user1', pokerName: '田中太郎'),
          2: SeatData(userId: 'user2', pokerName: '佐藤花子'),
          3: SeatData(userId: 'user3', pokerName: '鈴木一郎'),
          4: SeatData(userId: 'user4', pokerName: '高橋美咲'),
          5: SeatData(userId: 'user5', pokerName: '渡辺健太'),
          6: SeatData(userId: 'user6', pokerName: '伊藤恵子'),
          7: null,
          8: null,
          9: null,
        },
        updatedAt: DateTime.now(),
      ),
      'table2': TableSeats(
        tableId: 'table2',
        seats: {
          1: SeatData(userId: 'user7', pokerName: '山田太郎'),
          2: SeatData(userId: 'user8', pokerName: '中村花子'),
          3: SeatData(userId: 'user9', pokerName: '小林一郎'),
          4: SeatData(userId: 'user10', pokerName: '加藤美咲'),
          5: SeatData(userId: 'user11', pokerName: '吉田健太'),
          6: SeatData(userId: 'user12', pokerName: '松本恵子'),
          7: SeatData(userId: 'user13', pokerName: '井上太郎'),
          8: null,
          9: null,
        },
        updatedAt: DateTime.now(),
      ),
      'table3': TableSeats(
        tableId: 'table3',
        seats: {
          1: SeatData(userId: 'user14', pokerName: '斎藤太郎'),
          2: SeatData(userId: 'user15', pokerName: '山口花子'),
          3: SeatData(userId: 'user16', pokerName: '森一郎'),
          4: SeatData(userId: 'user17', pokerName: '池田美咲'),
          5: SeatData(userId: 'user18', pokerName: '橋本健太'),
          6: SeatData(userId: 'user19', pokerName: '阿部恵子'),
          7: SeatData(userId: 'user20', pokerName: '石川太郎'),
          8: SeatData(userId: 'user21', pokerName: '山下花子'),
          9: null,
        },
        updatedAt: DateTime.now(),
      ),
    };

    _waitingList = WaitingList(
      waiting: {
        'user22': WaitingUserData(pokerName: '佐々木太郎', joinedAt: DateTime.now().subtract(const Duration(minutes: 30)), order: 1),
        'user23': WaitingUserData(pokerName: '田中美咲', joinedAt: DateTime.now().subtract(const Duration(minutes: 25)), order: 2),
        'user24': WaitingUserData(pokerName: '木村一郎', joinedAt: DateTime.now().subtract(const Duration(minutes: 20)), order: 3),
        'user25': WaitingUserData(pokerName: '清水花子', joinedAt: DateTime.now().subtract(const Duration(minutes: 15)), order: 4),
        'user26': WaitingUserData(pokerName: '山本健太', joinedAt: DateTime.now().subtract(const Duration(minutes: 10)), order: 5),
        'user27': WaitingUserData(pokerName: '林恵子', joinedAt: DateTime.now().subtract(const Duration(minutes: 5)), order: 6),
        'user28': WaitingUserData(pokerName: '福田太郎', joinedAt: DateTime.now().subtract(const Duration(minutes: 2)), order: 7),
        'user29': WaitingUserData(pokerName: '西村花子', joinedAt: DateTime.now().subtract(const Duration(minutes: 1)), order: 8),
      },
      count: 8,
      updatedAt: DateTime.now(),
    );

    _startMockTimer();
  }

  void _startMockTimer() {
    _mockTimer?.cancel();
    _mockTimer = Timer.periodic(const Duration(seconds: 3), (timer) {
      _updateMockData();
    });
  }

  void _updateMockData() {
    // MainViewの擬似更新
    _mainView = _mainView.copyWith(
      currentLevel: _mainView.currentLevel + (_random.nextBool() ? 1 : 0),
      levelEndsAt: DateTime.now().add(Duration(minutes: _random.nextInt(20) + 10)),
      lastEventAt: DateTime.now(),
      seatedCount: _mainView.seatedCount + (_random.nextBool() ? 1 : -1),
      waitingCount: _mainView.waitingCount + (_random.nextBool() ? 1 : -1),
    );

    // 座席の擬似更新
    _tableSeats.forEach((tableId, tableSeat) {
      final seats = Map<int, SeatData?>.from(tableSeat.seats);
      if (_random.nextBool()) {
        // ランダムに座席を変更
        final seatNo = _random.nextInt(9) + 1;
        if (seats[seatNo] != null) {
          seats[seatNo] = null; // 空席にする
        } else {
          final userId = 'user${_random.nextInt(50) + 1}';
          seats[seatNo] = SeatData(userId: userId, pokerName: 'ユーザー$userId'); // 新しいユーザーを座らせる
        }
      }
      _tableSeats[tableId] = tableSeat.copyWith(
        seats: seats,
        updatedAt: DateTime.now(),
      );
    });

    // 待機リストの擬似更新
    if (_random.nextBool()) {
      final userId = 'user${_random.nextInt(50) + 1}';
      if (_waitingList.isUserWaiting(userId)) {
        _waitingList = _waitingList.removeUser(userId);
      } else {
        _waitingList = _waitingList.addUser(userId, pokerName: 'ユーザー$userId');
      }
    }
  }

  // MainViewのストリーム
  @override
  Stream<MainView> getMainViewStream(String tournamentId) {
    return Stream.periodic(const Duration(seconds: 3), (i) => _mainView);
  }

  // 特定の卓の座席ストリーム
  @override
  Stream<TableSeats> getTableSeatsStream(String tournamentId, String tableId) {
    return Stream.periodic(const Duration(seconds: 3), (i) {
      return _tableSeats[tableId] ?? TableSeats(
        tableId: tableId,
        seats: {},
        updatedAt: DateTime.now(),
      );
    });
  }

  // 全卓の座席ストリーム
  @override
  Stream<Map<String, TableSeats>> getAllTableSeatsStream(String tournamentId) {
    return Stream.periodic(const Duration(seconds: 3), (i) => _tableSeats);
  }

  // 待機リストのストリーム
  @override
  Stream<WaitingList> getWaitingListStream(String tournamentId) {
    return Stream.periodic(const Duration(seconds: 3), (i) => _waitingList);
  }

  // リソース解放
  @override
  void dispose() {
    _mockTimer?.cancel();
  }
}
