import 'package:amuse_app_template/tournament/active/widgets/dialogs/regular_waiting_action_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('showRegularWaitingActionDialog', () {
    testWidgets('席へとAddonを表示する', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              return Scaffold(
                body: Center(
                  child: ElevatedButton(
                    onPressed: () {
                      showRegularWaitingActionDialog(
                        context: context,
                        displayName: '太郎',
                        addonLine: 'Addon: 現在 0 / 2 回',
                        addonDisabled: false,
                        waitingMinutes: 12,
                      );
                    },
                    child: const Text('open'),
                  ),
                ),
              );
            },
          ),
        ),
      );

      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      expect(find.text('待機者操作'), findsOneWidget);
      expect(find.text('席へ'), findsOneWidget);
      expect(find.text('Addon'), findsOneWidget);
      expect(find.text('待機時間: 12分'), findsOneWidget);
      expect(find.text('Addon: 現在 0 / 2 回'), findsOneWidget);
    });
  });
}
