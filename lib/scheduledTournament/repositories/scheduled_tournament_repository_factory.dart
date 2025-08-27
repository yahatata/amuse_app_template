import 'scheduled_tournament_repository_interface.dart';
import 'mock_scheduled_tournament_repository.dart';
import 'firestore_scheduled_tournament_repository.dart';
import '../config/environment_config.dart';

/// リポジトリの種類
enum RepositoryType {
  mock,
  firestore,
}

/// スケジュール済みトーナメントのリポジトリファクトリー
class ScheduledTournamentRepositoryFactory {
  /// 指定されたタイプのリポジトリを作成
  static ScheduledTournamentRepositoryInterface create(RepositoryType type) {
    switch (type) {
      case RepositoryType.mock:
        return MockScheduledTournamentRepository();
      case RepositoryType.firestore:
        return FirestoreScheduledTournamentRepository();
    }
  }
  
  /// 環境設定に基づいてリポジトリを作成（開発時はMock、本番時はFirestore）
  static ScheduledTournamentRepositoryInterface createFromEnvironment() {
    // 環境情報をログ出力（デバッグ用）
    if (EnvironmentConfig.isDebug) {
      EnvironmentConfig.printEnvironmentInfo();
    }
    
    // 環境に応じてリポジトリを選択
    if (EnvironmentConfig.isDevelopment || EnvironmentConfig.isTest) {
      print('🔄 Using Mock Repository (Development/Test Environment)');
      return MockScheduledTournamentRepository();
    } else {
      print('🔥 Using Firestore Repository (Production Environment)');
      return FirestoreScheduledTournamentRepository();
    }
  }

  /// エラーハンドリング付きのリポジトリ作成
  static ScheduledTournamentRepositoryInterface createWithFallback() {
    try {
      return createFromEnvironment();
    } catch (e) {
      print('⚠️ Error creating repository, falling back to Mock: $e');
      return MockScheduledTournamentRepository();
    }
  }
}
