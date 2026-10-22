// 集計プレビューウィジェット
//
// 参照: 06_UI_SPEC §3-2

import 'package:flutter/material.dart';
import 'candidate_section.dart';

class PreviewSummary extends StatelessWidget {
  final List<CandidateEntry> group1;
  final List<CandidateEntry> group2;
  final int? expectedCountMin;
  final int? expectedCountMax;

  const PreviewSummary({
    super.key,
    required this.group1,
    required this.group2,
    this.expectedCountMin,
    this.expectedCountMax,
  });

  @override
  Widget build(BuildContext context) {
    final selected1 = group1.where((e) => e.selected).toList();
    final selected2 = group2.where((e) => e.selected).toList();
    final allSelected = [...selected1, ...selected2];
    final totalMinutes =
        allSelected.fold<int>(0, (s, e) => s + e.actualWorkMinutes);
    final totalCount = allSelected.length;
    final h = totalMinutes ~/ 60;
    final m = totalMinutes % 60;

    final countWarning = (expectedCountMin != null && totalCount < expectedCountMin!) ||
        (expectedCountMax != null && totalCount > expectedCountMax!);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('集計プレビュー',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 8),
            Text(
              '属性1: ${selected1.length}/${group1.length}件'
              '　属性2: ${selected2.length}/${group2.length}件',
            ),
            const SizedBox(height: 4),
            Text('合計対象: $totalCount件　合計時間: ${h}h${m.toString().padLeft(2, '0')}m'),
            if (countWarning) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.orange),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.warning_amber, color: Colors.orange),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '件数が想定範囲（${expectedCountMin ?? "-"}〜${expectedCountMax ?? "-"}件）から外れています',
                        style: const TextStyle(color: Colors.orange),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
