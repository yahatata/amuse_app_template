import 'package:cloud_firestore/cloud_firestore.dart';

/// Firestore `scheduledTournaments/{tournamentId}/okibakeTemporaryEntries/{id}` の読み取り用モデル（Phase2）。
class OkibakeTemporaryEntry {
  OkibakeTemporaryEntry({
    required this.okibakeEntryId,
    required this.tournamentId,
    required this.temporaryDisplayName,
    required this.entryStatus,
    required this.billLinkStatus,
    required this.createdAt,
    this.okibakeAddonCount = 0,
    this.linkedUserId,
    this.linkedUserPokerName,
    this.memo,
    this.bustedAt,
  });

  final String okibakeEntryId;
  final String tournamentId;
  final String temporaryDisplayName;
  final String entryStatus;
  final String billLinkStatus;
  final DateTime? createdAt;
  final int okibakeAddonCount;
  final String? linkedUserId;
  final String? linkedUserPokerName;
  final String? memo;

  /// Phase 4 補完: `bustOkibakeTemporaryEntry` で書き込まれる退席時刻。
  final DateTime? bustedAt;

  factory OkibakeTemporaryEntry.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    final countRaw = d['okibakeAddonCount'];
    var addonCount = 0;
    if (countRaw is int) {
      addonCount = countRaw;
    } else if (countRaw is num) {
      addonCount = countRaw.toInt();
    }

    final linkedPn = d['linkedUserPokerName'];
    final linkedUserPokerName =
        linkedPn is String && linkedPn.trim().isNotEmpty ? linkedPn.trim() : null;

    final linkedUid = d['linkedUserId'];
    final linkedUserId =
        linkedUid is String && linkedUid.trim().isNotEmpty ? linkedUid.trim() : null;

    final memoRaw = d['memo'];
    final memo = memoRaw is String && memoRaw.trim().isNotEmpty ? memoRaw.trim() : null;

    return OkibakeTemporaryEntry(
      okibakeEntryId: doc.id,
      tournamentId: d['tournamentId'] as String? ?? '',
      temporaryDisplayName: d['temporaryDisplayName'] as String? ?? doc.id,
      entryStatus: d['entryStatus'] as String? ?? '',
      billLinkStatus: d['billLinkStatus'] as String? ?? '',
      createdAt: (d['createdAt'] as Timestamp?)?.toDate(),
      okibakeAddonCount: addonCount,
      linkedUserId: linkedUserId,
      linkedUserPokerName: linkedUserPokerName,
      memo: memo,
      bustedAt: (d['bustedAt'] as Timestamp?)?.toDate(),
    );
  }

  bool get isWaitingUnlinked =>
      entryStatus == 'registered' && billLinkStatus == 'unlinked';

  /// Phase 4 補完: トーナメント操作タブ「置きバケ一覧」の操作対象（§12.8.2）。
  /// `registered` / `seated` / `busted` かつ `unlinked` のみが操作対象。
  bool get isListTarget =>
      billLinkStatus == 'unlinked' &&
      (entryStatus == 'registered' ||
          entryStatus == 'seated' ||
          entryStatus == 'busted');

  /// Phase 4 補完: 退席後かつ unlinked。「置きバケ一覧」の主目的対象（§12.8.1）。
  bool get isBustedUnlinked =>
      entryStatus == 'busted' && billLinkStatus == 'unlinked';

  /// 待機者一覧の表示名（着席 Callable と同系統: linkedUserPokerName 優先）。
  String get waitingListDisplayName =>
      linkedUserPokerName ?? temporaryDisplayName;
}
