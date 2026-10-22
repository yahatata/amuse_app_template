import 'package:flutter_test/flutter_test.dart';

import 'package:amuse_app_template/tableDevice/models/table_device_home_state.dart';

void main() {
  group('TableDeviceHomeStateResolver', () {
    test('open 卓は idle として扱う', () {
      final state = TableDeviceHomeStateResolver.resolve(
        tableId: 'TableA',
        tableName: '卓A',
        tableStatus: 'open',
        tournamentDetail: null,
        sideGameTypes: const ['ブラックジャック'],
        registrationEnabled: true,
        currentBusinessDateKey: '2026-06-18',
      );

      expect(state.kind, TableDeviceHomeKind.idle);
      expect(state.canRegisterTournament, true);
      expect(state.canRegisterSideGame, true);
    });

    test('scheduled トーナメントは tournamentScheduled として扱う', () {
      final state = TableDeviceHomeStateResolver.resolve(
        tableId: 'TableA',
        tableName: '卓A',
        tableStatus: 'tournament',
        tournamentDetail: const {
          'tournamentId': 'tn-1',
          'tournamentName': '朝トナメ',
        },
        sideGameTypes: const ['ブラックジャック'],
        registrationEnabled: true,
        currentBusinessDateKey: '2026-06-18',
        tournamentStatus: 'scheduled',
        tournamentBusinessDate: '2026-06-18',
      );

      expect(state.kind, TableDeviceHomeKind.tournamentScheduled);
      expect(state.tournamentId, 'tn-1');
      expect(state.tournamentName, '朝トナメ');
    });

    test('sideGame active は sideGameActive として扱う', () {
      final state = TableDeviceHomeStateResolver.resolve(
        tableId: 'TableA',
        tableName: '卓A',
        tableStatus: 'ブラックジャック',
        tournamentDetail: const {
          'tournamentId': 'tn-1',
          'tournamentName': '朝トナメ',
        },
        sideGameTypes: const ['ブラックジャック'],
        registrationEnabled: true,
        currentBusinessDateKey: '2026-06-18',
        sideGameActive: true,
      );

      expect(state.kind, TableDeviceHomeKind.sideGameActive);
      expect(state.gameName, 'ブラックジャック');
      expect(state.tournamentName, '朝トナメ');
    });

    test('open なのに tournamentDetail がある場合は inconsistent', () {
      final state = TableDeviceHomeStateResolver.resolve(
        tableId: 'TableA',
        tableName: '卓A',
        tableStatus: 'open',
        tournamentDetail: const {
          'tournamentId': 'tn-1',
        },
        sideGameTypes: const ['ブラックジャック'],
        registrationEnabled: true,
        currentBusinessDateKey: '2026-06-18',
      );

      expect(state.kind, TableDeviceHomeKind.inconsistent);
      expect(state.message, contains('不整合'));
      expect(state.message, isNot(contains('tournamentDetail')));
      expect(state.message, isNot(contains('sideGame')));
    });

    test('sideGame 未 active の不整合メッセージに内部フィールド名を出さない', () {
      final state = TableDeviceHomeStateResolver.resolve(
        tableId: 'TableA',
        tableName: '卓A',
        tableStatus: 'ブラックジャック',
        tournamentDetail: null,
        sideGameTypes: const ['ブラックジャック'],
        registrationEnabled: true,
        currentBusinessDateKey: '2026-06-18',
        sideGameActive: false,
      );

      expect(state.kind, TableDeviceHomeKind.inconsistent);
      expect(state.message, contains('不整合'));
      expect(state.message, isNot(contains('sideGame.active')));
    });
  });
}
