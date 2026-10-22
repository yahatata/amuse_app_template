/// views/main の entries + reentries。
/// 置きバケ一時参加者は作成時に entries へ含まれるため、プライズ確定の参加人数にも含まれる。
int resolveTournamentPrizeParticipantCount(Map<String, dynamic>? mainViewData) {
  if (mainViewData == null) return 0;

  return _nonNegativeInt(mainViewData['entries']) +
      _nonNegativeInt(mainViewData['reentries']);
}

int _nonNegativeInt(Object? value) {
  if (value is int && value >= 0) return value;
  if (value is num) {
    final rounded = value.round();
    return rounded < 0 ? 0 : rounded;
  }
  if (value is String) {
    final parsed = int.tryParse(value);
    if (parsed != null && parsed >= 0) return parsed;
  }
  return 0;
}
