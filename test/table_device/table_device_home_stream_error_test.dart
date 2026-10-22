import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:amuse_app_template/tableDevice/pages/table_device_home_page.dart';

void main() {
  group('tableDeviceHomeStreamHasError / tableDeviceHomeStreamErrorMessage', () {
    test('hasError=true は true', () {
      final snapshot = AsyncSnapshot<Object?>.withError(
        ConnectionState.active,
        Exception('secret-firestore-path /users/uid-xyz'),
      );

      expect(tableDeviceHomeStreamHasError(snapshot), isTrue);
    });

    test('hasError=false は false', () {
      const snapshot = AsyncSnapshot<Object?>.withData(
        ConnectionState.active,
        Object(),
      );
      expect(tableDeviceHomeStreamHasError(snapshot), isFalse);
    });

    test('waiting のみでは error 扱いにしない', () {
      const snapshot = AsyncSnapshot<Object?>.nothing();
      expect(tableDeviceHomeStreamHasError(snapshot), isFalse);
    });

    test('文言は固定で raw error を出さない', () {
      final secret = Exception('SHOULD_NOT_APPEAR /internal/doc');
      final msg = tableDeviceHomeStreamErrorMessage(secret);
      expect(msg, TableDeviceHomeStreamErrorView.message);
      expect(msg, contains('データを取得できませんでした'));
      expect(msg, isNot(contains('SHOULD_NOT_APPEAR')));
      expect(msg, isNot(contains('/internal/doc')));
    });
  });

  testWidgets('Stream error UI は固定文言と再読み込みを出し raw error は出さない', (
    tester,
  ) async {
    var retried = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: TableDeviceHomeStreamErrorView(
            onRetry: () => retried = true,
          ),
        ),
      ),
    );

    expect(find.text('卓情報を表示できません'), findsOneWidget);
    expect(
      find.text(TableDeviceHomeStreamErrorView.message),
      findsOneWidget,
    );
    expect(find.text('再読み込み'), findsOneWidget);

    await tester.tap(find.text('再読み込み'));
    await tester.pump();
    expect(retried, isTrue);
  });
}
