/// getPayrollCalcDisplayContext / getPayrollCandidates.displayContext 用
class PayrollDisplayContext {
  final String asOfDateJst;
  final String paymentPeriodKey;
  final String periodStart;
  final String periodEnd;
  final String? paymentDayOfMonth;
  final int paymentMonthOffset;
  final String? actualPaymentDate;
  final String paymentDateDisplay;

  PayrollDisplayContext({
    required this.asOfDateJst,
    required this.paymentPeriodKey,
    required this.periodStart,
    required this.periodEnd,
    required this.paymentDayOfMonth,
    required this.paymentMonthOffset,
    required this.actualPaymentDate,
    required this.paymentDateDisplay,
  });

  factory PayrollDisplayContext.fromMap(Map<String, dynamic> m) {
    return PayrollDisplayContext(
      asOfDateJst: m['asOfDateJst'] as String? ?? '',
      paymentPeriodKey: m['paymentPeriodKey'] as String? ?? '',
      periodStart: m['periodStart'] as String? ?? '',
      periodEnd: m['periodEnd'] as String? ?? '',
      paymentDayOfMonth: m['paymentDayOfMonth'] as String?,
      paymentMonthOffset: (m['paymentMonthOffset'] as num?)?.toInt() ?? 1,
      actualPaymentDate: m['actualPaymentDate'] as String?,
      paymentDateDisplay: m['paymentDateDisplay'] as String? ?? '未設定',
    );
  }
}
