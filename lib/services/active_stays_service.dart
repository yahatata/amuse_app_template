import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:async';

/// activeStays をアプリ全体で1本だけの単一長寿命リスナーで購読するサービス（シングルトン）
/// 内部で Firestore の snapshots() を1回だけ呼び出し、その結果を StreamController を使って
/// アプリ全体で共有する。各画面が直接 Firestore を呼ぶ形は禁止。
class ActiveStaysService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _subscription;
  final StreamController<QuerySnapshot<Map<String, dynamic>>> _streamController = StreamController<QuerySnapshot<Map<String, dynamic>>>.broadcast();
  
  /// 直近の QuerySnapshot をキャッシュ（新規購読者に即座に返すため）
  QuerySnapshot<Map<String, dynamic>>? _latestSnapshot;
  
  /// シングルトンインスタンス（static getter）
  static final ActiveStaysService _instance = ActiveStaysService._();
  static ActiveStaysService get instance => _instance;
  
  ActiveStaysService._() {
    _initializeListener();
  }
  
  /// 内部で Firestore リスナーを1本だけ張る
  void _initializeListener() {
    _subscription = _firestore
        .collection('activeStays')
        .where('isActive', isEqualTo: true)
        .snapshots()
        .listen(
          (snapshot) {
            _latestSnapshot = snapshot;
            _streamController.add(snapshot);
          },
          onError: (error) {
            // Firestore の内部リトライに任せる（独自の再接続ロジックは不要）
            _streamController.addError(error);
          },
        );
  }
  
  /// UI 側が購読する Stream
  /// - 新しい購読者にはまず最新スナップショットを 1 回返し、
  ///   その後にリアルタイム更新を流す。
  Stream<QuerySnapshot<Map<String, dynamic>>> get stream async* {
    if (_latestSnapshot != null) {
      yield _latestSnapshot!;
    }
    yield* _streamController.stream;
  }
  
  /// リスナーのキャンセル（アプリ終了時など）
  void dispose() {
    _subscription?.cancel();
    _streamController.close();
  }
}

