import 'package:flutter/material.dart';
import 'package:amuse_app_template/AttendanceManagement/attendance_user_facing_errors.dart';
import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:async';

/// インデックスエラー原因切り分け用テストモード
/// UNCLOCKED_LIST_INDEX_DEBUG.md の Step 1 に従い、どのクエリで失敗するか特定する。
enum _QueryTestMode {
  /// A: where のみ（orderBy なし）→ 成功なら orderBy が原因
  testA,
  /// B: where + orderBy('date') のみ
  testB,
  /// C: where + orderBy('date') + orderBy('clockIn')（元のクエリ）
  testC,
}

/// Phase4 03 拡張: 未退勤 attendances 一覧
///
/// Firestore snapshot でリアルタイム取得。日付バー＋カード形式で表示。
/// タップでパスワード確認→修正ダイアログ→退勤打刻。
///
/// [embedded] true のとき Scaffold なしで body のみ返す（タブ内埋め込み用）
class UnclockedAttendanceListPage extends StatefulWidget {
  final bool embedded;

  const UnclockedAttendanceListPage({super.key, this.embedded = false});

  @override
  State<UnclockedAttendanceListPage> createState() =>
      _UnclockedAttendanceListPageState();
}

class _UnclockedAttendanceListPageState extends State<UnclockedAttendanceListPage> {
  static const _limit = 200;

  /// 切り分け: testA → testB → testC の順に変更してエラーが出る段階を確認
  static const _queryTestMode = _QueryTestMode.testA;

  Stream<QuerySnapshot<Map<String, dynamic>>> _unclockedStream() {
    // closedStoreWithoutClockOut: true のデータのみ（閉店時未退勤としてフラグ付されたもの）
    Query<Map<String, dynamic>> query = FirebaseFirestore.instance
        .collection('attendances')
        .where('closedStoreWithoutClockOut', isEqualTo: true);

    switch (_queryTestMode) {
      case _QueryTestMode.testA:
        // orderBy なし（単一フィールド index で実行可）
        query = query.limit(_limit);
        break;
      case _QueryTestMode.testB:
        query = query.orderBy('date', descending: true).limit(_limit);
        break;
      case _QueryTestMode.testC:
        query = query
            .orderBy('date', descending: true)
            .orderBy('clockIn', descending: true)
            .limit(_limit);
        break;
    }

    return query.snapshots().handleError((err, st) {
      debugPrint('=== UnclockedAttendance Firestore Error [$_queryTestMode] ===');
      debugPrint('error: $err');
      debugPrint('stackTrace: $st');
      if (err is FirebaseException) {
        debugPrint('code: ${err.code}');
        debugPrint('message: ${err.message}');
        debugPrint('plugin: ${err.plugin}');
      }
      throw err;
    });
  }

  /// testA のときは取得後にメモリで date desc → clockIn desc にソート
  List<Map<String, dynamic>> _sortItemsIfNeeded(List<Map<String, dynamic>> items) {
    if (_queryTestMode != _QueryTestMode.testA) return items;
    final list = List<Map<String, dynamic>>.from(items);
    list.sort((a, b) {
      final cmpDate = (b['date'] ?? '').toString().compareTo((a['date'] ?? '').toString());
      if (cmpDate != 0) return cmpDate;
      final cA = a['clockIn'];
      final cB = b['clockIn'];
      if (cA != null && cB != null) {
        return cB.toString().compareTo(cA.toString());
      }
      return 0;
    });
    return list;
  }

  static String _formatDate(String? dateStr) {
    if (dateStr == null || dateStr.isEmpty) return '—';
    final parts = dateStr.split('-');
    if (parts.length != 3) return dateStr;
    try {
      final y = int.parse(parts[0]);
      final m = int.parse(parts[1]);
      final d = int.parse(parts[2]);
      return '$y/$m/$d';
    } catch (_) {
      return dateStr;
    }
  }

  static String _formatClockIn(dynamic clockIn) {
    if (clockIn == null) return '—';
    if (clockIn is Timestamp) {
      final dt = clockIn.toDate();
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    }
    if (clockIn is String) {
      try {
        final dt = DateTime.parse(clockIn);
        return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
      } catch (_) {
        return clockIn;
      }
    }
    return '—';
  }

