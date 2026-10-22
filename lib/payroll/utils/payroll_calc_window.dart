// 計算タブの「計算可能期間」判定（JST 基準日・期間終了日・monthlyPayroll.status）
// 期間終了日の翌日から、status が confirmed / hold / paid になるまでを計算可能区間とする。

import 'payment_date_utils.dart';

DateTime _parseIsoYmdLocal(String iso) {
  if (iso.length < 10 || iso[4] != '-' || iso[7] != '-') {
    return DateTime(1970);
  }
  final y = int.tryParse(iso.substring(0, 4));
  final m = int.tryParse(iso.substring(5, 7));
  final d = int.tryParse(iso.substring(8, 10));
  if (y == null || m == null || d == null) return DateTime(1970);
  return DateTime(y, m, d);
}

String _fmtYmd(DateTime d) {
  final y = d.year.toString().padLeft(4, '0');
  final m = d.month.toString().padLeft(2, '0');
  final day = d.day.toString().padLeft(2, '0');
  return '$y-$m-$day';
}

/// 表示中の給与期間の直前区間（終了日は [currentStart] の前日、日数は現期間と同じ）
({String start, String end}) previousPayrollPeriodRange(
  String periodStartIso,
  String periodEndIso,
) {
  final start = _parseIsoYmdLocal(periodStartIso);
  final end = _parseIsoYmdLocal(periodEndIso);
  final lenDays = end.difference(start).inDays + 1;
  final prevEnd = start.subtract(const Duration(days: 1));
  final prevStart = prevEnd.subtract(Duration(days: lenDays - 1));
  return (start: _fmtYmd(prevStart), end: _fmtYmd(prevEnd));
}

/// 締め日前（期間未終了）で計算できないときの説明（直前期間は運用上確定済み想定の文言）
String payrollCalculationBlockedBeforePeriodEndMessage({
  required String periodStartIso,
  required String periodEndIso,
}) {
  final prev = previousPayrollPeriodRange(periodStartIso, periodEndIso);
  final a =
      '${formatIsoYmdToSlash(prev.start)} 〜 ${formatIsoYmdToSlash(prev.end)}';
  final b =
      '${formatIsoYmdToSlash(periodStartIso)} 〜 ${formatIsoYmdToSlash(periodEndIso)}';
  return '「$a」は確定済み、「$b」はまだ終了していないため、現在計算を行えません。';
}

/// 基準日が給与期間終了日より後か（締め後＝全営業日終了後の翌日から計算可能）
bool isPayrollPeriodClosedForCalculation(String asOfDateJst, String periodEnd) {
  return asOfDateJst.compareTo(periodEnd) > 0;
}

bool isPayrollCalculationPhaseComplete(String? status) {
  if (status == null || status.isEmpty) return false;
  return status == 'confirmed' || status == 'hold' || status == 'paid';
}

bool isInPayrollCalculationWindow(
  String asOfDateJst,
  String periodEnd,
  String? monthlyPayrollStatus,
) {
  return isPayrollPeriodClosedForCalculation(asOfDateJst, periodEnd) &&
      !isPayrollCalculationPhaseComplete(monthlyPayrollStatus);
}

/// 計算対象外カードに表示する、この期間の状況（平易な短文）
///
/// [periodStartIso] / [periodEndIso] はサーバー表示コンテキストの現行給与期間（締め前メッセージ用）
String payrollMonthlyCycleStatusLine({
  required String? monthlyPayrollStatus,
  required bool periodClosedForCalculation,
  String? periodStartIso,
  String? periodEndIso,
}) {
  if (!periodClosedForCalculation) {
    final ps = periodStartIso ?? '';
    final pe = periodEndIso ?? '';
    if (ps.isNotEmpty && pe.isNotEmpty) {
      return payrollCalculationBlockedBeforePeriodEndMessage(
        periodStartIso: ps,
        periodEndIso: pe,
      );
    }
    return '表示期間が取得できないため、理由を表示できません。';
  }
  switch (monthlyPayrollStatus) {
    case 'paid':
      return '支払い済み';
    case 'hold':
      return '確定済み、保留中あり';
    case 'confirmed':
      return '確定済み、未支払いあり';
    case 'draft':
      return '未確定（計算結果があります。確定処理が必要です）';
    default:
      return '未計算';
  }
}
