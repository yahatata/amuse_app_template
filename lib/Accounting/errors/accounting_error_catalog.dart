import 'package:amuse_app_template/Accounting/errors/accounting_error_operations.dart';
import 'package:amuse_app_template/core/errors/error_message_catalog.dart';

/// 会計ドメインの静的 errorKey 文言（D-2A 承認済み）。
///
/// 動的文言（USAGE_UNIT / INSUFFICIENT_BALANCE の状態別）は
/// [mapAccountingCallableError] 側で overlay catalog を足す。
const ErrorMessageCatalog kAccountingErrorCatalog = ErrorMessageCatalog(
  byErrorKey: {
    'PAYMENT_SPLIT_MISMATCH':
        '支払い内容が最新の残高または店舗設定と一致しません。画面を更新し、支払い内容を選び直してください。',
    'PAYMENT_METHOD_NOT_ALLOWED':
        'この支払い方法は使えません。別の支払い方法を選んでください。',
    'BALANCE_TYPE_DISABLED':
        'このポイントは現在利用できません。別の支払い方法を選んでください。',
    // usageUnit が取れない場合の静的 fallback（動的構築が優先）
    'USAGE_UNIT_VIOLATION':
        '支払い金額が利用単位と合いません。金額を直して再度お試しください。',
    'ACCOUNTING_PAYMENT_TOTAL_MISMATCH':
        '支払い合計が一致しません。金額を確認して再度お試しください。',
    'CUSTOM_PAYMENT_CATEGORY_MISSING':
        '支払いが未指定のカテゴリがあります。すべてのカテゴリで支払い方法を指定してください。',
    'CONFIG_POINT_INVALID': 'ポイント設定を確認できないため、この支払いを実行できません。',
    // status 不明時の安全側（状態別は mapper overlay）
    'ACCOUNTING_INSUFFICIENT_BALANCE':
        '残高が不足しています。画面を更新して残高と支払い内容を確認してください。\n'
        '会計中の場合は「会計開始前に戻る」または「支払い方法変更」からやり直してください。',
    'ACCOUNTING_START_REQUEST_CANCELLED':
        'この会計開始リクエストは取り消されています。画面を更新してやり直してください。',
    'ACCOUNTING_START_IDEMPOTENCY_STALE':
        '会計開始の再送状態を確認できませんでした。画面を更新してやり直してください。',
  },
  byErrorKeyAndOperation: {
    'ACCOUNTING_ALREADY_SETTLED': {
      AccountingErrorOperations.complete:
          'すでに会計済みです。画面を更新して確認してください。',
    },
    'ACCOUNTING_NOT_STARTED': {
      AccountingErrorOperations.complete:
          '会計が開始されていません。会計開始からやり直してください。',
    },
    'ACCOUNTING_ALREADY_STARTED': {
      AccountingErrorOperations.start:
          '会計はすでに開始されています。画面を更新して状態を確認してください。',
    },
    'ACCOUNTING_INVALID_STATE': {
      AccountingErrorOperations.start:
          '現在の伝票状態では会計を開始できません。画面を更新してください。',
      AccountingErrorOperations.cancel:
          '現在の伝票状態では会計開始を取り消せません。画面を更新してください。',
    },
  },
);

/// 個別辞書へ載せない会計系 errorKey（意図的除外の固定リスト）。
const Set<String> kAccountingErrorKeysExcludedFromCatalog = {
  'PAYMENT_CATEGORY_REQUIRED',
  'UNKNOWN_PAYMENT_METHOD',
};
