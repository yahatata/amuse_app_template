// エラー表示・再実行ウィジェット
//
// completed_with_errors 時に失敗 staff を表示し、再実行/結果確認を提供する。
// 参照: 06_UI_SPEC §3-8

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

class ErrorView extends StatefulWidget {
  final String paymentPeriodKey;
  final String runId;
  final VoidCallback onRetry;
  final VoidCallback onViewResults;

  const ErrorView({
    super.key,
    required this.paymentPeriodKey,
    required this.runId,
    required this.onRetry,
    required this.onViewResults,
  });

  @override
  State<ErrorView> createState() => _ErrorViewState();
}

class _ErrorViewState extends State<ErrorView> {
  List<Map<String, dynamic>> _failedStaff = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadFailedStaff();
  }

  Future<void> _loadFailedStaff() async {
    final snap = await FirebaseFirestore.instance
        .collection('monthlyPayroll')
        .doc(widget.paymentPeriodKey)
        .collection('payrollRuns')
        .doc(widget.runId)
        .collection('staffResults')
        .where('taskStatus', isEqualTo: 'failed')
        .get();

    if (mounted) {
      setState(() {
        _failedStaff = snap.docs.map((d) => d.data()).toList();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.all(16),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.warning_amber, color: Colors.orange, size: 28),
                const SizedBox(width: 8),
                Text(
                  '${_failedStaff.length}名のスタッフの計算に失敗しました',
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else
              ..._failedStaff.map((s) {
                final name = s['staffNameSnapshot'] as String? ?? '不明';
                final error = s['taskError'] as String? ?? '不明なエラー';
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      const Text('・', style: TextStyle(fontSize: 16)),
                      Expanded(child: Text('$name: $error')),
                    ],
                  ),
                );
              }),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                ElevatedButton.icon(
                  onPressed: widget.onRetry,
                  icon: const Icon(Icons.refresh),
                  label: const Text('失敗分を再実行'),
                ),
                OutlinedButton.icon(
                  onPressed: widget.onViewResults,
                  icon: const Icon(Icons.visibility),
                  label: const Text('詳細を確認'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
