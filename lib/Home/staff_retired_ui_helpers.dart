import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

/// A-3: 退職済みスタッフの UI 表示ヘルパー（履歴・給与系画面向け）
class StaffRetiredUi {
  StaffRetiredUi._();

  static bool isRetiredStatus(dynamic status) => status == 'retired';

  static Future<Set<String>> fetchRetiredStaffIds() async {
    final snap = await FirebaseFirestore.instance
        .collection('staffs')
        .where('status', isEqualTo: 'retired')
        .get();
    return snap.docs.map((d) => d.id).toSet();
  }

  static Future<Set<String>> fetchRetiredStaffNames() async {
    final snap = await FirebaseFirestore.instance
        .collection('staffs')
        .where('status', isEqualTo: 'retired')
        .get();
    return snap.docs
        .map((d) => d.data()['fullName']?.toString() ?? '')
        .where((name) => name.isNotEmpty)
        .toSet();
  }

  static Widget retiredChip({VisualDensity visualDensity = VisualDensity.compact}) {
    return Chip(
      label: const Text('退職済み'),
      visualDensity: visualDensity,
    );
  }

  static Widget nameWithRetiredBadge({
    required String name,
    required bool isRetired,
    TextStyle? nameStyle,
    int? maxLines,
    TextOverflow? overflow,
  }) {
    return Row(
      children: [
        Expanded(
          child: Text(
            name,
            style: nameStyle,
            maxLines: maxLines,
            overflow: overflow,
          ),
        ),
        if (isRetired) ...[
          const SizedBox(width: 8),
          retiredChip(),
        ],
      ],
    );
  }
}
