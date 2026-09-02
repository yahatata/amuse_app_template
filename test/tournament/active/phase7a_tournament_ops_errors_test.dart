import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_ops_user_facing_errors.dart';
import 'package:cloud_functions/cloud_functions.dart';
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

  group('Phase 7A Tournament ops', () {
    test('TOUR-01 fail vs not-found constants', () {
      expect(
        tournamentOpsHomeLoadErrorMessage(notFound: true),
        kTournamentNotFoundMessage,
      );
      expect(
        tournamentOpsHomeLoadErrorMessage(notFound: false),
        kTournamentDataLoadFailedMessage,
      );
      expect(kTournamentNotFoundMessage, isNot(equals(kTournamentDataLoadFailedMessage)));
      expect(kTournamentNotFoundMessage, isNot(contains('\$e')));
      expect(kTournamentDataLoadFailedMessage, isNot(contains('Exception')));
    });

    test('TOUR-10/11/15/16 end mapping: UID/path 非表示', () {
      final ffe = mapTournamentOpsCallableError(
        _TestFirebaseFunctionsException(
          code: 'permission-denied',
          message: 'uid=secret-user path=/scheduledTournaments/t1/views/main',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: 'endTournament',
      );
      expect(ffe, isNot(contains('uid=secret-user')));
      expect(ffe, isNot(contains('/scheduledTournaments')));
      expect(ffe, isNot(contains('secret-user')));
      expect(ffe, isNotEmpty);

      final generic = mapTournamentOpsCallableError(
        Exception('secret internal stack path=/internal/end'),
        operation: 'endTournament',
      );
      expect(generic, isNot(contains('secret')));
      expect(generic, isNot(contains('/internal/end')));
      expect(generic, isNotEmpty);
    });

    testWidgets('TOUR-12 stream helper: raw 非表示', (tester) async {
      final secret = Exception('projects/x/databases/(default)/documents/t1');
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                Text(
                  tournamentOpsStreamMessage(
                    hasStaleData: false,
                    error: secret,
                  ),
                ),
                Text(
                  tournamentOpsStreamMessage(
                    hasStaleData: true,
                    error: secret,
                  ),
                ),
              ],
            ),
          ),
        ),
      );

      expect(find.text(kTournamentStreamLoadFailedMessage), findsOneWidget);
      expect(find.text(kTournamentStaleUpdateFailedMessage), findsOneWidget);
      expect(find.textContaining('projects/'), findsNothing);
      expect(find.textContaining('Exception'), findsNothing);
    });

    test('TOUR-18/23 load catch mapping: raw 非表示', () {
      final prize = mapTournamentOpsCallableError(
        _TestFirebaseFunctionsException(
          code: 'internal',
          message: 'getPrizeData failed uid=u1 templateId=tpl-9',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: 'getPrizeData',
      );
      expect(prize, isNot(contains('uid=u1')));
      expect(prize, isNot(contains('templateId')));
      expect(prize, isNot(contains('getPrizeData failed')));

      final ranking = mapTournamentOpsCallableError(
        Exception('ranking load boom /views/main'),
        operation: 'getRankingData',
      );
      expect(ranking, isNot(contains('ranking load boom')));
      expect(ranking, isNot(contains('/views/main')));
    });

    test('TOUR-21/28 save mapping: raw 非表示', () {
      final prizeSave = mapTournamentOpsCallableError(
        _TestFirebaseFunctionsException(
          code: 'failed-precondition',
          message: 'setPrizeData rejected path=/prize',
          details: {'errorKey': 'UNKNOWN_ERROR'},
        ),
        operation: 'setPrizeData',
      );
      expect(prizeSave, isNot(contains('setPrizeData rejected')));
      expect(prizeSave, isNot(contains('/prize')));

      final rankSave = mapTournamentOpsCallableError(
        Exception('setRankingData crash uid=abc'),
        operation: 'setRankingData',
      );
      expect(rankSave, isNot(contains('setRankingData crash')));
      expect(rankSave, isNot(contains('uid=abc')));
    });

    test('TOUR-25 prizeConversion 内部名を出さない', () {
      expect(kTournamentPrizeConversionMissingMessage, isNot(contains('prizeConversion')));
      expect(kTournamentPrizeConversionMissingMessage, contains('プライズ'));
      expect(kTournamentPrizeConversionMissingMessage, isNot(contains('\$e')));
    });

    test('TOUR-30/31 blind load/stream fixed messages', () {
      expect(
        tournamentOpsStreamErrorMessage(
          kTournamentBlindLoadFailedMessage,
          Exception('e.toString() leak'),
        ),
        kTournamentBlindLoadFailedMessage,
      );
      expect(
        tournamentOpsStreamErrorMessage(
          kTournamentListLoadFailedMessage,
          Exception('snapshot.error leak'),
        ),
        kTournamentListLoadFailedMessage,
      );
      expect(kTournamentBlindLoadFailedMessage, isNot(contains('toString')));
      expect(kTournamentListLoadFailedMessage, isNot(contains('snapshot')));
      expect(kTournamentNotFoundMessage, isNot(equals(kTournamentBlindLoadFailedMessage)));
    });
  });
}
