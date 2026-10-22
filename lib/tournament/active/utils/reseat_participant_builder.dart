import 'package:amuse_app_template/tournament/active/models/okibake_temporary_entry.dart';
import 'package:amuse_app_template/tournament/active/models/reseat_participant.dart';
import 'package:amuse_app_template/tournament/active/models/table_and_users.dart';

/// 全員リシート候補を通常参加者 + 置きバケから組み立てる（純粋関数）。
class ReseatParticipantBuilder {
  ReseatParticipantBuilder._();

  static int? parseSeatNumberFromSeatKey(String? seatKey) {
    if (seatKey == null || seatKey.trim().isEmpty) return null;
    final trimmed = seatKey.trim();
    final withPrefix = RegExp(r'^seat(\d{1,2})$', caseSensitive: false)
        .firstMatch(trimmed);
    if (withPrefix != null) {
      return int.tryParse(withPrefix.group(1)!);
    }
    return int.tryParse(trimmed);
  }

  /// [regularWaitingPlayers] は通常待機のみ（`isOkibakeTemporary == false`）。
  static List<ReseatParticipant> build({
    required List<WaitingPlayer> regularWaitingPlayers,
    required List<OkibakeTemporaryEntry> okibakeEntries,
    required List<TournamentTable> tables,
  }) {
    final normalUserIds = <String>{};
    final candidates = <ReseatParticipant>[];
    final okibakeSeatByEntryId = <String, ({String tableId, int seatNumber})>{};

    for (final table in tables) {
      for (final entry in table.seats.entries) {
        final seatNumber = entry.key;
        final seatData = entry.value;
        final uid = seatData.userId;
        if (uid != null && uid.isNotEmpty) {
          normalUserIds.add(uid);
          candidates.add(
            ReseatParticipant(
              participantType: ReseatParticipantType.normal,
              selectionKey: uid,
              displayName: seatData.pokerName ?? 'ユーザー$uid',
              isCurrentlySeated: true,
              userId: uid,
              currentTableId: table.tableId,
              currentSeatNumber: seatNumber,
            ),
          );
        }

        final okibakeId = seatData.okibakeEntryId;
        if (okibakeId != null &&
            okibakeId.isNotEmpty &&
            seatData.isOkibakeSeat) {
          okibakeSeatByEntryId[okibakeId] = (
            tableId: table.tableId,
            seatNumber: seatNumber,
          );
        }
      }
    }

    for (final player in regularWaitingPlayers) {
      if (player.isOkibakeTemporary) continue;
      if (normalUserIds.contains(player.userId)) continue;
      normalUserIds.add(player.userId);
      candidates.add(
        ReseatParticipant(
          participantType: ReseatParticipantType.normal,
          selectionKey: player.userId,
          displayName: player.displayName,
          isCurrentlySeated: false,
          userId: player.userId,
          joinedAt: player.joinedAt,
        ),
      );
    }

    for (final entry in okibakeEntries) {
      if (!entry.isReseatCandidate) continue;

      // 伝票紐付け後は同一人物が waiting / 卓席の通常参加者として既にいる。
      // linkedUserId が通常参加者 ID と一致する置きバケ行は二重表示しない。
      final linkedUid = entry.linkedUserId;
      if (linkedUid != null &&
          linkedUid.isNotEmpty &&
          normalUserIds.contains(linkedUid)) {
        continue;
      }

      final seatFromTable = okibakeSeatByEntryId[entry.okibakeEntryId];
      final tableId = seatFromTable?.tableId ?? entry.assignedTableId;
      final seatNumber = seatFromTable?.seatNumber ??
          parseSeatNumberFromSeatKey(entry.assignedSeatKey);
      final isSeated = entry.entryStatus == 'seated' ||
          seatFromTable != null ||
          (tableId != null && seatNumber != null);

      candidates.add(
        ReseatParticipant(
          participantType: ReseatParticipantType.okibake,
          selectionKey: ReseatParticipant.okibakeSelectionKey(entry.okibakeEntryId),
          displayName: entry.waitingListDisplayName,
          isCurrentlySeated: isSeated,
          okibakeEntryId: entry.okibakeEntryId,
          currentTableId: tableId,
          currentSeatNumber: seatNumber,
          joinedAt: entry.createdAt,
          entryStatus: entry.entryStatus,
          billLinkStatus: entry.billLinkStatus,
          linkedUserId: entry.linkedUserId,
        ),
      );
    }

    return candidates;
  }

  /// 着席中の候補の selectionKey（自動選択用）。
  static List<String> seatedSelectionKeys(List<ReseatParticipant> candidates) =>
      candidates
          .where((c) => c.isCurrentlySeated)
          .map((c) => c.selectionKey)
          .toList();
}
