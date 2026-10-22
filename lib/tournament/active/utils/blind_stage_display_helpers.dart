/// runtime.stages の level stage から SB / BB / Ante 表示文字列を組み立てる。
///
/// sb / bb が欠ける場合は仮値を使わず `'-'` を返す。
String formatBlindValuesFromStage(Map<String, dynamic>? stage) {
  if (stage == null) return '-';

  switch (stage['type']) {
    case 'level':
      final sb = _asInt(stage['sb']);
      final bb = _asInt(stage['bb']);
      if (sb == null || bb == null) {
        return '-';
      }
      final ante = _asInt(stage['ante']);
      final anteText = ante != null ? '$ante' : '-';
      return '$sb / $bb / $anteText';
    case 'break':
      return '- / - / -';
    case 'regist':
      return '-';
    default:
      return '-';
  }
}

int? _asInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return null;
}
