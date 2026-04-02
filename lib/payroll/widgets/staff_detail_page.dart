// staff 詳細画面
//
// 参照: 06_UI_SPEC §4-3

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';
import 'staff_card.dart';

class StaffDetailPage extends StatefulWidget {
  final String paymentPeriodKey;
  final String runId;
  final StaffCardData staffData;

  const StaffDetailPage({
    super.key,
    required this.paymentPeriodKey,
    required this.runId,
    required this.staffData,
  });

  @override
  State<StaffDetailPage> createState() => _StaffDetailPageState();
}

class _StaffDetailPageState extends State<StaffDetailPage> {
  List<Map<String, dynamic>>? _attendanceItems;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _fetchAttendanceItems();
  }

  Future<void> _fetchAttendanceItems() async {
    final snap = await FirebaseFirestore.instance
        .collection('monthlyPayroll')
        .doc(widget.paymentPeriodKey)
        .collection('payrollRuns')
        .doc(widget.runId)
        .collection('staffResults')
        .doc(widget.staffData.staffId)
        .collection('attendanceItems')
        .orderBy('workDate')
        .get();

    if (mounted) {
      setState(() {
        _attendanceItems =
            snap.docs.map((d) => d.data()).toList();
        _loading = false;
      });
    }
  }

  static const _weekdayLabels = ['日', '月', '火', '水', '木', '金', '土'];

  String _minutesToHm(int minutes) {
    final h = minutes ~/ 60;
    final m = minutes % 60;
    return '${h}h ${m}m';
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.staffData;
    final yenFormat = NumberFormat('#,###');
    final yenDecimalFormat = NumberFormat('#,##0.##');

    // 丸め差分が存在するか判定するヘルパー
    bool hasRoundingDiff(double? raw, num rounded) {
      if (raw == null) return false;
      return (raw - rounded).abs() > 0.001;
    }

    return Scaffold(
      appBar: AppBar(title: Text(d.staffName)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _sectionTitle('基本情報'),
            _infoRow('スタッフ名', d.staffName),
            _infoRow('基本時給', '¥${yenFormat.format(d.baseHourlyWage)}'),
            const Divider(height: 32),

            _sectionTitle('集計値'),
            _infoRow('実労働時間', _minutesToHm(d.totalActualWorkMinutes)),
            _infoRow('深夜労働時間', _minutesToHm(d.totalNightWorkMinutes)),
            _infoRow('法定時間外労働', _minutesToHm(d.totalLegalOvertimeMinutes)),
            _infoRow('60h超時間外', _minutesToHm(d.over60OvertimeMinutes)),
            _infoRow('法定休日労働', _minutesToHm(d.totalLegalHolidayWorkMinutes)),
            _infoRow('法定外休日労働', _minutesToHm(d.totalNonLegalHolidayWorkMinutes)),
            const Divider(height: 32),

            _sectionTitle('金額内訳'),
            // 基本給: 丸め前を差分がある場合のみ別行で表示
            if (hasRoundingDiff(d.basePayRaw, d.basePay))
              _infoRow('基本給（丸め前）', '¥${yenDecimalFormat.format(d.basePayRaw!)}',
                  subLabel: true),
            _infoRow('基本給', '¥${yenDecimalFormat.format(d.basePay)}'),
            _infoRow('深夜割増', '¥${yenDecimalFormat.format(d.lateNightPremiumPay)}'),
            _infoRow('残業割増', '¥${yenDecimalFormat.format(d.overtimePremiumPay)}'),
            _infoRow('60h超割増', '¥${yenDecimalFormat.format(d.over60PremiumPay)}'),
            _infoRow('法定休日割増', '¥${yenDecimalFormat.format(d.legalHolidayPremiumPay)}'),
            const Divider(),
            // 総支給額: 丸め前を差分がある場合のみ別行で表示
            if (hasRoundingDiff(d.grossPayRaw, d.grossPay))
              _infoRow('総支給額（丸め前）', '¥${yenDecimalFormat.format(d.grossPayRaw!)}',
                  subLabel: true),
            _infoRow('総支給額', '¥${yenFormat.format(d.grossPay)}',
                bold: true),

            if (d.carryOverAttendanceCount > 0) ...[
              const Divider(height: 32),
              _sectionTitle('キャリーオーバー'),
              _infoRow('件数', '${d.carryOverAttendanceCount} 件'),
              _infoRow('支給額', '¥${yenFormat.format(d.carryOverGrossPay)}'),
            ],

            if (d.warnings != null && d.warnings!.isNotEmpty) ...[
              const Divider(height: 32),
              _sectionTitle('警告'),
              for (final w in d.warnings!)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.warning_amber,
                          size: 16, color: Colors.orange),
                      const SizedBox(width: 6),
                      Expanded(child: Text(w)),
                    ],
                  ),
                ),
            ],

            const Divider(height: 32),
            _sectionTitle('attendance 明細'),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_attendanceItems == null || _attendanceItems!.isEmpty)
              const Text('明細データがありません',
                  style: TextStyle(color: Colors.grey))
            else
              _buildAttendanceTable(),
          ],
        ),
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(title,
          style: const TextStyle(
              fontSize: 16, fontWeight: FontWeight.bold)),
    );
  }

  Widget _infoRow(String label, String value, {bool bold = false, bool subLabel = false}) {
    final labelColor = subLabel ? Colors.grey.shade400 : Colors.grey;
    final valueColor = subLabel ? Colors.grey.shade400 : null;
    final fontSize = subLabel ? 12.0 : null;

    return Padding(
      padding: EdgeInsets.symmetric(vertical: subLabel ? 1 : 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: TextStyle(color: labelColor, fontSize: fontSize)),
          Text(value,
              style: TextStyle(
                  fontWeight: bold ? FontWeight.bold : FontWeight.normal,
                  color: valueColor,
                  fontSize: fontSize)),
        ],
      ),
    );
  }

  Widget _buildAttendanceTable() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DataTable(
        columnSpacing: 16,
        columns: const [
          DataColumn(label: Text('日付')),
          DataColumn(label: Text('曜日')),
          DataColumn(label: Text('実労働'), numeric: true),
          DataColumn(label: Text('深夜'), numeric: true),
          DataColumn(label: Text('法定外'), numeric: true),
          DataColumn(label: Text('法休')),
          DataColumn(label: Text('CO')),
        ],
        rows: _attendanceItems!.map((item) {
          final weekday = (item['weekday'] as num?)?.toInt() ?? 0;
          final isLegalHoliday = item['isLegalHoliday'] as bool? ?? false;
          final isCarryOver = item['isCarryOver'] as bool? ?? false;

          return DataRow(cells: [
            DataCell(Text(item['workDate'] as String? ?? '')),
            DataCell(Text(_weekdayLabels[weekday % 7])),
            DataCell(Text('${(item['actualWorkMinutes'] as num?)?.toInt() ?? 0}')),
            DataCell(Text('${(item['nightWorkMinutes'] as num?)?.toInt() ?? 0}')),
            DataCell(Text('${(item['legalOvertimeMinutes'] as num?)?.toInt() ?? 0}')),
            DataCell(isLegalHoliday
                ? const Icon(Icons.check, size: 16, color: Colors.red)
                : const SizedBox.shrink()),
            DataCell(isCarryOver
                ? Text('CO',
                    style: TextStyle(
                        color: Colors.teal.shade700,
                        fontWeight: FontWeight.bold,
                        fontSize: 12))
                : const SizedBox.shrink()),
          ]);
        }).toList(),
      ),
    );
  }
}
