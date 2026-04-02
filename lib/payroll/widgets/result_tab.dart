// 結果タブ本体
//
// 参照: 06_UI_SPEC §4, §5、UI修正用 TOBE_SPEC

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/services/payroll_config_service.dart';

import '../services/payroll_callable_service.dart';
import '../utils/payment_date_utils.dart';
import 'result_summary.dart';
import 'staff_card.dart';
import 'staff_detail_page.dart';
import 'confirm_section.dart';
import 'payment_management.dart';
import 'past_results_selector.dart';
import 'payroll_header_common.dart';

class ResultTab extends StatefulWidget {
  const ResultTab({super.key});

  @override
  State<ResultTab> createState() => _ResultTabState();
}

class _ResultTabState extends State<ResultTab> {
  final _payrollService = PayrollCallableService();
  final ScrollController _staffResultsScrollController = ScrollController();
  String _paymentPeriodKey = '';
  bool _periodKeyLoading = true;
  bool _mgmtPaymentRegisterBusy = false;

  /// 親 StreamBuilder の再ビルドのたびに `snapshots()` を渡し直すと、子 StreamBuilder が
  /// 別ストリーム扱いで再購読 → 一瞬 waiting → スクロール可能領域が消えてオフセットが 0 に戻る。
  /// 同一 period + runId では同じ Stream インスタンスを使い回す。
  String? _payrollStreamsCacheKey;
  Stream<DocumentSnapshot>? _cachedPayrollRunDocStream;
  Stream<QuerySnapshot>? _cachedStaffResultsQueryStream;

  void _invalidatePayrollStreamCaches() {
    _payrollStreamsCacheKey = null;
    _cachedPayrollRunDocStream = null;
    _cachedStaffResultsQueryStream = null;
  }

  void _ensurePayrollStreams(String runId) {
    final key = '$_paymentPeriodKey|$runId';
    if (_payrollStreamsCacheKey == key) return;
    _payrollStreamsCacheKey = key;
    final runRef = FirebaseFirestore.instance
        .collection('monthlyPayroll')
        .doc(_paymentPeriodKey)
        .collection('payrollRuns')
        .doc(runId);
    _cachedPayrollRunDocStream = runRef.snapshots();
    _cachedStaffResultsQueryStream = runRef
        .collection('staffResults')
        .where('taskStatus', isEqualTo: 'completed')
        .snapshots();
  }

  Stream<DocumentSnapshot> _payrollRunDocumentStream(String runId) {
    _ensurePayrollStreams(runId);
    return _cachedPayrollRunDocStream!;
  }

  Stream<QuerySnapshot> _staffResultsQueryStream(String runId) {
    _ensurePayrollStreams(runId);
    return _cachedStaffResultsQueryStream!;
  }

  @override
  void initState() {
    super.initState();
    _resolvePaymentPeriodKey();
  }

  @override
  void dispose() {
    _staffResultsScrollController.dispose();
    super.dispose();
  }

