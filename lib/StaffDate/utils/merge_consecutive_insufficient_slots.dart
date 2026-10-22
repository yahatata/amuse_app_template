/// 連続する不足時間帯をマージ（required / current が同一の隣接スロット）
List<({int start, int end, int required, int current})> mergeConsecutiveInsufficientSlots(
  List<({int start, int end, int required, int current})> slots,
) {
  if (slots.isEmpty) return [];

  final sorted = [...slots]..sort((a, b) => a.start.compareTo(b.start));
  final merged = <({int start, int end, int required, int current})>[];

  var current = sorted.first;

  for (var i = 1; i < sorted.length; i++) {
    final next = sorted[i];
    if (current.end == next.start &&
        current.required == next.required &&
        current.current == next.current) {
      current = (
        start: current.start,
        end: next.end,
        required: current.required,
        current: current.current,
      );
    } else {
      merged.add(current);
      current = next;
    }
  }

  merged.add(current);
  return merged;
}
