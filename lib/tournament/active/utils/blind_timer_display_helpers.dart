import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';
import 'package:amuse_app_template/tournament/active/utils/tournament_result_entries.dart';

int? _positiveInt(Object? value) {
  if (value is int && value > 0) return value;
  if (value is num) {
    final asInt = value.toInt();
    if (value == asInt && asInt > 0) return asInt;
  }
  return null;
}

int? _prizeAmount(Object? value) {
  if (value is int && value > 0) return value;
  if (value is num) {
    final asInt = value.toInt();
    if (value == asInt && asInt > 0) return asInt;
  }
  return null;
}

int? _prizePool(Object? value) {
  if (value is int && value >= 0) return value;
  if (value is num) {
    final asInt = value.toInt();
    if (value == asInt && asInt >= 0) return asInt;
  }
  return null;
}

int? _prizeReceiverCount(Object? value) {
  if (value is int && value > 0) return value;
  if (value is num) {
    final asInt = value.toInt();
    if (value == asInt && asInt > 0) return asInt;
  }
  return null;
}

String _formatAddonStack(int stack) {
  return '+${NumberFormat('#,###').format(stack)}';
}

/// snapshot からブラインドタイマー用 Reentry 条件文字列を生成する。
/// 正本: [snapshot.maxReentries]（maxReentriesPerPlayer は使わない）。
String formatBlindReentryCondition(Map<String, dynamic>? snapshot) {
  final data = snapshot ?? const <String, dynamic>{};
  final isReentry = data['isReentry'] as bool? ?? false;
  final maxReentries = data['maxReentries'];
  final reentryFee = _positiveInt(data['reentryFee']);

  if (!isReentry) {
    return 'Reentry: 不可';
  }

  if (maxReentries is num && maxReentries == 0) {
    return 'Reentry: 不可';
  }

  final parts = <String>[];

  final limit = _positiveInt(maxReentries);
  if (limit != null) {
    parts.add('上限$limit回');
  } else if (maxReentries == null) {
    parts.add('無制限');
  }

  if (reentryFee != null) {
    parts.add(formatYenAmount(reentryFee));
  }

  return 'Reentry: ${parts.join(' / ')}';
}

/// snapshot からブラインドタイマー用 Addon 条件文字列を生成する。
String formatBlindAddonCondition(Map<String, dynamic>? snapshot) {
  final data = snapshot ?? const <String, dynamic>{};
  final isAddon = data['isAddon'] as bool? ?? false;

  if (!isAddon) {
    return 'Addon: 不可';
  }

  final parts = <String>[];

  final limit = _positiveInt(data['addonLimitPerPlayer']);
  if (limit != null) {
    parts.add('上限$limit回');
  }

  final fee = _positiveInt(data['addonFee']);
  if (fee != null) {
    parts.add(formatYenAmount(fee));
  }

  final stack = _positiveInt(data['addonStack']);
  if (stack != null) {
    parts.add(_formatAddonStack(stack));
  }

  if (parts.isEmpty) {
    return 'Addon: 可';
  }

  return 'Addon: ${parts.join(' / ')}';
}

/// ブラインドタイマー左部に表示する確定済み Prize 情報。
class BlindPrizeDisplay {
  const BlindPrizeDisplay({
    required this.prizeReceiverCount,
    required this.prizePool,
    required this.ranks,
  });

  final int prizeReceiverCount;
  final int? prizePool;
  final List<BlindPrizeRank> ranks;
}

class BlindPrizeRank {
  const BlindPrizeRank({
    required this.rank,
    required this.amount,
  });

  final int rank;
  final int amount;
}

/// ブラインドタイマー Prize 金額リストの1ページあたりの最大行数。
const int kBlindPrizeRankListPageSize = 12;

/// 金額リストのページ切替間隔。
const Duration kBlindPrizeRankListRotationInterval = Duration(seconds: 30);

/// 同額の連続順位をまとめた Prize 表示行。
class BlindPrizeRankGroup {
  const BlindPrizeRankGroup({
    required this.startRank,
    required this.endRank,
    required this.amount,
  });

  final int startRank;
  final int endRank;
  final int amount;
}

