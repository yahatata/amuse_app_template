import 'package:amuse_app_template/Home/home_list_load_errors.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/sideGame/side_game_user_facing_errors.dart';
import 'package:amuse_app_template/tableDevice/models/table_device_home_state.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('Phase 9 residual fixes', () {
    test('admin user load fail message has no raw exception', () {
      expect(kHomeUsersListLoadFailedMessage, isNot(contains('Exception')));
      expect(kHomeUsersListLoadFailedMessage, isNot(contains('\$e')));
      expect(kHomeUsersListLoadFailedMessage, contains('ユーザー'));
    });

    test('menu sold-out catch mapping hides secrets', () {
      final msg = mapCallableError(
        Exception('secret internal path=/menus/x'),
      ).message;
      expect(msg, isNot(contains('secret')));
      expect(msg, isNot(contains('/menus')));
    });

    test('side game permissions fail ≠ empty list', () {
      expect(
        kSideGameTableListLoadFailedMessage,
        isNot(equals('表示できる卓がありません')),
      );
      expect(kSideGameTableListLoadFailedMessage, isNot(contains('\$e')));
    });

    test('table device inconsistent messages hide internal field names', () {
      final openWithDetail = TableDeviceHomeStateResolver.resolve(
        tableId: 'T1',
        tableStatus: 'open',
        tournamentDetail: const {'tournamentId': 'x'},
        sideGameTypes: const [],
        registrationEnabled: true,
      );
      expect(openWithDetail.kind, TableDeviceHomeKind.inconsistent);
      expect(openWithDetail.message, isNot(contains('tournamentDetail')));
      expect(openWithDetail.message, isNot(contains('sideGame.active')));

      final sideInactive = TableDeviceHomeStateResolver.resolve(
        tableId: 'T1',
        tableStatus: 'BJ',
        tournamentDetail: null,
        sideGameTypes: const ['BJ'],
        registrationEnabled: true,
        sideGameActive: false,
      );
      expect(sideInactive.kind, TableDeviceHomeKind.inconsistent);
      expect(sideInactive.message, isNot(contains('sideGame')));
    });

    testWidgets('fail strings render without raw', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                Text(kHomeUsersListLoadFailedMessage),
                Text(kSideGameTableListLoadFailedMessage),
                Text(mapCallableError(Exception('boom')).message),
              ],
            ),
          ),
        ),
      );
      expect(find.textContaining('Exception'), findsNothing);
      expect(find.textContaining('boom'), findsNothing);
    });
  });
}
