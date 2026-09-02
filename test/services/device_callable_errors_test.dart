import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/services/device_callable_errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('getDevices failure vs empty (DEV-01/02 contract)', () {
    test('空一覧成功と読込失敗は別メッセージ契約', () {
      // 成功で devices=[] のとき UI は「登録されたデバイスがありません」
      // 読込失敗のとき UI は固定文言（raw FirebaseException / path 非表示）
      const emptySuccessUi = '登録されたデバイスがありません';
      expect(kDeviceListLoadFailedMessage, isNot(emptySuccessUi));
      expect(kDeviceListLoadFailedMessage, contains('端末一覧を取得できませんでした'));
      expect(kDeviceListLoadFailedMessage, isNot(contains('Firebase')));
      expect(kDeviceListLoadFailedMessage, isNot(contains('devices/')));
    });
  });

  group('DEV-11 Auth code mapping', () {
    test('operation-not-allowed → 固定文言（raw message 非表示）', () {
      const raw = 'Anonymous provider is disabled for project secret-path';
      final e = FirebaseAuthException(
        code: 'operation-not-allowed',
        message: raw,
      );
      final msg = mapDeviceRegisterError(e);
      expect(msg, kAnonymousAuthUnavailableMessage);
      expect(msg, isNot(contains(raw)));
      expect(msg, isNot(contains('secret-path')));
      expect(isAnonymousAuthRestricted(e), isTrue);
    });

    test('admin-restricted-operation → 固定文言', () {
      const raw = 'admin-restricted-operation raw detail uid=abc';
      final e = FirebaseAuthException(
        code: 'admin-restricted-operation',
        message: raw,
      );
      final msg = mapDeviceRegisterError(e);
      expect(msg, kAnonymousAuthUnavailableMessage);
      expect(msg, isNot(contains('uid=')));
      expect(msg, isNot(contains(raw)));
    });

    test('toString contains では判定しない（別 code）', () {
      final e = FirebaseAuthException(
        code: 'network-request-failed',
        message: 'admin-restricted-operation appears in message only',
      );
      expect(isAnonymousAuthRestricted(e), isFalse);
      final msg = mapDeviceRegisterError(e);
      expect(msg, isNot(kAnonymousAuthUnavailableMessage));
      expect(
        msg,
        isNot(contains('admin-restricted-operation appears in message only')),
      );
    });
  });

  group('mapDeviceCallableError for device updates', () {
    test('updateDeviceStatus permission-denied（raw message 非表示）', () {
      const secret = 'uid=secret-user path=/devices/x';
      final mapped = mapDeviceCallableError(
        FirebaseFunctionsException(
          code: 'permission-denied',
          message: secret,
          details: {'errorKey': 'UNKNOWN_DEVICE_KEY'},
        ),
        operation: 'updateDeviceStatus',
      );
      expect(mapped, 'この操作の権限がありません。');
      expect(mapped, isNot(contains(secret)));
      expect(mapped, isNot(contains('uid=')));
      expect(mapped, isNot(contains('/devices/')));
    });

    test('updateDeviceRole failed-precondition', () {
      final mapped = mapDeviceCallableError(
        FirebaseFunctionsException(
          code: 'failed-precondition',
          message: 'last admin cannot demote raw',
        ),
        operation: 'updateDeviceRole',
      );
      expect(
        mapped,
        '現在の状態ではこの操作を実行できません。画面を更新してください。',
      );
      expect(mapped, isNot(contains('last admin')));
    });

    test('archiveDevice soft-fail（message/error 非表示）', () {
      const rawMessage = 'backend archive raw';
      const rawError = 'internal archive error';
      final mapped = mapDeviceCallableError(
        const DeviceCallableSoftFail({
          'success': false,
          'message': rawMessage,
          'error': rawError,
        }),
        operation: 'archiveDevice',
      );
      expect(mapped, kFinalFallbackErrorMessage);
      expect(mapped, isNot(contains(rawMessage)));
      expect(mapped, isNot(contains(rawError)));
    });

    test('updateDeviceOptions unavailable', () {
      final mapped = mapDeviceCallableError(
        FirebaseFunctionsException(
          code: 'unavailable',
          message: 'backend raw unavailable',
        ),
        operation: 'updateDeviceOptions',
      );
      expect(mapped, '通信できません。接続を確認して再度お試しください。');
      expect(mapped, isNot(contains('backend raw')));
    });

    test('updateTableDeviceConfigCallable internal', () {
      final mapped = mapDeviceCallableError(
        FirebaseFunctionsException(
          code: 'internal',
          message: 'storeMeta/config path leak',
        ),
        operation: 'updateTableDeviceConfigCallable',
      );
      expect(
        mapped,
        '処理中にエラーが発生しました。画面を更新して再度お試しください。',
      );
      expect(mapped, isNot(contains('storeMeta')));
    });

    test('通常 Exception は最終共通（toString 非表示）', () {
      final mapped = mapDeviceCallableError(
        Exception('secret internal exception'),
        operation: 'updateDeviceStatus',
      );
      expect(mapped, kFinalFallbackErrorMessage);
      expect(mapped, isNot(contains('secret internal exception')));
    });
  });

  group('DEV-14 load failure contract', () {
    test('読込失敗文言は defaults 保存を促さない固定文', () {
      expect(
        kTableDeviceSettingsLoadFailedMessage,
        contains('卓端末設定を取得できませんでした'),
      );
      expect(kTableDeviceSettingsLoadFailedMessage, isNot(contains('Firebase')));
      expect(kTableDeviceSettingsLoadFailedMessage, isNot(contains('storeMeta')));
    });
  });
}
