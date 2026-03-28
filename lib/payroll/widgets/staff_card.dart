// staff ごとのカード表示
//
// 参照: 06_UI_SPEC §4-2

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class StaffCardData {
  final String staffId;
  final String staffName;
  final int totalActualWorkMinutes;
  final int grossPay;             // 丸め後総支給額（整数）
  final double? grossPayRaw;      // 丸め前総支給額（nullable: 旧データ互換）
  final int totalLegalOvertimeMinutes;
  final int totalLegalHolidayWorkMinutes;
  final int over60OvertimeMinutes;
  final int carryOverAttendanceCount;
  final int carryOverGrossPay;
  final int baseHourlyWage;
  final int totalNightWorkMinutes;
  final int totalNonLegalHolidayWorkMinutes;
  final double basePay;           // 丸め差分吸収後（小数第2位まで）
  final double? basePayRaw;       // 丸め前基本給（nullable: 旧データ互換）
  final double lateNightPremiumPay;
  final double overtimePremiumPay;
  final double over60PremiumPay;
  final double legalHolidayPremiumPay;
  final List<String>? warnings;
  final String? paymentStatus;

  StaffCardData({
    required this.staffId,
    required this.staffName,
    required this.totalActualWorkMinutes,
    required this.grossPay,
    this.grossPayRaw,
    required this.totalLegalOvertimeMinutes,
    required this.totalLegalHolidayWorkMinutes,
    required this.over60OvertimeMinutes,
    required this.carryOverAttendanceCount,
    required this.carryOverGrossPay,
    required this.baseHourlyWage,
    required this.totalNightWorkMinutes,
    required this.totalNonLegalHolidayWorkMinutes,
    required this.basePay,
    this.basePayRaw,
    required this.lateNightPremiumPay,
    required this.overtimePremiumPay,
    required this.over60PremiumPay,
    required this.legalHolidayPremiumPay,
    this.warnings,
    this.paymentStatus,
  });

  factory StaffCardData.fromFirestore(String staffId, Map<String, dynamic> data) {
    return StaffCardData(
      staffId: staffId,
      staffName: data['staffNameSnapshot'] as String? ?? '',
      totalActualWorkMinutes: (data['totalActualWorkMinutes'] as num?)?.toInt() ?? 0,
      grossPay: (data['grossPay'] as num?)?.toInt() ?? 0,
      grossPayRaw: (data['grossPayRaw'] as num?)?.toDouble(),
      totalLegalOvertimeMinutes: (data['totalLegalOvertimeMinutes'] as num?)?.toInt() ?? 0,
      totalLegalHolidayWorkMinutes: (data['totalLegalHolidayWorkMinutes'] as num?)?.toInt() ?? 0,
      over60OvertimeMinutes: (data['over60OvertimeMinutes'] as num?)?.toInt() ?? 0,
      carryOverAttendanceCount: (data['carryOverAttendanceCount'] as num?)?.toInt() ?? 0,
      carryOverGrossPay: (data['carryOverGrossPay'] as num?)?.toInt() ?? 0,
      baseHourlyWage: (data['baseHourlyWageSnapshot'] as num?)?.toInt() ?? 0,
      totalNightWorkMinutes: (data['totalNightWorkMinutes'] as num?)?.toInt() ?? 0,
      totalNonLegalHolidayWorkMinutes: (data['totalNonLegalHolidayWorkMinutes'] as num?)?.toInt() ?? 0,
      basePay: (data['basePay'] as num?)?.toDouble() ?? 0.0,
      basePayRaw: (data['basePayRaw'] as num?)?.toDouble(),
      lateNightPremiumPay: (data['lateNightPremiumPay'] as num?)?.toDouble() ?? 0.0,
      overtimePremiumPay: (data['overtimePremiumPay'] as num?)?.toDouble() ?? 0.0,
      over60PremiumPay: (data['over60PremiumPay'] as num?)?.toDouble() ?? 0.0,
      legalHolidayPremiumPay: (data['legalHolidayPremiumPay'] as num?)?.toDouble() ?? 0.0,
      warnings: (data['warnings'] as List<dynamic>?)?.cast<String>(),
      paymentStatus: data['paymentStatus'] as String?,
    );
  }
}

