import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:cloud_functions/cloud_functions.dart';

/// `closeStoreTerminal` / `openStoreTerminal` の成功判定。
///
/// `success == true`（bool）のときのみ成功。欠損・非 bool・不正 shape は失敗。
bool isStoreTerminalCallableSuccess(Object? data) {
  return data is Map && data['success'] == true;
}

/// soft-fail / 不正 shape を利用者向けエラーへ変換する。
///
/// `message` / `error` は表示に使わない（D-1 [mapSoftFailError]）。
UserFacingError mapStoreTerminalSoftFail(Object? data) {
  return mapSoftFailError(data);
}

/// 開店／閉店系 Callable の hard-fail を利用者向け文言へ変換する。
///
/// raw `message` / `toString` は表示しない。
String mapStoreTerminalCallableException(
  Object exception, {
  String? operation,
}) {
  return mapCallableError(exception, operation: operation).message;
}

/// `failed-precondition` の「他操作実行中」固定文言用。
bool isStoreTerminalBusyPrecondition(Object exception) {
  return exception is FirebaseFunctionsException &&
      exception.code == 'failed-precondition';
}

/// details から resume 用 runId を取り出す（表示には使わない）。
String? extractStoreTerminalResumeRunId(Object exception) {
  if (exception is! FirebaseFunctionsException) return null;
  final details = exception.details;
  if (details is! Map) return null;
  final runId = details['runId'];
  return runId is String && runId.isNotEmpty ? runId : null;
}
