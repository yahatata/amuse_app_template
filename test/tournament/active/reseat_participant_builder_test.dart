import 'package:amuse_app_template/tournament/active/models/okibake_temporary_entry.dart';
import 'package:amuse_app_template/tournament/active/models/reseat_participant.dart';
import 'package:amuse_app_template/tournament/active/models/seat_data.dart';
import 'package:amuse_app_template/tournament/active/models/table_and_users.dart';
import 'package:amuse_app_template/tournament/active/utils/reseat_participant_builder.dart';
import 'package:flutter_test/flutter_test.dart';

OkibakeTemporaryEntry _entry({
  required String id,
  required String entryStatus,
  required String billLinkStatus,
  String? linkedUserId,
  String? linkedUserPokerName,
  String? assignedTableId,
  String? assignedSeatKey,
}) {
  return OkibakeTemporaryEntry(
    okibakeEntryId: id,
    tournamentId: 't1',
    temporaryDisplayName: 'オキバケA',
    entryStatus: entryStatus,
    billLinkStatus: billLinkStatus,
    createdAt: DateTime(2026, 1, 1),
    linkedUserId: linkedUserId,
    linkedUserPokerName: linkedUserPokerName,
    assignedTableId: assignedTableId,
    assignedSeatKey: assignedSeatKey,
  );
}

TournamentTable _tableWithSeats({
  required String tableId,
  required Map<int, SeatData> seats,
}) {
  return TournamentTable(
    tableId: tableId,
    name: tableId,
    maxSeats: 6,
    status: 'open',
    isEnabled: true,
    seats: seats,
  );
}

void main() {
  group('OkibakeTemporaryEntry.isReseatCandidate', () {
    test('registered + unlinked は候補', () {
      expect(_entry(id: 'o1', entryStatus: 'registered', billLinkStatus: 'unlinked')
          .isReseatCandidate, isTrue);
    });

    test('seated + linked は候補', () {
      expect(_entry(id: 'o2', entryStatus: 'seated', billLinkStatus: 'linked')
          .isReseatCandidate, isTrue);
    });

    test('busted / voided / pending_review は候補外', () {
      expect(_entry(id: 'o3', entryStatus: 'busted', billLinkStatus: 'unlinked')
          .isReseatCandidate, isFalse);
      expect(_entry(id: 'o4', entryStatus: 'voided', billLinkStatus: 'unlinked')
          .isReseatCandidate, isFalse);
      expect(
          _entry(id: 'o5', entryStatus: 'registered', billLinkStatus: 'pending_review')
              .isReseatCandidate,
          isFalse);
    });
  });

  group('ReseatParticipantBuilder.build', () {
    test('registered + unlinked の置きバケが候補に出る', () {
      final candidates = ReseatParticipantBuilder.build(
        regularWaitingPlayers: const [],
        okibakeEntries: [
          _entry(id: 'ok1', entryStatus: 'registered', billLinkStatus: 'unlinked'),
        ],
        tables: const [],
      );

      expect(candidates.length, 1);
      expect(candidates.single.participantType, ReseatParticipantType.okibake);
      expect(candidates.single.isCurrentlySeated, isFalse);
      expect(candidates.single.listDisplayName, 'オキバケA（置きバケ）');
    });

    test('seated + unlinked の置きバケが候補に出る', () {
      final candidates = ReseatParticipantBuilder.build(
        regularWaitingPlayers: const [],
        okibakeEntries: [
          _entry(
            id: 'ok2',
            entryStatus: 'seated',
            billLinkStatus: 'unlinked',
            assignedTableId: 'table1',
            assignedSeatKey: 'seat02',
          ),
        ],
        tables: [
          _tableWithSeats(
            tableId: 'table1',
            seats: {
              2: SeatData(
                okibakeEntryId: 'ok2',
                pokerName: 'オキバケA',
              ),
            },
          ),
        ],
      );

      expect(candidates.length, 1);
      expect(candidates.single.isCurrentlySeated, isTrue);
      expect(candidates.single.currentTableId, 'table1');
      expect(candidates.single.currentSeatNumber, 2);
    });

    test('registered + linked / seated + linked の置きバケが候補に出る', () {
      final registeredLinked = ReseatParticipantBuilder.build(
        regularWaitingPlayers: const [],
        okibakeEntries: [
          _entry(
            id: 'ok3',
            entryStatus: 'registered',
            billLinkStatus: 'linked',
            linkedUserId: 'u_remote',
          ),
        ],
        tables: const [],
      );
      expect(registeredLinked.length, 1);

      final seatedLinked = ReseatParticipantBuilder.build(
        regularWaitingPlayers: const [],
        okibakeEntries: [
          _entry(
            id: 'ok4',
            entryStatus: 'seated',
            billLinkStatus: 'linked',
            linkedUserId: 'u_remote2',
          ),
        ],
        tables: const [],
      );
      expect(seatedLinked.length, 1);
    });

    test('linkedUserId が通常参加者候補と重複する場合、置きバケは二重表示されない', () {
      final candidates = ReseatParticipantBuilder.build(
        regularWaitingPlayers: const [],
        okibakeEntries: [
          _entry(
            id: 'ok_linked',
            entryStatus: 'seated',
            billLinkStatus: 'linked',
            linkedUserId: 'user_normal',
            linkedUserPokerName: '山田太郎',
          ),
        ],
        tables: [
          _tableWithSeats(
            tableId: 'table1',
            seats: {
              1: SeatData(
                userId: 'user_normal',
                pokerName: '山田太郎',
              ),
            },
          ),
        ],
      );

      expect(candidates.length, 1);
      expect(candidates.single.participantType, ReseatParticipantType.normal);
      expect(candidates.single.userId, 'user_normal');
    });

    test('pending_review / busted / voided は候補に出ない', () {
      final candidates = ReseatParticipantBuilder.build(
        regularWaitingPlayers: const [],
        okibakeEntries: [
          _entry(id: 'x1', entryStatus: 'busted', billLinkStatus: 'unlinked'),
          _entry(id: 'x2', entryStatus: 'voided', billLinkStatus: 'unlinked'),
          _entry(id: 'x3', entryStatus: 'registered', billLinkStatus: 'pending_review'),
        ],
        tables: const [],
      );

      expect(candidates, isEmpty);
    });

    test('通常待機参加者は従来通り候補に含まれる', () {
      final candidates = ReseatParticipantBuilder.build(
        regularWaitingPlayers: [
          WaitingPlayer(
            userId: 'wait1',
            displayName: '待機太郎',
            joinedAt: DateTime(2026, 1, 1),
          ),
        ],
        okibakeEntries: const [],
        tables: const [],
      );

      expect(candidates.length, 1);
      expect(candidates.single.participantType, ReseatParticipantType.normal);
      expect(candidates.single.listDisplayName, '待機太郎');
    });
  });
}