class StaffCard extends StatelessWidget {
  final StaffCardData data;
  final VoidCallback? onTap;
  /// 給与確定後など、カード内で支払い登録 UI を出す
  final bool showPaymentActions;
  final bool paymentBusy;
  final Future<void> Function(StaffCardData staff)? onRegisterPaid;
  final Future<void> Function(StaffCardData staff)? onRegisterHold;

  const StaffCard({
    super.key,
    required this.data,
    this.onTap,
    this.showPaymentActions = false,
    this.paymentBusy = false,
    this.onRegisterPaid,
    this.onRegisterHold,
  });

  String _minutesToHm(int minutes) {
    final h = minutes ~/ 60;
    final m = minutes % 60;
    return '${h}h ${m}m';
  }

  /// 確認 → 処理中表示のまま Callable 完了まで待ち、成功時に閉じる
  static Future<void> showPaymentRegistrationDialog(
    BuildContext context, {
    required StaffCardData staff,
    required bool asPaid,
    required Future<void> Function(StaffCardData staff) onCommit,
  }) {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => _StaffPaymentRegistrationDialog(
        staff: staff,
        asPaid: asPaid,
        onCommit: onCommit,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final yenFormat = NumberFormat('#,###');

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          InkWell(
            onTap: onTap,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                data.staffName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              '¥${yenFormat.format(data.grossPay)}',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 18,
                                color: Colors.deepPurple,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              _minutesToHm(data.totalActualWorkMinutes),
                              style: const TextStyle(color: Colors.grey),
                            ),
                          ],
                        ),
                      ),
                      if (_hasWorkFlagTexts) ...[
                        const SizedBox(width: 8),
                        _workFlagTextsColumn(),
                      ],
                    ],
                  ),
                  if (data.carryOverAttendanceCount > 0) ...[
                    const SizedBox(height: 6),
                    Text(
                      'CO ${data.carryOverAttendanceCount}件 / +¥${yenFormat.format(data.carryOverGrossPay)}',
                      style: TextStyle(
                        color: Colors.teal.shade700,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (showPaymentActions) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: _buildPaymentRow(context),
            ),
          ],
        ],
      ),
    );
  }

  bool get _hasWorkFlagTexts =>
      data.totalLegalOvertimeMinutes > 0 ||
      data.totalLegalHolidayWorkMinutes > 0 ||
      data.totalNightWorkMinutes > 0 ||
      data.over60OvertimeMinutes > 0;

  /// 旧チップ（残業・法定休日等）と同じ枠＋薄い背景（支払い操作のボタン用）
  Widget _paymentChipButton({
    required String label,
    required Color accentColor,
    required VoidCallback? onTap,
  }) {
    final enabled = onTap != null;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Opacity(
          opacity: enabled ? 1 : 0.45,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: accentColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: accentColor.withValues(alpha: 0.4)),
            ),
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12,
                color: accentColor,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _workFlagTextsColumn() {
    const baseStyle = TextStyle(fontSize: 11, fontWeight: FontWeight.w600);
    final lines = <Widget>[];

    void add(String text, Color color) {
      lines.add(
        Text(text, textAlign: TextAlign.right, style: baseStyle.copyWith(color: color)),
      );
    }

    if (data.totalLegalOvertimeMinutes > 0) add('残業あり', Colors.orange);
    if (data.totalLegalHolidayWorkMinutes > 0) add('法定休日あり', Colors.red);
    if (data.totalNightWorkMinutes > 0) add('深夜あり', Colors.indigo);
    if (data.over60OvertimeMinutes > 0) add('60h超あり', Colors.purple);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < lines.length; i++) ...[
          if (i > 0) const SizedBox(height: 2),
          lines[i],
        ],
      ],
    );
  }

  Widget _buildPaymentRow(BuildContext context) {
    switch (data.paymentStatus) {
      case 'paid':
        return Align(
          alignment: Alignment.centerLeft,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.green.shade50,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Text(
              '✓ 支払い済み',
              style: TextStyle(color: Colors.green.shade700, fontSize: 13),
            ),
          ),
        );
      case 'hold':
        return Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.amber.shade50,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '⏸ 保留中',
                style: TextStyle(
                  color: Colors.amber.shade800,
                  fontSize: 12,
                ),
              ),
            ),
            const SizedBox(width: 8),
            _paymentChipButton(
              label: '支払い済み',
              accentColor: Colors.green.shade700,
              onTap: paymentBusy
                  ? null
                  : () {
                      showPaymentRegistrationDialog(
                        context,
                        staff: data,
                        asPaid: true,
                        onCommit: onRegisterPaid ?? (_) async {},
                      );
                    },
            ),
          ],
        );
      default:
        return Row(
          children: [
            _paymentChipButton(
              label: '支払い済み',
              accentColor: Colors.green.shade700,
              onTap: paymentBusy
                  ? null
                  : () {
                      showPaymentRegistrationDialog(
                        context,
                        staff: data,
                        asPaid: true,
                        onCommit: onRegisterPaid ?? (_) async {},
                      );
                    },
            ),
            const SizedBox(width: 8),
            _paymentChipButton(
              label: '保留',
              accentColor: Colors.amber.shade800,
              onTap: paymentBusy
                  ? null
                  : () {
                      showPaymentRegistrationDialog(
                        context,
                        staff: data,
                        asPaid: false,
                        onCommit: onRegisterHold ?? (_) async {},
                      );
                    },
            ),
          ],
        );
    }
  }
}

