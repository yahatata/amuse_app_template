// 管理者向け: emitLogOpsErrorSamples Callable（logOpsError 代表パターンを Cloud Logging に出力）

import 'dart:async';
import 'dart:convert';

import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

/// `emitLogOpsErrorSamples` / `emitLogOpsErrorRealSdkSamples` を実行する
/// （devices.role === admin のみサーバで許可）。
class LogOpsErrorSamplePage extends StatefulWidget {
  const LogOpsErrorSamplePage({super.key});

  @override
  State<LogOpsErrorSamplePage> createState() => _LogOpsErrorSamplePageState();
}

class _LogOpsErrorSamplePageState extends State<LogOpsErrorSamplePage> {
  bool _busy = false;
  Map<String, dynamic>? _lastCaseResult;
  String _tc01Mode = 'notFound';
  String _tc06Mode = 'duplicate';

  final TextEditingController _tc01RunLabelController = TextEditingController();
  final TextEditingController _tc02TournamentIdController = TextEditingController();
  final TextEditingController _tc02StartAtController = TextEditingController();
  final TextEditingController _tc02SelectedBusinessDateKeyController =
      TextEditingController();
  final TextEditingController _tc06TargetWeekStartDateController =
      TextEditingController();

  @override
  void dispose() {
    _tc01RunLabelController.dispose();
    _tc02TournamentIdController.dispose();
    _tc02StartAtController.dispose();
    _tc02SelectedBusinessDateKeyController.dispose();
    _tc06TargetWeekStartDateController.dispose();
    super.dispose();
  }

  Future<void> _ensureSignedIn() async {
    final auth = FirebaseAuth.instance;
    if (auth.currentUser == null) {
      await auth.signInAnonymously();
    }
  }

  Future<void> _callEmit({
    required String functionName,
    required String runningLabel,
    required String logSearchHint,
    Duration timeout = const Duration(seconds: 60),
  }) async {
    if (_busy) return;
    setState(() => _busy = true);

    try {
      await _ensureSignedIn();

      if (!mounted) return;
      _showSnackBar(runningLabel, Colors.blue);

      final callable = FunctionsClient.instance.httpsCallable(functionName);
      final result = await callable.call(<String, dynamic>{}).timeout(
            timeout,
            onTimeout: () =>
                throw TimeoutException('呼び出しがタイムアウトしました'),
          );

      if (!mounted) return;
      if (result.data is Map) {
        final map = result.data as Map;
        final emitted = map['emitted'];
        final scenarios = map['scenarios'];
        final mode = map['mode'];
        _showSnackBar(
          '完了: emitted=$emitted scenarios=$scenarios'
          '${mode != null ? ' mode=$mode' : ''}'
          '（Cloud Logging で $logSearchHint を検索）',
          Colors.green,
        );
      } else {
        _showSnackBar('完了: ${result.data}', Colors.green);
      }
    } catch (e) {
      if (!mounted) return;
      final msg = e is FirebaseFunctionsException
          ? (e.message ?? e.code)
          : e.toString();
      _showSnackBar('エラー: $msg', Colors.red);
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _callCaseCallable({
    required String caseId,
    required String functionName,
    required Map<String, dynamic> payload,
    Duration timeout = const Duration(seconds: 120),
    String? jobName,
  }) async {
    if (_busy) return;
    setState(() => _busy = true);
    final invokedAt = DateTime.now().toIso8601String();

    try {
      await _ensureSignedIn();

      final callable = FunctionsClient.instance.httpsCallable(functionName);
      final result = await callable.call(payload).timeout(
            timeout,
            onTimeout: () =>
                throw TimeoutException('呼び出しがタイムアウトしました'),
          );

      if (!mounted) return;
      setState(() {
        _lastCaseResult = {
          'caseId': caseId,
          'invokedAt': invokedAt,
          'payload': payload,
          'target': functionName,
          if (jobName != null) 'jobName': jobName,
          'success': true,
          'code': null,
          'message': 'success',
          'response': result.data,
        };
      });
      _showSnackBar('[$caseId] 実行成功', Colors.green);
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      setState(() {
        _lastCaseResult = {
          'caseId': caseId,
          'invokedAt': invokedAt,
          'payload': payload,
          'target': functionName,
          if (jobName != null) 'jobName': jobName,
          'success': false,
          'code': e.code,
          'message': e.message ?? e.toString(),
          'details': e.details,
        };
      });
      _showSnackBar('[$caseId] ${e.code}: ${e.message}', Colors.red);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _lastCaseResult = {
          'caseId': caseId,
          'invokedAt': invokedAt,
          'payload': payload,
          'target': functionName,
          if (jobName != null) 'jobName': jobName,
          'success': false,
          'code': 'unknown',
          'message': e.toString(),
        };
      });
      _showSnackBar('[$caseId] エラー: $e', Colors.red);
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _emitAll() async {
    await _callEmit(
      functionName: 'emitLogOpsErrorSamples',
      runningLabel: '実行中…（9 パターンの合成 logOpsError）',
      logSearchHint: '[probe]',
    );
  }

  Future<void> _emitRealSdk() async {
    await _callEmit(
      functionName: 'emitLogOpsErrorRealSdkSamples',
      runningLabel: '実行中…（実 SDK 失敗 7 パターンの logOpsError、最大約2分）',
      logSearchHint: '[probe-real-sdk]',
      timeout: const Duration(seconds: 120),
    );
  }

  Future<void> _runTc01() async {
    await _callCaseCallable(
      caseId: 'TC-01',
      functionName: 'emitThrowOnlyTc01NotFound',
      payload: {
        'mode': _tc01Mode,
        'runLabel': _tc01RunLabelController.text.trim(),
      },
    );
  }

  Future<void> _runTc02() async {
    final payload = <String, dynamic>{
      'tournamentId': _tc02TournamentIdController.text.trim(),
      'startAt': _tc02StartAtController.text.trim(),
    };
    final selected = _tc02SelectedBusinessDateKeyController.text.trim();
    if (selected.isNotEmpty) {
      payload['selectedBusinessDateKey'] = selected;
    }

    await _callCaseCallable(
      caseId: 'TC-02',
      functionName: 'updateScheduledTournamentStartAt',
      payload: payload,
    );
  }

  Future<void> _runTc06() async {
    final payload = <String, dynamic>{
      'mode': _tc06Mode,
      'targetWeekStartDate': _tc06TargetWeekStartDateController.text.trim(),
    };
    await _callCaseCallable(
      caseId: 'TC-06',
      functionName: 'enqueueThrowOnlyTc06WeeklyPlannerTask',
      payload: payload,
      jobName: 'weeklyPlanner',
    );
  }

  Widget _buildCaseResultCard() {
    final data = _lastCaseResult;
    if (data == null) {
      return const Text(
        'ケース実行結果: まだ実行されていません',
        style: TextStyle(fontSize: 12),
      );
    }
    final formatted = const JsonEncoder.withIndent('  ').convert(data);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(8),
      ),
      child: SelectableText(
        formatted,
        style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
      ),
    );
  }

