import 'package:cloud_functions/cloud_functions.dart';
import 'package:amuse_app_template/Accounting/errors/accounting_error_operations.dart';
import 'package:amuse_app_template/Accounting/errors/map_accounting_error.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';

/// C1-B 来店なし入金（現金・全額必須）のクライアント側ヘルパ。
///
/// Option 1: `claim total === payment total` を変更しない。
/// 一部入金・過入金・値引きは対象外。

const String kCarryoverRemoteCashAmountMismatchMessage =
    '請求額と入金額が一致していません';

/// 請求額と入力額が一致するか（UI / 送信前 validation）。
bool isCarryoverRemoteCashAmountExact({
  required int claimTotalIncl,
  required int inputAmountIncl,
}) {
  return claimTotalIncl == inputAmountIncl;
}

/// monetary > 0 のカテゴリだけを現金指定する。
Map<String, String> buildAllCashPaymentMethodsByCategory(
  Map<String, int> monetaryByCategory,
) {
  final out = <String, String>{};
  for (final entry in monetaryByCategory.entries) {
    if (entry.value > 0) {
      out[entry.key] = 'cash';
    }
  }
  return out;
}

class CarryoverBillPreviewTotals {
  const CarryoverBillPreviewTotals({
    required this.claimTotalIncl,
    required this.monetaryByCategory,
  });

  final int claimTotalIncl;
  final Map<String, int> monetaryByCategory;
}

/// `getBillPreviewTotals` から請求額とカテゴリ monetary を取得する。
Future<CarryoverBillPreviewTotals> fetchCarryoverBillPreviewTotals(
  String billId, {
  FirebaseFunctions? functions,
}) async {
  final fn = functions ?? FunctionsClient.instance;
  final result = await fn.httpsCallable('getBillPreviewTotals').call({
    'billId': billId,
  });
  final data = Map<String, dynamic>.from(result.data as Map);
  final categories = Map<String, dynamic>.from(data['categories'] as Map);
  final monetary = <String, int>{
    'extraCost':
        (categories['extraCost']?['monetary'] as num?)?.toInt() ?? 0,
    'items': (categories['items']?['monetary'] as num?)?.toInt() ?? 0,
    'tournaments':
        (categories['tournaments']?['monetary'] as num?)?.toInt() ?? 0,
    'sideGameChip':
        (categories['sideGameChip']?['monetary'] as num?)?.toInt() ?? 0,
  };
  final claim =
      (data['grandTotal'] as num?)?.toInt() ??
      monetary.values.fold<int>(0, (sum, v) => sum + v);
  return CarryoverBillPreviewTotals(
    claimTotalIncl: claim,
    monetaryByCategory: monetary,
  );
}

class CarryoverRemoteCashSettleResult {
  const CarryoverRemoteCashSettleResult({
    required this.success,
    this.errorMessage,
  });

  final bool success;
  final String? errorMessage;
}

Map<String, dynamic>? _asStringKeyedMap(Object? data) {
  if (data is Map) {
    return data.map((key, value) => MapEntry(key.toString(), value));
  }
  return null;
}

/// 既存通常会計契約で carryover bill を現金全額精算する。
///
/// 1. claim と input の一致を検証
/// 2. `startAccounting`（custom / 全カテゴリ cash）
/// 3. `completeAccountingV2`
/// 4. `finalizeUnsettledBillAfterAccounting`
Future<CarryoverRemoteCashSettleResult> settleCarryoverWithRemoteCashPayment({
  required String billId,
  required int inputAmountIncl,
  required int claimTotalIncl,
  required Map<String, int> monetaryByCategory,
  FirebaseFunctions? functions,
  String? clientNonce,
}) async {
  if (!isCarryoverRemoteCashAmountExact(
    claimTotalIncl: claimTotalIncl,
    inputAmountIncl: inputAmountIncl,
  )) {
    return const CarryoverRemoteCashSettleResult(
      success: false,
      errorMessage: kCarryoverRemoteCashAmountMismatchMessage,
    );
  }

  final fn = functions ?? FunctionsClient.instance;
  final nonce =
      clientNonce ?? DateTime.now().microsecondsSinceEpoch.toString();
  final byCategory = buildAllCashPaymentMethodsByCategory(monetaryByCategory);

  try {
    late final HttpsCallableResult startResult;
    if (claimTotalIncl == 0) {
      startResult = await fn.httpsCallable('startAccounting').call({
        'billId': billId,
        'clientNonce': nonce,
        'paymentMethodsByAmount': <String, int>{},
      });
    } else {
      if (byCategory.isEmpty) {
        return const CarryoverRemoteCashSettleResult(
          success: false,
          errorMessage: kCarryoverRemoteCashAmountMismatchMessage,
        );
      }
      startResult = await fn.httpsCallable('startAccounting').call({
        'billId': billId,
        'clientNonce': nonce,
        'accountingMode': 'custom',
        'paymentMethodsByCategory': byCategory,
        'paymentMethodsByAmount': {'cash': claimTotalIncl},
      });
    }

    final startData = _asStringKeyedMap(startResult.data);
    if (startData == null || startData['success'] != true) {
      final mapped = mapAccountingSoftFailError(
        startData ?? startResult.data,
        operation: AccountingErrorOperations.start,
      );
      return CarryoverRemoteCashSettleResult(
        success: false,
        errorMessage: mapped.message,
      );
    }

    final completeResult =
        await fn.httpsCallable('completeAccountingV2').call({'billId': billId});
    final completeData = _asStringKeyedMap(completeResult.data);
    if (completeData == null || completeData['success'] != true) {
      final mapped = mapAccountingSoftFailError(
        completeData ?? completeResult.data,
        operation: AccountingErrorOperations.complete,
      );
      return CarryoverRemoteCashSettleResult(
        success: false,
        errorMessage: mapped.message,
      );
    }

    await fn.httpsCallable('finalizeUnsettledBillAfterAccounting').call({
      'billId': billId,
    });

    return const CarryoverRemoteCashSettleResult(success: true);
  } on FirebaseFunctionsException catch (e) {
    final details = e.details;
    String? errorKey;
    if (details is Map) {
      errorKey = details['errorKey'] as String?;
    }
    if (errorKey == 'ACCOUNTING_PAYMENT_TOTAL_MISMATCH') {
      return const CarryoverRemoteCashSettleResult(
        success: false,
        errorMessage: kCarryoverRemoteCashAmountMismatchMessage,
      );
    }
    final mapped = mapAccountingCallableError(
      e,
      operation: AccountingErrorOperations.complete,
    );
    return CarryoverRemoteCashSettleResult(
      success: false,
      errorMessage: mapped.message,
    );
  } catch (e) {
    final mapped = mapAccountingCallableError(
      e,
      operation: AccountingErrorOperations.complete,
    );
    return CarryoverRemoteCashSettleResult(
      success: false,
      errorMessage: mapped.message,
    );
  }
}