  /// clockIn から日付・時刻を "MM/DD HH:MM" 形式で返す
  static String _formatClockInDateAndTime(dynamic clockIn) {
    if (clockIn == null) return '—';
    DateTime? dt;
    if (clockIn is Timestamp) {
      dt = clockIn.toDate();
    } else if (clockIn is String) {
      try {
        dt = DateTime.parse(clockIn);
      } catch (_) {
        return '—';
      }
    } else {
      return '—';
    }
    return '${dt.month.toString().padLeft(2, '0')}/${dt.day.toString().padLeft(2, '0')} '
        '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }

  Map<String, dynamic> _docToItem(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    final clockIn = d['clockIn'];
    String clockInIso = '—';
    if (clockIn is Timestamp) {
      clockInIso = clockIn.toDate().toIso8601String();
    } else if (clockIn is String) {
      clockInIso = clockIn;
    }
    return {
      'docId': doc.id,
      'date': d['date'] as String? ?? '',
      'staffName': d['staffsFullName'] as String? ?? '—',
      'staffId': d['staffId'] as String? ?? '',
      'clockIn': clockInIso,
      'closedStoreWithoutClockOut': d['closedStoreWithoutClockOut'] == true,
    };
  }

  /// 日付でグループ化（日付の新しい順）
  Map<String, List<Map<String, dynamic>>> _groupByDate(
    List<Map<String, dynamic>> items,
  ) {
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final item in items) {
      final date = item['date'] as String? ?? '';
      groups.putIfAbsent(date, () => []).add(item);
    }
    final sortedKeys = groups.keys.toList()..sort((a, b) => b.compareTo(a));
    return Map.fromEntries(
      sortedKeys.map((k) => MapEntry(k, groups[k]!)),
    );
  }

  void _onCardTap(Map<String, dynamic> item) {
    _showPasswordDialog(item);
  }

  Future<void> _waitForRouteTransition() async {
    await Future<void>.delayed(Duration.zero);
  }

  void _showPasswordDialog(Map<String, dynamic> item) {
    showDialog<void>(
      context: context,
      builder: (ctx) => _UnclockedAttendancePasswordDialog(
        staffName: item['staffName'] as String? ?? '—',
        onSubmit: (password) => _verifyPasswordAndOpenEdit(item, password),
      ),
    );
  }