  /// デフォルトは直近の monthlyPayroll（createdAt 最新）。無ければ Callable の期間キー。
  Future<void> _resolvePaymentPeriodKey() async {
    try {
      final snap = await FirebaseFirestore.instance
          .collection('monthlyPayroll')
          .orderBy('createdAt', descending: true)
          .limit(1)
          .get();

      String key = '';
      if (snap.docs.isNotEmpty) {
        key = snap.docs.first.id;
      } else {
        final ctx = await _payrollService.getPayrollCalcDisplayContext();
        key = ctx['paymentPeriodKey'] as String? ?? '';
      }

      if (!mounted) return;
      setState(() {
        if (_paymentPeriodKey != key) _invalidatePayrollStreamCaches();
        _paymentPeriodKey = key;
        _periodKeyLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      final fallback = _computePeriodKey();
      setState(() {
        if (_paymentPeriodKey != fallback) _invalidatePayrollStreamCaches();
        _paymentPeriodKey = fallback;
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
    setState(() {
      _paymentPeriodKey = newKey;
      _invalidatePayrollStreamCaches();
    });
  }

  /// 結果サマリ見出し横: 対象期間・支給予定日（選択中の期間キー＋店舗 payrollConfig）
  String _resultSummaryHeaderMetaLine() {
    final parts = _paymentPeriodKey.split('_');
    if (parts.length != 2) {
      return '対象期間：—, 給与支給予定日：未設定';
    }
    final range =
        '${formatIsoYmdToSlash(parts[0])}~${formatIsoYmdToSlash(parts[1])}';
    final config = PayrollConfigService.instance.latest;
    final actual = computeActualPaymentDate(
      periodEnd: parts[1],
      paymentDayOfMonth: config?.paymentDayOfMonth,
      paymentMonthOffset: config?.paymentMonthOffset ?? 1,
    );
    final payLabel =
        actual != null ? formatIsoYmdToSlash(actual) : '未設定';
    return '対象期間：$range, 給与支給予定日：$payLabel';
  }

  /// カード内ダイアログから呼ぶ。失敗時は SnackBar のあと rethrow（ダイアログを確認画面に戻す）
  Future<void> _registerStaffPaymentStatus(
    StaffCardData staff,
    String status,
  ) async {
    try {
      await _payrollService.registerPaymentStatus(
        paymentPeriodKey: _paymentPeriodKey,
        entries: [
          {'staffId': staff.staffId, 'status': status}
        ],
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('登録に失敗: $e')),
        );
      }
      rethrow;
    }
  }

  Widget _buildResultHeaderRow(
    BuildContext context, {
    required Map<String, dynamic>? mpData,
    required Map<String, dynamic>? runData,
  }) {
    final time = payrollExecutionTimeFormatted(mpData, runData);
    final mpStatus = mpData?['status'] as String? ?? '';
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            flex: 2,
            child: Text(
              '下記の計算実行日時：$time',
              style: TextStyle(
                color: Theme.of(context).colorScheme.error,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 2,
            child: PastResultsSelector(
              currentPeriodKey: _paymentPeriodKey,
              onPeriodChanged: _changePeriod,
              compact: true,
            ),
          ),
          const SizedBox(width: 8),
          PayrollMonthlyStatusBadge(status: mpStatus),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_periodKeyLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: _paymentPeriodKey.isEmpty
              ? const Center(child: Text('表示する期間を取得できません'))
              : StreamBuilder<DocumentSnapshot>(
                  stream: FirebaseFirestore.instance
                      .collection('monthlyPayroll')
                      .doc(_paymentPeriodKey)
                      .snapshots(),
                  builder: (context, mpSnapshot) {
                    if (mpSnapshot.connectionState == ConnectionState.waiting) {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _buildResultHeaderRow(
                            context,
                            mpData: null,
                            runData: null,
                          ),
                          const Expanded(
                            child: Center(child: CircularProgressIndicator()),
                          ),
                        ],
                      );
                    }

                    final mpData =
                        mpSnapshot.data?.data() as Map<String, dynamic>?;
                    if (mpData == null) {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _buildResultHeaderRow(
                            context,
                            mpData: null,
                            runData: null,
                          ),
                          Expanded(child: _emptyState()),
                        ],
                      );
                    }

                    final latestRunId = mpData['latestRunId'] as String?;
                    if (latestRunId == null) {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _buildResultHeaderRow(
                            context,
                            mpData: mpData,
                            runData: null,
                          ),
                          Expanded(child: _emptyState()),
                        ],
                      );
                    }

                    return _buildWithRun(context, latestRunId, mpData);
                  },
                ),
        ),
      ],
    );
  }

  Widget _emptyState() {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.inbox, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            Text(
              'この期間の計算結果はまだありません',
              style: TextStyle(color: Colors.grey.shade700, fontSize: 16),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWithRun(
    BuildContext context,
    String runId,
    Map<String, dynamic> mpData,
  ) {
    return StreamBuilder<DocumentSnapshot>(
      stream: _payrollRunDocumentStream(runId),
      builder: (context, runSnapshot) {
        if (runSnapshot.connectionState == ConnectionState.waiting) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildResultHeaderRow(
                context,
                mpData: mpData,
                runData: null,
              ),
              const Expanded(
                child: Center(child: CircularProgressIndicator()),
              ),
            ],
          );
        }

        final runData = runSnapshot.data?.data() as Map<String, dynamic>?;
        if (runData == null) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildResultHeaderRow(
                context,
                mpData: mpData,
                runData: null,
              ),
              Expanded(child: _emptyState()),
            ],
          );
        }

        final runStatus = runData['status'] as String? ?? '';
        final mpStatus = mpData['status'] as String? ?? '';

        if (['preparing', 'processing', 'aggregating'].contains(runStatus)) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildResultHeaderRow(
                context,
                mpData: mpData,
                runData: runData,
              ),
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const SizedBox(height: 24),
                      const Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            CircularProgressIndicator(),
                            SizedBox(height: 16),
                            Text(
                              '計算中です。計算タブで進捗を確認できます',
                              style: TextStyle(color: Colors.grey),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _buildResultHeaderRow(
              context,
              mpData: mpData,
              runData: runData,
            ),
            Expanded(
              child: _buildStaffResults(
                runId,
                runData,
                runStatus,
                mpStatus,
                mpData,
              ),
            ),
          ],
        );
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
    return StreamBuilder<QuerySnapshot>(
      stream: _staffResultsQueryStream(runId),
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
          key: const PageStorageKey<String>('result_tab_staff_scroll'),
          controller: _staffResultsScrollController,
          padding: const EdgeInsets.only(bottom: 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
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
                headerMetaLine: _resultSummaryHeaderMetaLine(),
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

              ...staffList.map((staff) {
                final showPay = ['confirmed', 'hold', 'paid']
                    .contains(mpStatus);
                return StaffCard(
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
                  showPaymentActions: showPay,
                  paymentBusy: _mgmtPaymentRegisterBusy,
                  onRegisterPaid: (s) => _registerStaffPaymentStatus(s, 'paid'),
                  onRegisterHold: (s) => _registerStaffPaymentStatus(s, 'hold'),
                );
              }),

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
                  showPerStaffPaymentRows: false,
                  paymentRegisterBusy: _mgmtPaymentRegisterBusy,
                  onManagementProcessingChanged: (v) {
                    if (!mounted) return;
                    setState(() => _mgmtPaymentRegisterBusy = v);
                  },
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
