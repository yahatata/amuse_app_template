// このファイルは削除予定です。動作確認後に削除してください。
// 削除理由: Runtime Debug機能/未使用/機能重複のため不要と判断されました。

/*
import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/main_view.dart';
import '../models/table_seats.dart';
import '../models/waiting_list.dart';
import '../models/waiting_user_data.dart';


/// Firestoreを使用したスケジュール済みトーナメントのリポジトリ実装
class FirestoreScheduledTournamentRepository {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  StreamSubscription<DocumentSnapshot>? _mainViewSubscription;
  StreamSubscription<QuerySnapshot>? _tableSeatsSubscription;
  StreamSubscription<DocumentSnapshot>? _waitingListSubscription;
  
  // 現在のトーナメントID（将来的な拡張用）
  // String? _currentTournamentId;

  void initialize(String tournamentId) {
    // _currentTournamentId = tournamentId;
  }

  void dispose() {
    _mainViewSubscription?.cancel();
    _tableSeatsSubscription?.cancel();
    _waitingListSubscription?.cancel();
    // _currentTournamentId = null;
  }

  Stream<MainView> getMainViewStream(String tournamentId) {
    return _firestore
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('main')
        .snapshots()
        .map((snapshot) {
      if (!snapshot.exists) {
        // ドキュメントが存在しない場合はデフォルト値を返す
        return MainView(
          entries: 0,
          reentries: 0,
          addons: 0,
          playersIn: 0,
          playersBusted: 0,
          seatedCount: 0,
          waitingCount: 0,
          currentLevel: 1,
          levelEndsAt: null,
          lastEventAt: DateTime.now(),
        );
      }
      
      final data = snapshot.data()!;
      return MainView.fromMap(data);
    });
  }

  Stream<TableSeats> getTableSeatsStream(String tournamentId, String tableId) {
    return _firestore
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .snapshots()
        .map((snapshot) {
      if (!snapshot.exists) {
        // ドキュメントが存在しない場合は空の座席を返す
        return TableSeats(
          tableId: tableId,
          seats: {},
          updatedAt: DateTime.now(),
        );
      }
      
      final data = snapshot.data()!;
      return TableSeats.fromMap(data);
    });
  }

  Stream<Map<String, TableSeats>> getAllTableSeatsStream(String tournamentId) {
    return _firestore
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .snapshots()
        .map((snapshot) {
      final Map<String, TableSeats> tableSeats = {};
      
      for (final doc in snapshot.docs) {
        if (doc.id != 'waiting') { // waitingは除外（別途取得）
          final data = doc.data();
          data['tableId'] = doc.id; // tableIdを追加
          tableSeats[doc.id] = TableSeats.fromMap(data);
        }
      }
      
      return tableSeats;
    });
  }

  Stream<WaitingList> getWaitingListStream(String tournamentId) {
    return _firestore
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc('waiting')
        .snapshots()
        .map((snapshot) {
      if (!snapshot.exists) {
        // ドキュメントが存在しない場合は空の待機リストを返す
        return WaitingList(
          waiting: {},
          count: 0,
          updatedAt: DateTime.now(),
        );
      }
      
      final data = snapshot.data()!;
      return WaitingList.fromMap(data);
    });
  }
}
*/