  void _showSnackBar(String msg, Color bgColor) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: bgColor),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('logOpsError 代表サンプル'),
          backgroundColor: Colors.deepPurple,
          foregroundColor: Colors.white,
        ),
        body: Stack(
          children: [
            SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    '管理者デバイスのみサーバで許可されます。',
                    style: TextStyle(fontSize: 14),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    '【合成】代表9パターン — オブジェクトを組み立てて logOpsError（手軽・形の確認向け）。',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  FilledButton.icon(
                    onPressed: _busy ? null : _emitAll,
                    icon: _busy
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.bug_report_outlined),
                    label: Text(_busy ? '実行中…' : '合成サンプル（9）を Cloud Logging に出力'),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Text(
                    '【実SDK】Firestore / Auth / Storage / Tasks / HTTP の失敗を実際に起こした cause で '
                    'logOpsError（ログエクスプローラの値が本番に近い）。',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  FilledButton.tonalIcon(
                    onPressed: _busy ? null : _emitRealSdk,
                    icon: const Icon(Icons.cloud_upload_outlined),
                    label: const Text('実SDKサンプル（7）を Cloud Logging に出力'),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Divider(),
                  const SizedBox(height: 12),
                  const Text(
                    'throw-only 観測確認（検証用・一時導線）',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    '管理者デバイス向け。tenant-errors 観測のための一時検証UIです。',
                    style: TextStyle(fontSize: 12),
                  ),
                  const SizedBox(height: 16),

                  const Text('TC-01 executeMonthlyPayroll 代表 (fixed not-found)'),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    value: _tc01Mode,
                    decoration: const InputDecoration(
                      labelText: 'mode',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'notFound',
                        child: Text('notFound (4xx)'),
                      ),
                      DropdownMenuItem(
                        value: 'internal',
                        child: Text('internal (5xx)'),
                      ),
                    ],
                    onChanged: _busy
                        ? null
                        : (v) {
                            if (v == null) return;
                            setState(() => _tc01Mode = v);
                          },
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _tc01RunLabelController,
                    enabled: !_busy,
                    decoration: const InputDecoration(
                      labelText: 'runLabel (任意)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: _busy ? null : _runTc01,
                    child: const Text('TC-01 実行'),
                  ),
                  const SizedBox(height: 16),

                  const Text('TC-02 updateScheduledTournamentStartAt (raw payload)'),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _tc02TournamentIdController,
                    enabled: !_busy,
                    decoration: const InputDecoration(
                      labelText: 'tournamentId',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _tc02StartAtController,
                    enabled: !_busy,
                    decoration: const InputDecoration(
                      labelText: 'startAt (raw, 例: 2026-04-08T01:00:00.000Z)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _tc02SelectedBusinessDateKeyController,
                    enabled: !_busy,
                    decoration: const InputDecoration(
                      labelText: 'selectedBusinessDateKey (任意)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: _busy ? null : _runTc02,
                    child: const Text('TC-02 実行'),
                  ),
                  const SizedBox(height: 16),

                  const Text('TC-06 weeklyPlannerTask enqueue (debug wrapper)'),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    value: _tc06Mode,
                    decoration: const InputDecoration(
                      labelText: 'mode',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'duplicate',
                        child: Text('duplicate (通常 enqueue)'),
                      ),
                      DropdownMenuItem(
                        value: 'nonDuplicateFailure',
                        child: Text('nonDuplicateFailure (enqueue 失敗)'),
                      ),
                    ],
                    onChanged: _busy
                        ? null
                        : (v) {
                            if (v == null) return;
                            setState(() => _tc06Mode = v);
                          },
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _tc06TargetWeekStartDateController,
                    enabled: !_busy,
                    decoration: const InputDecoration(
                      labelText: 'targetWeekStartDate (YYYY-MM-DD, 空なら次の日曜)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: _busy ? null : _runTc06,
                    child: const Text('TC-06 実行'),
                  ),
                  const SizedBox(height: 16),
                  _buildCaseResultCard(),
                ],
              ),
            ),
            if (_busy)
              const ModalBarrier(
                dismissible: false,
                color: Color(0x33000000),
              ),
          ],
        ),
      ),
    );
  }
}
