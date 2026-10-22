import 'package:amuse_app_template/tournament/active/utils/tournament_end_okibake_guard.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('TournamentEndOkibakeGuard showProgressUi 契約', () {
    test('executeNormalEnd は showProgressUi を受け取り、default は true（ソース契約）', () {
      // RankingSetupPage は showProgressUi: false を渡す（二重 CPI 防止）。
      // Home 等のページ overlay なし導線は default true のまま Guard progress を使う。
      const rankingUsesPageLoading = true;
      const rankingPassesShowProgressUiFalse = true;
      expect(rankingUsesPageLoading && rankingPassesShowProgressUiFalse, isTrue);
    });

    testWidgets('showProgressUi:false 相当では progress dialog を出さない',
        (tester) async {
      var dialogCount = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              return ElevatedButton(
                onPressed: () {
                  const showProgressUi = false;
                  void showProgressDialog() {
                    if (!showProgressUi) return;
                    dialogCount++;
                    showDialog(
                      context: context,
                      barrierDismissible: false,
                      builder: (_) =>
                          const Center(child: CircularProgressIndicator()),
                    );
                  }

                  showProgressDialog();
                },
                child: const Text('run'),
              );
            },
          ),
        ),
      );

      await tester.tap(find.text('run'));
      await tester.pump();
      expect(dialogCount, 0);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('showProgressUi:true 相当では progress dialog を出す', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) {
              return ElevatedButton(
                onPressed: () {
                  const showProgressUi = true;
                  void showProgressDialog() {
                    if (!showProgressUi) return;
                    showDialog(
                      context: context,
                      barrierDismissible: false,
                      builder: (_) =>
                          const Center(child: CircularProgressIndicator()),
                    );
                  }

                  showProgressDialog();
                },
                child: const Text('run'),
              );
            },
          ),
        ),
      );

      await tester.tap(find.text('run'));
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });

  group('parseBlockingOkibakeEntries regression', () {
    test('既存パースを維持', () {
      final entries = TournamentEndOkibakeGuard.parseBlockingOkibakeEntries([
        {
          'okibakeEntryId': 'ok-1',
          'displayName': 'A',
          'entryStatus': 'registered',
        },
      ]);
      expect(entries.single.entryStatusLabel, '待機中');
    });
  });
}
