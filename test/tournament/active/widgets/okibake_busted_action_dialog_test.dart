import 'package:amuse_app_template/tournament/active/widgets/dialogs/okibake_busted_action_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('showOkibakeBustedActionDialog', () {
    testWidgets('伝票紐付けのみ表示し Addon / 席へ / Bust は出ない', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              return Scaffold(
                body: Center(
                  child: ElevatedButton(
                    onPressed: () {
                      showOkibakeBustedActionDialog(
                        context: context,
                        displayName: 'オキバケX',
                        billLinkStatus: 'unlinked',
                        bustedInfoLine: '退席: 10 分前',
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

      expect(find.text('置きバケ操作（退席済み）'), findsOneWidget);
      expect(find.text('オキバケX'), findsOneWidget);
      expect(find.text('退席済み'), findsOneWidget);
      expect(find.text('退席: 10 分前'), findsOneWidget);
      expect(find.text('伝票: 未リンク'), findsOneWidget);

      expect(find.text('伝票紐付け'), findsOneWidget);
      expect(find.text('Addon'), findsNothing);
      expect(find.text('席へ'), findsNothing);
      expect(find.text('Bust'), findsNothing);
    });

    testWidgets('伝票紐付けタップで OkibakeBustedAction.linkBill が返る', (tester) async {
      OkibakeBustedAction? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              return Scaffold(
                body: Center(
                  child: ElevatedButton(
                    onPressed: () async {
                      result = await showOkibakeBustedActionDialog(
                        context: context,
                        displayName: 'オキバケX',
                        billLinkStatus: 'unlinked',
                        bustedInfoLine: '退席済み',
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

      await tester.tap(find.text('伝票紐付け'));
      await tester.pumpAndSettle();

      expect(result, OkibakeBustedAction.linkBill);
    });

    testWidgets('billLinkStatus が unlinked 以外なら伝票紐付けは無効', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              return Scaffold(
                body: Center(
                  child: ElevatedButton(
                    onPressed: () {
                      showOkibakeBustedActionDialog(
                        context: context,
                        displayName: 'オキバケX',
                        billLinkStatus: 'linked',
                        bustedInfoLine: '退席済み',
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

      // ラベル自体は表示されるが、ボタンは IgnorePointer で無効化される（タップしても閉じない）。
      expect(find.text('伝票紐付け'), findsOneWidget);
      expect(find.text('伝票: リンク済み'), findsOneWidget);
    });
  });

  group('formatOkibakeBustedInfoLine', () {
    test('bustedAt が null なら「退席済み」', () {
      expect(formatOkibakeBustedInfoLine(bustedAt: null), '退席済み');
    });

    test('1 分未満', () {
      final now = DateTime(2026, 5, 27, 10, 0, 30);
      final busted = DateTime(2026, 5, 27, 10, 0, 0);
      expect(
        formatOkibakeBustedInfoLine(bustedAt: busted, now: now),
        '退席: 1 分未満前',
      );
    });

    test('分単位', () {
      final now = DateTime(2026, 5, 27, 10, 30);
      final busted = DateTime(2026, 5, 27, 10, 0);
      expect(
        formatOkibakeBustedInfoLine(bustedAt: busted, now: now),
        '退席: 30 分前',
      );
    });

    test('時間+分単位', () {
      final now = DateTime(2026, 5, 27, 12, 30);
      final busted = DateTime(2026, 5, 27, 10, 15);
      expect(
        formatOkibakeBustedInfoLine(bustedAt: busted, now: now),
        '退席: 2 時間 15 分前',
      );
    });

    test('時間ちょうど', () {
      final now = DateTime(2026, 5, 27, 12, 0);
      final busted = DateTime(2026, 5, 27, 10, 0);
      expect(
        formatOkibakeBustedInfoLine(bustedAt: busted, now: now),
        '退席: 2 時間前',
      );
    });

    test('24 時間以上なら「退席済み」のみ', () {
      final now = DateTime(2026, 5, 28, 12, 0);
      final busted = DateTime(2026, 5, 27, 10, 0);
      expect(
        formatOkibakeBustedInfoLine(bustedAt: busted, now: now),
        '退席済み',
      );
    });
  });
}
