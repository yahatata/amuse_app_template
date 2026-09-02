import 'package:amuse_app_template/Accounting/errors/accounting_error_catalog.dart';
import 'package:amuse_app_template/Accounting/errors/accounting_error_operations.dart';
import 'package:amuse_app_template/Accounting/errors/map_accounting_error.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('kAccountingErrorCatalog 静的文言', () {
    test('承認済み errorKey が登録されている', () {
      final keys = kAccountingErrorCatalog.byErrorKey;
      expect(keys['PAYMENT_SPLIT_MISMATCH'], contains('支払い内容を選び直してください'));
      expect(keys['PAYMENT_METHOD_NOT_ALLOWED'], contains('別の支払い方法'));
      expect(keys['BALANCE_TYPE_DISABLED'], contains('利用できません'));
      expect(keys['USAGE_UNIT_VIOLATION'], contains('利用単位と合いません'));
      expect(keys['ACCOUNTING_PAYMENT_TOTAL_MISMATCH'], contains('支払い合計'));
      expect(keys['CUSTOM_PAYMENT_CATEGORY_MISSING'], contains('すべてのカテゴリ'));
      expect(
        keys['CONFIG_POINT_INVALID'],
        'ポイント設定を確認できないため、この支払いを実行できません。',
      );
      expect(keys['ACCOUNTING_INSUFFICIENT_BALANCE'], contains('残高が不足'));
      expect(
        keys['ACCOUNTING_START_REQUEST_CANCELLED'],
        contains('取り消されています'),
      );
      expect(
        keys['ACCOUNTING_START_IDEMPOTENCY_STALE'],
        contains('画面を更新してやり直してください'),
      );
    });

    test('CANCELLED / STALE は raw message を使わず catalog 文言', () {
      final cancelled = mapAccountingCallableError(
        FirebaseFunctionsException(
          code: 'failed-precondition',
          message: 'RAW_SHOULD_NOT_SHOW',
          details: {
            'errorKey': 'ACCOUNTING_START_REQUEST_CANCELLED',
          },
        ),
        operation: AccountingErrorOperations.start,
      );
      expect(cancelled.message, contains('取り消されています'));
      expect(cancelled.message, isNot(contains('RAW_SHOULD_NOT_SHOW')));

      final stale = mapAccountingCallableError(
        FirebaseFunctionsException(
          code: 'failed-precondition',
          message: 'RAW_SHOULD_NOT_SHOW',
          details: {
            'errorKey': 'ACCOUNTING_START_IDEMPOTENCY_STALE',
          },
        ),
        operation: AccountingErrorOperations.start,
      );
      expect(stale.message, contains('画面を更新してやり直してください'));
      expect(stale.message, isNot(contains('RAW_SHOULD_NOT_SHOW')));
    });

    test('PAYMENT_CATEGORY_REQUIRED / UNKNOWN_PAYMENT_METHOD は個別辞書にない', () {
      for (final key in kAccountingErrorKeysExcludedFromCatalog) {
        expect(kAccountingErrorCatalog.byErrorKey.containsKey(key), isFalse);
        expect(
          kAccountingErrorCatalog.byErrorKeyAndOperation.containsKey(key),
          isFalse,
        );
      }
    });

    test('CONFIG_POINT_INVALID は店舗設定修正を促さない', () {
      final msg = kAccountingErrorCatalog.byErrorKey['CONFIG_POINT_INVALID']!;
      expect(msg, isNot(contains('店舗設定')));
      expect(msg, isNot(contains('管理者')));
      expect(msg, isNot(contains('設定画面')));
    });

    test('operation別 ACCOUNTING_INVALID_STATE', () {
      final start = kAccountingErrorCatalog.messageFor(
        errorKey: 'ACCOUNTING_INVALID_STATE',
        operation: AccountingErrorOperations.start,
      );
      final cancel = kAccountingErrorCatalog.messageFor(
        errorKey: 'ACCOUNTING_INVALID_STATE',
        operation: AccountingErrorOperations.cancel,
      );
      expect(start, contains('会計を開始できません'));
      expect(cancel, contains('会計開始を取り消せません'));
      expect(start, isNot(cancel));
    });

    test('定数と catalog の operation キーが一致', () {
      final ops = kAccountingErrorCatalog.byErrorKeyAndOperation;
      expect(
        ops['ACCOUNTING_ALREADY_SETTLED']![AccountingErrorOperations.complete],
        isNotNull,
      );
      expect(
        ops['ACCOUNTING_NOT_STARTED']![AccountingErrorOperations.complete],
        isNotNull,
      );
      expect(
        ops['ACCOUNTING_ALREADY_STARTED']![AccountingErrorOperations.start],
        isNotNull,
      );
      expect(
        ops['ACCOUNTING_INVALID_STATE']![AccountingErrorOperations.start],
        isNotNull,
      );
      expect(
        ops['ACCOUNTING_INVALID_STATE']![AccountingErrorOperations.cancel],
        isNotNull,
      );
    });
  });

  group('mapAccountingCallableError', () {
    FirebaseFunctionsException ffe({
      required String code,
      required String message,
      Object? details,
    }) {
      return FirebaseFunctionsException(
        code: code,
        message: message,
        details: details,
      );
    }

    test('ACCOUNTING_ALREADY_SETTLED × complete', () {
      final mapped = mapAccountingCallableError(
        ffe(
          code: 'failed-precondition',
          message: 'already settled INTERNAL',
          details: {'errorKey': 'ACCOUNTING_ALREADY_SETTLED'},
        ),
        operation: AccountingErrorOperations.complete,
      );
      expect(mapped.message, 'すでに会計済みです。画面を更新して確認してください。');
      expect(mapped.message, isNot(contains('INTERNAL')));
    });

    test('ACCOUNTING_NOT_STARTED × complete', () {
      final mapped = mapAccountingCallableError(
        ffe(
          code: 'failed-precondition',
          message: 'not started',
          details: {'errorKey': 'ACCOUNTING_NOT_STARTED'},
        ),
        operation: AccountingErrorOperations.complete,
      );
      expect(mapped.message, contains('会計が開始されていません'));
    });

    test('ACCOUNTING_ALREADY_STARTED × start', () {
      final mapped = mapAccountingCallableError(
        ffe(
          code: 'failed-precondition',
          message: 'already',
          details: {'errorKey': 'ACCOUNTING_ALREADY_STARTED'},
        ),
        operation: AccountingErrorOperations.start,
      );
      expect(mapped.message, contains('すでに開始されています'));
    });

    test('start と cancel で INVALID_STATE が別文言', () {
      final err = ffe(
        code: 'failed-precondition',
        message: 'invalid',
        details: {'errorKey': 'ACCOUNTING_INVALID_STATE'},
      );
      final start = mapAccountingCallableError(
        err,
        operation: AccountingErrorOperations.start,
      );
      final cancel = mapAccountingCallableError(
        err,
        operation: AccountingErrorOperations.cancel,
      );
      expect(start.message, contains('会計を開始できません'));
      expect(cancel.message, contains('会計開始を取り消せません'));
    });

    test('operation typo 時に操作別へ誤一致しない', () {
      final mapped = mapAccountingCallableError(
        ffe(
          code: 'failed-precondition',
          message: 'invalid',
          details: {'errorKey': 'ACCOUNTING_INVALID_STATE'},
        ),
        operation: 'accounting.strat', // typo
      );
      // errorKey共通は未登録 → code共通へ
      expect(
        mapped.message,
        '現在の状態ではこの操作を実行できません。画面を更新してください。',
      );
      expect(mapped.message, isNot(contains('会計を開始できません')));
      expect(mapped.message, isNot(contains('取り消せません')));
    });

    test('PAYMENT_SPLIT_MISMATCH / METHOD / BALANCE / TOTAL / CATEGORY / CONFIG', () {
      final cases = <String, String>{
        'PAYMENT_SPLIT_MISMATCH': '支払い内容を選び直してください',
        'PAYMENT_METHOD_NOT_ALLOWED': '別の支払い方法を選んでください',
        'BALANCE_TYPE_DISABLED': 'このポイントは現在利用できません',
        'ACCOUNTING_PAYMENT_TOTAL_MISMATCH': '支払い合計が一致しません',
        'CUSTOM_PAYMENT_CATEGORY_MISSING': 'すべてのカテゴリで支払い方法を指定',
        'CONFIG_POINT_INVALID': 'ポイント設定を確認できないため',
      };
      for (final entry in cases.entries) {
        final mapped = mapAccountingCallableError(
          ffe(
            code: 'failed-precondition',
            message: 'firebase_functions/failed-precondition raw ${entry.key}',
            details: {'errorKey': entry.key},
          ),
          operation: AccountingErrorOperations.start,
        );
        expect(mapped.message, contains(entry.value), reason: entry.key);
        expect(mapped.message, isNot(contains('firebase_functions')));
        expect(mapped.message, isNot(contains(entry.key)));
      }
    });

    test('PAYMENT_CATEGORY_REQUIRED は個別文言にならず codeへ', () {
      final mapped = mapAccountingCallableError(
        ffe(
          code: 'invalid-argument',
          message: 'category required',
          details: {'errorKey': 'PAYMENT_CATEGORY_REQUIRED'},
        ),
        operation: AccountingErrorOperations.start,
      );
      expect(
        mapped.message,
        '入力内容を確認できませんでした。画面を更新して再度お試しください。',
      );
      expect(mapped.message, isNot(contains('不正な支払い')));
    });

    test('unknown errorKey + unknown code → 最終共通 / raw非表示', () {
      final mapped = mapAccountingCallableError(
        ffe(
          code: 'aborted',
          message: '[firebase_functions/aborted] secret stack',
          details: {'errorKey': 'SOME_UNKNOWN_KEY'},
        ),
        operation: AccountingErrorOperations.start,
      );
      expect(mapped.message, kFinalFallbackErrorMessage);
      expect(mapped.message, isNot(contains('secret')));
      expect(mapped.message, isNot(contains('firebase_functions')));
    });

    test('非 FirebaseFunctionsException も raw を出さない', () {
      final mapped = mapAccountingCallableError(
        Exception('secret-local'),
        operation: AccountingErrorOperations.start,
      );
      expect(mapped.message, kFinalFallbackErrorMessage);
      expect(mapped.message, isNot(contains('secret-local')));
    });
  });

  group('USAGE_UNIT_VIOLATION', () {
    test('正の整数 + displayName', () {
      expect(
        buildUsageUnitViolationMessage(
          usageUnitRaw: 100,
          displayName: 'ポイントA',
        ),
        'ポイントAは100単位で利用できます。支払い金額を修正してください。',
      );
    });

    test('正の整数 + displayNameなし', () {
      expect(
        buildUsageUnitViolationMessage(usageUnitRaw: 50, displayName: null),
        'この支払い方法は50単位で利用できます。支払い金額を修正してください。',
      );
    });

    test('null / 文字列 / 0 / 負数は一般文言', () {
      for (final raw in [null, '100', 0, -1, 1.5]) {
        expect(
          buildUsageUnitViolationMessage(usageUnitRaw: raw, displayName: 'X'),
          '支払い金額が利用単位と合いません。金額を直して再度お試しください。',
          reason: '$raw',
        );
      }
    });

    test('mapper は context.usageUnit を使い Functions message に依存しない', () {
      final mapped = mapAccountingCallableError(
        FirebaseFunctionsException(
          code: 'invalid-argument',
          message: 'USAGE 999 from message should not appear',
          details: {
            'errorKey': 'USAGE_UNIT_VIOLATION',
            'context': {
              'method': 'pointA',
              'usageUnit': 100,
              'referenceAmount': 50,
            },
          },
        ),
        operation: AccountingErrorOperations.start,
      );
      // StoreConfig 未初期化時は displayName なし文言になるが、単位は context 由来
      expect(mapped.message, contains('100単位'));
      expect(mapped.message, isNot(contains('999')));
      expect(mapped.message, isNot(contains('USAGE')));
      expect(
        mapped.message,
        'この支払い方法は100単位で利用できます。支払い金額を修正してください。',
      );
    });

    test('safeAccountingPaymentDisplayName は設定名があるときのみ返す', () {
      expect(safeAccountingPaymentDisplayName('cash'), '現金');
      expect(
        safeAccountingPaymentDisplayName(
          'pointA',
          StoreConfigData(
            pointSettings: {
              'pointA': {'enabled': true, 'displayName': 'ポイントA'},
            },
          ),
        ),
        'ポイントA',
      );
      expect(
        safeAccountingPaymentDisplayName(
          'pointA',
          StoreConfigData(pointSettings: {'pointA': {'enabled': true}}),
        ),
        isNull,
      );
    });
  });

  group('ACCOUNTING_INSUFFICIENT_BALANCE', () {
    test('status別文言', () {
      expect(
        buildInsufficientBalanceMessage('open'),
        '残高が不足しています。残高と支払い内容を確認してください。',
      );
      expect(
        buildInsufficientBalanceMessage('in_progress'),
        '残高が不足しています。残高と支払い内容を確認してください。',
      );
      expect(
        buildInsufficientBalanceMessage('settling'),
        contains('会計開始前に戻る'),
      );
      expect(
        buildInsufficientBalanceMessage(null),
        contains('画面を更新して残高と支払い内容を確認'),
      );
      expect(buildInsufficientBalanceMessage('open'), isNot(contains('もう一度会計')));
      expect(
        buildInsufficientBalanceMessage('settling'),
        isNot(contains('もう一度会計')),
      );
    });

    test('mapper が billStatus を反映', () {
      final err = FirebaseFunctionsException(
        code: 'failed-precondition',
        message: 'insufficient INTERNAL race',
        details: {'errorKey': 'ACCOUNTING_INSUFFICIENT_BALANCE'},
      );
      expect(
        mapAccountingCallableError(
          err,
          operation: AccountingErrorOperations.start,
          billStatus: 'settling',
        ).message,
        contains('支払い方法変更'),
      );
      expect(
        mapAccountingCallableError(
          err,
          operation: AccountingErrorOperations.start,
          billStatus: 'open',
        ).message,
        isNot(contains('支払い方法変更')),
      );
    });
  });

  group('mapAccountingSoftFailError / cancel success shape', () {
    test('success:false + errorKey', () {
      final mapped = mapAccountingSoftFailError(
        {
          'success': false,
          'errorKey': 'ACCOUNTING_INVALID_STATE',
          'message': 'raw cancel fail',
          'error': 'raw error',
        },
        operation: AccountingErrorOperations.cancel,
      );
      expect(mapped.message, contains('会計開始を取り消せません'));
      expect(mapped.message, isNot(contains('raw')));
    });

    test('success:false で message のみ → 最終共通', () {
      final mapped = mapAccountingSoftFailError(
        {'success': false, 'message': '会計開始を取り消しました'},
        operation: AccountingErrorOperations.cancel,
      );
      expect(mapped.message, kFinalFallbackErrorMessage);
      expect(mapped.message, isNot(contains('取り消しました')));
    });

    test('cancel success判定ヘルパー相当: success!=true は失敗', () {
      bool isCancelSuccess(Object? data) {
        if (data is! Map) return false;
        return data['success'] == true;
      }

      expect(isCancelSuccess({'success': true}), isTrue);
      expect(isCancelSuccess({'success': false, 'message': 'ok'}), isFalse);
      expect(isCancelSuccess({'message': '会計開始を取り消しました'}), isFalse);
      expect(isCancelSuccess(null), isFalse);
    });
  });

  group('extraCatalogs は global registry を汚さない', () {
    test('mapAccountingCallableError 後も registry は空', () {
      expect(ErrorMessageRegistry.instance.catalogs, isEmpty);
      mapAccountingCallableError(
        FirebaseFunctionsException(
          code: 'failed-precondition',
          message: 'x',
          details: {'errorKey': 'PAYMENT_SPLIT_MISMATCH'},
        ),
        operation: AccountingErrorOperations.start,
      );
      expect(ErrorMessageRegistry.instance.catalogs, isEmpty);
    });
  });
}
