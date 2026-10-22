// 計算用タブ本体
//
// 参照: 06_UI_SPEC §3、修正用フォルダ UI修正用 TOBE_SPEC

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:intl/intl.dart';
import 'package:amuse_app_template/services/payroll_config_service.dart';
import 'package:amuse_app_template/Home/staff_retired_ui_helpers.dart';
import '../errors/payroll_user_facing_errors.dart';
import '../models/payroll_display_context.dart';
import '../services/payroll_callable_service.dart';
import '../utils/payroll_calc_window.dart';
import '../utils/wage_missing_staff.dart';
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

  PayrollDisplayContext? _displayContext;
  bool _contextLoading = true;
  String? _contextLoadError;

  List<CandidateEntry> _group1 = [];
  List<CandidateEntry> _group2 = [];
  List<CandidateEntry> _group3 = [];

  List<WageMissingStaffEntry> _wageMissingStaff = [];

  Set<String> _retiredStaffNames = {};

  String? _runId;

  /// 給与計算実行・失敗再試行の Callable 待ち中（二重押下防止・接続ダイアログ表示中を含む）
  bool _payrollSubmitBusy = false;

  static String _fmtTimestamp(dynamic t) {
    if (t is Timestamp) {
      return DateFormat('yyyy-MM-dd HH:mm').format(t.toDate());
    }
    return '—';
  }

  @override
  void initState() {
    super.initState();
    _loadDisplayContext();
  }

  Future<void> _loadDisplayContext() async {
    setState(() {
      _contextLoading = true;
      _contextLoadError = null;
    });
    try {
      final map = await _service.getPayrollCalcDisplayContext();
      if (!mounted) return;
      if (!isPayrollCallableSuccess(
        map,
        shapeValidator: isPayrollCalcDisplayContextShape,
      )) {
        setState(() {
          _contextLoadError = mapPayrollSoftFail(
            map,
            operation: kGetPayrollCalcDisplayContextOperation,
          );
          _contextLoading = false;
        });
        return;
      }
      setState(() {
        _displayContext = PayrollDisplayContext.fromMap(map);
        _contextLoading = false;
        _contextLoadError = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _contextLoadError = kPayrollContextLoadFailedMessage;
        _contextLoading = false;
      });
    }
  }

  bool get _contextReady =>
      _displayContext != null && _contextLoadError == null;

  Future<void> _fetchCandidates() async {
    final ctx = _displayContext;
    if (ctx == null || !_contextReady) return;

    final prevG1 = List<CandidateEntry>.from(_group1);
    final prevG2 = List<CandidateEntry>.from(_group2);
    final prevG3 = List<CandidateEntry>.from(_group3);
    final prevState = _state;

    setState(() {
      _state = CalcTabState.loading;
      _errorMessage = null;
    });

    try {
      final result =
          await _service.getPayrollCandidates(ctx.paymentPeriodKey);
      if (!isPayrollCallableSuccess(
        result,
        shapeValidator: isPayrollCandidatesShape,
      )) {
        if (!mounted) return;
        setState(() {
          _group1 = prevG1;
          _group2 = prevG2;
          _group3 = prevG3;
          _state = prevState == CalcTabState.candidatesLoaded
              ? CalcTabState.candidatesLoaded
              : CalcTabState.idle;
          _errorMessage = mapPayrollSoftFail(
            result,
            operation: kGetPayrollCandidatesOperation,
          );
        });
        return;
      }

      final disp = result['displayContext'];
      if (disp is Map) {
        _displayContext = PayrollDisplayContext.fromMap(
          Map<String, dynamic>.from(disp),
        );
      }

      final g1 = (result['group1'] as List<dynamic>? ?? [])
          .map((e) => CandidateEntry.fromMap(Map<String, dynamic>.from(e as Map)))
          .toList();
      final g2 = (result['group2'] as List<dynamic>? ?? [])
          .map((e) => CandidateEntry.fromMap(Map<String, dynamic>.from(e as Map)))
          .toList();
      final g3 = (result['group3'] as List<dynamic>? ?? [])
          .map((e) => CandidateEntry.fromMap(Map<String, dynamic>.from(e as Map)))
          .toList();
      final wageMissing = parseWageMissingStaff(result['wageMissingStaff']);

      for (final e in g1) {
        e.selected = true;
      }
      for (final e in g2) {
        e.selected = true;
      }

      final retiredNames = await StaffRetiredUi.fetchRetiredStaffNames();

      if (!mounted) return;
      final selectableEmpty = g1.isEmpty && g2.isEmpty;
      setState(() {
        _group1 = g1;
        _group2 = g2;
        _group3 = g3;
        _wageMissingStaff = wageMissing;
        _retiredStaffNames = retiredNames;
        _state = CalcTabState.candidatesLoaded;
        if (selectableEmpty) {
          _errorMessage = kPayrollCandidatesEmptyMessage;
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _group1 = prevG1;
        _group2 = prevG2;
        _group3 = prevG3;
        _state = prevState == CalcTabState.candidatesLoaded
            ? CalcTabState.candidatesLoaded
            : CalcTabState.idle;
        _errorMessage = kPayrollCandidatesLoadFailedMessage;
      });
    }
  }

  /// サーバー接続待ち（execute / retry の Callable 完了前）。await showDialog しない（閉じるまで Future が完了しないため）。
  void _openConnectingDialog() {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return PopScope(
          canPop: false,
          child: AlertDialog(
            title: const Text('給与計算'),
            content: const Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(height: 8),
                CircularProgressIndicator(),
                SizedBox(height: 20),
                Text('サーバーに接続しています…'),
                SizedBox(height: 4),
                Text(
                  'しばらくお待ちください',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _closeConnectingDialog() {
    final nav = Navigator.of(context, rootNavigator: true);
    if (nav.canPop()) {
      nav.pop();
    }
  }

  void _showRunProgressDialog(String runId) {
    final pk = _displayContext!.paymentPeriodKey;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) {
        return PopScope(
          canPop: false,
          child: AlertDialog(
            title: const Text('給与計算の進捗'),
            content: SizedBox(
              width: double.maxFinite,
              child: ProgressView(
                paymentPeriodKey: pk,
                runId: runId,
                onCompleted: () {
                  if (dialogContext.mounted) {
                    Navigator.of(dialogContext).pop();
                  }
                  widget.tabController.animateTo(1);
                  if (mounted) {
                    setState(() {
                      _state = CalcTabState.candidatesLoaded;
                      _runId = null;
                    });
                  }
                },
                onCompletedWithErrors: () {
                  if (dialogContext.mounted) {
                    Navigator.of(dialogContext).pop();
                  }
                  if (mounted) {
                    setState(() {
                      _state = CalcTabState.error;
                      _runId = runId;
                    });
                  }
                },
                onCancel: () => _cancelRunFromDialog(pk, runId),
                onTerminal: () {
                  if (dialogContext.mounted) {
                    Navigator.of(dialogContext).pop();
                  }
                  if (mounted) {
                    setState(() {
                      _state = CalcTabState.candidatesLoaded;
                      _runId = null;
                    });
                  }
                },
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _cancelRunFromDialog(String paymentPeriodKey, String runId) async {
    try {
      final result = await _service.cancelPayrollRun(paymentPeriodKey, runId);
      if (!isPayrollCallableSuccess(
        result,
        shapeValidator: isCancelPayrollRunShape,
      )) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                mapPayrollSoftFail(
                  result,
                  operation: kCancelPayrollRunOperation,
                ),
              ),
            ),
          );
        }
        return;
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapPayrollCallableError(
                e,
                operation: kCancelPayrollRunOperation,
              ),
            ),
          ),
        );
      }
    }
  }

  Future<void> _executePayroll() async {
    if (_payrollSubmitBusy) return;

    final ctx = _displayContext;
    if (ctx == null || !_contextReady) return;

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

    setState(() => _payrollSubmitBusy = true);
    _openConnectingDialog();
    await SchedulerBinding.instance.endOfFrame;

    try {
      final result = await _service.executeMonthlyPayroll(
        paymentPeriodKey: ctx.paymentPeriodKey,
        attendanceIds: selectedIds,
      );
      if (!mounted) return;
      _closeConnectingDialog();

      if (!isPayrollCallableSuccess(
        result,
        shapeValidator: isExecuteMonthlyPayrollShape,
      )) {
        setState(() {
          _payrollSubmitBusy = false;
          _errorMessage = mapPayrollSoftFail(
            result,
            operation: kExecuteMonthlyPayrollOperation,
          );
        });
        return;
      }

      final newRunId = result['runId'] as String?;
      setState(() {
        _runId = newRunId;
        _payrollSubmitBusy = false;
      });
      if (newRunId != null && newRunId.isNotEmpty) {
        _showRunProgressDialog(newRunId);
      } else {
        setState(() {
          _errorMessage = kPayrollExecuteFailedMessage;
        });
      }
    } catch (e) {
      if (mounted) {
        _closeConnectingDialog();
        setState(() {
          _payrollSubmitBusy = false;
          _errorMessage = mapPayrollCallableError(
            e,
            operation: kExecuteMonthlyPayrollOperation,
          );
        });
      }
    }
  }

  Future<void> _retryFailed() async {
    if (_payrollSubmitBusy) return;

    final pk = _displayContext?.paymentPeriodKey;
    if (pk == null || _runId == null) return;

    setState(() => _payrollSubmitBusy = true);
    _openConnectingDialog();
    await SchedulerBinding.instance.endOfFrame;

    try {
      final result = await _service.retryFailedStaffTasks(pk, _runId!);
      if (!mounted) return;
      _closeConnectingDialog();

      if (!isPayrollCallableSuccess(
        result,
        shapeValidator: isRetryFailedStaffTasksShape,
      )) {
        setState(() {
          _payrollSubmitBusy = false;
          _state = CalcTabState.error;
          _errorMessage = mapPayrollSoftFail(
            result,
            operation: kRetryFailedStaffTasksOperation,
          );
        });
        return;
      }

      setState(() => _payrollSubmitBusy = false);
      _showRunProgressDialog(_runId!);
    } catch (e) {
      if (mounted) {
        _closeConnectingDialog();
        setState(() {
          _payrollSubmitBusy = false;
          _state = CalcTabState.error;
          _errorMessage = mapPayrollCallableError(
            e,
            operation: kRetryFailedStaffTasksOperation,
          );
        });
      }
    }
  }

  Query<Map<String, dynamic>> _activeRunsQuery(String pk) {
    return FirebaseFirestore.instance
        .collection('monthlyPayroll')
        .doc(pk)
        .collection('payrollRuns')
        .where('status', whereIn: ['preparing', 'processing', 'aggregating']);
  }

  String? _pickActiveRunId(List<QueryDocumentSnapshot<Map<String, dynamic>>> docs) {
    if (docs.isEmpty) return null;
    final sorted = [...docs];
    sorted.sort((a, b) {
      final ca = a.data()['createdAt'];
      final cb = b.data()['createdAt'];
      final ma = ca is Timestamp ? ca.millisecondsSinceEpoch : 0;
      final mb = cb is Timestamp ? cb.millisecondsSinceEpoch : 0;
      return mb.compareTo(ma);
    });
    return sorted.first.id;
  }

  Widget _buildDisplayContextCard({
    required bool inCalculationWindow,
    required String? monthlyPayrollStatus,
    required bool periodClosedForCalculation,
  }) {
    final ctx = _displayContext!;
    final theme = Theme.of(context);
    final statusLine = payrollMonthlyCycleStatusLine(
      monthlyPayrollStatus: monthlyPayrollStatus,
      periodClosedForCalculation: periodClosedForCalculation,
      periodStartIso: ctx.periodStart,
      periodEndIso: ctx.periodEnd,
    );

    return Card(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('計算対象の情報', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            Text('基準日（当日の日付）: ${ctx.asOfDateJst}'),
            if (inCalculationWindow) ...[
              const SizedBox(height: 8),
              Text('期間: ${ctx.periodStart} 〜 ${ctx.periodEnd}'),
              Text('給与支給予定日: ${ctx.paymentDateDisplay}'),
            ] else ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest
                      .withValues(alpha: 0.65),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: theme.colorScheme.outlineVariant),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '計算期間対象外',
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(statusLine),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildDraftWarningBanner(
    Map<String, dynamic>? mpData,
    DocumentSnapshot<Map<String, dynamic>>? latestRunDoc,
  ) {
    if (mpData == null) return const SizedBox.shrink();
    final mpStatus = mpData['status'] as String? ?? '';
    final latestRunId = mpData['latestRunId'] as String?;
    if (latestRunId == null || mpStatus != 'draft') {
      return const SizedBox.shrink();
    }
    if (latestRunDoc == null || !latestRunDoc.exists) {
      return const SizedBox.shrink();
    }
    final runStatus = latestRunDoc.data()?['status'] as String? ?? '';
    if (runStatus != 'completed' && runStatus != 'completed_with_errors') {
      return const SizedBox.shrink();
    }
    final calculatedAtStr = _fmtTimestamp(mpData['latestCalculatedAt']);

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.amber.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.amber.shade700),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '未確定（draft）の計算結果が既に存在します。最終集計日時: $calculatedAtStr',
            style: TextStyle(color: Colors.amber.shade900, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          Text(
            '再計算する場合のみ対象データの抽出を開始してください。',
            style: TextStyle(color: Colors.amber.shade900, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _buildActiveRunBanner(String? activeRunId, VoidCallback onShowProgress) {
    if (activeRunId == null) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.deepPurple.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.deepPurple),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '給与計算を処理中です。完了まで対象データの抽出は実行できません。',
            style: TextStyle(color: Colors.deepPurple.shade900, fontWeight: FontWeight.w600),
          ),
          TextButton(
            onPressed: onShowProgress,
            child: const Text('進捗を表示'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_contextLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_contextLoadError != null && _displayContext == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_contextLoadError!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _loadDisplayContext,
                child: const Text('再読み込み'),
              ),
            ],
          ),
        ),
      );
    }

    final pk = _displayContext!.paymentPeriodKey;

    if (_state == CalcTabState.error && _runId != null) {
      return ErrorView(
        paymentPeriodKey: pk,
        runId: _runId!,
        onRetry: _retryFailed,
        onViewResults: () => widget.tabController.animateTo(1),
      );
    }

    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance.collection('monthlyPayroll').doc(pk).snapshots(),
      builder: (context, mpSnap) {
        final mpData = mpSnap.data?.data();
        final latestRunId = mpData?['latestRunId'] as String?;

        return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: _activeRunsQuery(pk).snapshots(),
          builder: (context, activeSnap) {
            final activeDocs = activeSnap.data?.docs ?? [];
            final activeRunId = _pickActiveRunId(activeDocs);
            final blockExtract = activeRunId != null;

            final mpStatus = mpData?['status'] as String?;
            final isCalculationLocked = mpStatus != null &&
                ['confirmed', 'paid', 'hold'].contains(mpStatus);

            if (latestRunId != null) {
              return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                stream: FirebaseFirestore.instance
                    .collection('monthlyPayroll')
                    .doc(pk)
                    .collection('payrollRuns')
                    .doc(latestRunId)
                    .snapshots(),
                builder: (context, runSnap) {
                  return _buildScrollableContent(
                    mpData: mpData,
                    latestRunDoc: runSnap.data,
                    blockExtract: blockExtract,
                    activeRunId: activeRunId,
                    isCalculationLocked: isCalculationLocked,
                  );
                },
              );
            }

            return _buildScrollableContent(
              mpData: mpData,
              latestRunDoc: null,
              blockExtract: blockExtract,
              activeRunId: activeRunId,
              isCalculationLocked: isCalculationLocked,
            );
          },
        );
      },
    );
  }

  Widget _buildScrollableContent({
    required Map<String, dynamic>? mpData,
    required DocumentSnapshot<Map<String, dynamic>>? latestRunDoc,
    required bool blockExtract,
    required String? activeRunId,
    required bool isCalculationLocked,
  }) {
    final ctx = _displayContext!;
    final mpStatus = mpData?['status'] as String?;
    final periodClosed = isPayrollPeriodClosedForCalculation(
      ctx.asOfDateJst,
      ctx.periodEnd,
    );
    final inCalculationWindow = isInPayrollCalculationWindow(
      ctx.asOfDateJst,
      ctx.periodEnd,
      mpStatus,
    );

    return SingleChildScrollView(
      padding: const EdgeInsets.only(bottom: 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildDraftWarningBanner(mpData, latestRunDoc),
          _buildDisplayContextCard(
            inCalculationWindow: inCalculationWindow,
            monthlyPayrollStatus: mpStatus,
            periodClosedForCalculation: periodClosed,
          ),
          _buildActiveRunBanner(
            activeRunId,
            () => _showRunProgressDialog(activeRunId!),
          ),
          if (_errorMessage != null)
            Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(_errorMessage!, style: const TextStyle(color: Colors.red)),
            ),
          if (inCalculationWindow &&
              (_state == CalcTabState.idle || _state == CalcTabState.loading))
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
                      onPressed: (_state == CalcTabState.loading ||
                              blockExtract ||
                              !_contextReady)
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
          if (!inCalculationWindow &&
              (_state == CalcTabState.idle || _state == CalcTabState.loading))
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              child: Text(
                '計算期間対象外のため、対象データの抽出はできません。',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.grey.shade700,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          if (!inCalculationWindow &&
              (_state == CalcTabState.candidatesLoaded ||
                  _state == CalcTabState.running ||
                  _payrollSubmitBusy))
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  Text(
                    '計算期間対象外のため、抽出・実行の操作は行えません。',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.grey.shade800,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton(
                    onPressed: () {
                      setState(() {
                        _state = CalcTabState.idle;
                        _group1 = [];
                        _group2 = [];
                        _group3 = [];
                        _wageMissingStaff = [];
                        _errorMessage = null;
                      });
                    },
                    child: const Text('画面を初期状態に戻す'),
                  ),
                ],
              ),
            ),
          if (inCalculationWindow &&
              (_state == CalcTabState.candidatesLoaded ||
                  _state == CalcTabState.running ||
                  _payrollSubmitBusy)) ...[
            if (isCalculationLocked)
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
            CandidateSection(
              title: '対象外データ',
              groupKey: 'group3',
              entries: _group3,
              selectable: false,
              retiredStaffNames: _retiredStaffNames,
            ),
            CandidateSection(
              title: '前期以前の未反映データ（キャリーオーバー）',
              groupKey: 'group2',
              entries: _group2,
              retiredStaffNames: _retiredStaffNames,
              onToggle: (idx) {
                setState(() => _group2[idx].selected = !_group2[idx].selected);
              },
            ),
            CandidateSection(
              title: '期間内の正常勤怠データ',
              groupKey: 'group1',
              entries: _group1,
              requireConfirmToUncheck: true,
              retiredStaffNames: _retiredStaffNames,
              onToggle: (idx) {
                setState(() => _group1[idx].selected = !_group1[idx].selected);
              },
            ),
            PreviewSummary(
              group1: _group1,
              group2: _group2,
              expectedCountMin:
                  PayrollConfigService.instance.latest?.maxCandidatesCount != null ? null : null,
            ),
            if (_wageMissingStaff.isNotEmpty)
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.orange.shade400),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      kPayrollHourlyWageMissingMessage,
                      style: TextStyle(
                        color: Colors.orange.shade900,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (formatWageMissingStaffNames(_wageMissingStaff).isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        '対象: ${formatWageMissingStaffNames(_wageMissingStaff)}',
                        style: TextStyle(color: Colors.orange.shade900),
                      ),
                    ],
                  ],
                ),
              ),
            if (!isCalculationLocked)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: ElevatedButton.icon(
                  onPressed: (blockExtract ||
                          _payrollSubmitBusy ||
                          !_contextReady ||
                          shouldBlockPayrollExecuteForMissingWage(_wageMissingStaff))
                      ? null
                      : _executePayroll,
                  icon: _payrollSubmitBusy
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.play_arrow),
                  label: Text(_payrollSubmitBusy ? '開始処理中…' : '給与計算を実行'),
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
                onPressed: (inCalculationWindow &&
                        !blockExtract &&
                        _contextReady)
                    ? _fetchCandidates
                    : null,
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
