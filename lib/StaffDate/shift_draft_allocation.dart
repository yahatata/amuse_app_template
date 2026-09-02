// Shift draft: staff latest request vs Admin local allocation helpers.
//
// originalStartMinute/originalEndMinute are audit-only and must not drive UI limits.

typedef ShiftMinuteRange = ({int startMinute, int endMinute});

/// Admin「申請時間」= staff 最新申請（Firestore start/end）。
ShiftMinuteRange requestDisplayRange({
  required int startMinute,
  required int endMinute,
}) =>
    (startMinute: startMinute, endMinute: endMinute);

/// Slider min/max = latest request, not original audit fields.
ShiftMinuteRange sliderConstraintRange({
  required int startMinute,
  required int endMinute,
  int? originalStartMinute,
  int? originalEndMinute,
}) =>
    (startMinute: startMinute, endMinute: endMinute);

/// Allocation initial value when Admin opens draft.
ShiftMinuteRange initialAllocationRange({
  required int startMinute,
  required int endMinute,
}) =>
    (startMinute: startMinute, endMinute: endMinute);

/// Apply slider move within latest request range; returns null if invalid.
ShiftMinuteRange? clampAllocationWithinRequest({
  required int requestStartMinute,
  required int requestEndMinute,
  required int newStartMinute,
  required int newEndMinute,
  int minDurationMinutes = 60,
}) {
  final clampedStart = newStartMinute.clamp(requestStartMinute, requestEndMinute);
  final clampedEnd = newEndMinute.clamp(requestStartMinute, requestEndMinute);
  if (clampedEnd - clampedStart >= minDurationMinutes &&
      clampedStart >= requestStartMinute &&
      clampedEnd <= requestEndMinute) {
    return (startMinute: clampedStart, endMinute: clampedEnd);
  }
  return null;
}
