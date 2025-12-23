import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:amuse_app_template/tournament/active/models/table_and_users.dart';
import 'package:amuse_app_template/tournament/active/models/waiting_user_data.dart';

class TournamentDataService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseFunctions _functions = FirebaseFunctions.instance;

  /// トーナメントのテーブル情報を取得
  Future<List<TournamentTable>> getTournamentTables(String tournamentId) async {
    try {
      final tablesSeatSnapshot = await _firestore
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('tablesSeat')
          .get();

      final tables = <TournamentTable>[];
      
      for (final doc in tablesSeatSnapshot.docs) {
        if (doc.id == 'waiting') continue; // 待機者リストは除外
        
        final data = doc.data();
        if (data['isEnabled'] == true) {
          // テーブルの基本情報を取得
          final tableDoc = await _firestore
              .collection('tables')
              .doc(doc.id)
              .get();
          
          if (tableDoc.exists) {
            final tableData = tableDoc.data()!;
            final tournamentTable = TournamentTable.fromFirestore({
              ...tableData,
              ...data, // tablesSeatのデータで上書き
            }, doc.id);
            tables.add(tournamentTable);
          }
        }
      }
      
      return tables;
    } catch (e) {
      print('テーブル情報取得エラー: $e');
      return [];
    }
  }

  /// トーナメントの待機者リストを取得
  Future<List<WaitingPlayer>> getWaitingPlayers(String tournamentId) async {
    try {
      // 待機者リストを取得
      final waitingSnapshot = await _firestore
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('tablesSeat')
          .doc('waiting')
          .get();

      if (!waitingSnapshot.exists) return [];

      final waitingData = waitingSnapshot.data()!;
      final waiting = waitingData['waiting'];
      
      // 待機者の詳細情報を取得
      final waitingPlayers = <WaitingPlayer>[];
      
      // データ形式をチェックして適切に処理
      if (waiting is Map) {
        // ハイブリッド形式の場合
        final waitingList = Map<String, dynamic>.from(waiting);
        
        for (final userId in waitingList.keys) {
          final value = waitingList[userId];
          
          if (value is Map<String, dynamic>) {
            // 新しい形式: WaitingUserData
            try {
              final waitingUserData = WaitingUserData.fromMap(value);
              final waitingPlayer = WaitingPlayer(
                userId: userId,
                displayName: waitingUserData.pokerName,
                joinedAt: waitingUserData.joinedAt,
              );
              waitingPlayers.add(waitingPlayer);
            } catch (e) {
              print('WaitingUserData変換エラー (userId: $userId): $e');
              // エラーが発生した場合はダミー情報で作成
              final waitingPlayer = WaitingPlayer(
                userId: userId,
                displayName: 'ユーザー$userId',
                joinedAt: DateTime.now().subtract(const Duration(minutes: 15)),
              );
              waitingPlayers.add(waitingPlayer);
            }
                      } else if (value == true) {
              // 旧形式: boolean (移行用)
              try {
                // activeStays からユーザー情報を取得
                final activeStayDoc = await _firestore
                    .collection('activeStays')
                    .doc(userId)
                    .get();
                
                if (activeStayDoc.exists && activeStayDoc.data()?['isActive'] == true) {
                  final activeStayData = activeStayDoc.data()!;
                  final pokerName = activeStayData['pokerName'] as String? ?? 'ユーザー$userId';
                  final startedAt = activeStayData['startedAt']?.toDate() ?? DateTime.now().subtract(const Duration(minutes: 15));
                  
                  final waitingPlayer = WaitingPlayer(
                    userId: userId,
                    displayName: pokerName,
                    joinedAt: startedAt,
                  );
                  waitingPlayers.add(waitingPlayer);
                } else {
                  // activeStays にユーザー情報がない場合はダミー情報で作成
                  final waitingPlayer = WaitingPlayer(
                    userId: userId,
                    displayName: 'ユーザー$userId',
                    joinedAt: DateTime.now().subtract(const Duration(minutes: 15)),
                  );
                  waitingPlayers.add(waitingPlayer);
                }
              } catch (e) {
                print('ユーザー情報取得エラー (userId: $userId): $e');
                // エラーが発生した場合もダミー情報で作成
                final waitingPlayer = WaitingPlayer(
                  userId: userId,
                  displayName: 'ユーザー$userId',
                  joinedAt: DateTime.now().subtract(const Duration(minutes: 15)),
                );
                waitingPlayers.add(waitingPlayer);
              }
            }
        }
      } else if (waiting is List) {
        // List形式の場合（旧形式、移行が必要）
        print('警告: List形式のwaitingデータが検出されました。移行が必要です。');
        for (final item in waiting) {
          if (item is Map<String, dynamic> && item['userId'] != null) {
            final userId = item['userId'] as String;
            final pokerName = item['pokerName'] as String? ?? 'ユーザー$userId';
            final joinedAt = item['joinedAt']?.toDate() ?? DateTime.now().subtract(const Duration(minutes: 15));
            
            final waitingPlayer = WaitingPlayer(
              userId: userId,
              displayName: pokerName,
              joinedAt: joinedAt,
            );
            waitingPlayers.add(waitingPlayer);
          }
        }
      }
      
      // 待機時間でソート（長い順）
      waitingPlayers.sort((a, b) => b.waitingMinutes.compareTo(a.waitingMinutes));
      
      return waitingPlayers;
    } catch (e) {
      print('待機者リスト取得エラー: $e');
      return [];
    }
  }

  /// トーナメントのユーザー情報を取得
  Future<List<TournamentUser>> getTournamentUsers(String tournamentId) async {
    try {
      final usersSnapshot = await _firestore
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('users')
          .get();

      final users = <TournamentUser>[];
      
      for (final doc in usersSnapshot.docs) {
        final userData = doc.data();
        final user = TournamentUser.fromFirestore(userData, doc.id);
        users.add(user);
      }
      
      return users;
    } catch (e) {
      print('ユーザー情報取得エラー: $e');
      return [];
    }
  }

  /// 利用可能なテーブル（status: 'open'）を取得
  Future<List<Map<String, dynamic>>> getAvailableTables() async {
    try {
      print('=== Cloud Functions経由でテーブル取得開始 ===');
      
      // Cloud Functions経由でテーブル情報を取得
      final result = await _functions
          .httpsCallable('getAvailableTables')
          .call({});
      
      print('Cloud Functions レスポンス: ${result.data}');
      print('レスポンスの型: ${result.data.runtimeType}');
      print('tablesフィールドの型: ${result.data['tables'].runtimeType}');
      if (result.data['tables'] is List) {
        print('tablesリストの要素数: ${(result.data['tables'] as List).length}');
        if ((result.data['tables'] as List).isNotEmpty) {
          print('最初の要素の型: ${(result.data['tables'] as List).first.runtimeType}');
        }
      }
      
      if (result.data['success'] == true) {
        final tablesList = result.data['tables'] as List;
        final tables = tablesList.map((item) {
          if (item is Map) {
            // Map<Object?, Object?> を Map<String, dynamic> に変換
            return Map<String, dynamic>.from(item);
          } else {
            print('予期しないデータ型: ${item.runtimeType}');
            return <String, dynamic>{};
          }
        }).where((map) => map.isNotEmpty).toList();
        
        print('取得したテーブル数: ${tables.length}');
        return tables;
      } else {
        print('Cloud Functions エラー: ${result.data['error']}');
        return [];
      }
    } catch (e) {
      print('利用可能テーブル取得エラー: $e');
      return [];
    }
  }

  /// データをリフレッシュ（操作後の再読み込み）
  Future<Map<String, dynamic>> refreshTournamentData(String tournamentId) async {
    try {
      final tables = await getTournamentTables(tournamentId);
      final waitingPlayers = await getWaitingPlayers(tournamentId);
      final users = await getTournamentUsers(tournamentId);
      
      return {
        'tables': tables,
        'waitingPlayers': waitingPlayers,
        'users': users,
        'success': true,
      };
    } catch (e) {
      print('データリフレッシュエラー: $e');
      return {
        'success': false,
        'error': e.toString(),
      };
    }
  }
}
