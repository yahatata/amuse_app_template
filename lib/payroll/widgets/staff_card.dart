// staff ごとのカード表示
//
// 参照: 06_UI_SPEC §4-2

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class StaffCardData {
  final String staffId;
  final String staffName;
  final int totalActualWorkMinutes;
  final int grossPay;
  final int totalLegalOvertimeMinutes;
  final int totalLegalHolidayWorkMinutes;
  final int over60OvertimeMinutes;
  final int carryOverAttendanceCount;
  final int carryOverGrossPay;
  final int baseHourlyWage;
  final int totalNightWorkMinutes;
  final int totalNonLegalHolidayWorkMinutes;
  final int basePay;
  final int lateNightPremiumPay;
  final int overtimePremiumPay;
  final int over60PremiumPay;
  final int legalHolidayPremiumPay;
  final List<String>? warnings;
  final String? paymentStatus;

  StaffCardData({
    required this.staffId,
    required this.staffName,
    required this.totalActualWorkMinutes,
    required this.grossPay,
    required this.totalLegalOvertimeMinutes,
    required this.totalLegalHolidayWorkMinutes,
    required this.over60OvertimeMinutes,
    required this.carryOverAttendanceCount,
    required this.carryOverGrossPay,
    required this.baseHourlyWage,
    required this.totalNightWorkMinutes,
    required this.totalNonLegalHolidayWorkMinutes,
    required this.basePay,
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
      totalLegalOvertimeMinutes: (data['totalLegalOvertimeMinutes'] as num?)?.toInt() ?? 0,
      totalLegalHolidayWorkMinutes: (data['totalLegalHolidayWorkMinutes'] as num?)?.toInt() ?? 0,
      over60OvertimeMinutes: (data['over60OvertimeMinutes'] as num?)?.toInt() ?? 0,
      carryOverAttendanceCount: (data['carryOverAttendanceCount'] as num?)?.toInt() ?? 0,
      carryOverGrossPay: (data['carryOverGrossPay'] as num?)?.toInt() ?? 0,
      baseHourlyWage: (data['baseHourlyWageSnapshot'] as num?)?.toInt() ?? 0,
      totalNightWorkMinutes: (data['totalNightWorkMinutes'] as num?)?.toInt() ?? 0,
      totalNonLegalHolidayWorkMinutes: (data['totalNonLegalHolidayWorkMinutes'] as num?)?.toInt() ?? 0,
      basePay: (data['basePay'] as num?)?.toInt() ?? 0,
      lateNightPremiumPay: (data['lateNightPremiumPay'] as num?)?.toInt() ?? 0,
      overtimePremiumPay: (data['overtimePremiumPay'] as num?)?.toInt() ?? 0,
      over60PremiumPay: (data['over60PremiumPay'] as num?)?.toInt() ?? 0,
      legalHolidayPremiumPay: (data['legalHolidayPremiumPay'] as num?)?.toInt() ?? 0,
      warnings: (data['warnings'] as List<dynamic>?)?.cast<String>(),
      paymentStatus: data['paymentStatus'] as String?,
    );
  }
}

class StaffCard extends StatelessWidget {
  final StaffCardData data;
  final VoidCallback? onTap;

  const StaffCard({super.key, required this.data, this.onTap});

  String _minutesToHm(int minutes) {
    final h = minutes ~/ 60;
    final m = minutes % 60;
    return '${h}h ${m}m';
  }

  @override
  Widget build(BuildContext context) {
    final yenFormat = NumberFormat('#,###');

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(data.staffName,
                        style: const TextStyle(
                            fontWeight: FontWeight.bold, fontSize: 16)),
                  ),
                  Text('¥${yenFormat.format(data.grossPay)}',
                      style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 18,
                          color: Colors.deepPurple)),
                ],
              ),
              const SizedBox(height: 4),
              Text(_minutesToHm(data.totalActualWorkMinutes),
                  style: const TextStyle(color: Colors.grey)),
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: [
                  if (data.totalLegalOvertimeMinutes > 0)
                    _chip('残業', Colors.orange),
                  if (data.totalLegalHolidayWorkMinutes > 0)
                    _chip('法定休日', Colors.red),
                  if (data.over60OvertimeMinutes > 0)
                    _chip('60h超', Colors.purple),
                  if (data.totalNightWorkMinutes > 0)
                    _chip('深夜', Colors.indigo),
                ],
              ),
              if (data.carryOverAttendanceCount > 0) ...[
                const SizedBox(height: 6),
                Text(
                  'CO ${data.carryOverAttendanceCount}件 / +¥${yenFormat.format(data.carryOverGrossPay)}',
                  style: TextStyle(
                      color: Colors.teal.shade700, fontSize: 13),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _chip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(label,
          style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
    );
  }
}
