// 管理者向け詳細設定ページ
// 初期セットアップ等を集約。開発側のみが操作（admin デバイスでログイン時のみ表示）。
// 参照: docs/config_migration/phase1/PHASE1_UPDATE_PATH_DESIGN.md

import 'dart:async';
import 'package:amuse_app_template/core/utils/functions_client.dart';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

class AdminDetailSettingsPage extends StatefulWidget {
  const AdminDetailSettingsPage({super.key});

  @override
  State<AdminDetailSettingsPage> createState() => _AdminDetailSettingsPageState();
}

class _AdminDetailSettingsPageState extends State<AdminDetailSettingsPage> {
  final FirebaseFunctions _functions = FunctionsClient.instance;
  bool _isProcessing = false;
  bool? _reportingEnabled;
  bool _loadingReportingFlag = true;
  bool? _liffRegistrationEnabled;
  bool? _liffCalendarEnabled;
  bool _loadingLiffTournamentFlags = true;

  // 整合性チェック用
  String? _checkTargetDate;
  String? _checkTargetMonth;
  final Map<String, bool> _checkRunning = {};

  static List<String> _recentDates() {
    final dates = <String>[];
    for (int i = 1; i <= 3; i++) {
      final d = DateTime.now().subtract(Duration(days: i));
      dates.add(
        '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}',
      );
    }
    return dates;
  }

  static List<String> _recentMonths() {
    final months = <String>[];
    for (int i = 1; i <= 3; i++) {
      final now = DateTime.now();
      final m = DateTime(now.year, now.month - i);
      months.add(
        '${m.year}-${m.month.toString().padLeft(2, '0')}',
      );
    }
    return months;
  }

  @override
  void initState() {
    super.initState();
    _loadReportingFlag();
    _loadLiffTournamentFlags();
  }

