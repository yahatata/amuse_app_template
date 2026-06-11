import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/tournament/active/utils/active_tournament_table_usage.dart';

const _sideGameTypes = ['ブラックジャック', 'バカラ'];

void main() {
  group('active_tournament_table_usage', () {
    test('isActiveTournamentStatus', () {
      expect(isActiveTournamentStatus('running'), true);
      expect(isActiveTournamentStatus('ended'), false);
      expect(isActiveTournamentStatus('cancelled'), false);
    });

    test('tablesSeat doc 相当: userId/okibake なし → occupied=false', () {
      final seats = <String, dynamic>{};
      for (var i = 1; i <= 6; i++) {
        final nn = i.toString().padLeft(2, '0');
        seats['seat${nn}UserId'] = null;
        seats['seat${nn}PokerName'] = null;
      }
      expect(hasOccupiedSeats(seats), false);
      expect(
        hasOccupiedSeats(
          extractSeatsFlatFromTableSeatDoc({
            'maxSeats': 6,
            'isEnabled': true,
            'seats': seats,
          }),
        ),
        false,
      );
    });

    test('seatXXPokerName のみ → occupied=false', () {
      expect(
        hasOccupiedSeats({
          'seat01UserId': null,
          'seat01PokerName': '名前のみ',
        }),
        false,
      );
    });

    test('userId あり → occupied=true', () {
      expect(
        hasOccupiedSeats({
          'seat01UserId': 'u1',
          'seat01PokerName': 'P1',
        }),
        true,
      );
    });

    test('okibakeEntryId のみ → occupied=true', () {
      expect(
        hasOccupiedSeats({
          'seat01UserId': null,
          'seat01PokerName': '置きバケ',
          'seat01OkibakeEntryId': 'okibake_1',
        }),
        true,
      );
    });

    test('非文字列 userId は着席扱いしない', () {
      expect(
        hasOccupiedSeats({
          'seat01UserId': 0,
          'seat01PokerName': 'P1',
        }),
        false,
      );
    });

    test('文字列 "null" の userId は着席扱いしない', () {
      expect(
        hasOccupiedSeats({
          'seat01UserId': 'null',
          'seat01PokerName': 'P1',
        }),
        false,
      );
    });

    test('shouldRejectSideGameStart: registered かつ occupied=false → 拒否しない', () {
      const usage = ActiveTournamentTableUsage(
        isRegisteredInAnyActiveTournament: true,
        hasOccupiedSeatsInAnyActiveTournament: false,
      );
      expect(shouldRejectSideGameStartForTournamentUsage(usage), false);
    });

    test('shouldRejectSideGameStart: occupied=true → 拒否する', () {
      const usage = ActiveTournamentTableUsage(
        isRegisteredInAnyActiveTournament: true,
        hasOccupiedSeatsInAnyActiveTournament: true,
      );
      expect(shouldRejectSideGameStartForTournamentUsage(usage), true);
    });

    group('resolveTableStatusAfterSideGameEnd', () {
      test('registered / 着席なし → tournament', () {
        expect(
          resolveTableStatusAfterSideGameEnd(
            const ActiveTournamentTableUsage(
              isRegisteredInAnyActiveTournament: true,
              hasOccupiedSeatsInAnyActiveTournament: false,
            ),
          ),
          'tournament',
        );
      });

      test('registered / 着席あり → tournament', () {
        expect(
          resolveTableStatusAfterSideGameEnd(
            const ActiveTournamentTableUsage(
              isRegisteredInAnyActiveTournament: true,
              hasOccupiedSeatsInAnyActiveTournament: true,
            ),
          ),
          'tournament',
        );
      });

      test('未登録 → open', () {
        expect(
          resolveTableStatusAfterSideGameEnd(ActiveTournamentTableUsage.empty),
          'open',
        );
      });
    });

    group('resolveSideGameTableListPresentation', () {
      test('open + 未登録 → 使用可能', () {
        final presentation = resolveSideGameTableListPresentation(
          tablesStatus: 'open',
          sideGameTypes: _sideGameTypes,
          usage: ActiveTournamentTableUsage.empty,
        );
        expect(presentation.kind, SideGameTableListPresentationKind.available);
        expect(presentation.label, '使用可能');
      });

      test('open + 登録あり + 着席なし → トーナメント登録中', () {
        final presentation = resolveSideGameTableListPresentation(
          tablesStatus: 'open',
          sideGameTypes: _sideGameTypes,
          usage: const ActiveTournamentTableUsage(
            isRegisteredInAnyActiveTournament: true,
            hasOccupiedSeatsInAnyActiveTournament: false,
          ),
        );
        expect(
          presentation.kind,
          SideGameTableListPresentationKind.tournamentRegistered,
        );
        expect(presentation.label, 'トーナメント登録中');
      });

      test('open + 登録あり + 着席あり → トーナメント着席中', () {
        final presentation = resolveSideGameTableListPresentation(
          tablesStatus: 'open',
          sideGameTypes: _sideGameTypes,
          usage: const ActiveTournamentTableUsage(
            isRegisteredInAnyActiveTournament: true,
            hasOccupiedSeatsInAnyActiveTournament: true,
          ),
        );
        expect(
          presentation.kind,
          SideGameTableListPresentationKind.tournamentSeated,
        );
        expect(presentation.label, 'トーナメント着席中');
      });

      test('tournament + 登録あり + 着席なし → トーナメント登録中', () {
        final presentation = resolveSideGameTableListPresentation(
          tablesStatus: 'tournament',
          sideGameTypes: _sideGameTypes,
          usage: const ActiveTournamentTableUsage(
            isRegisteredInAnyActiveTournament: true,
            hasOccupiedSeatsInAnyActiveTournament: false,
          ),
        );
        expect(
          presentation.kind,
          SideGameTableListPresentationKind.tournamentRegistered,
        );
        expect(presentation.label, 'トーナメント登録中');
      });

      test('tournament + 登録あり + 着席あり → トーナメント着席中', () {
        final presentation = resolveSideGameTableListPresentation(
          tablesStatus: 'tournament',
          sideGameTypes: _sideGameTypes,
          usage: const ActiveTournamentTableUsage(
            isRegisteredInAnyActiveTournament: true,
            hasOccupiedSeatsInAnyActiveTournament: true,
          ),
        );
        expect(
          presentation.kind,
          SideGameTableListPresentationKind.tournamentSeated,
        );
        expect(presentation.label, 'トーナメント着席中');
      });

      test('status が sideGameTypes → サイドゲーム中表示を優先', () {
        final presentation = resolveSideGameTableListPresentation(
          tablesStatus: 'ブラックジャック',
          sideGameTypes: _sideGameTypes,
          usage: const ActiveTournamentTableUsage(
            isRegisteredInAnyActiveTournament: true,
            hasOccupiedSeatsInAnyActiveTournament: true,
          ),
        );
        expect(
          presentation.kind,
          SideGameTableListPresentationKind.sideGameActive,
        );
        expect(presentation.label, 'ブラックジャック');
      });
    });

    group('shouldShowSideGameOverwriteWarning', () {
      test('トーナメント登録中は警告する', () {
        expect(
          shouldShowSideGameOverwriteWarning(
            tablesStatus: 'tournament',
            sideGameTypes: _sideGameTypes,
            usage: const ActiveTournamentTableUsage(
              isRegisteredInAnyActiveTournament: true,
              hasOccupiedSeatsInAnyActiveTournament: false,
            ),
          ),
          true,
        );
      });

      test('使用可能は警告しない', () {
        expect(
          shouldShowSideGameOverwriteWarning(
            tablesStatus: 'open',
            sideGameTypes: _sideGameTypes,
            usage: ActiveTournamentTableUsage.empty,
          ),
          false,
        );
      });
    });
  });
}
