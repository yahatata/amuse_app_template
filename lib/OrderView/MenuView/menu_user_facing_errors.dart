import 'package:amuse_app_template/core/errors/errors.dart';

/// Menu 利用者向けの固定文言・薄いヘルパー（Phase 6 MENU）。
///
/// Callable は D-1（[mapCallableError] / [mapCallableSoftFailMessage] /
/// [isCallableSuccessResponse]）へ委譲する。raw / path / codec は表示しない。

const String kGetMenuItemsOperation = 'getMenuItems';

/// メニュー一覧取得失敗（MENU-04/05/08）。0 件とは別。
const String kMenuItemsLoadFailedMessage =
    'メニュー情報を取得できませんでした。再試行してください。';

/// キャッシュ未取得（MENU-07）。カテゴリー空とは別。
const String kMenuItemsNotLoadedMessage =
    'メニューデータがまだ読み込まれていません。更新ボタンを押してください。';

/// 再取得失敗だが既存メニューを残す場合（MENU-04）。
const String kMenuItemsUpdateFailedMessage =
    'メニューの更新に失敗しました。表示は直前の内容のままです。';

/// カテゴリーが本当に空（MENU-07）。
const String kMenuCategoriesEmptyMessage = '表示できるカテゴリーがありません。';

/// 入店中ユーザー（activeStays）Stream 失敗。
const String kMenuActiveStaysLoadFailedMessage =
    '入店中のユーザー情報を取得できませんでした。再度お試しください。';

/// 画像変換失敗（MENU-02）。path / codec / raw 非表示。
const String kMenuImageConvertFailedMessage =
    '画像の変換に失敗しました。別の画像を選択して再度お試しください。';

/// 名前・金額のローカル検証（MENU-06）。
const String kMenuNamePriceValidationMessage = '有効な名前と金額を入力してください';

/// getMenuItems Callable hard-fail。
String mapGetMenuItemsError(Object exception) {
  return mapCallableError(
    exception,
    operation: kGetMenuItemsOperation,
  ).message;
}

/// getMenuItems soft-fail / 不正 shape。
String mapGetMenuItemsSoftFail(Object? data) {
  return mapCallableSoftFailMessage(
    data,
    operation: kGetMenuItemsOperation,
  );
}

/// [MenuItemsManager.lastError] を UI に出すときの安全化（MENU-08）。
///
/// raw を信用せず固定文言へ落とす。manager 成功後の空一覧とは別経路で使う。
String safeMenuItemsManagerErrorMessage([String? lastError]) {
  return kMenuItemsLoadFailedMessage;
}