/// 連続する同額順位をまとめる（例: 6st/7st が 800 → 1 行）。
List<BlindPrizeRankGroup> groupBlindPrizeRanksForDisplay(
  List<BlindPrizeRank> ranks,
) {
  if (ranks.isEmpty) return [];

  final groups = <BlindPrizeRankGroup>[];
  var startRank = ranks.first.rank;
  var endRank = ranks.first.rank;
  var amount = ranks.first.amount;

  for (var i = 1; i < ranks.length; i++) {
    final current = ranks[i];
    final previous = ranks[i - 1];

    if (current.amount == amount && current.rank == previous.rank + 1) {
      endRank = current.rank;
      continue;
    }

    groups.add(
      BlindPrizeRankGroup(
        startRank: startRank,
        endRank: endRank,
        amount: amount,
      ),
    );
    startRank = current.rank;
    endRank = current.rank;
    amount = current.amount;
  }

  groups.add(
    BlindPrizeRankGroup(
      startRank: startRank,
      endRank: endRank,
      amount: amount,
    ),
  );

  return groups;
}

/// Prize 金額リストのページ数を返す。
int blindPrizeRankListPageCount(
  int groupCount, {
  int pageSize = kBlindPrizeRankListPageSize,
}) {
  if (groupCount <= 0 || pageSize <= 0) return 0;
  return (groupCount + pageSize - 1) ~/ pageSize;
}

/// 指定ページに表示する Prize 金額リスト行を返す。
List<BlindPrizeRankGroup> visibleBlindPrizeRankGroupsForPage(
  List<BlindPrizeRankGroup> groups,
  int pageIndex, {
  int pageSize = kBlindPrizeRankListPageSize,
}) {
  if (groups.isEmpty || pageSize <= 0) return const [];

  final pageCount = blindPrizeRankListPageCount(groups.length, pageSize: pageSize);
  if (pageCount == 0) return const [];

  final safeIndex = ((pageIndex % pageCount) + pageCount) % pageCount;
  final start = safeIndex * pageSize;
  final end = start + pageSize;
  if (start >= groups.length) return const [];

  return groups.sublist(start, end > groups.length ? groups.length : end);
}

/// Prize 金額リスト行の内容が同一かどうか。
bool blindPrizeRankGroupsEqual(
  List<BlindPrizeRankGroup> a,
  List<BlindPrizeRankGroup> b,
) {
  if (identical(a, b)) return true;
  if (a.length != b.length) return false;

  for (var i = 0; i < a.length; i++) {
    final left = a[i];
    final right = b[i];
    if (left.startRank != right.startRank ||
        left.endRank != right.endRank ||
        left.amount != right.amount) {
      return false;
    }
  }

  return true;
}

/// 順位ラベル（例: `6st` / `6-7st`）。
String formatBlindPrizeRankLabel(int startRank, int endRank) {
  if (startRank == endRank) {
    return '${startRank}st';
  }
  return '$startRank-${endRank}st';
}

/// views/main から確定済み Prize 表示データを取得する。未確定時は null。
BlindPrizeDisplay? parseBlindPrizeDisplay(Map<String, dynamic>? mainViewData) {
  if (mainViewData == null) return null;

  final receiverCount = _prizeReceiverCount(mainViewData['prizeReceiverCount']);
  if (receiverCount == null) return null;

  final ranks = <BlindPrizeRank>[];
  for (var rank = 1; rank <= receiverCount; rank++) {
    final amount = _prizeAmount(mainViewData['${rank}stPrize']);
    if (amount != null) {
      ranks.add(BlindPrizeRank(rank: rank, amount: amount));
    }
  }

  if (ranks.isEmpty) return null;

  return BlindPrizeDisplay(
    prizeReceiverCount: receiverCount,
    prizePool: _prizePool(mainViewData['prizePool']),
    ranks: ranks,
  );
}

/// ブラインドタイマー Prize 欄用の金額表示（¥ なし、カンマ区切り）。
String formatBlindPrizeAmount(int amount) {
  return amount.toString().replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
    (match) => '${match[1]},',
  );
}

