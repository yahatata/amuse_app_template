import 'package:amuse_app_template/tournament/active/models/table_and_users.dart';
import 'package:amuse_app_template/tournament/active/services/seat_decision_logic.dart';
import 'package:amuse_app_template/tournament/active/utils/reseat_table_selection_helpers.dart';
import 'package:flutter_test/flutter_test.dart';

TournamentTable _table({
  required String tableId,
  int maxSeats = 10,
}) {
  return TournamentTable(
    tableId: tableId,
    name: tableId,
    maxSeats: maxSeats,
    status: 'open',
    isEnabled: true,
    seats: const {},
  );
}

void main() {
  group('ReseatTableSelectionHelpers', () {
    final tables = [
      _table(tableId: 'table_a'),
      _table(tableId: 'table_b'),
      _table(tableId: 'table_c'),
    ];

    test('有効卓は初期選択用にすべて返る', () {
      expect(
        ReseatTableSelectionHelpers.enabledTableIds(tables),
        ['table_a', 'table_b', 'table_c'],
      );
    });

    test('全卓選択時は従来どおり全卓の席数が使える', () {
      final allIds = tables.map((t) => t.tableId).toSet();
      final validation = ReseatTableSelectionHelpers.validateReseatTableSelection(
        targetParticipantCount: 20,
        tables: tables,
        reseatTableIds: allIds,
      );

      expect(validation.canExecute, isTrue);
      expect(validation.selectedSeatCount, 30);
    });

    test('一部卓を未選択にすると未選択卓は配分対象から外れる', () {
      final selected = {'table_a', 'table_b'};
      final filtered = ReseatTableSelectionHelpers.filterTablesForReseat(
        tables,
        selected,
      );

      expect(filtered.map((t) => t.tableId).toList(), ['table_a', 'table_b']);
      expect(
        SeatDecisionLogic.distributePlayersAcrossTables(
          totalPlayers: 8,
          tables: filtered
              .map((t) => TableInfo(tableId: t.tableId, maxSeats: t.maxSeats))
              .toList(),
        ).keys,
        containsAll(['table_a', 'table_b']),
      );
      expect(
        SeatDecisionLogic.distributePlayersAcrossTables(
          totalPlayers: 8,
          tables: filtered
              .map((t) => TableInfo(tableId: t.tableId, maxSeats: t.maxSeats))
              .toList(),
        ).containsKey('table_c'),
        isFalse,
      );
    });

    test('reseatTableIds が空の場合は実行不可', () {
      final validation = ReseatTableSelectionHelpers.validateReseatTableSelection(
        targetParticipantCount: 5,
        tables: tables,
        reseatTableIds: {},
      );

      expect(validation.canExecute, isFalse);
      expect(validation.issue, ReseatTableSelectionIssue.noTablesSelected);
      expect(validation.message, 'リシート先の卓を1つ以上選択してください。');
    });

    test('選択卓の席数 < 対象者数 の場合は実行不可', () {
      final validation = ReseatTableSelectionHelpers.validateReseatTableSelection(
        targetParticipantCount: 15,
        tables: tables,
        reseatTableIds: {'table_a'},
      );

      expect(validation.canExecute, isFalse);
      expect(validation.issue, ReseatTableSelectionIssue.insufficientSeats);
    });

    test('選択卓の席数 >= 対象者数 の場合は実行可能', () {
      final validation = ReseatTableSelectionHelpers.validateReseatTableSelection(
        targetParticipantCount: 14,
        tables: tables,
        reseatTableIds: {'table_a', 'table_b'},
      );

      expect(validation.canExecute, isTrue);
      expect(validation.selectedSeatCount, 20);
    });

    test('waiting を含めた対象者数も席数チェックに反映される', () {
      final validation = ReseatTableSelectionHelpers.validateReseatTableSelection(
        targetParticipantCount: 11,
        tables: tables,
        reseatTableIds: {'table_a'},
      );

      expect(validation.canExecute, isFalse);
    });

    test('着席中 okibake を含めた対象者数も席数チェックに反映される', () {
      final seatedOkibakeCount = 12;
      final validation = ReseatTableSelectionHelpers.validateReseatTableSelection(
        targetParticipantCount: seatedOkibakeCount,
        tables: tables,
        reseatTableIds: {'table_a'},
      );

      expect(validation.canExecute, isFalse);
    });
  });
}
