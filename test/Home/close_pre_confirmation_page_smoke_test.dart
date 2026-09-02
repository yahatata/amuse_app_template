import 'package:amuse_app_template/Home/close_pre_confirmation_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('integrityDataLoader の結果を表示できる', (tester) async {
    var loadCount = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: ClosePreConfirmationPage(
          onConfirmClose: (_) async {},
          integrityDataLoader: () async {
            loadCount += 1;
            return {
              'success': true,
              'unsettledBills': const [
                {
                  'billId': 'bill-1',
                  'userId': 'user-1',
                  'pokerName': 'Alice',
                  'displayAmount': 1200,
                  'status': 'open',
                },
              ],
              'unsettledBillsReturnedCount': 1,
              'unsettledBillsTruncated': false,
              'unclockedStaff': const [],
              'unclosedTournaments': const [],
            };
          },
          unsettledBillDestinationBuilder: (_) =>
              const Scaffold(body: Text('dummy')),
          unclockedStaffDestinationBuilder: (_) =>
              const Scaffold(body: Text('dummy2')),
        ),
      ),
    );

    await tester.pumpAndSettle();
    expect(loadCount, greaterThanOrEqualTo(1));
    expect(find.text('Alice'), findsOneWidget);

    await tester.tap(find.text('Alice'));
    await tester.pumpAndSettle();
    expect(find.text('会計画面へ'), findsOneWidget);
    expect(find.text('open'), findsNothing);
    expect(find.text('ステータス'), findsNothing);
  });
}

