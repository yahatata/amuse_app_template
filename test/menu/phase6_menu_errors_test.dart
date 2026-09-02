import 'package:amuse_app_template/OrderView/MenuView/menu_user_facing_errors.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';

class _TestFirebaseFunctionsException extends FirebaseFunctionsException {
  _TestFirebaseFunctionsException({
    required String message,
    required String code,
    dynamic details,
  }) : super(message: message, code: code, details: details);
}

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('Phase 6 Menu', () {
    test('MENU-02 image convert: path/codec/raw 非表示', () {
      expect(kMenuImageConvertFailedMessage, contains('画像'));
      expect(kMenuImageConvertFailedMessage, isNot(contains('\$e')));
      expect(kMenuImageConvertFailedMessage, isNot(contains('path')));
      expect(kMenuImageConvertFailedMessage, isNot(contains('codec')));
      expect(kMenuImageConvertFailedMessage, contains('選択'));
    });

    test('MENU-04/05 fail vs empty: 読込失敗と更新失敗を区別', () {
      expect(kMenuItemsLoadFailedMessage, contains('取得できませんでした'));
      expect(kMenuItemsUpdateFailedMessage, contains('直前'));
      expect(kMenuItemsLoadFailedMessage, isNot(equals(kMenuItemsUpdateFailedMessage)));
      expect(kMenuItemsLoadFailedMessage, isNot(contains('\$e')));
    });

    test('MENU-05 getMenuItems FFE: lastError 相当が raw を含まない', () {
      final msg = mapGetMenuItemsError(
        _TestFirebaseFunctionsException(
          code: 'permission-denied',
          message: 'uid=menu-secret path=/menus/internal',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
      );
      expect(msg, isNot(contains('menu-secret')));
      expect(msg, isNot(contains('/menus/internal')));
      expect(msg, isNot(contains('uid=')));
    });

    test('MENU-05 soft-fail: data.error を表示しない', () {
      final msg = mapGetMenuItemsSoftFail({
        'success': false,
        'error': 'secret menu error',
        'message': 'leak',
      });
      expect(msg, isNot(contains('secret menu')));
      expect(msg, isNot(contains('leak')));
    });

    test('MENU-07 empty vs not-loaded 文言は区別', () {
      expect(kMenuCategoriesEmptyMessage, contains('カテゴリー'));
      expect(kMenuItemsNotLoadedMessage, contains('読み込まれていません'));
      expect(kMenuCategoriesEmptyMessage, isNot(equals(kMenuItemsNotLoadedMessage)));
      expect(kMenuCategoriesEmptyMessage, isNot(equals(kMenuItemsLoadFailedMessage)));
    });

    test('MENU-08 manager error: safe 固定文言（raw lastError を出さない）', () {
      final safe = safeMenuItemsManagerErrorMessage(
        'メニューアイテムの取得に失敗しました: Exception: uid=x path=/y',
      );
      expect(safe, equals(kMenuItemsLoadFailedMessage));
      expect(safe, isNot(contains('uid=')));
      expect(safe, isNot(contains('Exception')));
      expect(safe, isNot(contains('/y')));
    });

    test('MENU-06 validation 定数は固定文言のみ', () {
      expect(kMenuNamePriceValidationMessage, contains('名前'));
      expect(kMenuNamePriceValidationMessage, isNot(contains('\$e')));
    });
  });
}
