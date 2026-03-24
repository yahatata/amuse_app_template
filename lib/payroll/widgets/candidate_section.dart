// 属性別 attendance 折りたたみセクション
//
// 参照: 06_UI_SPEC §3-1

import 'package:flutter/material.dart';

class CandidateEntry {
  final String attendanceId;
  final String staffName;
  final String date;
  final int actualWorkMinutes;
  final String reasonType;
  final String reasonLabel;
  bool selected;

  CandidateEntry({
    required this.attendanceId,
    required this.staffName,
    required this.date,
    required this.actualWorkMinutes,
    required this.reasonType,
    required this.reasonLabel,
    this.selected = false,
  });

  factory CandidateEntry.fromMap(Map<String, dynamic> m) {
    return CandidateEntry(
      attendanceId: m['attendanceId'] as String? ?? '',
      staffName: m['staffName'] as String? ?? '不明',
      date: m['date'] as String? ?? '',
      actualWorkMinutes: (m['actualWorkMinutes'] as num?)?.toInt() ?? 0,
      reasonType: m['reasonType'] as String? ?? 'other',
      reasonLabel: m['reasonLabel'] as String? ?? '',
    );
  }
}

class CandidateSection extends StatelessWidget {
  final String title;
  final String groupKey;
  final List<CandidateEntry> entries;
  final bool selectable;
  final bool requireConfirmToUncheck;
  final ValueChanged<int>? onToggle;

  const CandidateSection({
    super.key,
    required this.title,
    required this.groupKey,
    required this.entries,
    this.selectable = true,
    this.requireConfirmToUncheck = false,
    this.onToggle,
  });

  String _formatMinutes(int m) {
    final h = m ~/ 60;
    final min = m % 60;
    return '${h}h${min.toString().padLeft(2, '0')}m';
  }

  @override
  Widget build(BuildContext context) {
    final selectedCount = entries.where((e) => e.selected).length;

    return ExpansionTile(
      initiallyExpanded: false,
      title: Text(
        '$title（$selectedCount / ${entries.length}件）',
        style: const TextStyle(fontWeight: FontWeight.bold),
      ),
      children: entries.isEmpty
          ? [
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text('該当データなし', style: TextStyle(color: Colors.grey)),
              ),
            ]
          : entries.asMap().entries.map((e) {
              final idx = e.key;
              final entry = e.value;
              return ListTile(
                dense: true,
                leading: selectable
                    ? Checkbox(
                        value: entry.selected,
                        onChanged: (val) async {
                          if (requireConfirmToUncheck &&
                              entry.selected &&
                              val == false) {
                            final confirmed = await showDialog<bool>(
                              context: context,
                              builder: (_) => AlertDialog(
                                title: const Text('確認'),
                                content: const Text(
                                  '期間内の正常勤怠データのチェックを外すと計算対象から除外されます。よろしいですか？',
                                ),
                                actions: [
                                  TextButton(
                                    onPressed: () =>
                                        Navigator.pop(context, false),
                                    child: const Text('キャンセル'),
                                  ),
                                  TextButton(
                                    onPressed: () =>
                                        Navigator.pop(context, true),
                                    child: const Text('外す'),
                                  ),
                                ],
                              ),
                            );
                            if (confirmed == true) onToggle?.call(idx);
                          } else {
                            onToggle?.call(idx);
                          }
                        },
                      )
                    : const Icon(Icons.block, color: Colors.grey, size: 20),
                title: Text('${entry.staffName}  ${entry.date}'),
                subtitle: Text(
                  '${entry.reasonLabel}  ${_formatMinutes(entry.actualWorkMinutes)}',
                  style: const TextStyle(fontSize: 12),
                ),
              );
            }).toList(),
    );
  }
}
