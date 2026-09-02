import 'package:amuse_app_template/core/errors/errors.dart';

/// Callable 応答の成功判定。
///
/// `success == true`（bool）のときのみ成功。欠損・非 bool・非 Map は失敗。
bool isCallableSuccessResponse(Object? data) {
  return data is Map && data['success'] == true;
}

/// soft-fail / 不正 shape の利用者向け文言。
///
/// `message` / `error` は表示に使わない（D-1 [mapSoftFailError]）。
String mapCallableSoftFailMessage(
  Object? data, {
  String? operation,
}) {
  return mapSoftFailError(data, operation: operation).message;
}
