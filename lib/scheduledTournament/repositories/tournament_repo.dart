import 'package:cloud_firestore/cloud_firestore.dart';
import '../model/runtime_main.dart';

/// トーナメント関連のFirestore操作を管理するリポジトリ
class TournamentRepository {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// トーナメントのRuntime状態を監視するStream
  /// scheduledTournament/{tid}/views/runtime ドキュメントを監視
  Stream<RuntimeMain?> watchRuntime(String tournamentId) {
    print('=== TournamentRepository.watchRuntime ===');
    print('Tournament ID: $tournamentId');
    print('Firestore Path: scheduledTournaments/$tournamentId/views/runtime');
    print('=========================================');
    
    return _firestore
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('runtime')
        .snapshots()
        .map((snapshot) {
      print('=== Firestore Snapshot ===');
      print('Exists: ${snapshot.exists}');
      print('Has Data: ${snapshot.data() != null}');
      print('Metadata: ${snapshot.metadata}');
      print('========================');
      
      if (!snapshot.exists) {
        print('Runtime document does not exist');
        return null;
      }
      
      try {
        final runtime = RuntimeMain.fromFirestore(snapshot);
        print('Runtime created successfully: ${runtime.status}');
        return runtime;
      } catch (e) {
        print('Error creating RuntimeMain: $e');
        rethrow;
      }
    });
  }

  /// トーナメントのRuntime状態を一度だけ取得
  Future<RuntimeMain?> getRuntime(String tournamentId) async {
    print('=== TournamentRepository.getRuntime ===');
    print('Tournament ID: $tournamentId');
    print('Firestore Path: scheduledTournaments/$tournamentId/views/runtime');
    print('======================================');
    
    try {
      final snapshot = await _firestore
          .collection('scheduledTournaments')
          .doc(tournamentId)
          .collection('views')
          .doc('runtime')
          .get();

      print('=== Firestore Get Result ===');
      print('Exists: ${snapshot.exists}');
      print('Has Data: ${snapshot.data() != null}');
      print('Metadata: ${snapshot.metadata}');
      print('============================');

      if (!snapshot.exists) {
        print('Runtime document does not exist');
        return null;
      }
      
      final runtime = RuntimeMain.fromFirestore(snapshot);
      print('Runtime created successfully: ${runtime.status}');
      return runtime;
    } catch (e) {
      print('Error in getRuntime: $e');
      rethrow;
    }
  }

  /// トーナメントのRuntime状態を初期化（新規作成）
  /// 注意: このメソッドは通常、Cloud Functionsから呼び出される
  Future<void> initializeRuntime(String tournamentId) async {
    final runtimeRef = _firestore
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('runtime');

    final initialRuntime = RuntimeMain.initial();
    
    await runtimeRef.set(initialRuntime.toFirestore());
  }

  /// トーナメントのRuntime状態を更新
  /// 注意: このメソッドは通常、Cloud Functionsから呼び出される
  Future<void> updateRuntime(String tournamentId, RuntimeMain runtime) async {
    final runtimeRef = _firestore
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('views')
        .doc('runtime');

    await runtimeRef.update(runtime.toFirestore());
  }

  /// トーナメントの存在確認
  Future<bool> tournamentExists(String tournamentId) async {
    final snapshot = await _firestore
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .get();
    
    return snapshot.exists;
  }

  /// トーナメントの基本情報を取得
  Future<Map<String, dynamic>?> getTournamentInfo(String tournamentId) async {
    final snapshot = await _firestore
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .get();

    if (!snapshot.exists) {
      return null;
    }
    
    return snapshot.data();
  }
}