  Future<void> _verifyPasswordAndOpenEdit(
    Map<String, dynamic> item,
    String password,
  ) async {
    if (!mounted) return;
    await _waitForRouteTransition();
    if (!mounted) return;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const AlertDialog(
        content: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(width: 16),
            Text('確認中...'),
          ],
        ),
      ),
    );

    try {
      final callable = FunctionsClient.instance
          .httpsCallable('verifyUnclockedAttendanceEditPassword');
      final result = await callable.call({'password': password});

      if (!mounted) return;
      Navigator.of(context).pop();
      await _waitForRouteTransition();
      if (!mounted) return;

      if (!isCallableSuccessResponse(result.data)) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapAttendanceCallableSoftFail(
                result.data,
                operation: 'verifyUnclockedAttendanceEditPassword',
              ),
            ),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }
      _showEditDialog(item, password);
    } catch (e) {
      if (!mounted) return;
      Navigator.of(context).pop();
      await _waitForRouteTransition();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            mapAttendanceCallableError(
              e,
              operation: 'verifyUnclockedAttendanceEditPassword',
            ),
          ),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  void _showEditDialog(Map<String, dynamic> item, String password) {
    final staffName = item['staffName'] as String? ?? '—';
    final dateStr = item['date'] as String? ?? '';
    final clockIn = item['clockIn'] as String? ?? '';
    DateTime selectedDate = _parseDateKey(dateStr) ?? DateTime.now();
    TimeOfDay? selectedClockOutTime;
    String? errorText;

    showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocalState) => AlertDialog(
          title: const Text('退勤打刻'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('スタッフ: $staffName', style: const TextStyle(fontSize: 14)),
              const SizedBox(height: 8),
              Text('出勤: ${_formatClockIn(clockIn)}', style: const TextStyle(fontSize: 14)),
              const SizedBox(height: 10),
              InkWell(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: selectedDate,
                    firstDate: DateTime(2020, 1, 1),
                    lastDate: DateTime(2100, 12, 31),
                  );
                  if (picked == null) return;
                  setLocalState(() {
                    selectedDate = DateTime(picked.year, picked.month, picked.day);
                  });
                },
                child: InputDecorator(
                  decoration: const InputDecoration(
                    labelText: '退勤日付',
                    border: OutlineInputBorder(),
                  ),
                  child: Text(_formatDate(_fmtDateKey(selectedDate))),
                ),
              ),
              const SizedBox(height: 10),
              InkWell(
                onTap: () async {
                  final picked = await showTimePicker(
                    context: context,
                    initialTime: selectedClockOutTime ?? const TimeOfDay(hour: 18, minute: 0),
                  );
                  if (picked == null) return;
                  setLocalState(() {
                    selectedClockOutTime = picked;
                    errorText = null;
                  });
                },
                child: InputDecorator(
                  decoration: const InputDecoration(
                    labelText: '退勤時刻',
                    border: OutlineInputBorder(),
                  ),
                  child: Text(
                    selectedClockOutTime == null
                        ? ''
                        : '${selectedClockOutTime!.hour.toString().padLeft(2, '0')}:${selectedClockOutTime!.minute.toString().padLeft(2, '0')}',
                  ),
                ),
              ),
              if (errorText != null) ...[
                const SizedBox(height: 8),
                Text(errorText!, style: const TextStyle(color: Colors.red)),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('キャンセル'),
            ),
            ElevatedButton(
              onPressed: () async {
                if (selectedClockOutTime == null) {
                  setLocalState(() {
                    errorText = '退勤時刻を入力して下さい';
                  });
                  return;
                }
                final clockOutAt = DateTime(
                  selectedDate.year,
                  selectedDate.month,
                  selectedDate.day,
                  selectedClockOutTime!.hour,
                  selectedClockOutTime!.minute,
                );
                final clockInAt = _parseIsoDateTime(clockIn);
                if (clockInAt == null) {
                  setLocalState(() {
                    errorText = '出勤時刻が不正です';
                  });
                  return;
                }
                if (clockOutAt.isBefore(clockInAt)) {
                  setLocalState(() {
                    errorText = '出勤時刻より過去の退勤時間は登録できません';
                  });
                  return;
                }

                final totalMinutes = clockOutAt.difference(clockInAt).inMinutes;
                if (totalMinutes >= 15 * 60) {
                  final ok = await _showLongWorkWarning(
                    '15時間以上の勤務時間で登録を行おうとしていますが、よろしいですか。',
                  );
                  if (!ok) return;
                } else if (totalMinutes >= 10 * 60) {
                  final ok = await _showLongWorkWarning(
                    '10時間以上の勤務時間で登録を行おうとしていますが、よろしいですか。',
                  );
                  if (!ok) return;
                }

                if (!ctx.mounted) return;
                final confirmed = await _showClockOutConfirmDialog(
                  staffName: staffName,
                  dateStr: dateStr,
                  clockIn: clockIn,
                  clockOutAt: clockOutAt,
                );
                if (confirmed != true) return;

                if (!ctx.mounted) return;
                await _performClockOut(
                  ctx,
                  item,
                  password,
                  clockOutAt: clockOutAt,
                );
              },
              child: const Text('退勤打刻する'),
            ),
          ],
        ),
      ),
    );
  }

  Future<bool?> _showClockOutConfirmDialog({
    required String staffName,
    required String dateStr,
    required String clockIn,
    required DateTime clockOutAt,
  }) async {
    final clockOutStr =
        '${clockOutAt.month.toString().padLeft(2, '0')}/${clockOutAt.day.toString().padLeft(2, '0')} '
        '${clockOutAt.hour.toString().padLeft(2, '0')}:${clockOutAt.minute.toString().padLeft(2, '0')}';
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('退勤打刻の確認'),
        content: Text(
          '以下の内容で退勤情報を追加してよろしいですか？\n\n'
          'スタッフ: $staffName\n'
          '日付: ${_formatDate(dateStr)}\n'
          '出勤: ${_formatClockInDateAndTime(clockIn)}\n'
          '退勤: $clockOutStr',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('キャンセル'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('確認'),
          ),
        ],
      ),
    );
  }

  Future<bool> _showLongWorkWarning(String message) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('確認'),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('キャンセル')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('続行')),
        ],
      ),
    );
    return result == true;
  }

  Future<void> _performClockOut(
    BuildContext dialogContext,
    Map<String, dynamic> item,
    String password, {
    required DateTime clockOutAt,
  }) async {
    final docId = item['docId'] as String?;
    if (docId == null || docId.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('ドキュメントIDがありません'), backgroundColor: Colors.red),
        );
      }
      return;
    }

    if (!mounted || !dialogContext.mounted) return;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const AlertDialog(
        content: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(width: 16),
            Text('処理中...'),
          ],
        ),
      ),
    );

    try {
      final callable = FunctionsClient.instance
          .httpsCallable('updateUnclockedAttendanceWithAuth');
      final result = await callable.call<Map<String, dynamic>>({
        'docId': docId,
        'adminPassword': password,
        'clockOutAt': clockOutAt.toUtc().toIso8601String(),
      }).timeout(
        const Duration(seconds: 15),
        onTimeout: () => throw TimeoutException('タイムアウトしました'),
      );

      if (!mounted || !dialogContext.mounted) return;
      Navigator.of(context).pop(); // ローディングダイアログを閉じる

      if (!isCallableSuccessResponse(result.data)) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              mapAttendanceCallableSoftFail(
                result.data,
                operation: 'updateUnclockedAttendanceWithAuth',
              ),
            ),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }

      Navigator.of(dialogContext).pop(); // 退勤打刻ダイアログを閉じる
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('退勤打刻が完了しました'),
          backgroundColor: Colors.green,
        ),
      );
      // snapshot が自動更新するため _fetch 不要
    } catch (e) {
      if (!mounted || !dialogContext.mounted) return;
      Navigator.of(context).pop(); // ローディングダイアログを閉じる
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            mapAttendanceCallableError(
              e,
              operation: 'updateUnclockedAttendanceWithAuth',
            ),
          ),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  DateTime? _parseDateKey(String dateStr) {
    final parts = dateStr.split('-');
    if (parts.length != 3) return null;
    final y = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    final d = int.tryParse(parts[2]);
    if (y == null || m == null || d == null) return null;
    return DateTime(y, m, d);
  }

  DateTime? _parseIsoDateTime(String value) {
    try {
      return DateTime.parse(value);
    } catch (_) {
      return null;
    }
  }

  String _fmtDateKey(DateTime d) {
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final body = StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: _unclockedStream(),
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            debugPrint('=== UnclockedAttendance StreamBuilder Error ===');
            debugPrint('error: ${snapshot.error}');
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  kAttendanceDataLoadFailedMessage,
                  style: const TextStyle(color: Colors.red),
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final docs = snapshot.data!.docs;
          final items = <Map<String, dynamic>>[];
          for (final doc in docs) {
            final d = doc.data();
            if (d['clockIn'] == null) continue;
            items.add(_docToItem(doc));
          }

          if (items.isEmpty) {
            return const Center(child: Text('未退勤データはありません'));
          }

          final sortedItems = _sortItemsIfNeeded(items);
          final groups = _groupByDate(sortedItems);
          final listChildren = <Widget>[];

          for (final entry in groups.entries) {
            final dateStr = entry.key;
            final groupItems = entry.value;

            listChildren.add(
              Container(
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.grey.shade200,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  _formatDate(dateStr),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            );

            for (final item in groupItems) {
              listChildren.add(_buildCard(item));
            }
          }

          return ListView(
            padding: const EdgeInsets.all(12),
            children: listChildren,
          );
        },
    );
    if (widget.embedded) {
      return body;
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('未退勤一覧'),
      ),
      body: body,
    );
  }

  Widget _buildCard(Map<String, dynamic> item) {
    final staffName = item['staffName'] as String? ?? '—';
    final dateStr = item['date'] as String? ?? '';
    final clockIn = item['clockIn'];
    final closedStore = item['closedStoreWithoutClockOut'] == true;

    final cardBg = Color.lerp(Colors.orange.shade50, Colors.white, 0.5)!;

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Material(
        color: cardBg,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          onTap: () => _onCardTap(item),
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: cardBg,
              border: Border.all(color: Colors.grey.shade400),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        staffName,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '出勤：${_formatClockInDateAndTime(clockIn)}',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade700,
                        ),
                      ),
                      if (closedStore)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            '閉店時未退勤',
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.orange.shade800,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _UnclockedAttendancePasswordDialog extends StatefulWidget {
  final String staffName;
  final Future<void> Function(String password) onSubmit;

  const _UnclockedAttendancePasswordDialog({
    required this.staffName,
    required this.onSubmit,
  });

  @override
  State<_UnclockedAttendancePasswordDialog> createState() =>
      _UnclockedAttendancePasswordDialogState();
}

class _UnclockedAttendancePasswordDialogState
    extends State<_UnclockedAttendancePasswordDialog> {
  late final TextEditingController _controller = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_isSubmitting) return;
    final password = _controller.text.trim();
    if (password.isEmpty) return;

    setState(() => _isSubmitting = true);
    final passwordCopy = _controller.text.trim();
    Navigator.of(context).pop();
    await widget.onSubmit(passwordCopy);
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = !_isSubmitting && _controller.text.trim().isNotEmpty;
    return AlertDialog(
      title: const Text('パスワード入力'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${widget.staffName} の修正を行うにはパスワードを入力してください。',
            style: const TextStyle(fontSize: 13),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            obscureText: true,
            enabled: !_isSubmitting,
            decoration: const InputDecoration(
              labelText: 'パスワード',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => setState(() {}),
            onSubmitted: canSubmit ? (_) => _submit() : null,
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _isSubmitting ? null : () => Navigator.of(context).pop(),
          child: const Text('キャンセル'),
        ),
        ElevatedButton(
          onPressed: canSubmit ? _submit : null,
          child: const Text('修正画面を開く'),
        ),
      ],
    );
  }
}