/// 入賞人数表示（例: `入賞：3人`）。
String formatBlindPrizeReceiverCount(int prizeReceiverCount) {
  return '入賞：$prizeReceiverCount人';
}

/// プライズプール表示（例: `プライズプール: ¥50,000`）。未設定時は `-`。
String formatBlindPrizePoolLine(int? prizePool) {
  if (prizePool == null) {
    return 'プライズプール: -';
  }
  return 'プライズプール: ${formatBlindPrizeAmount(prizePool)}';
}

/// ブラインドタイマーでレジスト締切済みと表示する文言。
const String kBlindRegistrationClosedLabel = 'レジスト済み';

/// Firestore の日時フィールドを [DateTime] に変換する。
DateTime? parseBlindFirestoreDateTime(Object? value) {
  if (value == null) return null;
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  if (value is int) return DateTime.fromMillisecondsSinceEpoch(value);
  if (value is String) return DateTime.tryParse(value);
  return null;
}

/// scheduledTournaments.regEndAt を [DateTime] に変換する。
DateTime? parseBlindRegEndAt(Object? value) => parseBlindFirestoreDateTime(value);

/// scheduledTournaments.startAt を [DateTime] に変換する。
DateTime? parseBlindStartAt(Object? value) => parseBlindFirestoreDateTime(value);

/// runtime.startedAt を [DateTime] に変換する。
DateTime? parseBlindStartedAt(Object? value) => parseBlindFirestoreDateTime(value);

/// runtime.registAt を [DateTime] に変換する。
DateTime? parseBlindRegistAt(Object? value) => parseBlindFirestoreDateTime(value);

/// トーナメント開始からレジスト締切までの秒数（regEndAt - startAt）。
int? calculateBlindRegistrationOffsetSec({
  DateTime? startAt,
  DateTime? regEndAt,
}) {
  if (startAt == null || regEndAt == null) return null;
  return regEndAt.difference(startAt).inSeconds;
}

/// StageBuilder と同じ基準のトーナメント経過秒。
int? calculateTournamentElapsedSec({
  required DateTime? startedAt,
  required DateTime evaluationTime,
  required int shiftSec,
}) {
  if (startedAt == null) return null;

  final elapsedSec = evaluationTime.difference(startedAt).inSeconds - shiftSec;
  return elapsedSec < 0 ? 0 : elapsedSec;
}

/// トーナメント進行の評価時刻（pause 中は pausedAt で固定）。
DateTime resolveBlindTournamentEvaluationTime({
  required String status,
  required DateTime? pausedAt,
  required DateTime now,
}) {
  if (status == 'paused' && pausedAt != null) {
    return pausedAt;
  }
  return now;
}

/// レジスト締切までの残り時間を mm:ss 形式で返す。
String formatBlindRegistrationRemaining(Duration remaining) {
  return formatBlindRegistrationRemainingSec(remaining.inSeconds);
}

/// レジスト締切までの残り秒数を mm:ss 形式で返す。
String formatBlindRegistrationRemainingSec(int totalSeconds) {
  if (totalSeconds <= 0) return '00:00';

  final minutes = totalSeconds ~/ 60;
  final seconds = totalSeconds % 60;
  return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
}

/// ブラインドタイマーのレジスト締切表示文字列を返す。
///
/// [registrationOffsetSec] は startAt から regEndAt までの秒数。
/// [tournamentElapsedSec] は runtime.startedAt 基準の経過秒（StageBuilder と同じ）。
String formatBlindRegistrationStatus({
  required int? registrationOffsetSec,
  required int? tournamentElapsedSec,
  String? status,
  DateTime? registAt,
}) {
  if (status == 'registered') {
    return kBlindRegistrationClosedLabel;
  }
  if (registAt != null) {
    return kBlindRegistrationClosedLabel;
  }
  if (registrationOffsetSec == null || tournamentElapsedSec == null) {
    return '-';
  }

  final registrationRemainingSec =
      registrationOffsetSec - tournamentElapsedSec;
  if (registrationRemainingSec <= 0) {
    return kBlindRegistrationClosedLabel;
  }

  return formatBlindRegistrationRemainingSec(registrationRemainingSec);
}
