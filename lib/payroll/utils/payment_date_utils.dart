/// `YYYY-MM-DD` を `YYYY/MM/DD` 表示用に変換（想定外の文字列はそのまま返す）
String formatIsoYmdToSlash(String iso) {
  if (iso.length >= 10 && iso[4] == '-' && iso[7] == '-') {
    return '${iso.substring(0, 4)}/${iso.substring(5, 7)}/${iso.substring(8, 10)}';
  }
  return iso;
}

String? computeActualPaymentDate({
  required String periodEnd,
  required String? paymentDayOfMonth,
  required int paymentMonthOffset,
}) {
  if (paymentDayOfMonth == null) return null;

  final digitsOnly = RegExp(r'^\d{1,2}$');
  if (!digitsOnly.hasMatch(paymentDayOfMonth)) return null;

  final paymentDay = int.tryParse(paymentDayOfMonth);
  if (paymentDay == null || paymentDay < 0 || paymentDay > 31) {
    return null;
  }
  if (paymentMonthOffset < 0 || paymentMonthOffset > 2) return null;

  final periodEndParts = periodEnd.split('-');
  if (periodEndParts.length != 3) return null;
  final year = int.tryParse(periodEndParts[0]);
  final month = int.tryParse(periodEndParts[1]);
  if (year == null || month == null) return null;

  final targetMonthDate = DateTime(year, month + paymentMonthOffset, 1);
  final lastDayOfMonth =
      DateTime(targetMonthDate.year, targetMonthDate.month + 1, 0).day;
  final actualDay = paymentDay == 0
      ? lastDayOfMonth
      : (paymentDay > lastDayOfMonth ? lastDayOfMonth : paymentDay);

  final date = DateTime(targetMonthDate.year, targetMonthDate.month, actualDay);
  final y = date.year.toString().padLeft(4, '0');
  final m = date.month.toString().padLeft(2, '0');
  final d = date.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}
