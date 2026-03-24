// 過去の計算結果セレクタ
//
// 参照: 06_UI_SPEC §4-8

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class PastResultsSelector extends StatefulWidget {
  final String currentPeriodKey;
  final ValueChanged<String> onPeriodChanged;

  const PastResultsSelector({
    super.key,
    required this.currentPeriodKey,
    required this.onPeriodChanged,
  });

  @override
  State<PastResultsSelector> createState() => _PastResultsSelectorState();
}

class _PastResultsSelectorState extends State<PastResultsSelector> {
  List<_PeriodOption>? _options;
  String? _selectedKey;

  @override
  void initState() {
    super.initState();
    _selectedKey = widget.currentPeriodKey;
    _fetchPeriods();
  }

  Future<void> _fetchPeriods() async {
    final snap = await FirebaseFirestore.instance
        .collection('monthlyPayroll')
        .orderBy('createdAt', descending: true)
        .limit(12)
        .get();

    final options = snap.docs.map((doc) {
      final data = doc.data();
      final key = doc.id;
      final status = data['status'] as String? ?? '';
      return _PeriodOption(key: key, status: status);
    }).toList();

    if (mounted) {
      setState(() => _options = options);
    }
  }

  String _formatPeriodKey(String key) {
    final parts = key.split('_');
    if (parts.length == 2) return '${parts[0]} 〜 ${parts[1]}';
    return key;
  }

  String _statusBadge(String status) {
    switch (status) {
      case 'draft':
        return '未確定';
      case 'confirmed':
        return '確定済み';
      case 'hold':
        return '保留あり';
      case 'paid':
        return '支払済み';
      default:
        return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_options == null) return const SizedBox.shrink();
    if (_options!.length <= 1) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: DropdownButtonFormField<String>(
        value: _options!.any((o) => o.key == _selectedKey)
            ? _selectedKey
            : null,
        decoration: const InputDecoration(
          labelText: '計算結果の期間を選択',
          border: OutlineInputBorder(),
          contentPadding:
              EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        ),
        items: _options!.map((opt) {
          return DropdownMenuItem(
            value: opt.key,
            child: Text(
              '${_formatPeriodKey(opt.key)}  (${_statusBadge(opt.status)})',
              style: const TextStyle(fontSize: 14),
            ),
          );
        }).toList(),
        onChanged: (value) {
          if (value != null && value != _selectedKey) {
            setState(() => _selectedKey = value);
            widget.onPeriodChanged(value);
          }
        },
      ),
    );
  }
}

class _PeriodOption {
  final String key;
  final String status;
  const _PeriodOption({required this.key, required this.status});
}
