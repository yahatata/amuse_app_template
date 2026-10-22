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
    this.addonIntent,
    this.assignedTableId,
    this.assignedSeatKey,
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
  final String? addonIntent;

  /// Phase 4 補完: `bustOkibakeTemporaryEntry` で書き込まれる退席時刻。
  final DateTime? bustedAt;

  final String? assignedTableId;
  final String? assignedSeatKey;

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
    final addonIntentRaw = d['addonIntent'];
    final addonIntent = addonIntentRaw is String && addonIntentRaw.trim().isNotEmpty
        ? addonIntentRaw.trim()
        : null;

    final assignedTableRaw = d['assignedTableId'];
    final assignedTableId = assignedTableRaw is String &&
            assignedTableRaw.trim().isNotEmpty
        ? assignedTableRaw.trim()
        : null;
    final assignedSeatRaw = d['assignedSeatKey'];
    final assignedSeatKey = assignedSeatRaw is String &&
            assignedSeatRaw.trim().isNotEmpty
        ? assignedSeatRaw.trim()
        : null;

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
      addonIntent: addonIntent,
      assignedTableId: assignedTableId,
      assignedSeatKey: assignedSeatKey,
    );
  }

  /// 全員リシート候補対象（registered/seated × unlinked/linked）。
  bool get isReseatCandidate {
    const validEntry = {'registered', 'seated'};
    const validBill = {'unlinked', 'linked'};
    return validEntry.contains(entryStatus) &&
        validBill.contains(billLinkStatus);
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
