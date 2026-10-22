import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:amuse_app_template/tableDevice/pages/table_device_home_page.dart';

void main() {
  testWidgets('未紐付け案内メッセージを表示する', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: TableDeviceUnboundNotice(),
        ),
      ),
    );

    expect(find.text('卓の紐付けが未設定です'), findsOneWidget);
    expect(find.text(TableDeviceUnboundNotice.message), findsOneWidget);
  });
}
