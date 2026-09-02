import 'dart:async';

import 'package:amuse_app_template/user_actions/tournament_user_addon_counter.dart';
import 'package:amuse_app_template/user_actions/user_action_load_errors.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('TournamentUserAddonCounter', () {
    testWidgets('初回 loading のあと値を表示し、親 rebuild でも Future を再生成しない',
        (tester) async {
      var loadCalls = 0;
      final completer = Completer<AddonCounterSnapshot>();
      final failedFlags = <bool>[];
      final busyFlags = <bool>[];

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setParent) {
                return Column(
                  children: [
                    TournamentUserAddonCounter(
                      tournamentId: 't1',
                      userId: 'u1',
                      onLoadFailedChanged: failedFlags.add,
                      onLoadBusyChanged: busyFlags.add,
                      loader: ({required tournamentId, required userId}) {
                        loadCalls++;
                        return completer.future;
                      },
                    ),
                    TextButton(
                      onPressed: () => setParent(() {}),
                      child: const Text('parent-rebuild'),
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      );

      expect(find.text('Addon: 読み込み中...'), findsOneWidget);
      expect(loadCalls, 1);

      final state = tester.state<TournamentUserAddonCounterState>(
        find.byType(TournamentUserAddonCounter),
      );
      final generationAfterFirstBuild = state.loadGeneration;

      await tester.tap(find.text('parent-rebuild'));
      await tester.pump();
      await tester.tap(find.text('parent-rebuild'));
      await tester.pump();

      expect(loadCalls, 1);
      expect(state.loadGeneration, generationAfterFirstBuild);
      expect(failedFlags, isEmpty);

      completer.complete(
        const AddonCounterSnapshot(
          isAddonEnabled: true,
          limit: 3,
          count: 1,
          loadFailed: false,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Addon: 現在 1 / 3 回'), findsOneWidget);
      expect(loadCalls, 1);
      expect(failedFlags, contains(false));
      expect(busyFlags, contains(true));
      expect(busyFlags, contains(false));
    });

    testWidgets('failure 時は失敗表示し、waiting は failure 扱いにしない', (tester) async {
      final failedFlags = <bool>[];
      final completer = Completer<AddonCounterSnapshot>();

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TournamentUserAddonCounter(
              tournamentId: 't1',
              userId: 'u1',
              onLoadFailedChanged: failedFlags.add,
              loader: ({required tournamentId, required userId}) =>
                  completer.future,
            ),
          ),
        ),
      );

      expect(find.text('Addon: 読み込み中...'), findsOneWidget);
      expect(failedFlags, isEmpty);

      completer.complete(
        const AddonCounterSnapshot(
          isAddonEnabled: false,
          limit: 0,
          count: 0,
          loadFailed: true,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text(kUserActionAddonCountLoadFailedMessage), findsOneWidget);
      expect(failedFlags, contains(true));
    });

    testWidgets('明示 reload では 1 回だけ再取得する', (tester) async {
      var loadCalls = 0;
      Completer<AddonCounterSnapshot>? current;

      Future<AddonCounterSnapshot> loader({
        required String tournamentId,
        required String userId,
      }) {
        loadCalls++;
        current = Completer<AddonCounterSnapshot>();
        return current!.future;
      }

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TournamentUserAddonCounter(
              tournamentId: 't1',
              userId: 'u1',
              loader: loader,
            ),
          ),
        ),
      );

      expect(loadCalls, 1);
      current!.complete(
        const AddonCounterSnapshot(
          isAddonEnabled: false,
          limit: 0,
          count: 0,
          loadFailed: true,
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('再読み込み'));
      await tester.pump();
      expect(loadCalls, 2);
      expect(find.text('Addon: 読み込み中...'), findsOneWidget);

      current!.complete(
        const AddonCounterSnapshot(
          isAddonEnabled: true,
          limit: 2,
          count: 0,
          loadFailed: false,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Addon: 現在 0 / 2 回'), findsOneWidget);
      expect(loadCalls, 2);
    });
  });
}
