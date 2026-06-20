import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:amuse_app_template/tableDevice/models/table_device_home_state.dart';
import 'package:amuse_app_template/tableDevice/services/table_device_service.dart';
import 'package:amuse_app_template/tableDevice/widgets/table_device_drawer.dart';

void main() {
  group('TableDeviceDrawer', () {
    testWidgets('強制解除の実行中はローディングを表示し、成功後に完了ダイアログを出す', (tester) async {
      final completer = Completer<void>();
      final service = FakeTableDeviceService(
        state: _tournamentActiveState(),
        tournamentOccupiedSeatCount: 2,
        unregisterTournamentCompleter: completer,
      );

      await _pumpDrawerHost(tester, service);

      await tester.tap(find.text('トーナメントから登録解除'));
      await tester.pumpAndSettle();

      expect(find.text('強制クリア確認'), findsOneWidget);

      await tester.enterText(find.byType(TextField), '4321');
      await tester.tap(find.text('解除する'));
      await tester.pump();

      expect(find.text('トーナメント登録を解除しています...'), findsOneWidget);

      completer.complete();
      await tester.pumpAndSettle();

      expect(find.text('トーナメント登録を解除しました'), findsOneWidget);
      expect(find.text('卓をトーナメントから登録解除しました。'), findsOneWidget);
    });

    testWidgets('強制解除が失敗したときは失敗ダイアログを出す', (tester) async {
      final service = FakeTableDeviceService(
        state: _tournamentActiveState(),
        tournamentOccupiedSeatCount: 2,
        unregisterTournamentError: Exception('パスコードが違います'),
      );

      await _pumpDrawerHost(tester, service);

      await tester.tap(find.text('トーナメントから登録解除'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), '9999');
      await tester.tap(find.text('解除する'));
      await tester.pumpAndSettle();

      expect(find.text('トーナメント解除に失敗しました'), findsOneWidget);
      expect(find.text('パスコードが違います'), findsOneWidget);
    });
  });
}

Future<void> _pumpDrawerHost(
  WidgetTester tester,
  FakeTableDeviceService service,
) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        drawer: TableDeviceDrawer(
          tableId: service.state.tableId,
          initialState: service.state,
          service: service,
        ),
        body: Builder(
          builder: (context) => Center(
            child: FilledButton(
              onPressed: () => Scaffold.of(context).openDrawer(),
              child: const Text('open drawer'),
            ),
          ),
        ),
      ),
    ),
  );

  await tester.tap(find.text('open drawer'));
  await tester.pumpAndSettle();
}

TableDeviceHomeState _tournamentActiveState() {
  return const TableDeviceHomeState(
    kind: TableDeviceHomeKind.tournamentActive,
    tableId: 'T1',
    tableName: '卓1',
    registrationEnabled: true,
    tournamentId: 'tn-1',
    tournamentName: '朝トナメ',
  );
}

class FakeTableDeviceService implements TableDeviceService {
  FakeTableDeviceService({
    required this.state,
    this.tournamentOccupiedSeatCount = 0,
    this.unregisterTournamentCompleter,
    this.unregisterTournamentError,
  });

  final TableDeviceHomeState state;
  final int tournamentOccupiedSeatCount;
  final Completer<void>? unregisterTournamentCompleter;
  final Object? unregisterTournamentError;

  @override
  Stream<TableDeviceHomeState> watchHomeState(String? tableId) {
    return Stream<TableDeviceHomeState>.value(state);
  }

  @override
  Future<int> getTournamentOccupiedSeatCount({
    required String tournamentId,
    required String tableId,
  }) async {
    return tournamentOccupiedSeatCount;
  }

  @override
  Future<void> unregisterTableFromTournament({
    required String tableId,
    required String tournamentId,
    bool force = false,
    String? passcode,
  }) async {
    if (unregisterTournamentError != null) {
      throw unregisterTournamentError!;
    }
    if (unregisterTournamentCompleter != null) {
      await unregisterTournamentCompleter!.future;
    }
  }

  @override
  String formatFunctionsError(Object error) {
    return error.toString().replaceFirst('Exception: ', '');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
