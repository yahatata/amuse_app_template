import 'package:amuse_app_template/core/errors/errors.dart';

/// Order 利用者向けの固定文言・薄いヘルパー（Phase 6 ORDER）。
///
/// Callable は D-1（[mapCallableError] / [mapCallableSoftFailMessage] /
/// [isCallableSuccessResponse]）へ委譲する。raw message / toString /
/// snapshot.error / UID / path は表示しない。

const String kUpdateOrderQuantityOperation = 'updateOrderQuantity';
const String kCancelOrderOperation = 'cancelOrder';

/// 注文編集ダイアログの読込失敗（ORDER-06）。「見つからない」とは別。
const String kOrderEditLoadFailedMessage =
    '注文データを取得できませんでした。再試行してください。';

/// 注文ドキュメントが存在しない（正常取得の欠落）。
const String kOrderEditNotFoundMessage = '注文データが見つかりません';

/// 数量バリデーション（ORDER-12・ローカル）。
const String kOrderQuantityValidationMessage = '数量は1以上の整数で入力してください';

/// 注文一覧 Stream 失敗（ORDER-11）。空一覧とは別。
const String kOrdersListLoadFailedMessage =
    '注文一覧を取得できませんでした。画面を更新して再度お試しください。';

/// storeMeta 読込失敗（注文管理 AppBar / 一覧）。
const String kOrderStoreMetaLoadFailedMessage =
    '営業情報を取得できませんでした。画面を更新して再度お試しください。';

/// 一覧に古いデータがあるときの更新失敗バナー（ORDER-11）。
const String kOrdersListUpdateFailedMessage =
    '注文一覧の更新に失敗しました。表示は直前の内容のままです。';

/// 提供済みマーク失敗（ORDER-07・Firestore 直接書込）。
const String kOrderMarkServedFailedMessage =
    '提供済みへの更新に失敗しました。再度お試しください。';

/// 数量更新 Callable hard-fail。
String mapUpdateOrderQuantityError(Object exception) {
  return mapCallableError(
    exception,
    operation: kUpdateOrderQuantityOperation,
  ).message;
}

/// 数量更新 soft-fail / 不正 shape。
String mapUpdateOrderQuantitySoftFail(Object? data) {
  return mapCallableSoftFailMessage(
    data,
    operation: kUpdateOrderQuantityOperation,
  );
}

/// 取消 Callable hard-fail。
String mapCancelOrderError(Object exception) {
  return mapCallableError(
    exception,
    operation: kCancelOrderOperation,
  ).message;
}

/// 取消 soft-fail / 不正 shape。
String mapCancelOrderSoftFail(Object? data) {
  return mapCallableSoftFailMessage(
    data,
    operation: kCancelOrderOperation,
  );
}

/// Stream / 読込失敗文言。raw [error] は使わない（ORDER-11）。
String ordersListErrorMessage({required bool hasStaleOrders}) {
  return hasStaleOrders
      ? kOrdersListUpdateFailedMessage
      : kOrdersListLoadFailedMessage;
}

/// 提供済み失敗文言。raw は使わない（ORDER-07）。
String mapOrderMarkServedError([Object? error]) {
  return kOrderMarkServedFailedMessage;
}
