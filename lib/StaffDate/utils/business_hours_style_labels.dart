/// 営業スタイル ID の UI 固定表示名（config には保存しない）
const Map<String, String> kBusinessHoursStyleLabels = {
  'weekday': '平日',
  'weekendHoliday': '週末・祝日',
  'event': 'イベント',
  'allDay': '終日',
  'closed': '休業日',
};

const List<String> kBusinessHoursStyleIds = [
  'weekday',
  'weekendHoliday',
  'event',
  'allDay',
  'closed',
];

String businessHoursStyleLabel(String styleId) {
  return kBusinessHoursStyleLabels[styleId] ?? styleId;
}
