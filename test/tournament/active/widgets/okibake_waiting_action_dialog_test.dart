import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_waiting_action_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('isOkibakeWaitingActionAddonDisabled', () {
    test('上限到達で disabled', () {
      expect(
        isOkibakeWaitingActionAddonDisabled(
          okibakeAddonCount: 2,
          resolvedAddonLimit: 2,
        ),
        true,
      );
    });

    test('実行可能', () {
      expect(
        isOkibakeWaitingActionAddonDisabled(
          okibakeAddonCount: 0,
          resolvedAddonLimit: 2,
        ),
        false,
      );
    });
  });

  group('formatOkibakeBillLinkStatusLabel', () {
    test('unlinked / linked / pending_review', () {
      expect(formatOkibakeBillLinkStatusLabel('unlinked'), '伝票: 未リンク');
      expect(formatOkibakeBillLinkStatusLabel('linked'), '伝票: リンク済み');
      expect(formatOkibakeBillLinkStatusLabel('pending_review'), '伝票: 要確認');
    });
  });

  group('showOkibakeWaitingActionDialog', () {
    testWidgets('席へとAddonを表示しBustは出ない', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              return Scaffold(
                body: Center(
                  child: ElevatedButton(
                    onPressed: () {
                      showOkibakeWaitingActionDialog(
                        context: context,
                        displayName: 'オキバケA',
                        addonLine: 'Addon: 現在 0 / 2 回',
                        addonDisabled: false,
                        waitingMinutes: 5,
                        billLinkStatus: 'unlinked',
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

      expect(find.text('置きバケ操作'), findsOneWidget);
      expect(find.text('席へ'), findsOneWidget);
      expect(find.text('Addon'), findsOneWidget);
      expect(find.text('Bust'), findsNothing);
      expect(find.text('置きバケ'), findsWidgets);
      expect(find.text('待機時間: 5分'), findsOneWidget);
      expect(find.text('伝票: 未リンク'), findsOneWidget);
      expect(find.text('Addon: 現在 0 / 2 回'), findsOneWidget);
      expect(find.text('対象ユーザー設定'), findsNothing);
      expect(find.text('対象ユーザー変更'), findsNothing);
    });

    testWidgets('Addon disabled 時も席へは選択できる', (tester) async {
      OkibakeWaitingAction? result;

      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              return Scaffold(
                body: Center(
                  child: ElevatedButton(
                    onPressed: () async {
                      result = await showOkibakeWaitingActionDialog(
                        context: context,
                        displayName: 'オキバケA',
                        addonLine: 'Addon: 上限到達 2 / 2 回',
                        addonDisabled: true,
                        waitingMinutes: 3,
                        billLinkStatus: 'unlinked',
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

      await tester.tap(find.text('席へ'));
      await tester.pumpAndSettle();

      expect(result, OkibakeWaitingAction.assignSeat);
    });

    testWidgets('canSetLinkedUser true のとき対象ユーザー設定を表示し結果を返す', (tester) async {
      OkibakeWaitingAction? result;

      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              return Scaffold(
                body: Center(
                  child: ElevatedButton(
                    onPressed: () async {
                      result = await showOkibakeWaitingActionDialog(
                        context: context,
                        displayName: 'オキバケA',
                        addonLine: 'Addon: 現在 0 / 2 回',
                        addonDisabled: false,
                        waitingMinutes: 3,
                        billLinkStatus: 'unlinked',
                        canSetLinkedUser: true,
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

      expect(find.text('対象ユーザー設定'), findsOneWidget);
      expect(find.text('対象ユーザー変更'), findsNothing);

      await tester.tap(find.text('対象ユーザー設定'));
      await tester.pumpAndSettle();

      expect(result, OkibakeWaitingAction.setLinkedUser);
    });
  });
}
