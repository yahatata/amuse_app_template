// 結果タブ本体
//
// 参照: 06_UI_SPEC §4, §5、UI修正用 TOBE_SPEC

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:amuse_app_template/services/store_config_service.dart';

import '../services/payroll_callable_service.dart';
import 'result_summary.dart';
import 'staff_card.dart';
import 'staff_detail_page.dart';
import 'confirm_section.dart';
import 'payment_management.dart';
import 'past_results_selector.dart';

class ResultTab extends StatefulWidget {
  const ResultTab({super.key});

  @override
  State<ResultTab> createState() => _ResultTabState();
}

class _ResultTabState extends State<ResultTab> {
  final _payrollService = PayrollCallableService();
  String _paymentPeriodKey = '';
  bool _periodKeyLoading = true;

  @override
  void initState() {
    super.initState();
    _resolvePaymentPeriodKey();
  }

  Future<void> _resolvePaymentPeriodKey() async {
    try {
      final ctx = await _payrollService.getPayrollCalcDisplayContext();
      if (!mounted) return;
      final key = ctx['paymentPeriodKey'] as String? ?? '';
      setState(() {
        _paymentPeriodKey = key;
        _periodKeyLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _paymentPeriodKey = _computePeriodKey();
        _periodKeyLoading = false;
      });
    }
  }

  String _computePeriodKey() {
    final config = StoreConfigService.instance.latestData;
    final startDay = config?.payrollStartDay ?? 26;
    final endDay = config?.payrollEndDay ?? 25;

    final now = DateTime.now();
    DateTime periodStart;
    DateTime periodEnd;

    if (endDay == 0) {
      periodStart = DateTime(now.year, now.month, 1);
      final nextMonth = DateTime(now.year, now.month + 1, 1);
      periodEnd = nextMonth.subtract(const Duration(days: 1));
    } else if (now.day <= endDay) {
      final s = DateTime(now.year, now.month - 1, startDay);
      periodStart = DateTime(s.year, s.month, startDay);
      periodEnd = DateTime(now.year, now.month, endDay);
    } else {
      periodStart = DateTime(now.year, now.month, startDay);
      final e = DateTime(now.year, now.month + 1, endDay);
      periodEnd = DateTime(e.year, e.month, endDay);
    }

    String fmt(DateTime d) =>
        '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    return '${fmt(periodStart)}_${fmt(periodEnd)}';
  }

  void _changePeriod(String newKey) {
    setState(() => _paymentPeriodKey = newKey);
  }

  static String _formatTs(dynamic t) {
    if (t is Timestamp) {
      return DateFormat('yyyy-MM-dd HH:mm').format(t.toDate());
    }
    return '—';
  }

  static String _monthlyStatusLabel(String status) {
    switch (status) {
      case 'draft':
        return '未確定';
      case 'confirmed':
        return '確定済み';
      case 'hold':
        return '保留中';
      case 'paid':
        return '支払済';
      default:
        return status.isEmpty ? '—' : status;
    }
  }

  /// draft=赤系、confirmed/paid=緑系、その他=橙/灰
  ({Color border, Color background, Color foreground}) _statusBadgeColors(
    String mpStatus,
  ) {
    switch (mpStatus) {
      case 'draft':
        return (
          border: Colors.red.shade700,
          background: Colors.red.shade50,
          foreground: Colors.red.shade800,
        );
      case 'confirmed':
      case 'paid':
        return (
          border: Colors.green.shade700,
          background: Colors.green.shade50,
          foreground: Colors.green.shade800,
        );
      case 'hold':
        return (
          border: Colors.orange.shade700,
          background: Colors.orange.shade50,
          foreground: Colors.orange.shade900,
        );
      default:
        return (
          border: Colors.grey.shade600,
          background: Colors.grey.shade100,
          foreground: Colors.grey.shade800,
        );
    }
  }

