import 'business_hours_style_labels.dart';

/// 必要人数スロットの選択肢（時刻は 0〜30 時。25:00 営業などに対応）
final List<int> kRequiredStaffHourOptions =
    List<int>.generate(31, (index) => index);

/// 必要人数の選択肢
final List<int> kRequiredStaffCountOptions =
    List<int>.generate(20, (index) => index + 1);

/// endHour の dropdown 候補（startHour より後の時刻のみ）
List<int> endHourOptionsForStart(int startHour) {
  return kRequiredStaffHourOptions.where((h) => h > startHour).toList();
}

/// 保存前バリデーション。問題なければ null を返す。
String? validateRequiredStaffByStyle(
  Map<String, List<Map<String, int>>> byStyle,
) {
  for (final styleId in kBusinessHoursStyleIds) {
    if (styleId == 'closed') continue;

    final slots = byStyle[styleId] ?? [];
    for (var i = 0; i < slots.length; i++) {
      final slot = slots[i];
      final startHour = slot['startHour'];
      final endHour = slot['endHour'];
      final requiredCount = slot['requiredCount'];

      if (startHour == null || endHour == null || requiredCount == null) {
        return '${businessHoursStyleLabel(styleId)} の時間帯${i + 1}に未入力があります';
      }

      if (startHour >= endHour) {
        return '${businessHoursStyleLabel(styleId)} の時間帯${i + 1}: 開始時刻は終了時刻より前にしてください';
      }

      if (requiredCount < 1) {
        return '${businessHoursStyleLabel(styleId)} の時間帯${i + 1}: 必要人数は1人以上にしてください';
      }
    }
  }

  return null;
}
