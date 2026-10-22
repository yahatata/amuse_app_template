import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:amuse_app_template/services/store_meta_service.dart';
import 'package:intl/intl.dart';

/// 占有判定対象の scheduledTournament.status
const activeTournamentStatuses = <String>[
  'scheduled',
  'running',
  'registered',
  'paused',
];

/// 占有判定から除外する scheduledTournament.status
const closedOrInvalidTournamentStatuses = <String>[
  'ended',
  'force_ended',
  'cancelled',
  'canceled',
];

final _seatOccupancyKeyPattern = RegExp(
  r'^seat\d{1,2}(UserId|OkibakeEntryId)$',
);

final _seatFlatKeyPattern = RegExp(
  r'^seat\d{1,2}(UserId|PokerName|OkibakeEntryId)$',
);

bool isActiveTournamentStatus(String? status) {
  if (status == null || status.isEmpty) return false;
  return activeTournamentStatuses.contains(status);
}

bool isClosedOrInvalidTournamentStatus(String? status) {
  if (status == null || status.isEmpty) return true;
  return closedOrInvalidTournamentStatuses.contains(status);
}

/// 着席 ID として有効な非空文字列か（userId / okibakeEntryId 用）。
bool isNonEmptySeatIdValue(Object? value) {
  if (value is! String) return false;
  final trimmed = value.trim();
  if (trimmed.isEmpty) return false;
  // Firestore / 手入力で文字列 "null" が入っているケースは空席扱い
  if (trimmed == 'null' || trimmed == 'undefined') return false;
  return true;
}

/// tablesSeat ドキュメントから seats フラットマップを取り出す。
/// ネスト `seats` と root の seatXX* キーをマージする。
Map<String, dynamic> extractSeatsFlatFromTableSeatDoc(
  Map<String, dynamic> tableSeatData,
) {
  final merged = <String, dynamic>{};

  void absorb(Map<dynamic, dynamic> source) {
    for (final entry in source.entries) {
      final key = entry.key;
      if (key is! String) continue;
      if (!_seatFlatKeyPattern.hasMatch(key)) continue;
      merged[key] = entry.value;
    }
  }

  final nested = tableSeatData['seats'];
  if (nested is Map) {
    absorb(nested);
  }
  absorb(tableSeatData);

  return merged;
}

/// [seatsFlat] に着席者（userId または okibakeEntryId）が1席でもあれば true。
///
/// seatXXPokerName のみ・ドキュメントメタデータ（maxSeats 等）は着席扱いしない。
bool hasOccupiedSeats(Map<String, dynamic> seatsFlat, {int? maxSeats}) {
  for (final entry in seatsFlat.entries) {
    final key = entry.key;
    if (key is! String) continue;
    if (!_seatOccupancyKeyPattern.hasMatch(key)) continue;
    if (isNonEmptySeatIdValue(entry.value)) return true;
  }
  return false;
}

/// 未終了TNにおける卓の利用状況（SG選択・SG終了復元で共用）。
class ActiveTournamentTableUsage {
  const ActiveTournamentTableUsage({
    required this.isRegisteredInAnyActiveTournament,
    required this.hasOccupiedSeatsInAnyActiveTournament,
  });

  static const empty = ActiveTournamentTableUsage(
    isRegisteredInAnyActiveTournament: false,
    hasOccupiedSeatsInAnyActiveTournament: false,
  );

  /// いずれかの未終了TNに tablesSeat/{tableId} が存在する。
  final bool isRegisteredInAnyActiveTournament;

  /// いずれかの未終了TNの tablesSeat/{tableId} に着席者がいる。
  final bool hasOccupiedSeatsInAnyActiveTournament;
}

/// SG一覧の表示種別。
enum SideGameTableListPresentationKind {
  sideGameActive,
  tournamentSeated,
  tournamentRegistered,
  available,
  otherInUse,
}

/// SG一覧1卓分の表示情報。
class SideGameTableListPresentation {
  const SideGameTableListPresentation({
    required this.kind,
    required this.label,
  });

  final SideGameTableListPresentationKind kind;
  final String label;
}

/// SG一覧表示（tables.status + usage）を決定する。
SideGameTableListPresentation resolveSideGameTableListPresentation({
  required String tablesStatus,
  required List<String> sideGameTypes,
  required ActiveTournamentTableUsage usage,
}) {
  if (sideGameTypes.contains(tablesStatus)) {
    return SideGameTableListPresentation(
      kind: SideGameTableListPresentationKind.sideGameActive,
      label: tablesStatus,
    );
  }
  if (usage.hasOccupiedSeatsInAnyActiveTournament) {
    return const SideGameTableListPresentation(
      kind: SideGameTableListPresentationKind.tournamentSeated,
      label: 'トーナメント着席中',
    );
  }
  if (usage.isRegisteredInAnyActiveTournament) {
    return const SideGameTableListPresentation(
      kind: SideGameTableListPresentationKind.tournamentRegistered,
      label: 'トーナメント登録中',
    );
  }
  if (tablesStatus == 'open') {
    return const SideGameTableListPresentation(
      kind: SideGameTableListPresentationKind.available,
      label: '使用可能',
    );
  }
  return SideGameTableListPresentation(
    kind: SideGameTableListPresentationKind.otherInUse,
    label: '$tablesStatus使用中',
  );
}

