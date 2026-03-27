// 計算進捗表示ウィジェット
//
// payrollRuns/{runId} を snapshots() でリアルタイムリスニングし進捗を表示する。
// 参照: 06_UI_SPEC §3-7

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

class ProgressView extends StatelessWidget {
  final String paymentPeriodKey;
  final String runId;
  final VoidCallback onCompleted;
  final VoidCallback onCompletedWithErrors;
  final VoidCallback? onCancel;
  /// failed / cancelled などでダイアログを閉じるとき
  final VoidCallback? onTerminal;

  const ProgressView({
    super.key,
    required this.paymentPeriodKey,
    required this.runId,
    required this.onCompleted,
    required this.onCompletedWithErrors,
    this.onCancel,
    this.onTerminal,
  });

  @override
  Widget build(BuildContext context) {
    final docRef = FirebaseFirestore.instance
        .collection('monthlyPayroll')
        .doc(paymentPeriodKey)
        .collection('payrollRuns')
        .doc(runId);

    return StreamBuilder<DocumentSnapshot>(
      stream: docRef.snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (!snapshot.hasData || !snapshot.data!.exists) {
          return const Center(child: Text('Run データが見つかりません'));
        }

        final data = snapshot.data!.data() as Map<String, dynamic>;
        final status = data['status'] as String? ?? 'preparing';
        final completed = (data['completedStaffCount'] as num?)?.toInt() ?? 0;
        final failed = (data['failedStaffCount'] as num?)?.toInt() ?? 0;
        final target = (data['targetStaffCount'] as num?)?.toInt() ?? 1;

        if (status == 'completed') {
          WidgetsBinding.instance.addPostFrameCallback((_) => onCompleted());
        }
        if (status == 'completed_with_errors') {
          WidgetsBinding.instance
              .addPostFrameCallback((_) => onCompletedWithErrors());
        }

        final processed = completed + failed;
        final progress = target > 0 ? processed / target : 0.0;

        return Card(
          margin: const EdgeInsets.all(16),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _statusLabel(status),
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 16),
                if (status == 'processing') ...[
                  LinearProgressIndicator(value: progress),
                  const SizedBox(height: 8),
                  Text('$processed / $target スタッフ完了'
                      '${failed > 0 ? '（$failed 件失敗）' : ''}'),
                ] else if (status == 'preparing' ||
                    status == 'aggregating') ...[
                  const CircularProgressIndicator(),
                ] else if (status == 'failed') ...[
                  const Icon(Icons.error, color: Colors.red, size: 48),
                  const SizedBox(height: 8),
                  const Text('計算に失敗しました'),
                  if (onTerminal != null) ...[
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: onTerminal,
                      child: const Text('閉じる'),
                    ),
                  ],
                ] else if (status == 'cancelled') ...[
                  const Icon(Icons.cancel, color: Colors.grey, size: 48),
                  const SizedBox(height: 8),
                  const Text('中止されました'),
                  if (onTerminal != null) ...[
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: onTerminal,
                      child: const Text('閉じる'),
                    ),
                  ],
                ],
                const SizedBox(height: 16),
                if (status == 'preparing' || status == 'processing')
                  OutlinedButton.icon(
                    onPressed: onCancel,
                    icon: const Icon(Icons.stop, color: Colors.red),
                    label: const Text('中止'),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'preparing':
        return '準備中...';
      case 'processing':
        return '給与計算 実行中';
      case 'aggregating':
        return '集計中...';
      case 'completed':
        return '計算完了';
      case 'completed_with_errors':
        return '一部エラーあり';
      case 'failed':
        return '失敗';
      case 'cancelled':
        return '中止されました';
      default:
        return status;
    }
  }
}
