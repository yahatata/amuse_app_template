/// 時給未設定 staff の候補抽出結果。
class WageMissingStaffEntry {
  final String staffId;
  final String staffName;

  const WageMissingStaffEntry({
    required this.staffId,
    required this.staffName,
  });

  factory WageMissingStaffEntry.fromMap(Map<String, dynamic> map) {
    return WageMissingStaffEntry(
      staffId: map['staffId'] as String? ?? '',
      staffName: map['staffName'] as String? ?? '不明',
    );
  }
}

List<WageMissingStaffEntry> parseWageMissingStaff(Object? raw) {
  if (raw is! List) return const [];
  return raw
      .whereType<Map>()
      .map((e) => WageMissingStaffEntry.fromMap(Map<String, dynamic>.from(e)))
      .where((e) => e.staffId.isNotEmpty)
      .toList();
}

/// 警告表示用。先頭 [maxNames] 名 + 残り件数。
String formatWageMissingStaffNames(
  List<WageMissingStaffEntry> staff, {
  int maxNames = 3,
}) {
  if (staff.isEmpty) return '';
  final names = staff.map((s) => s.staffName).where((n) => n.isNotEmpty).toList();
  if (names.isEmpty) return '';
  if (names.length <= maxNames) {
    return names.join('、');
  }
  final shown = names.take(maxNames).join('、');
  final rest = names.length - maxNames;
  return '$shown、ほか${rest}名';
}

bool shouldBlockPayrollExecuteForMissingWage(
  List<WageMissingStaffEntry> wageMissingStaff,
) {
  return wageMissingStaff.isNotEmpty;
}
