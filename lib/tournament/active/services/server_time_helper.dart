import 'package:cloud_firestore/cloud_firestore.dart';

/// サーバ時刻取得ヘルパー
class ServerTimeHelper {
  static Duration? _serverOffset;
  static DateTime? _lastUpdate;
  
  /// サーバ時刻オフセットを取得・更新
  static Future<Duration?> getServerOffset() async {
    // 5分以内に更新済みの場合はキャッシュを使用
    if (_serverOffset != null && 
        _lastUpdate != null && 
        DateTime.now().difference(_lastUpdate!).inMinutes < 5) {
      return _serverOffset;
    }
    
    try {
      final now = DateTime.now();
      
      // サーバ時刻を取得するためのドキュメントを作成
      final docRef = FirebaseFirestore.instance
          .collection('_serverTime')
          .doc('now');
      
      // サーバタイムスタンプでドキュメントを更新
      await docRef.set({
        'timestamp': FieldValue.serverTimestamp(),
        'clientTime': Timestamp.fromDate(now),
      });
      
      // 更新されたドキュメントを取得
      final doc = await docRef.get();
      final serverTimestamp = doc.data()?['timestamp'] as Timestamp?;
      
      if (serverTimestamp != null) {
        final serverTime = serverTimestamp.toDate();
        _serverOffset = serverTime.difference(now);
        _lastUpdate = now;
        return _serverOffset;
      }
    } catch (e) {
      // エラーの場合はオフセットなしで続行
      print('ServerTimeHelper: Failed to get server time: $e');
    }
    
    return null;
  }
  
  /// 現在時刻を取得（サーバオフセット適用）
  static DateTime getCurrentTime() {
    final now = DateTime.now();
    if (_serverOffset != null) {
      return now.add(_serverOffset!);
    }
    return now;
  }
  
  /// オフセットをクリア（テスト用）
  static void clearOffset() {
    _serverOffset = null;
    _lastUpdate = null;
  }
  
  /// 現在のサーバオフセットを取得（デバッグ用）
  static Duration? get currentOffset => _serverOffset;
}