/// SG開始を拒否すべきか（着席者ありのときのみ true）。
bool shouldRejectSideGameStartForTournamentUsage(
  ActiveTournamentTableUsage usage,
) {
  return usage.hasOccupiedSeatsInAnyActiveTournament;
}

/// SG開始前に上書き確認ダイアログを出すべきか。
bool shouldShowSideGameOverwriteWarning({
  required String tablesStatus,
  required List<String> sideGameTypes,
  required ActiveTournamentTableUsage usage,
}) {
  final presentation = resolveSideGameTableListPresentation(
    tablesStatus: tablesStatus,
    sideGameTypes: sideGameTypes,
    usage: usage,
  );
  return presentation.kind ==
          SideGameTableListPresentationKind.tournamentRegistered ||
      presentation.kind == SideGameTableListPresentationKind.otherInUse;
}

/// トーナメント占有判定で参照する営業日キー（当日 TN のみ対象にする）。
Future<String> resolveBusinessDateKeyForActiveTournamentLookup(
  FirebaseFirestore firestore,
) async {
  final meta = StoreMetaService.instance.latestData;
  if (meta != null &&
      meta.isRunning &&
      meta.currentBusinessDateKey != null &&
      meta.currentBusinessDateKey!.isNotEmpty) {
    return meta.currentBusinessDateKey!;
  }

  final snap =
      await firestore.collection('storeMeta').doc('currentBusinessDay').get();
  final data = snap.data();
  final status = data?['status'] as String?;
  final key = data?['currentBusinessDateKey'] as String?;
  if (status == 'running' && key != null && key.isNotEmpty) {
    return key;
  }

  return DateFormat('yyyy-MM-dd').format(DateTime.now());
}

ActiveTournamentTableUsage _mergeTableUsage(
  ActiveTournamentTableUsage current,
  ActiveTournamentTableUsage next,
) {
  return ActiveTournamentTableUsage(
    isRegisteredInAnyActiveTournament:
        current.isRegisteredInAnyActiveTournament ||
            next.isRegisteredInAnyActiveTournament,
    hasOccupiedSeatsInAnyActiveTournament:
        current.hasOccupiedSeatsInAnyActiveTournament ||
            next.hasOccupiedSeatsInAnyActiveTournament,
  );
}

ActiveTournamentTableUsage _usageFromTableSeatDoc(
  Map<String, dynamic> tableSeatData,
) {
  if (tableSeatData['isEnabled'] == false) {
    return ActiveTournamentTableUsage.empty;
  }
  final seats = extractSeatsFlatFromTableSeatDoc(tableSeatData);
  return ActiveTournamentTableUsage(
    isRegisteredInAnyActiveTournament: true,
    hasOccupiedSeatsInAnyActiveTournament: hasOccupiedSeats(seats),
  );
}

/// [tableId] について、当日・未終了TNの tablesSeat を横断確認する。
Future<ActiveTournamentTableUsage> findActiveTournamentTableUsage(
  FirebaseFirestore firestore,
  String tableId,
) async {
  final map = await findActiveTournamentTableUsageByTableIds(
    firestore,
    [tableId],
  );
  return map[tableId] ?? ActiveTournamentTableUsage.empty;
}

/// 複数 [tableIds] について、当日・未終了TNの tablesSeat usage をまとめて取得する。
Future<Map<String, ActiveTournamentTableUsage>> findActiveTournamentTableUsageByTableIds(
  FirebaseFirestore firestore,
  Iterable<String> tableIds,
) async {
  final ids = tableIds
      .where((id) => id != 'waiting' && id != 'busted')
      .toSet();

  final result = <String, ActiveTournamentTableUsage>{
    for (final id in ids) id: ActiveTournamentTableUsage.empty,
  };
  if (ids.isEmpty) return result;

  final businessDateKey =
      await resolveBusinessDateKeyForActiveTournamentLookup(firestore);

  final tournamentsSnap = await firestore
      .collection('scheduledTournaments')
      .where('businessDate', isEqualTo: businessDateKey)
      .get();

  for (final tournamentDoc in tournamentsSnap.docs) {
    final status = tournamentDoc.data()['status'] as String?;
    if (!isActiveTournamentStatus(status)) continue;

    final tablesSeatSnap = await firestore
        .collection('scheduledTournaments')
        .doc(tournamentDoc.id)
        .collection('tablesSeat')
        .get();

    for (final tableSeatDoc in tablesSeatSnap.docs) {
      final tableId = tableSeatDoc.id;
      if (!ids.contains(tableId)) continue;

      final docUsage = _usageFromTableSeatDoc(tableSeatDoc.data());
      if (!docUsage.isRegisteredInAnyActiveTournament) continue;

      result[tableId] = _mergeTableUsage(result[tableId]!, docUsage);
    }
  }

  return result;
}

/// SG終了時に tables.status へ戻す値。
String resolveTableStatusAfterSideGameEnd(ActiveTournamentTableUsage usage) {
  if (usage.isRegisteredInAnyActiveTournament) {
    return 'tournament';
  }
  return 'open';
}
