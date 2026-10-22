// 計算・結果タブ共通: 実行日時表示・monthlyPayroll ステータスバッジ

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// 結果タブ・計算タブで共通の「計算実行日時」文字列（Firestore Timestamp 対応）
String payrollExecutionTimeFormatted(
  Map<String, dynamic>? mpData,
  Map<String, dynamic>? runData,
) {
  if (mpData == null) return '—';
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
  if (ts is Timestamp) {
    return DateFormat('yyyy-MM-dd HH:mm').format(ts.toDate());
  }
  return '—';
}

class PayrollMonthlyStatusBadge extends StatelessWidget {
  final String status;

  const PayrollMonthlyStatusBadge({super.key, required this.status});

  static String labelOf(String status) {
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

  static ({Color border, Color background, Color foreground}) colorsOf(
    String status,
  ) {
    switch (status) {
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

  @override
  Widget build(BuildContext context) {
    final c = colorsOf(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: c.background,
        border: Border.all(color: c.border, width: 1.5),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        labelOf(status),
        style: TextStyle(
          color: c.foreground,
          fontWeight: FontWeight.w600,
          fontSize: 13,
        ),
      ),
    );
  }
}
