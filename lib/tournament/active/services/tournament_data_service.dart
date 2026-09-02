import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/tournament/active/models/table_and_users.dart';
import 'package:amuse_app_template/tournament/active/models/waiting_user_data.dart';
import 'package:amuse_app_template/tournament/active/models/okibake_temporary_entry.dart';
import 'package:amuse_app_template/tournament/active/utils/available_tables_filter.dart';

class TournamentDataService {
  TournamentDataService({FirebaseFirestore? firestore})
      : _firestoreOverride = firestore;

  final FirebaseFirestore? _firestoreOverride;

  FirebaseFirestore get _firestore =>
      _firestoreOverride ?? FirebaseFirestore.instance;

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
      // 空配列へ変換しない（読込失敗を「卓なし」と誤認させない）
      rethrow;
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
      // 空配列へ変換しない（読込失敗を「待機者なし」と誤認させない）
      rethrow;
    }
  }

  /// Phase2: `entryStatus == registered` の一時行から、待機表示用の [WaitingPlayer] に変換する（`billLinkStatus` はクライアントで `unlinked` のみ採用）。
  Future<List<WaitingPlayer>> getOkibakeTemporaryWaitingPlayers(String tournamentId) async {
    try {
      final snapshot = await _firestore
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('okibakeTemporaryEntries')
          .where('entryStatus', isEqualTo: 'registered')
          .get();

      final out = <WaitingPlayer>[];
      for (final doc in snapshot.docs) {
        final entry = OkibakeTemporaryEntry.fromDoc(doc);
        if (!entry.isWaitingUnlinked) continue;
        out.add(
          WaitingPlayer.okibakeTemporary(
            okibakeEntryId: entry.okibakeEntryId,
            displayName: entry.waitingListDisplayName,
            createdAt: entry.createdAt ?? DateTime.now(),
            okibakeAddonCount: entry.okibakeAddonCount,
            billLinkStatus: entry.billLinkStatus,
            linkedUserId: entry.linkedUserId,
            addonIntent: entry.addonIntent,
          ),
        );
      }
      return out;
    } catch (e) {
      print('オキバケ一時参加者リスト取得エラー: $e');
      rethrow;
    }
  }

  /// 全員リシート候補用: `registered` / `seated` の置きバケ一時参加者を取得する。
  Future<List<OkibakeTemporaryEntry>> getOkibakeTemporaryEntriesForReseat(
    String tournamentId,
  ) async {
    try {
      final snapshot = await _firestore
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('okibakeTemporaryEntries')
          .where('entryStatus', whereIn: ['registered', 'seated'])
          .get();

      return snapshot.docs
          .map(OkibakeTemporaryEntry.fromDoc)
          .where((e) => e.isReseatCandidate)
          .toList();
    } catch (e) {
      print('オキバケ一時参加者（リシート候補）取得エラー: $e');
      rethrow;
    }
  }

  /// 通常の待機リストと置きバケ一時参加者（未リンク）を統合し、[joinedAt] 降順で返す。
  Future<List<WaitingPlayer>> getMergedWaitingPlayers(String tournamentId) async {
    final regular = await getWaitingPlayers(tournamentId);
    final okibake = await getOkibakeTemporaryWaitingPlayers(tournamentId);
    final merged = <WaitingPlayer>[...regular, ...okibake];
    merged.sort((a, b) => b.joinedAt.compareTo(a.joinedAt));
    return merged;
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
      rethrow;
    }
  }

  /// 利用可能なテーブル（status: 'open'）を取得。
  /// [tournamentId] の tablesSeat に有効登録済み（`isEnabled != false`）の卓は除外する。
  /// 論理削除済み（`isEnabled: false`）の卓は再追加候補に含める。
  Future<List<Map<String, dynamic>>> getAvailableTables(
    String tournamentId,
  ) async {
    try {
      final snapshot = await _firestore
          .collection('tables')
          .where('status', isEqualTo: 'open')
          .get();

      final tablesSeatSnap = await _firestore
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('tablesSeat')
          .get();

      final registeredTableIds = activeRegisteredTableIdsFromTablesSeat(
        tablesSeatSnap.docs.map(
          (doc) => MapEntry(doc.id, doc.data()),
        ),
      );

      final tables = snapshot.docs
          .where((doc) => !registeredTableIds.contains(doc.id))
          .map((doc) {
        final data = doc.data();
        return <String, dynamic>{
          'tableId': doc.id,
          'name': doc.id,
          'maxSeats': data['maxSeats'] ?? 6,
          'status': data['status'] ?? 'open',
        };
      }).toList();

      return tables;
    } catch (e) {
      print('利用可能テーブル取得エラー: $e');
      rethrow;
    }
  }

  /// データをリフレッシュ（操作後の再読み込み）
  ///
  /// 下位の必須取得が失敗した場合は [success] == false を返す。
  /// 空配列への変換は行わない（正常な 0 件と誤認させない）。
  /// 戻り値に raw exception 文字列は載せない。
  Future<Map<String, dynamic>> refreshTournamentData(String tournamentId) async {
    try {
      final tables = await getTournamentTables(tournamentId);
      final waitingPlayers = await getMergedWaitingPlayers(tournamentId);
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
      };
    }
  }
}
