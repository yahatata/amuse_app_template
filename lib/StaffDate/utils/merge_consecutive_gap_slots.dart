/// 連続する gap（スタッフ0人）時間帯をマージ（隣接スロット）
///
/// [findGapTimeSlots] の 60 分刻み結果を表示前に結合する。
/// 判定ロジック自体は変更しない。
List<({int start, int end})> mergeConsecutiveGapSlots(
  List<({int start, int end})> slots,
) {
  if (slots.isEmpty) return [];

  // findGapTimeSlots は昇順だが、呼び出し側の保証がない場合に備えてソートする
  final sorted = [...slots]..sort((a, b) => a.start.compareTo(b.start));
  final merged = <({int start, int end})>[];

  var current = sorted.first;

  for (var i = 1; i < sorted.length; i++) {
    final next = sorted[i];
    if (current.end == next.start) {
      current = (start: current.start, end: next.end);
    } else {
      merged.add(current);
      current = next;
    }
  }

  merged.add(current);
  return merged;
}
