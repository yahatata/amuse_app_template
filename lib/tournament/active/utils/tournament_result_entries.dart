/// `views/main` からトーナメント結果（順位・プライズ）を読み取る。
class TournamentResultEntry {
  const TournamentResultEntry({
    required this.rank,
    required this.playerName,
    required this.playerUid,
    required this.prizeAmount,
  });

  final int rank;
  final String? playerName;
  final String? playerUid;
  final int prizeAmount;

  bool get hasPlayer {
    final name = playerName?.trim();
    final uid = playerUid?.trim();
    return name != null && name.isNotEmpty && uid != null && uid.isNotEmpty;
  }
}

class TournamentResultSummary {
  const TournamentResultSummary({
    required this.prizePool,
    required this.pointType,
    required this.prizeReceiverCount,
    required this.entries,
  });

  final int prizePool;
  final String pointType;
  final int prizeReceiverCount;
  final List<TournamentResultEntry> entries;

  bool get hasPrizeStructure => prizeReceiverCount > 0;

  bool get hasAnyRankedPlayer => entries.any((entry) => entry.hasPlayer);
}

TournamentResultSummary parseTournamentResultSummary(
  Map<String, dynamic>? mainViewData,
) {
  if (mainViewData == null) {
    return const TournamentResultSummary(
      prizePool: 0,
      pointType: 'pointA',
      prizeReceiverCount: 0,
      entries: [],
    );
  }

  final prizeReceiverCount = _asInt(mainViewData['prizeReceiverCount']);
  final prizePool = _asInt(mainViewData['prizePool']);
  final pointType = (mainViewData['pointType'] as String?)?.trim();
  final resolvedPointType =
      pointType == null || pointType.isEmpty ? 'pointA' : pointType;

  final entries = <TournamentResultEntry>[];
  for (var rank = 1; rank <= prizeReceiverCount; rank++) {
    entries.add(
      TournamentResultEntry(
        rank: rank,
        playerName: mainViewData['${rank}stPlayerName'] as String?,
        playerUid: mainViewData['${rank}stPlayerUid'] as String?,
        prizeAmount: _asInt(mainViewData['${rank}stPrize']),
      ),
    );
  }

  return TournamentResultSummary(
    prizePool: prizePool,
    pointType: resolvedPointType,
    prizeReceiverCount: prizeReceiverCount,
    entries: entries,
  );
}

int _asInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.round();
  return 0;
}

String formatYenAmount(int amount) {
  return '¥${amount.toString().replaceAllMapped(
        RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
        (match) => '${match[1]},',
      )}';
}
