import 'package:cloud_firestore/cloud_firestore.dart';

/// 会計完了一覧 / 会計後操作の「会計日」契約。
///
/// - SSoT timestamp: `ops.accountingCompletedAt`
/// - 一覧の日付キー: その Timestamp の **JST calendar date** (`YYYY-MM-DD`)
/// - `bill.businessDate`（売上帰属・営業日）とは分離する
/// - post-settlement では会計日を動かさない（`accountingCompletedAt` を書き換えない前提）
///
/// Legacy: `ops.accountingCompletedAt` 欠損時のみ `bill.businessDate` に fallback。
const Duration kSettlementDateJstOffset = Duration(hours: 9);

final RegExp _yyyyMmDd = RegExp(r'^\d{4}-\d{2}-\d{2}$');

bool isPostSettlementListStatus(String? status) {
  return status == 'settled' || status == 'post_settlement_pending';
}

/// UTC 基準の瞬間を JST wall-clock の年月日キーにする。
String settlementDateKeyFromDateTime(DateTime value) {
  final jst = value.toUtc().add(kSettlementDateJstOffset);
  final y = jst.year.toString().padLeft(4, '0');
  final m = jst.month.toString().padLeft(2, '0');
  final d = jst.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}

String? settlementDateKeyFromTimestamp(Timestamp? value) {
  if (value == null) return null;
  return settlementDateKeyFromDateTime(value.toDate());
}

/// bill doc から会計日キーを導出。欠損時は businessDate fallback。
String? resolveSettlementDateKey(Map<String, dynamic> bill) {
  final ops = bill['ops'];
  if (ops is Map) {
    final completedAt = ops['accountingCompletedAt'];
    if (completedAt is Timestamp) {
      return settlementDateKeyFromTimestamp(completedAt);
    }
    if (completedAt is DateTime) {
      return settlementDateKeyFromDateTime(completedAt);
    }
  }
  final businessDate = bill['businessDate'];
  if (businessDate is String && businessDate.trim().isNotEmpty) {
    return businessDate.trim();
  }
  return null;
}

bool billMatchesSettlementDateKey(
  Map<String, dynamic> bill,
  String settlementDateKey,
) {
  final key = resolveSettlementDateKey(bill);
  return key != null && key == settlementDateKey;
}

/// `YYYY-MM-DD`（JST calendar）の半開区間 [start, end) を Firestore Timestamp で返す。
({Timestamp start, Timestamp end}) jstDayRangeTimestamps(String yyyyMmDd) {
  if (!_yyyyMmDd.hasMatch(yyyyMmDd)) {
    throw ArgumentError.value(yyyyMmDd, 'yyyyMmDd', 'YYYY-MM-DD required');
  }
  final parts = yyyyMmDd.split('-');
  final year = int.parse(parts[0]);
  final month = int.parse(parts[1]);
  final day = int.parse(parts[2]);

  // JST 00:00 = UTC 前日 15:00
  final startUtc = DateTime.utc(year, month, day).subtract(kSettlementDateJstOffset);
  final endUtc = DateTime.utc(year, month, day + 1).subtract(kSettlementDateJstOffset);
  return (
    start: Timestamp.fromDate(startUtc),
    end: Timestamp.fromDate(endUtc),
  );
}

/// Legacy fallback 候補か（accountingCompletedAt が無く businessDate のみ）。
bool isLegacySettlementDateFallbackBill(Map<String, dynamic> bill) {
  final ops = bill['ops'];
  if (ops is Map) {
    final completedAt = ops['accountingCompletedAt'];
    if (completedAt is Timestamp || completedAt is DateTime) {
      return false;
    }
  }
  return true;
}
