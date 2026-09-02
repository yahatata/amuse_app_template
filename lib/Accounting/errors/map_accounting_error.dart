import 'package:amuse_app_template/Accounting/errors/accounting_error_catalog.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/user/point_ids.dart';
import 'package:cloud_functions/cloud_functions.dart';

/// 会計 Callable 例外 → [UserFacingError]。
///
/// グローバル [ErrorMessageRegistry] は使わず、会計 catalog を
/// [extraCatalogs] として明示注入する。
UserFacingError mapAccountingCallableError(
  Object exception, {
  required String operation,
  String? billStatus,
}) {
  final overlays = <ErrorMessageCatalog>[
    ..._dynamicCatalogsForException(
      exception,
      billStatus: billStatus,
    ),
    kAccountingErrorCatalog,
  ];

  return mapCallableError(
    exception,
    operation: operation,
    extraCatalogs: overlays,
  );
}

/// 会計 soft-fail Map → [UserFacingError]。
///
/// 呼出側で `success == true` を除外してから渡すこと。
UserFacingError mapAccountingSoftFailError(
  Object? data, {
  required String operation,
  String? billStatus,
}) {
  final overlays = <ErrorMessageCatalog>[
    ..._dynamicCatalogsForSoftFail(
      data,
      billStatus: billStatus,
    ),
    kAccountingErrorCatalog,
  ];

  return mapSoftFailError(
    data,
    operation: operation,
    extraCatalogs: overlays,
  );
}

List<ErrorMessageCatalog> _dynamicCatalogsForException(
  Object exception, {
  String? billStatus,
}) {
  if (exception is! FirebaseFunctionsException) {
    return const [];
  }
  final parsed = parseCallableErrorDetails(exception.details);
  return _dynamicCatalogsForKey(
    errorKey: parsed.errorKey,
    context: parsed.context,
    billStatus: billStatus,
  );
}

List<ErrorMessageCatalog> _dynamicCatalogsForSoftFail(
  Object? data, {
  String? billStatus,
}) {
  final parsed = parseSoftFailErrorDetails(data);
  return _dynamicCatalogsForKey(
    errorKey: parsed.errorKey,
    context: parsed.context,
    billStatus: billStatus,
  );
}

List<ErrorMessageCatalog> _dynamicCatalogsForKey({
  required String? errorKey,
  required Map<String, Object?>? context,
  String? billStatus,
}) {
  if (errorKey == 'USAGE_UNIT_VIOLATION') {
    final method = context?['method']?.toString();
    return [
      ErrorMessageCatalog(
        byErrorKey: {
          'USAGE_UNIT_VIOLATION': buildUsageUnitViolationMessage(
            usageUnitRaw: context?['usageUnit'],
            displayName: safeAccountingPaymentDisplayName(method),
          ),
        },
      ),
    ];
  }
  if (errorKey == 'ACCOUNTING_INSUFFICIENT_BALANCE') {
    return [
      ErrorMessageCatalog(
        byErrorKey: {
          'ACCOUNTING_INSUFFICIENT_BALANCE':
              buildInsufficientBalanceMessage(billStatus),
        },
      ),
    ];
  }
  return const [];
}

/// context.usageUnit から利用者文言を構築する（Functions message は使わない）。
String buildUsageUnitViolationMessage({
  required Object? usageUnitRaw,
  String? displayName,
}) {
  final usageUnit = parsePositiveUsageUnit(usageUnitRaw);
  if (usageUnit == null) {
    return '支払い金額が利用単位と合いません。金額を直して再度お試しください。';
  }
  final name = displayName?.trim();
  if (name != null && name.isNotEmpty) {
    return '$nameは$usageUnit単位で利用できます。支払い金額を修正してください。';
  }
  return 'この支払い方法は$usageUnit単位で利用できます。支払い金額を修正してください。';
}

/// 正の整数の usageUnit のみ受理。それ以外は null。
int? parsePositiveUsageUnit(Object? raw) {
  if (raw is int) {
    return raw > 0 ? raw : null;
  }
  if (raw is num) {
    if (raw != raw.roundToDouble()) return null;
    final asInt = raw.toInt();
    return asInt > 0 ? asInt : null;
  }
  // 文字列数値はサーバー契約外。Functions message regex と同様に採用しない。
  return null;
}

/// bill status に応じた残高不足文言。
///
/// status 取得失敗・不明時は両経路で誤案内にならない安全側。
String buildInsufficientBalanceMessage(String? billStatus) {
  switch (billStatus) {
    case 'settling':
      return '残高が不足しています。「会計開始前に戻る」または「支払い方法変更」からやり直してください。';
    case 'open':
    case 'in_progress':
      return '残高が不足しています。残高と支払い内容を確認してください。';
    default:
      return '残高が不足しています。画面を更新して残高と支払い内容を確認してください。\n'
          '会計中の場合は「会計開始前に戻る」または「支払い方法変更」からやり直してください。';
  }
}

/// config から安全に取れる displayName のみ返す。不確実なら null。
String? safeAccountingPaymentDisplayName(
  String? method, [
  StoreConfigData? config,
]) {
  if (method == null || method.isEmpty) return null;
  if (method == 'cash') return '現金';
  if (method == 'credit_card') return 'クレジットカード';
  if (method == 'electronic_money') return '電子マネー';

  final data = config ?? _tryLatestStoreConfigData();
  if (data == null) return null;

  if (method == kSideGameChipId) {
    final settings = data.sideGameChipSettings;
    final name = settings?['displayName'];
    if (name is String && name.trim().isNotEmpty) return name.trim();
    return null;
  }

  if (isCurrencyPointId(method)) {
    final slot = data.pointSettings?[method];
    if (slot is! Map) return null;
    final name = slot['displayName'];
    if (name is String && name.trim().isNotEmpty) return name.trim();
    return null;
  }

  final bps = data.balancePaymentSettings?[method];
  if (bps is Map) {
    final name = bps['displayName'];
    if (name is String && name.trim().isNotEmpty) return name.trim();
  }
  return null;
}

StoreConfigData? _tryLatestStoreConfigData() {
  try {
    return StoreConfigService.instance.latestData;
  } catch (_) {
    // unit test 等で Firebase 未初期化でも mapper を壊さない
    return null;
  }
}
