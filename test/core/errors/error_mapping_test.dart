import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  final testCatalog = ErrorMessageCatalog(
    byErrorKey: {
      'ACCOUNTING_INVALID_STATE': '会計の状態が不正です。',
      'TEST_KEY_ONLY': 'キー共通文言',
    },
    byErrorKeyAndOperation: {
      'ACCOUNTING_INVALID_STATE': {
        'accounting.start': '会計を開始できる状態ではありません。',
        'accounting.cancel': '会計開始を取り消せる状態ではありません。',
      },
      'TEST_OP_KEY': {
        'op.a': '操作別文言A',
      },
    },
  );

  group('normalizeFirebaseFunctionsCode', () {
    test('plain / prefix / bracket 形式を正規化', () {
      expect(
        normalizeFirebaseFunctionsCode('failed-precondition'),
        'failed-precondition',
      );
      expect(
        normalizeFirebaseFunctionsCode('firebase_functions/failed-precondition'),
        'failed-precondition',
      );
      expect(
        normalizeFirebaseFunctionsCode(
          '[firebase_functions/failed-precondition]',
        ),
        'failed-precondition',
      );
    });

    test('空・空白は null', () {
      expect(normalizeFirebaseFunctionsCode(null), isNull);
      expect(normalizeFirebaseFunctionsCode(''), isNull);
      expect(normalizeFirebaseFunctionsCode('   '), isNull);
      expect(normalizeFirebaseFunctionsCode('[]'), isNull);
    });
  });

  group('code共通文言', () {
    final cases = <String, String>{
      'unauthenticated':
          '認証情報を確認できませんでした。再度ログインしてください。',
      'permission-denied': 'この操作の権限がありません。',
      'unavailable': '通信できません。接続を確認して再度お試しください。',
      'deadline-exceeded': '通信がタイムアウトしました。再度お試しください。',
      'internal': '処理中にエラーが発生しました。画面を更新して再度お試しください。',
      'invalid-argument':
          '入力内容を確認できませんでした。画面を更新して再度お試しください。',
      'failed-precondition':
          '現在の状態ではこの操作を実行できません。画面を更新してください。',
      'not-found': '対象のデータが見つかりません。画面を更新してください。',
      'already-exists': 'すでに処理済みです。画面を更新してください。',
    };

    for (final entry in cases.entries) {
      test('${entry.key} → 確定文言', () {
        final err = FirebaseFunctionsException(
          code: entry.key,
          message: 'SHOULD_NOT_APPEAR_EN',
        );
        final mapped = mapCallableError(err);
        expect(mapped.message, entry.value);
        expect(mapped.code, entry.key);
        expect(mapped.errorKey, isNull);
        expect(mapped.message, isNot(contains('SHOULD_NOT')));
      });
    }

    test('prefix付き code でも同じ文言', () {
      final err = FirebaseFunctionsException(
        code: 'firebase_functions/not-found',
        message: 'missing',
      );
      expect(
        mapCallableError(err).message,
        '対象のデータが見つかりません。画面を更新してください。',
      );
      expect(mapCallableError(err).code, 'not-found');
    });
  });

  group('mapCallableError', () {
    test('1. details.errorKey がある', () {
      final err = FirebaseFunctionsException(
        code: 'failed-precondition',
        message: '内部メッセージ',
        details: {'errorKey': 'TEST_KEY_ONLY'},
      );
      final mapped = mapCallableError(err, extraCatalogs: [testCatalog]);
      expect(mapped.message, 'キー共通文言');
      expect(mapped.errorKey, 'TEST_KEY_ONLY');
      expect(mapped.code, 'failed-precondition');
      expect(mapped.source, UserFacingErrorSource.callable);
    });

    test('2. details が Map<Object?, Object?>', () {
      final err = FirebaseFunctionsException(
        code: 'failed-precondition',
        message: '内部',
        details: <Object?, Object?>{'errorKey': 'TEST_KEY_ONLY'},
      );
      expect(
        mapCallableError(err, extraCatalogs: [testCatalog]).message,
        'キー共通文言',
      );
    });

    test('3. details が null → code共通', () {
      final err = FirebaseFunctionsException(
        code: 'permission-denied',
        message: 'Permission denied',
        details: null,
      );
      final mapped = mapCallableError(err);
      expect(mapped.message, 'この操作の権限がありません。');
      expect(mapped.errorKey, isNull);
    });

    test('4. details が想定外型 → code共通（mapperはthrowしない）', () {
      final err = FirebaseFunctionsException(
        code: 'internal',
        message: 'boom',
        details: 'not-a-map',
      );
      final mapped = mapCallableError(err);
      expect(
        mapped.message,
        '処理中にエラーが発生しました。画面を更新して再度お試しください。',
      );
    });

    test('5. errorKey が空文字 → 未設定扱い', () {
      final err = FirebaseFunctionsException(
        code: 'not-found',
        message: 'x',
        details: {'errorKey': '   '},
      );
      expect(
        mapCallableError(err).message,
        '対象のデータが見つかりません。画面を更新してください。',
      );
      expect(mapCallableError(err).errorKey, isNull);
    });

    test('6. errorKey が非文字列 → 未設定扱い', () {
      final err = FirebaseFunctionsException(
        code: 'already-exists',
        message: 'x',
        details: {'errorKey': 123},
      );
      expect(
        mapCallableError(err).message,
        'すでに処理済みです。画面を更新してください。',
      );
    });

    test('7. operation別文言が errorKey共通より優先', () {
      final err = FirebaseFunctionsException(
        code: 'failed-precondition',
        message: 'state invalid',
        details: {'errorKey': 'ACCOUNTING_INVALID_STATE'},
      );
      final mapped = mapCallableError(
        err,
        operation: 'accounting.start',
        extraCatalogs: [testCatalog],
      );
      expect(mapped.message, '会計を開始できる状態ではありません。');
    });

    test('8. errorKey共通が code共通より優先', () {
      final err = FirebaseFunctionsException(
        code: 'failed-precondition',
        message: 'state invalid',
        details: {'errorKey': 'ACCOUNTING_INVALID_STATE'},
      );
      final mapped = mapCallableError(err, extraCatalogs: [testCatalog]);
      expect(mapped.message, '会計の状態が不正です。');
      expect(
        mapped.message,
        isNot(
          '現在の状態ではこの操作を実行できません。画面を更新してください。',
        ),
      );
    });

    test('9. code共通が最終共通より優先', () {
      final err = FirebaseFunctionsException(
        code: 'unavailable',
        message: 'Unavailable',
      );
      expect(
        mapCallableError(err).message,
        '通信できません。接続を確認して再度お試しください。',
      );
      expect(
        mapCallableError(err).message,
        isNot(kFinalFallbackErrorMessage),
      );
    });

    test('10. unknown code で最終共通', () {
      final err = FirebaseFunctionsException(
        code: 'resource-exhausted',
        message: 'Quota',
      );
      final mapped = mapCallableError(err);
      expect(mapped.message, kFinalFallbackErrorMessage);
      expect(mapped.code, 'resource-exhausted');
    });

    test('11. Functions message が日本語でも表示されない', () {
      final err = FirebaseFunctionsException(
        code: 'resource-exhausted',
        message: '残高が不足しています（サーバー内部説明）',
        details: null,
      );
      final mapped = mapCallableError(err);
      expect(mapped.message, kFinalFallbackErrorMessage);
      expect(mapped.message, isNot(contains('残高が不足')));
      expect(mapped.message, isNot(contains('サーバー内部')));
    });

    test('12. Functions message が英語・内部語でも表示されない', () {
      final err = FirebaseFunctionsException(
        code: 'aborted',
        message: 'INTERNAL: race on bill.ops.accountingStartedAt',
      );
      final mapped = mapCallableError(err);
      expect(mapped.message, kFinalFallbackErrorMessage);
      expect(mapped.message, isNot(contains('INTERNAL')));
      expect(mapped.message, isNot(contains('accountingStartedAt')));
    });

    test('13. raw \$e 相当が message へ混入しない', () {
      final err = FirebaseFunctionsException(
        code: 'unknown',
        message: 'x',
      );
      final mapped = mapCallableError(err);
      expect(mapped.message, isNot(contains('FirebaseFunctionsException')));
      expect(mapped.message, isNot(contains('[firebase_functions/')));
      expect(mapped.message, isNot(contains('Exception:')));

      final nonFfe = mapCallableError(Exception('secret-stack'));
      expect(nonFfe.message, kFinalFallbackErrorMessage);
      expect(nonFfe.message, isNot(contains('secret-stack')));
      expect(nonFfe.message, isNot(contains('Exception')));
    });

    test('registry 登録カタログを参照できる', () {
      ErrorMessageRegistry.instance.register(testCatalog);
      final err = FirebaseFunctionsException(
        code: 'failed-precondition',
        message: 'x',
        details: {'errorKey': 'TEST_KEY_ONLY'},
      );
      expect(mapCallableError(err).message, 'キー共通文言');
    });

    test('extractCallableErrorContext は context のみ返し UserFacingError に載せない', () {
      final err = FirebaseFunctionsException(
        code: 'failed-precondition',
        message: 'usage',
        details: {
          'errorKey': 'USAGE_UNIT_VIOLATION',
          'context': {'usageUnit': 100, 'method': 'pointA'},
        },
      );
      final ctx = extractCallableErrorContext(err);
      expect(ctx?['usageUnit'], 100);
      final mapped = mapCallableError(err);
      expect(mapped.message, isNot(contains('usageUnit')));
      expect(mapped.message, isNot(contains('pointA')));
    });
  });

  group('mapSoftFailError', () {
    test('1. errorKey あり', () {
      final mapped = mapSoftFailError(
        {'success': false, 'errorKey': 'TEST_KEY_ONLY', 'error': 'raw'},
        extraCatalogs: [testCatalog],
      );
      expect(mapped.message, 'キー共通文言');
      expect(mapped.errorKey, 'TEST_KEY_ONLY');
      expect(mapped.source, UserFacingErrorSource.softFail);
      expect(mapped.message, isNot(contains('raw')));
    });

    test('2. code のみ', () {
      final mapped = mapSoftFailError({
        'success': false,
        'code': 'permission-denied',
        'message': 'nope',
      });
      expect(mapped.message, 'この操作の権限がありません。');
      expect(mapped.code, 'permission-denied');
      expect(mapped.message, isNot(contains('nope')));
    });

    test('3. errorKey と code 両方 → errorKey優先', () {
      final mapped = mapSoftFailError(
        {
          'success': false,
          'errorKey': 'TEST_KEY_ONLY',
          'code': 'failed-precondition',
        },
        extraCatalogs: [testCatalog],
      );
      expect(mapped.message, 'キー共通文言');
    });

    test('4. operation別文言', () {
      final mapped = mapSoftFailError(
        {'success': false, 'errorKey': 'ACCOUNTING_INVALID_STATE'},
        operation: 'accounting.cancel',
        extraCatalogs: [testCatalog],
      );
      expect(mapped.message, '会計開始を取り消せる状態ではありません。');
    });

    test('5. errorKey も code もなし → 最終共通', () {
      final mapped = mapSoftFailError({'success': false});
      expect(mapped.message, kFinalFallbackErrorMessage);
    });

    test('6. error 文字列だけ → 最終共通（errorは表示しない）', () {
      final mapped = mapSoftFailError({
        'success': false,
        'error': '入店処理に失敗しました（内部）',
      });
      expect(mapped.message, kFinalFallbackErrorMessage);
      expect(mapped.message, isNot(contains('入店処理')));
    });

    test('7. message 文字列だけ → 最終共通', () {
      final mapped = mapSoftFailError({
        'success': false,
        'message': 'Something went wrong inside',
      });
      expect(mapped.message, kFinalFallbackErrorMessage);
      expect(mapped.message, isNot(contains('Something went wrong')));
    });

    test('8. Map が不正な shape', () {
      expect(mapSoftFailError(null).message, kFinalFallbackErrorMessage);
      expect(mapSoftFailError('string').message, kFinalFallbackErrorMessage);
      expect(mapSoftFailError(42).message, kFinalFallbackErrorMessage);
      expect(
        mapSoftFailError(<Object?, Object?>{}).message,
        kFinalFallbackErrorMessage,
      );
    });

    test('9. success:true → throwせず最終共通（呼出側責任）', () {
      final mapped = mapSoftFailError({
        'success': true,
        'data': {'ok': true},
      });
      expect(mapped.message, kFinalFallbackErrorMessage);
      expect(mapped.source, UserFacingErrorSource.softFail);
    });
  });

  group('ErrorMessageResolver 優先順位', () {
    test('operation無しで未登録operation指定時は errorKey共通', () {
      final resolver = ErrorMessageResolver(catalogs: [testCatalog]);
      final result = resolver.resolve(
        errorKey: 'ACCOUNTING_INVALID_STATE',
        code: 'failed-precondition',
        operation: 'accounting.unknown',
      );
      expect(result.message, '会計の状態が不正です。');
    });
  });
}
