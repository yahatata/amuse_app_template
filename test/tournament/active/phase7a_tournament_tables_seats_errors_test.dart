import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_ops_user_facing_errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _TestFirebaseFunctionsException extends FirebaseFunctionsException {
  _TestFirebaseFunctionsException({
    required String message,
    required String code,
    dynamic details,
  }) : super(message: message, code: code, details: details);
}

void main() {
  tearDown(() {
    ErrorMessageRegistry.instance.clear();
  });

  group('Phase 7A Tournament tables/seats/okibake/table-detail', () {
    test('TOUR-35/37/39 callable fail: UID/path 非表示', () {
      final msg = mapTournamentOpsCallableError(
        _TestFirebaseFunctionsException(
          code: 'permission-denied',
          message: 'uid=secret-user path=/scheduledTournaments/t1/tables',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: kAddTableToTournamentOperation,
      );
      expect(msg, isNot(contains('uid=secret-user')));
      expect(msg, isNot(contains('secret-user')));
      expect(msg, isNot(contains('/scheduledTournaments')));
      expect(msg, isNotEmpty);

      final reseat = mapTournamentOpsCallableError(
        Exception('卓削除に失敗しました: uid=u99 tableId=T01'),
        operation: kRemoveTableFromTournamentOperation,
      );
      expect(reseat, isNot(contains('uid=u99')));
      expect(reseat, isNot(contains('tableId=T01')));

      final soft = mapTournamentOpsSoftFail(
        {
          'success': false,
          'message': 'uid=secret path=/internal/reseat',
          'error': 'stack/secret',
        },
        operation: kReseatAllPlayersOperation,
      );
      expect(soft, isNot(contains('uid=secret')));
      expect(soft, isNot(contains('/internal')));
      expect(soft, isNot(contains('stack/')));
    });

    test('TOUR-36/38 fail vs empty: 固定文言が空一覧と別', () {
      expect(kTournamentTablesLoadFailedMessage, isNot(contains('\$e')));
      expect(kTournamentTablesLoadFailedMessage, isNot(contains('Exception')));
      expect(
        kTournamentTablesLoadFailedMessage,
        isNot(equals('削除可能な卓がありません')),
      );
      expect(
        kTournamentTablesLoadFailedMessage,
        contains('取得できませんでした'),
      );
      expect(kTournamentCandidatesLoadFailedMessage, contains('候補'));
    });

    testWidgets('TOUR-42/49/52 stream fixed: raw/path 非表示', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                Text(
                  tournamentOpsStreamErrorMessage(
                    kTournamentActiveStaysLoadFailedMessage,
                    Exception(
                      'projects/x/databases/(default)/documents/activeStays/uid1',
                    ),
                  ),
                ),
                Text(
                  tournamentOpsStreamErrorMessage(
                    kTournamentUsersLoadFailedMessage,
                    Exception('Permission denied for users/abc'),
                  ),
                ),
                Text(
                  tournamentOpsStreamErrorMessage(
                    kTournamentOkibakeLoadFailedMessage,
                    Exception('okibakeTemporaryEntries/entry-secret'),
                  ),
                ),
              ],
            ),
          ),
        ),
      );

      expect(find.text(kTournamentActiveStaysLoadFailedMessage), findsOneWidget);
      expect(find.text(kTournamentUsersLoadFailedMessage), findsOneWidget);
      expect(find.text(kTournamentOkibakeLoadFailedMessage), findsOneWidget);
      expect(find.textContaining('projects/'), findsNothing);
      expect(find.textContaining('activeStays'), findsNothing);
      expect(find.textContaining('uid1'), findsNothing);
      expect(find.textContaining('Exception'), findsNothing);
      expect(find.textContaining('entry-secret'), findsNothing);
    });

    test('TOUR-44 assign fail mapping: raw fallback なし', () {
      final ffe = mapTournamentOpsCallableError(
        _TestFirebaseFunctionsException(
          code: 'failed-precondition',
          message: '指定された席は使用中です',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: kAssignSeatToPlayerOperation,
      );
      expect(ffe, contains('席'));
      expect(ffe, isNot(contains('failed-precondition')));

      final soft = mapTournamentOpsSoftFail(
        {
          'success': false,
          'message': 'userId=u1 seat=3 already taken',
        },
        operation: kAssignSeatToPlayerOperation,
      );
      expect(soft, isNot(contains('userId=u1')));
      expect(soft, isNot(contains('already taken')));
    });

    test('TOUR-51 entry load: not-found / permission / network / generic', () {
      expect(
        mapTournamentOkibakeEntryLoadError(
          FirebaseException(
            plugin: 'cloud_firestore',
            code: 'permission-denied',
            message: 'Missing or insufficient permissions.',
          ),
        ),
        kTournamentPermissionDeniedMessage,
      );
      expect(
        mapTournamentOkibakeEntryLoadError(
          FirebaseException(
            plugin: 'cloud_firestore',
            code: 'unavailable',
            message: 'network down path=/okibake/e1',
          ),
        ),
        kTournamentNetworkFailedMessage,
      );
      expect(
        mapTournamentOkibakeEntryLoadError(
          FirebaseException(
            plugin: 'cloud_firestore',
            code: 'not-found',
            message: 'No document to update: okibake/e1',
          ),
        ),
        kTournamentOkibakeNotFoundMessage,
      );
      expect(
        mapTournamentOkibakeEntryLoadError(Exception('secret stack')),
        kTournamentOkibakeLoadFailedMessage,
      );
      expect(kTournamentOkibakeNotFoundMessage, isNot(contains('secret')));
      expect(kTournamentOkibakeBadDataMessage, isNot(contains('templateId')));
    });

    test('TOUR-111/113/114 stream fail ≠ 0 / raw 非表示', () {
      expect(
        tournamentOpsStreamMessage(hasStaleData: false),
        isNot(contains('0')),
      );
      expect(
        tournamentOpsStreamMessage(hasStaleData: true),
        kTournamentStaleUpdateFailedMessage,
      );
      expect(kTournamentCountUnavailableDisplay, isNot(equals('0')));
      expect(kTournamentCountUnavailableDisplay, isNot(equals('エラー')));
      expect(kTournamentCountUnavailableDisplay, isNot(contains('Exception')));
      expect(
        kTournamentSeatedCountLoadFailedMessage,
        isNot(contains('\$e')),
      );
    });

    test('TOUR-47 confirm: 待機リスト文言は業務安全', () {
      expect(kTournamentWaitingNotInListMessage, contains('待機リスト'));
      expect(kTournamentWaitingNotInListMessage, isNot(contains('\$e')));
      expect(kTournamentWaitingNotInListMessage, isNot(contains('Exception')));
      expect(kTournamentWaitingNotInListMessage, isNot(contains('userId')));
    });
  });
}