class _StaffPaymentRegistrationDialog extends StatefulWidget {
  const _StaffPaymentRegistrationDialog({
    required this.staff,
    required this.asPaid,
    required this.onCommit,
  });

  final StaffCardData staff;
  final bool asPaid;
  final Future<void> Function(StaffCardData staff) onCommit;

  @override
  State<_StaffPaymentRegistrationDialog> createState() =>
      _StaffPaymentRegistrationDialogState();
}

class _StaffPaymentRegistrationDialogState
    extends State<_StaffPaymentRegistrationDialog> {
  bool _submitting = false;

  Future<void> _onConfirm() async {
    setState(() => _submitting = true);
    try {
      await widget.onCommit(widget.staff);
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_submitting,
      child: AlertDialog(
        title: const Text('支払い状態の登録'),
        content: _submitting ? _buildLoadingContent() : _buildConfirmContent(),
        actions: _submitting
            ? null
            : [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('キャンセル'),
                ),
                ElevatedButton(
                  onPressed: _onConfirm,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: widget.asPaid
                        ? Colors.green.shade700
                        : Colors.amber.shade800,
                    foregroundColor: Colors.white,
                  ),
                  child: Text(
                    widget.asPaid ? '支払い済みで登録' : '保留で登録',
                  ),
                ),
              ],
      ),
    );
  }

  Widget _buildLoadingContent() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${widget.staff.staffName} さん',
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
          ),
          const SizedBox(height: 20),
          const Center(child: CircularProgressIndicator()),
          const SizedBox(height: 16),
          Text(
            widget.asPaid ? '支払い済みとして登録しています…' : '保留として登録しています…',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.grey.shade800,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildConfirmContent() {
    final staff = widget.staff;
    final asPaid = widget.asPaid;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '${staff.staffName} さん',
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
        const SizedBox(height: 16),
        if (asPaid) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
            decoration: BoxDecoration(
              color: Colors.green.shade50,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.green.shade700, width: 1.5),
            ),
            child: Text(
              '支払い済み',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.green.shade800,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '上記の状態で登録します。よろしいですか？',
            style: TextStyle(color: Colors.grey.shade800, fontSize: 14),
          ),
        ] else ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
            decoration: BoxDecoration(
              color: Colors.amber.shade50,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.amber.shade800, width: 1.5),
            ),
            child: Text(
              '保留',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.amber.shade900,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '上記の状態で登録します。よろしいですか？',
            style: TextStyle(color: Colors.grey.shade800, fontSize: 14),
          ),
        ],
      ],
    );
  }
}
