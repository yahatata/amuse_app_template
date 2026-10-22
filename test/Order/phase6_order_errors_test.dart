import 'package:amuse_app_template/OrderView/OrderManagement/order_user_facing_errors.dart';
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

  group('Phase 6 Order', () {
    test('ORDER-04 updateOrderQuantity FFE: UID/path 非表示', () {
      final msg = mapUpdateOrderQuantityError(
        _TestFirebaseFunctionsException(
          code: 'permission-denied',
          message: 'uid=secret-uid path=/orders/internal',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
      );
      expect(msg, isNot(contains('secret-uid')));
      expect(msg, isNot(contains('/orders/internal')));
      expect(msg, isNot(contains('uid=')));
    });

    test('ORDER-05 cancelOrder FFE: UID/path 非表示', () {
      final msg = mapCancelOrderError(
        _TestFirebaseFunctionsException(
          code: 'internal',
          message: 'uid=abc path=/bills/x',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
      );
      expect(msg, isNot(contains('uid=abc')));
      expect(msg, isNot(contains('/bills/x')));
    });

    test('ORDER-04/05 soft-fail: data.error を表示しない', () {
      final updateMsg = mapUpdateOrderQuantitySoftFail({
        'success': false,
        'error': 'internal secret stack',
        'message': 'leak message',
      });
      expect(updateMsg, isNot(contains('internal secret')));
      expect(updateMsg, isNot(contains('leak message')));

      final cancelMsg = mapCancelOrderSoftFail({
        'success': false,
        'error': 'cancel raw',
      });
      expect(cancelMsg, isNot(contains('cancel raw')));
    });

    test('ORDER-06 fail vs empty 文言は区別', () {
      expect(kOrderEditLoadFailedMessage, contains('取得できませんでした'));
      expect(kOrderEditNotFoundMessage, contains('見つかりません'));
      expect(kOrderEditLoadFailedMessage, isNot(equals(kOrderEditNotFoundMessage)));
      expect(kOrderEditLoadFailedMessage, isNot(contains('\$e')));
      expect(kOrderEditLoadFailedMessage, isNot(contains('Exception')));
    });

    test('ORDER-07 mark served: raw 非表示（楽観戻しは onSwipeServeFailed）', () {
      final msg = mapOrderMarkServedError(
        Exception('firestore permission projects/x/documents/orders'),
      );
      expect(msg, equals(kOrderMarkServedFailedMessage));
      expect(msg, isNot(contains('projects/')));
      expect(msg, isNot(contains('Exception')));
      // 楽観更新の戻しは order_management_page の onSwipeServeFailed
      // （_localOrderStatus.remove）で担保。ヘルパー単体では文言のみ検証。
    });

    test('ORDER-11 banner: raw 非表示・空と失敗を区別', () {
      expect(
        ordersListErrorMessage(hasStaleOrders: false),
        equals(kOrdersListLoadFailedMessage),
      );
      expect(
        ordersListErrorMessage(hasStaleOrders: true),
        equals(kOrdersListUpdateFailedMessage),
      );
      expect(kOrdersListLoadFailedMessage, isNot(contains('\$e')));
      expect(kOrdersListLoadFailedMessage, isNot(contains('toString')));
      expect(kOrdersListUpdateFailedMessage, contains('直前'));
    });

    test('ORDER-12 validation 定数は固定文言のみ', () {
      expect(kOrderQuantityValidationMessage, contains('数量'));
      expect(kOrderQuantityValidationMessage, isNot(contains('\$e')));
    });
  });
}
