/// 環境設定を管理するクラス
class EnvironmentConfig {
  // 環境タイプ
  static const String _environment = String.fromEnvironment(
    'ENVIRONMENT',
    defaultValue: 'development',
  );

  // デバッグモード
  static const bool _isDebug = bool.fromEnvironment(
    'DEBUG',
    defaultValue: true,
  );

  /// 現在の環境を取得
  static String get environment => _environment;

  /// 開発環境かどうか
  static bool get isDevelopment => _environment == 'development';

  /// テスト環境かどうか
  static bool get isTest => _environment == 'test';

  /// 本番環境かどうか
  static bool get isProduction => _environment == 'production';

  /// デバッグモードかどうか
  static bool get isDebug => _isDebug;

  /// 環境に応じたリポジトリタイプを取得
  static String get repositoryType {
    if (isDevelopment || isTest) {
      return 'mock';
    } else {
      return 'firestore';
    }
  }

  /// 環境情報を表示
  static void printEnvironmentInfo() {
    print('=== Environment Info ===');
    print('Environment: $_environment');
    print('Is Development: $isDevelopment');
    print('Is Test: $isTest');
    print('Is Production: $isProduction');
    print('Is Debug: $isDebug');
    print('Repository Type: $repositoryType');
    print('=======================');
  }
}
