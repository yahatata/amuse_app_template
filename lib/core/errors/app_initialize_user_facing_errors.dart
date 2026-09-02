import 'package:amuse_app_template/core/errors/errors.dart';

/// Phase 8 Misc（アプリ初期化等）の安全な固定文言。

const String kAppInitializeFailedMessage =
    'アプリの初期化に失敗しました。通信環境を確認して再度お試しください。';

const String kAppInitializeRetryLabel = '再試行';

/// 初期化例外 → 利用者文言（raw / UID / path 非表示）。
String mapAppInitializeError(Object exception) {
  return mapCallableError(exception).message;
}