  Widget _monthlyStatusBadge(String mpStatus) {
    final label = _monthlyStatusLabel(mpStatus);
    final c = _statusBadgeColors(mpStatus);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: c.background,
        border: Border.all(color: c.border, width: 1.5),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: c.foreground,
          fontWeight: FontWeight.w600,
          fontSize: 13,
        ),
      ),
    );
  }

  Widget _buildCalcTimeStatusRow(Map<String, dynamic> mpData, Map<String, dynamic>? runData) {
    final runStatus = runData?['status'] as String? ?? '';
    dynamic ts;
    if (runStatus == 'completed' ||
        runStatus == 'completed_with_errors' ||
        runStatus == 'failed' ||
        runStatus == 'cancelled') {
      ts = runData?['finishedAt'] ?? mpData['latestCalculatedAt'];
    } else {
      ts = mpData['latestCalculatedAt'] ?? runData?['startedAt'];
    }
    final timeLabel = _formatTs(ts);
    final mpStatus = mpData['status'] as String? ?? '';

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              'この結果の集計基準日時: $timeLabel',
              style: TextStyle(
                color: Theme.of(context).colorScheme.error,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: 12),
          _monthlyStatusBadge(mpStatus),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_periodKeyLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_paymentPeriodKey.isEmpty) {
      return const Center(child: Text('期間情報を取得できません'));
    }

    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseFirestore.instance
          .collection('monthlyPayroll')
          .doc(_paymentPeriodKey)
          .snapshots(),
      builder: (context, mpSnapshot) {
        if (mpSnapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final mpData = mpSnapshot.data?.data() as Map<String, dynamic>?;
        if (mpData == null) {
          return _emptyState();
        }

        final mpStatus = mpData['status'] as String? ?? '';
        final latestRunId = mpData['latestRunId'] as String?;

        if (latestRunId == null) {
          return _emptyState();
        }

        return _buildWithRun(latestRunId, mpStatus, mpData);
      },
    );
  }

  Widget _emptyState() {
    return SingleChildScrollView(
      child: Column(
        children: [
          PastResultsSelector(
            currentPeriodKey: _paymentPeriodKey,
            onPeriodChanged: _changePeriod,
          ),
          const SizedBox(height: 64),
          const Icon(Icons.inbox, size: 64, color: Colors.grey),
          const SizedBox(height: 16),
          const Text('計算結果がありません',
              style: TextStyle(color: Colors.grey, fontSize: 16)),
        ],
      ),
    );
  }

  Widget _buildWithRun(String runId, String mpStatus, Map<String, dynamic> mpData) {
    final runRef = FirebaseFirestore.instance
        .collection('monthlyPayroll')
        .doc(_paymentPeriodKey)
        .collection('payrollRuns')
        .doc(runId);

    return StreamBuilder<DocumentSnapshot>(
      stream: runRef.snapshots(),
      builder: (context, runSnapshot) {
        if (runSnapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final runData = runSnapshot.data?.data() as Map<String, dynamic>?;
        if (runData == null) {
          return _emptyState();
        }

        final runStatus = runData['status'] as String? ?? '';

        if (['preparing', 'processing', 'aggregating'].contains(runStatus)) {
          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                PastResultsSelector(
                  currentPeriodKey: _paymentPeriodKey,
                  onPeriodChanged: _changePeriod,
                ),
                _buildCalcTimeStatusRow(mpData, runData),
                const SizedBox(height: 24),
                const Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(),
                      SizedBox(height: 16),
                      Text('計算中です。計算タブで進捗を確認できます',
                          style: TextStyle(color: Colors.grey)),
                    ],
                  ),
                ),
              ],
            ),
          );
        }

        return _buildStaffResults(runId, runData, runStatus, mpStatus, mpData);
      },
    );
  }

  Widget _buildStaffResults(
    String runId,
    Map<String, dynamic> runData,
    String runStatus,
    String mpStatus,
    Map<String, dynamic> mpData,
  ) {
    final staffRef = FirebaseFirestore.instance
        .collection('monthlyPayroll')
        .doc(_paymentPeriodKey)
        .collection('payrollRuns')
        .doc(runId)
        .collection('staffResults')
        .where('taskStatus', isEqualTo: 'completed');

    return StreamBuilder<QuerySnapshot>(
      stream: staffRef.snapshots(),
      builder: (context, staffSnapshot) {
        if (staffSnapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final staffDocs = staffSnapshot.data?.docs ?? [];
        final staffList = staffDocs
            .map((doc) => StaffCardData.fromFirestore(
                doc.id, doc.data() as Map<String, dynamic>))
            .where((s) => s.grossPay != 0)
            .toList()
          ..sort((a, b) => b.grossPay.compareTo(a.grossPay));

        final totalActualWork =
            staffList.fold<int>(0, (s, e) => s + e.totalActualWorkMinutes);
        final totalOvertime = staffList.fold<int>(
            0, (s, e) => s + e.totalLegalOvertimeMinutes);
        final totalHoliday = staffList.fold<int>(
            0, (s, e) => s + e.totalLegalHolidayWorkMinutes);

        final failedCount =
            (runData['failedStaffCount'] as num?)?.toInt() ?? 0;

        return SingleChildScrollView(
          padding: const EdgeInsets.only(bottom: 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              PastResultsSelector(
                currentPeriodKey: _paymentPeriodKey,
                onPeriodChanged: _changePeriod,
              ),
              _buildCalcTimeStatusRow(mpData, runData),

              if (runStatus == 'completed_with_errors')
                Container(
                  margin:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.orange),
                  ),
                  child: Text(
                    '⚠ $failedCount名のスタッフの計算に失敗しています。計算タブから再実行してください。',
                    style: TextStyle(color: Colors.orange.shade800),
                  ),
                ),

              ResultSummary(
                targetStaffCount:
                    (runData['targetStaffCount'] as num?)?.toInt() ?? 0,
                totalGrossPay:
                    (runData['totalGrossPay'] as num?)?.toInt() ?? 0,
                totalActualWorkMinutes: totalActualWork,
                totalLegalOvertimeMinutes: totalOvertime,
                totalLegalHolidayWorkMinutes: totalHoliday,
                anomalyFlags:
                    runData['anomalyFlags'] as Map<String, dynamic>?,
              ),

              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('スタッフ (${staffList.length}名)',
                        style: Theme.of(context).textTheme.titleSmall),
                    TextButton.icon(
                      onPressed: () =>
                          _exportCsv(staffList, mpStatus, runData),
                      icon: const Icon(Icons.download, size: 18),
                      label: const Text('CSV'),
                    ),
                  ],
                ),
              ),

              ...staffList.map((staff) => StaffCard(
                    data: staff,
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => StaffDetailPage(
                          paymentPeriodKey: _paymentPeriodKey,
                          runId: runId,
                          staffData: staff,
                        ),
                      ),
                    ),
                  )),

              ConfirmSection(
                paymentPeriodKey: _paymentPeriodKey,
                runId: runId,
                runStatus: runStatus,
                monthlyPayrollStatus: mpStatus,
                failedStaffCount: failedCount,
              ),

              if (['confirmed', 'hold', 'paid'].contains(mpStatus))
                PaymentManagement(
                  paymentPeriodKey: _paymentPeriodKey,
                  monthlyPayrollStatus: mpStatus,
                  staffList: staffList,
                ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _exportCsv(
    List<StaffCardData> staffList,
    String mpStatus,
    Map<String, dynamic> runData,
  ) async {
    final statusLabel =
        mpStatus == 'draft' ? '未確定' : '確定済み';
    final buf = StringBuffer();
    buf.writeln('# ステータス: $statusLabel');
    buf.writeln('# 期間: $_paymentPeriodKey');
    buf.writeln(_csvRow([
      'スタッフ名',
      '時給',
      '実労働時間(分)',
      '夜間労働時間(分)',
      '法定時間外労働(分)',
      '60h超時間外(分)',
      '法定休日労働(分)',
      '法定外休日労働(分)',
      '基本給',
      '深夜割増',
      '残業割増',
      '60h超割増',
      '法定休日割増',
      'キャリーオーバー支給額',
      '総支給額',
    ]));

    for (final s in staffList) {
      buf.writeln(_csvRow([
        s.staffName,
        '${s.baseHourlyWage}',
        '${s.totalActualWorkMinutes}',
        '${s.totalNightWorkMinutes}',
        '${s.totalLegalOvertimeMinutes}',
        '${s.over60OvertimeMinutes}',
        '${s.totalLegalHolidayWorkMinutes}',
        '${s.totalNonLegalHolidayWorkMinutes}',
        '${s.basePay}',
        '${s.lateNightPremiumPay}',
        '${s.overtimePremiumPay}',
        '${s.over60PremiumPay}',
        '${s.legalHolidayPremiumPay}',
        '${s.carryOverGrossPay}',
        '${s.grossPay}',
      ]));
    }

    try {
      final dir = await getTemporaryDirectory();
      final fileName =
          'payroll_${_paymentPeriodKey.replaceAll('/', '-')}.csv';
      final file = File('${dir.path}/$fileName');
      // BOM for Excel UTF-8 compatibility
      final bom = '\uFEFF';
      await file.writeAsString('$bom${buf.toString()}');

      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path)],
          subject: '給与計算結果 $_paymentPeriodKey',
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('CSV出力に失敗: $e')),
        );
      }
    }
  }

  String _csvRow(List<String> fields) {
    return fields.map(_escapeCsvField).join(',');
  }

  String _escapeCsvField(String value) {
    if (value.contains(',') ||
        value.contains('"') ||
        value.contains('\n')) {
      return '"${value.replaceAll('"', '""')}"';
    }
    return value;
  }
}
