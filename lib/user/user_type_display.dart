import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';

/// A-6 管理者向けユーザー画面用の表示ヘルパー（互換推測なし）。
const String kUserTypeLine = 'line';
const String kUserTypeStoreManaged = 'store_managed';

/// `userType` の表示ラベル。
/// - `line` → LINE
/// - `store_managed` → 店舗管理
/// - 未設定・不正 → 種別未設定
String userTypeLabel(dynamic value) {
  if (value == kUserTypeLine) return 'LINE';
  if (value == kUserTypeStoreManaged) return '店舗管理';
  return '種別未設定';
}

/// 店舗管理かつ `isMigrated == true` のときのみ true（表示除外の判定用）。
bool isMigratedStoreManagedUser(Map<String, dynamic> data) {
  return data['userType'] == kUserTypeStoreManaged && data['isMigrated'] == true;
}

/// 管理者ユーザー一覧の表示対象か。移行済み店舗管理は常に除外する。
/// `userType` 未設定は移行済みと推測せず表示対象とする。
bool isVisibleOnAdminUserList(Map<String, dynamic> data) {
  return !isMigratedStoreManagedUser(data);
}

/// `activeStays` 正本に基づく入店状況ラベル。
/// [isInActiveStay] が true のときのみ「入店中」、それ以外は「未入店」。
String adminStayStatusLabel(bool isInActiveStay) {
  return isInActiveStay ? '入店中' : '未入店';
}

/// active な `activeStays` の docId（= userId）集合に含まれるか。
bool isUserInActiveStaySet(String userId, Set<String> activeStayUserIds) {
  return activeStayUserIds.contains(userId);
}

/// `pokerName` 検索の一致種別（管理者ユーザー一覧）。
enum AdminUserPokerNameSearchMatch {
  exact,
  prefix,
  partial,
  none,
}

/// [query] が空のときは [AdminUserPokerNameSearchMatch.none]（全件表示用）。
AdminUserPokerNameSearchMatch pokerNameSearchMatch(
  String pokerName,
  String query,
) {
  final q = query.trim();
  if (q.isEmpty) return AdminUserPokerNameSearchMatch.none;
  final name = pokerName.trim();
  if (name == q) return AdminUserPokerNameSearchMatch.exact;
  if (name.startsWith(q)) return AdminUserPokerNameSearchMatch.prefix;
  if (name.contains(q)) return AdminUserPokerNameSearchMatch.partial;
  return AdminUserPokerNameSearchMatch.none;
}

/// 管理者ユーザー一覧の通常表示順（pokerName 昇順 → id 昇順）。
int compareAdminUserListRow(
  Map<String, dynamic> a,
  Map<String, dynamic> b,
) {
  final an = (a['pokerName'] ?? '').toString();
  final bn = (b['pokerName'] ?? '').toString();
  final byName = an.compareTo(bn);
  if (byName != 0) return byName;
  final aid = (a['id'] ?? a['uid'] ?? '').toString();
  final bid = (b['id'] ?? b['uid'] ?? '').toString();
  return aid.compareTo(bid);
}

/// `initialBalanceSetAt` が設定されているか（初期ポイント設定済み判定）。
bool hasInitialUserBalanceSet(Map<String, dynamic> data) {
  return data['initialBalanceSetAt'] != null;
}

/// 初期ポイント設定の選択一覧トグル用。
/// [showOnlySetUsers] が false（初期）→ 未設定のみ、true → 設定済みのみ。
bool matchesInitialBalanceSetDisplayFilter(
  Map<String, dynamic> data, {
  required bool showOnlySetUsers,
}) {
  final set = hasInitialUserBalanceSet(data);
  return showOnlySetUsers ? set : !set;
}

/// 管理者ユーザー一覧・初期ポイント設定などの候補絞り込み
///（pokerName 検索 + 一致度順）。
///
/// 1. 表示対象のみ残す（[showMigratedStoreManaged] が false のとき移行済み店舗管理を除外）
/// 2. 通常表示順でソート
/// 3. 検索時は 完全一致 → 前方一致 → 部分一致 の順で結合（各グループ内は通常順維持）
List<Map<String, dynamic>> filterAdminUserListRows({
  required List<Map<String, dynamic>> rows,
  required String searchQuery,
  bool showMigratedStoreManaged = false,
}) {
  final visible = rows.where((data) {
    if (!showMigratedStoreManaged && isMigratedStoreManagedUser(data)) {
      return false;
    }
    return true;
  }).toList();
  visible.sort(compareAdminUserListRow);

  final q = searchQuery.trim();
  if (q.isEmpty) return visible;

  final exact = <Map<String, dynamic>>[];
  final prefix = <Map<String, dynamic>>[];
  final partial = <Map<String, dynamic>>[];

  for (final row in visible) {
    final name = (row['pokerName'] ?? '').toString();
    switch (pokerNameSearchMatch(name, q)) {
      case AdminUserPokerNameSearchMatch.exact:
        exact.add(row);
      case AdminUserPokerNameSearchMatch.prefix:
        prefix.add(row);
      case AdminUserPokerNameSearchMatch.partial:
        partial.add(row);
      case AdminUserPokerNameSearchMatch.none:
        break;
    }
  }

  return [...exact, ...prefix, ...partial];
}

/// 店舗管理→LINE 移行の移行元候補（`store_managed && isMigrated == false`）。
bool isEligibleMigrationSource(Map<String, dynamic> data) {
  return data['userType'] == kUserTypeStoreManaged && data['isMigrated'] == false;
}

/// 店舗管理→LINE 移行の移行先候補（`userType == line`）。
bool isEligibleMigrationTarget(Map<String, dynamic> data) {
  return data['userType'] == kUserTypeLine;
}

/// 残高フィールドを整数として読む（欠落・非数値は 0）。
int readUserBalanceInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.round();
  return 0;
}

/// loginId（小文字）または loginID（大文字）を返す。どちらも無ければ空文字。
String resolveLoginId(Map<String, dynamic> data) {
  final lower = data['loginId'];
  if (lower is String && lower.trim().isNotEmpty) return lower.trim();
  final upper = data['loginID'];
  if (upper is String && upper.trim().isNotEmpty) return upper.trim();
  return '';
}

/// 残高系フィールド。数値なら整数表示、欠落・非数値は「未設定」。
String formatUserBalance(dynamic value) {
  if (value is int) {
    return NumberFormat('#,###').format(value);
  }
  if (value is num) {
    return NumberFormat('#,###').format(value.round());
  }
  return '未設定';
}

/// Timestamp / DateTime を `YYYY-MM-DD HH:mm` で表示。欠落は「未設定」。
String formatUserTimestamp(dynamic value) {
  DateTime? dt;
  if (value is Timestamp) {
    dt = value.toDate();
  } else if (value is DateTime) {
    dt = value;
  }
  if (dt == null) return '未設定';
  final local = dt.toLocal();
  final y = local.year.toString().padLeft(4, '0');
  final m = local.month.toString().padLeft(2, '0');
  final d = local.day.toString().padLeft(2, '0');
  final hh = local.hour.toString().padLeft(2, '0');
  final mm = local.minute.toString().padLeft(2, '0');
  return '$y-$m-$d $hh:$mm';
}

String displayOrUnset(dynamic value) {
  if (value == null) return '未設定';
  final s = value.toString().trim();
  if (s.isEmpty) return '未設定';
  return s;
}
