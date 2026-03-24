// 計算用タブ本体
//
// 参照: 06_UI_SPEC §3

import 'package:flutter/material.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/services/payroll_config_service.dart';
import '../services/payroll_callable_service.dart';
import 'candidate_section.dart';
import 'preview_summary.dart';
import 'progress_view.dart';
import 'error_view.dart';

enum CalcTabState { idle, loading, candidatesLoaded, running, error }

class CalcTab extends StatefulWidget {
  final TabController tabController;

  const CalcTab({super.key, required this.tabController});

  @override
  State<CalcTab> createState() => _CalcTabState();
}

class _CalcTabState extends State<CalcTab> {
  final _service = PayrollCallableService();

  CalcTabState _state = CalcTabState.idle;
  String? _errorMessage;

  List<CandidateEntry> _group1 = [];
  List<CandidateEntry> _group2 = [];
  List<CandidateEntry> _group3 = [];

  String? _paymentPeriodKey;
  String? _runId;
  bool _isConfirmed = false;

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

  Future<void> _fetchCandidates() async {
    setState(() {
      _state = CalcTabState.loading;
      _errorMessage = null;
    });

    try {
      _paymentPeriodKey = _computePeriodKey();
      final result =
          await _service.getPayrollCandidates(_paymentPeriodKey!);

      final g1 = (result['group1'] as List<dynamic>? ?? [])
          .map((e) => CandidateEntry.fromMap(Map<String, dynamic>.from(e as Map)))
          .toList();
      final g2 = (result['group2'] as List<dynamic>? ?? [])
          .map((e) => CandidateEntry.fromMap(Map<String, dynamic>.from(e as Map)))
          .toList();
      final g3 = (result['group3'] as List<dynamic>? ?? [])
          .map((e) => CandidateEntry.fromMap(Map<String, dynamic>.from(e as Map)))
          .toList();

      for (final e in g1) {
        e.selected = true;
      }
      for (final e in g2) {
        e.selected = true;
      }

      final isConf = result['isConfirmed'] as bool? ?? false;

      setState(() {
        _group1 = g1;
        _group2 = g2;
        _group3 = g3;
        _isConfirmed = isConf;
        _state = CalcTabState.candidatesLoaded;
      });
    } catch (e) {
      setState(() {
        _state = CalcTabState.idle;
        _errorMessage = e.toString();
      });
    }
  }

  Future<void> _executePayroll() async {
    final selectedIds = [
      ..._group1.where((e) => e.selected).map((e) => e.attendanceId),
      ..._group2.where((e) => e.selected).map((e) => e.attendanceId),
    ];

    if (selectedIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('計算対象が選択されていません')),
      );
      return;
    }

    setState(() => _state = CalcTabState.running);

    try {
      final result = await _service.executeMonthlyPayroll(
        paymentPeriodKey: _paymentPeriodKey!,
        attendanceIds: selectedIds,
      );
      setState(() {
        _runId = result['runId'] as String?;
      });
    } catch (e) {
      setState(() {
        _state = CalcTabState.candidatesLoaded;
        _errorMessage = e.toString();
      });
    }
  }

  Future<void> _cancelRun() async {
    if (_paymentPeriodKey == null || _runId == null) return;
    try {
      await _service.cancelPayrollRun(_paymentPeriodKey!, _runId!);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('中止に失敗: $e')),
        );
      }
    }
  }

  Future<void> _retryFailed() async {
    if (_paymentPeriodKey == null || _runId == null) return;
    setState(() => _state = CalcTabState.running);
    try {
      await _service.retryFailedStaffTasks(_paymentPeriodKey!, _runId!);
    } catch (e) {
      setState(() {
        _state = CalcTabState.error;
        _errorMessage = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_state == CalcTabState.running && _runId != null) {
      return ProgressView(
        paymentPeriodKey: _paymentPeriodKey!,
        runId: _runId!,
        onCompleted: () {
          widget.tabController.animateTo(1);
          setState(() => _state = CalcTabState.candidatesLoaded);
        },
        onCompletedWithErrors: () {
          setState(() => _state = CalcTabState.error);
        },
        onCancel: _cancelRun,
      );
    }

    if (_state == CalcTabState.error && _runId != null) {
      return ErrorView(
        paymentPeriodKey: _paymentPeriodKey!,
        runId: _runId!,
        onRetry: _retryFailed,
        onViewResults: () => widget.tabController.animateTo(1),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.only(bottom: 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_errorMessage != null)
            Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(_errorMessage!,
                  style: const TextStyle(color: Colors.red)),
            ),

          if (_state == CalcTabState.idle || _state == CalcTabState.loading)
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  const Text(
                    '対象データを抽出して、給与計算を実行します',
                    style: TextStyle(fontSize: 16),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _state == CalcTabState.loading
                          ? null
                          : _fetchCandidates,
                      icon: _state == CalcTabState.loading
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.search),
                      label: const Text('対象データの抽出を開始する'),
                    ),
                  ),
                ],
              ),
            ),

          if (_state == CalcTabState.candidatesLoaded) ...[
            if (_isConfirmed)
              Container(
                margin: const EdgeInsets.all(16),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.blue),
                ),
                child: const Text(
                  'この期間は確定済みです。再計算はできません。',
                  style: TextStyle(color: Colors.blue),
                ),
              ),

            // 属性3（上）
            CandidateSection(
              title: '対象外データ',
              groupKey: 'group3',
              entries: _group3,
              selectable: false,
            ),
            // 属性2（中）
            CandidateSection(
              title: '前期以前の未反映データ（キャリーオーバー）',
              groupKey: 'group2',
              entries: _group2,
              onToggle: (idx) {
                setState(() => _group2[idx].selected = !_group2[idx].selected);
              },
            ),
            // 属性1（下）
            CandidateSection(
              title: '期間内の正常勤怠データ',
              groupKey: 'group1',
              entries: _group1,
              requireConfirmToUncheck: true,
              onToggle: (idx) {
                setState(() => _group1[idx].selected = !_group1[idx].selected);
              },
            ),

            PreviewSummary(
              group1: _group1,
              group2: _group2,
              expectedCountMin:
                  PayrollConfigService.instance.latest?.maxCandidatesCount != null
                      ? null
                      : null,
            ),

            if (!_isConfirmed)
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: ElevatedButton.icon(
                  onPressed: _executePayroll,
                  icon: const Icon(Icons.play_arrow),
                  label: const Text('給与計算を実行'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.deepPurple,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                ),
              ),

            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: OutlinedButton.icon(
                onPressed: _fetchCandidates,
                icon: const Icon(Icons.refresh),
                label: const Text('再抽出'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
