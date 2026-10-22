import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// 端末一覧の Firestore 読込失敗時の固定文言（DEV-01）。
const String kDeviceListLoadFailedMessage =
    '端末一覧を取得できませんでした。画面を更新して再度お試しください。';

/// 匿名認証が端末で利用できない場合の固定文言（DEV-11）。
const String kAnonymousAuthUnavailableMessage =
    'この端末では匿名認証を利用できません。管理者に設定を確認してください。';

/// reporting フラグ更新失敗時の固定文言（DEV-12）。
const String kReportingFlagUpdateFailedMessage =
    '設定を更新できませんでした。再度お試しください。';

/// 卓端末設定の読込失敗時の固定文言（DEV-14）。
const String kTableDeviceSettingsLoadFailedMessage =
    '卓端末設定を取得できませんでした。画面を更新して再度お試しください。';

/// Callable が throw せず `success != true` を返したときの搬送用。
///
/// 表示文言は [mapCallableSoftFailMessage] で解決する（raw message は使わない）。
class DeviceCallableSoftFail implements Exception {
  final Object? data;

  const DeviceCallableSoftFail(this.data);
}

/// 匿名認証が無効・制限されている Auth 失敗か。
bool isAnonymousAuthRestricted(Object exception) {
  if (exception is! FirebaseAuthException) return false;
  final code = exception.code;
  return code == 'operation-not-allowed' ||
      code == 'admin-restricted-operation';
}

/// デバイス登録（Auth + Callable）の利用者向け文言。
String mapDeviceRegisterError(
  Object exception, {
  String operation = 'registerDevice',
}) {
  if (exception is DeviceCallableSoftFail) {
    return mapCallableSoftFailMessage(exception.data, operation: operation);
  }
  if (isAnonymousAuthRestricted(exception)) {
    return kAnonymousAuthUnavailableMessage;
  }
  return mapCallableError(exception, operation: operation).message;
}

/// デバイス管理系 Callable hard-fail / soft-fail の利用者向け文言。
String mapDeviceCallableError(
  Object exception, {
  required String operation,
}) {
  if (exception is DeviceCallableSoftFail) {
    return mapCallableSoftFailMessage(exception.data, operation: operation);
  }
  return mapCallableError(exception, operation: operation).message;
}