  Future<void> _loadReportingFlag() async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection('storeMeta')
          .doc('config')
          .get();
      final features = doc.data()?['features'] as Map<String, dynamic>?;
      final val = features?['reportingAggregatorEnabled'];
      if (mounted) {
        setState(() {
          _reportingEnabled = val is bool ? val : false;
          _loadingReportingFlag = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _reportingEnabled = false;
          _loadingReportingFlag = false;
        });
      }
    }
  }

  Future<void> _loadLiffTournamentFlags() async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection('storeMeta')
          .doc('config')
          .get();
      final tournament = doc.data()?['tournament'] as Map<String, dynamic>?;
      final registration = tournament?['liffRegistrationEnabled'];
      final calendar = tournament?['liffCalendarEnabled'];
      if (mounted) {
        setState(() {
          _liffRegistrationEnabled = registration is bool ? registration : true;
          _liffCalendarEnabled = calendar is bool ? calendar : true;
          _loadingLiffTournamentFlags = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _liffRegistrationEnabled = true;
          _liffCalendarEnabled = true;
          _loadingLiffTournamentFlags = false;
        });
      }
    }
  }

  Future<void> _toggleLiffRegistrationFlag(bool newValue) async {
    if (_isProcessing) return;
    setState(() => _isProcessing = true);

    try {
      final auth = FirebaseAuth.instance;
      if (auth.currentUser == null) {
        await auth.signInAnonymously();
      }

      await FirebaseFirestore.instance
          .collection('storeMeta')
          .doc('config')
          .set(
            {
              'tournament': {'liffRegistrationEnabled': newValue},
            },
            SetOptions(merge: true),
          );

      if (!mounted) return;
      setState(() => _liffRegistrationEnabled = newValue);
      _showSnackBar(
        'liffRegistrationEnabled を ${newValue ? 'ON' : 'OFF'} にしました',
        Colors.green,
      );
    } catch (e) {
      if (!mounted) return;
      _showSnackBar('エラー: $e', Colors.red);
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<void> _toggleLiffCalendarFlag(bool newValue) async {
    if (_isProcessing) return;
    setState(() => _isProcessing = true);

    try {
      final auth = FirebaseAuth.instance;
      if (auth.currentUser == null) {
        await auth.signInAnonymously();
      }

      await FirebaseFirestore.instance
          .collection('storeMeta')
          .doc('config')
          .set(
            {
              'tournament': {'liffCalendarEnabled': newValue},
            },
            SetOptions(merge: true),
          );

      if (!mounted) return;
      setState(() => _liffCalendarEnabled = newValue);
      _showSnackBar(
        'liffCalendarEnabled を ${newValue ? 'ON' : 'OFF'} にしました',
        Colors.green,
      );
    } catch (e) {
      if (!mounted) return;
      _showSnackBar('エラー: $e', Colors.red);
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<void> _toggleReportingFlag(bool newValue) async {
    if (_isProcessing) return;
    setState(() => _isProcessing = true);

    try {
      final auth = FirebaseAuth.instance;
      if (auth.currentUser == null) {
        await auth.signInAnonymously();
      }

      await FirebaseFirestore.instance
          .collection('storeMeta')
          .doc('config')
          .set(
            {
              'features': {'reportingAggregatorEnabled': newValue},
            },
            SetOptions(merge: true),
          );

      if (!mounted) return;
      setState(() => _reportingEnabled = newValue);
      _showSnackBar(
        'reportingAggregatorEnabled を ${newValue ? 'ON' : 'OFF'} にしました',
        Colors.green,
      );
    } catch (e) {
      if (!mounted) return;
      _showSnackBar('エラー: $e', Colors.red);
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<void> _callCallable(String name, String loadingLabel) async {
    if (_isProcessing) return;
    setState(() => _isProcessing = true);

    try {
      final auth = FirebaseAuth.instance;
      if (auth.currentUser == null) {
        await auth.signInAnonymously();
      }

      if (!mounted) return;
      _showSnackBar('$loadingLabel 実行中...', Colors.blue);

      final callable = _functions.httpsCallable(name);
      final result = await callable.call({}).timeout(
            const Duration(seconds: 30),
            onTimeout: () =>
                throw TimeoutException('呼び出しがタイムアウトしました'),
          );

      if (!mounted) return;
      final data = result.data as Map<String, dynamic>? ?? {};
      final success = data['success'] == true;
      final message = data['message'] as String? ?? (success ? '完了' : '失敗');

      _showSnackBar(
        message,
        success ? Colors.green : Colors.orange,
      );
    } catch (e) {
      if (!mounted) return;
      _showSnackBar('エラー: $e', Colors.red);
    } finally {
      if (mounted) {
        setState(() => _isProcessing = false);
      }
    }
  }

  Future<void> _runConsistencyCheck(
    String functionName,
    String label,
    Map<String, dynamic> data,
  ) async {
    if (_checkRunning[functionName] == true) return;
    setState(() => _checkRunning[functionName] = true);

    try {
      final auth = FirebaseAuth.instance;
      if (auth.currentUser == null) {
        await auth.signInAnonymously();
      }

      _showSnackBar('$label 実行中...', Colors.blue);

      final callable = _functions.httpsCallable(functionName);
      final result = await callable.call(data).timeout(
            const Duration(seconds: 60),
            onTimeout: () => throw TimeoutException('チェックがタイムアウトしました'),
          );

      if (!mounted) return;
      final res = result.data as Map<String, dynamic>? ?? {};
      final judgment = res['judgment'] as String? ?? '不明';
      final failed = (res['failedChecks'] as List?)?.join(', ') ?? '';
      final color = judgment == 'ok'
          ? Colors.green
          : judgment == 'warning'
              ? Colors.orange
              : judgment == 'ng'
                  ? Colors.red
                  : Colors.grey;
      final msg = failed.isEmpty
          ? '$label: $judgment'
          : '$label: $judgment（$failed）';
      _showSnackBar(msg, color);
    } catch (e) {
      if (!mounted) return;
      _showSnackBar('エラー: $e', Colors.red);
    } finally {
      if (mounted) setState(() => _checkRunning[functionName] = false);
    }
  }

  void _showSnackBar(String msg, Color bgColor) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: bgColor,
        duration: const Duration(seconds: 5),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('詳細設定'),
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '初期セットアップ',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                leading: const Icon(Icons.settings, color: Colors.deepPurple),
                title: const Text('storeMeta/config 初期セットアップ'),
                subtitle: const Text(
                  'storeMeta/config、storeMeta/requiredStaffByTimeSlot、storeMeta/schedulerConfig を作成します。未存在時のみ作成。',
                ),
                trailing: _isProcessing
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.play_arrow),
                onTap: _isProcessing
                    ? null
                    : () => _callCallable(
                          'initializeStoreConfigCallable',
                          'storeMeta/config',
                        ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                leading: const Icon(Icons.calendar_today, color: Colors.teal),
                title: const Text('currentBusinessDay 初期化'),
                subtitle: const Text(
                  'storeMeta/currentBusinessDay を作成します。未存在時のみ作成。',
                ),
                trailing: _isProcessing
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.play_arrow),
                onTap: _isProcessing
                    ? null
                    : () => _callCallable(
                          'createInitialStateDocCallable',
                          'currentBusinessDay',
                        ),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'LIFF トーナメント設定',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: _loadingLiffTournamentFlags
                  ? const ListTile(
                      leading: Icon(Icons.sports_esports, color: Colors.deepOrange),
                      title: Text('ミニアプリ トーナメント参加登録（liffRegistrationEnabled）'),
                      trailing: SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : SwitchListTile(
                      secondary: const Icon(Icons.sports_esports, color: Colors.deepOrange),
                      title: const Text(
                        'ミニアプリ トーナメント参加登録（liffRegistrationEnabled）',
                      ),
                      subtitle: const Text(
                        'OFF の場合、ミニアプリではトーナメント閲覧のみ可能です。',
                      ),
                      value: _liffRegistrationEnabled ?? true,
                      onChanged: _isProcessing ? null : _toggleLiffRegistrationFlag,
                    ),
            ),
            const SizedBox(height: 12),
            Card(
              child: _loadingLiffTournamentFlags
                  ? const ListTile(
                      leading: Icon(Icons.calendar_month, color: Colors.deepOrange),
                      title: Text('ミニアプリ トーナメントカレンダー（liffCalendarEnabled）'),
                      trailing: SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : SwitchListTile(
                      secondary:
                          const Icon(Icons.calendar_month, color: Colors.deepOrange),
                      title: const Text(
                        'ミニアプリ トーナメントカレンダー（liffCalendarEnabled）',
                      ),
                      subtitle: const Text(
                        'OFF の場合、ミニアプリのカレンダータブを非表示にします。',
                      ),
                      value: _liffCalendarEnabled ?? true,
                      onChanged: _isProcessing ? null : _toggleLiffCalendarFlag,
                    ),
            ),
            const SizedBox(height: 24),
            const Text(
              'レポーティング設定',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: _loadingReportingFlag
                  ? const ListTile(
                      leading: Icon(Icons.bar_chart, color: Colors.indigo),
                      title: Text('reporting データ書き込み（reportingAggregatorEnabled）'),
                      trailing: SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : SwitchListTile(
                      secondary:
                          const Icon(Icons.bar_chart, color: Colors.indigo),
                      title: const Text(
                        'reporting データ書き込み（reportingAggregatorEnabled）',
                      ),
                      subtitle: const Text(
                        '会計・事後イベント時に reportingEntries / reportingMonthly へ書き込む。'
                        'OFF にすると既存の会計動作に影響なし。',
                      ),
                      value: _reportingEnabled ?? false,
                      onChanged:
                          _isProcessing ? null : _toggleReportingFlag,
                    ),
            ),
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                leading:
                    const Icon(Icons.tune, color: Colors.indigo),
                title:
                    const Text('reporting 設定ドキュメント初期化'),
                subtitle: const Text(
                  'storeMeta/taxReportingBehavior と storeMeta/reportingGroupConfig を作成します。'
                  '未存在時のみ作成（既存ドキュメントは上書きしません）。',
                ),
                trailing: _isProcessing
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.play_arrow),
                onTap: _isProcessing
                    ? null
                    : () => _callCallable(
                          'initReportingConfig',
                          'reporting 設定初期化',
                        ),
              ),
            ),
            const SizedBox(height: 24),
            // ─── 整合性チェック ───────────────────────────────────────────
            const Text(
              '整合性チェック',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              '各チェックは batchJobLogs に結果を記録します。judgment: ok / warning / ng を SnackBar で表示します。',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
            const SizedBox(height: 12),
            // 対象日セレクター（日次チェック用）
            Card(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    const Icon(Icons.calendar_today, color: Colors.blueGrey, size: 20),
                    const SizedBox(width: 8),
                    const Text('対象日（日次用）: '),
                    const SizedBox(width: 8),
                    DropdownButton<String>(
                      value: _checkTargetDate ?? _recentDates().first,
                      items: _recentDates()
                          .map((d) => DropdownMenuItem(value: d, child: Text(d)))
                          .toList(),
                      onChanged: (v) => setState(() => _checkTargetDate = v),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            // 対象月セレクター（月次チェック用）
            Card(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    const Icon(Icons.date_range, color: Colors.blueGrey, size: 20),
                    const SizedBox(width: 8),
                    const Text('対象月（月次用）: '),
                    const SizedBox(width: 8),
                    DropdownButton<String>(
                      value: _checkTargetMonth ?? _recentMonths().first,
                      items: _recentMonths()
                          .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                          .toList(),
                      onChanged: (v) => setState(() => _checkTargetMonth = v),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            // チェックボタン 2列×2行
            Row(
              children: [
                Expanded(
                  child: _CheckButton(
                    label: 'Analytics\n日次チェック',
                    icon: Icons.analytics_outlined,
                    color: Colors.blue,
                    isRunning: _checkRunning['analyticsDailyCheck'] == true,
                    onPressed: () => _runConsistencyCheck(
                      'analyticsDailyCheck',
                      'Analytics 日次',
                      {'targetDate': _checkTargetDate ?? _recentDates().first},
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _CheckButton(
                    label: 'Analytics\n月次チェック',
                    icon: Icons.analytics,
                    color: Colors.indigo,
                    isRunning: _checkRunning['analyticsMonthlyCheck'] == true,
                    onPressed: () => _runConsistencyCheck(
                      'analyticsMonthlyCheck',
                      'Analytics 月次',
                      {'targetMonth': _checkTargetMonth ?? _recentMonths().first},
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _CheckButton(
                    label: 'Reporting\n日次チェック',
                    icon: Icons.receipt_long_outlined,
                    color: Colors.teal,
                    isRunning: _checkRunning['reportingDailyCheck'] == true,
                    onPressed: () => _runConsistencyCheck(
                      'reportingDailyCheck',
                      'Reporting 日次',
                      {'targetDate': _checkTargetDate ?? _recentDates().first},
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _CheckButton(
                    label: 'Reporting\n月次チェック',
                    icon: Icons.receipt_long,
                    color: Colors.green.shade700,
                    isRunning: _checkRunning['reportingMonthlyCheck'] == true,
                    onPressed: () => _runConsistencyCheck(
                      'reportingMonthlyCheck',
                      'Reporting 月次',
                      {'targetMonth': _checkTargetMonth ?? _recentMonths().first},
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _CheckButton extends StatelessWidget {
  const _CheckButton({
    required this.label,
    required this.icon,
    required this.color,
    required this.isRunning,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final Color color;
  final bool isRunning;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return ElevatedButton.icon(
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        minimumSize: const Size.fromHeight(64),
      ),
      icon: isRunning
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                color: Colors.white,
                strokeWidth: 2,
              ),
            )
          : Icon(icon, size: 18),
      label: Text(
        label,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 12),
      ),
      onPressed: isRunning ? null : onPressed,
    );
  }
}
