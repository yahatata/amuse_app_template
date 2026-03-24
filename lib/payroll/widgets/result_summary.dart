// 計算結果サマリ表示
//
// 参照: 06_UI_SPEC §4-1

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class ResultSummary extends StatelessWidget {
  final int targetStaffCount;
  final int totalGrossPay;
  final int totalActualWorkMinutes;
  final int totalLegalOvertimeMinutes;
  final int totalLegalHolidayWorkMinutes;
  final Map<String, dynamic>? anomalyFlags;

  const ResultSummary({
    super.key,
    required this.targetStaffCount,
    required this.totalGrossPay,
    required this.totalActualWorkMinutes,
    required this.totalLegalOvertimeMinutes,
    required this.totalLegalHolidayWorkMinutes,
    this.anomalyFlags,
  });

  String _minutesToHm(int minutes) {
    final h = minutes ~/ 60;
    final m = minutes % 60;
    return '${h}h ${m}m';
  }

  @override
  Widget build(BuildContext context) {
    final yenFormat = NumberFormat('#,###');
    final hasAnomalies =
        anomalyFlags != null && anomalyFlags!.isNotEmpty;

    return Card(
      margin: const EdgeInsets.all(16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('計算結果サマリ',
                style: Theme.of(context).textTheme.titleMedium),
            const Divider(),
            _row('対象スタッフ数', '$targetStaffCount 名'),
            _row('総支給額合計', '¥${yenFormat.format(totalGrossPay)}'),
            _row('総実労働時間', _minutesToHm(totalActualWorkMinutes)),
            _row('総法定時間外労働', _minutesToHm(totalLegalOvertimeMinutes)),
            _row('総法定休日労働', _minutesToHm(totalLegalHolidayWorkMinutes)),
            if (hasAnomalies) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Row(
                  children: [
                    Icon(Icons.warning_amber,
                        color: Colors.orange.shade700, size: 20),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text('異常値チェックで警告があります',
                          style: TextStyle(color: Colors.orange)),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.grey)),
          Text(value,
              style: const TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
