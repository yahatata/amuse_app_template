// 過去の計算結果セレクタ（結果タブ上部の計算期間選択）
//
// 参照: 06_UI_SPEC §4-8

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../utils/payment_date_utils.dart';

class PastResultsSelector extends StatefulWidget {
  final String currentPeriodKey;
  final ValueChanged<String> onPeriodChanged;

  /// ヘッダー行など横並び用。余白・最大幅を抑える。
  final bool compact;

  const PastResultsSelector({
    super.key,
    required this.currentPeriodKey,
    required this.onPeriodChanged,
    this.compact = false,
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

  @override
  void didUpdateWidget(PastResultsSelector oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.currentPeriodKey != oldWidget.currentPeriodKey) {
      setState(() => _selectedKey = widget.currentPeriodKey);
    }
  }

  Future<void> _fetchPeriods() async {
    final snap = await FirebaseFirestore.instance
        .collection('monthlyPayroll')
        .orderBy('createdAt', descending: true)
        .limit(36)
        .get();

    var options = snap.docs.map((doc) {
      final data = doc.data();
      final key = doc.id;
      final status = data['status'] as String? ?? '';
      return _PeriodOption(key: key, status: status);
    }).toList();

    // 親が Callable フォールバック等で持っているキーが一覧に無い場合も選択肢に含める
    if (widget.currentPeriodKey.isNotEmpty &&
        !options.any((o) => o.key == widget.currentPeriodKey)) {
      options = [
        _PeriodOption(key: widget.currentPeriodKey, status: ''),
        ...options,
      ];
    }

    if (mounted) {
      setState(() => _options = options);
    }
  }

  String _formatPeriodKey(String key) {
    final parts = key.split('_');
    if (parts.length == 2) {
      return '${formatIsoYmdToSlash(parts[0])} 〜 ${formatIsoYmdToSlash(parts[1])}';
    }
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
    final theme = Theme.of(context);

    if (_options == null) {
      if (widget.compact) {
        return const SizedBox(
          height: 48,
          child: Center(
            child: SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        );
      }
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: const SizedBox(
              height: 48,
              child: Center(
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
          ),
        ),
      );
    }

    Widget inner;
    if (_options!.isEmpty) {
      inner = Text(
        '表示できる給与期間がありません',
        textAlign: TextAlign.center,
        style: TextStyle(color: theme.colorScheme.onSurfaceVariant, fontSize: 13),
      );
    } else {
      inner = DropdownButtonFormField<String>(
        isExpanded: true,
        value: _options!.any((o) => o.key == _selectedKey) ? _selectedKey : null,
        decoration: const InputDecoration(
          labelText: '計算期間を選択',
          border: OutlineInputBorder(),
          isDense: true,
          contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        ),
        items: _options!.map((opt) {
          return DropdownMenuItem(
            value: opt.key,
            child: Text(
              '${_formatPeriodKey(opt.key)}（${_statusBadge(opt.status)}）',
              style: const TextStyle(fontSize: 14),
              overflow: TextOverflow.ellipsis,
            ),
          );
        }).toList(),
        onChanged: (value) {
          if (value != null && value != _selectedKey) {
            setState(() => _selectedKey = value);
            widget.onPeriodChanged(value);
          }
        },
      );
    }

    if (widget.compact) {
      return inner;
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: inner,
        ),
      ),
    );
  }
}

class _PeriodOption {
  final String key;
  final String status;
  const _PeriodOption({required this.key, required this.status});
}
