import '../models/main_view.dart';
import '../models/table_seats.dart';
import '../models/waiting_list.dart';

/// スケジュール済みトーナメントのリポジトリインターフェース
abstract class ScheduledTournamentRepositoryInterface {
  /// リポジトリを初期化
  void initialize(String tournamentId);
  
  /// リソースを解放
  void dispose();
  
  /// MainViewのストリームを取得
  Stream<MainView> getMainViewStream(String tournamentId);
  
  /// 特定の卓の座席ストリームを取得
  Stream<TableSeats> getTableSeatsStream(String tournamentId, String tableId);
  
  /// 全卓の座席ストリームを取得
  Stream<Map<String, TableSeats>> getAllTableSeatsStream(String tournamentId);
  
  /// 待機リストのストリームを取得
  Stream<WaitingList> getWaitingListStream(String tournamentId);
}
