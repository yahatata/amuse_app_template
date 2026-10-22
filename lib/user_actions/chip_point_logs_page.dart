import 'package:amuse_app_template/user/balance_display.dart';
import 'package:amuse_app_template/user/point_ids.dart';
import 'package:amuse_app_template/user_actions/user_action_load_errors.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

/// チップ・ポイント履歴参照ページ（A-7: pointLogs / sideGameChipLogs）
class ChipPointLogsPage extends StatefulWidget {
  final String userId;
  final String pokerName;

  const ChipPointLogsPage({
    super.key,
    required this.userId,
    required this.pokerName,
  });

  @override
  State<ChipPointLogsPage> createState() => _ChipPointLogsPageState();
}

class _ChipPointLogsPageState extends State<ChipPointLogsPage> {
  late List<String> _tabs;
  late String _selectedLogType;
  int _chipReloadToken = 0;

  @override
  void initState() {
    super.initState();
    _tabs = [
      ...enabledBalanceIdsFromStoreConfig().where(isCurrencyPointId),
      if (enabledBalanceIdsFromStoreConfig().contains(kSideGameChipId))
        kSideGameChipId,
    ];
    // chip のみ有効な場合もある
    if (_tabs.isEmpty) {
      _tabs = enabledBalanceIdsFromStoreConfig();
    }
    _selectedLogType = _tabs.isNotEmpty ? _tabs.first : kCurrencyPointIds.first;
  }

  String _reasonLabel(String reasonType, {required bool isChip}) {
    switch (reasonType) {
      case 'accounting':
        return '会計';
      case 'post_settlement_refund':
      case 'refund':
        return '返金';
      case 'post_settlement_collection':
      case 'collection':
        return '追加徴収';
      case 'tournament_reward':
        return 'トーナメント報酬';
      case 'tournament_reward_reversal':
        return '報酬取消';
      case 'deposit':
        return '預け入れ';
      case 'withdraw':
        return '引出し';
      case 'purchase':
      case 'sideGame':
        return isChip ? '購入' : reasonType;
      case 'manual':
        return '手動調整';
      case 'adjustment':
        return '調整';
      default:
        return reasonType.isEmpty ? '履歴' : reasonType;
    }
  }

  Widget _historyLoadFailed(VoidCallback? onRetry) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              kUserActionHistoryLoadFailedMessage,
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.red[700]),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: onRetry,
                child: const Text('再読み込み'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_tabs.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text('${widget.pokerName} - 履歴')),
        body: const Center(child: Text('表示可能なポイント履歴がありません')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text('${widget.pokerName} - 履歴'),
      ),
      body: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                for (final id in _tabs)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(balanceDisplayName(id)),
                      selected: _selectedLogType == id,
                      onSelected: (_) {
                        setState(() => _selectedLogType = id);
                      },
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: _selectedLogType == kSideGameChipId
                ? _buildChipLogs()
                : _buildCurrencyPointLogs(_selectedLogType),
          ),
        ],
      ),
    );
  }

  Widget _buildCurrencyPointLogs(String pointType) {
    // 読取系: 画面領域 CPI のみ。USER-74: タブ単位で fail ≠ empty（他タブを空扱いにしない）
    final query = FirebaseFirestore.instance
        .collection('users')
        .doc(widget.userId)
        .collection('pointLogs')
        .where('pointType', isEqualTo: pointType)
        .orderBy('createdAt', descending: true)
        .limit(100);

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: query.snapshots(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        final status = resolveUserActionLogLoadStatus(
          hasError: snapshot.hasError,
          itemCount: snapshot.data?.docs.length ?? 0,
        );
        if (status == UserActionLogLoadStatus.failed) {
          return _historyLoadFailed(null);
        }
        if (status == UserActionLogLoadStatus.empty) {
          return const Center(child: Text('履歴がありません'));
        }
        final docs = snapshot.data!.docs;
        return ListView.builder(
          itemCount: docs.length,
          itemBuilder: (context, index) {
            final data = docs[index].data();
            final change = (data['changeAmount'] as num?)?.toInt() ?? 0;
            final reason = data['reasonType'] as String? ?? '';
            final before = data['balanceBefore'];
            final after = data['balanceAfter'];
            final relatedId = data['relatedId'] as String? ?? '';
            final createdAt = data['createdAt'];
            DateTime? when;
            if (createdAt is Timestamp) when = createdAt.toDate();

            final color = change >= 0 ? Colors.green : Colors.red;
            return Card(
              margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: color.withValues(alpha: 0.12),
                  child: Icon(
                    change >= 0 ? Icons.arrow_upward : Icons.arrow_downward,
                    color: color,
                  ),
                ),
                title: Text(
                  _reasonLabel(reason, isChip: false),
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                subtitle: Text(
                  [
                    if (when != null)
                      '${when.year}/${when.month.toString().padLeft(2, '0')}/${when.day.toString().padLeft(2, '0')} ${when.hour.toString().padLeft(2, '0')}:${when.minute.toString().padLeft(2, '0')}',
                    if (before != null && after != null)
                      '残高 $before → $after',
                    if (relatedId.isNotEmpty) '関連: $relatedId',
                  ].join('\n'),
                ),
                isThreeLine: true,
                trailing: Text(
                  '${change >= 0 ? '+' : ''}$change',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildChipLogs() {
    // USER-75: chip Future。失敗 ≠ 空。再読み込み可。ポイントタブとは独立。
    return FutureBuilder<List<_ChipLogRow>>(
      key: ValueKey(_chipReloadToken),
      future: _loadChipLogs(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        final status = resolveUserActionLogLoadStatus(
          hasError: snapshot.hasError,
          itemCount: snapshot.data?.length ?? 0,
        );
        if (status == UserActionLogLoadStatus.failed) {
          return _historyLoadFailed(() {
            setState(() => _chipReloadToken++);
          });
        }
        if (status == UserActionLogLoadStatus.empty) {
          return const Center(child: Text('履歴がありません'));
        }
        final rows = snapshot.data!;
        return ListView.builder(
          itemCount: rows.length,
          itemBuilder: (context, index) {
            final row = rows[index];
            final color = row.changeAmount >= 0 ? Colors.green : Colors.red;
            return Card(
              margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: color.withValues(alpha: 0.12),
                  child: Icon(
                    row.isPurchase
                        ? Icons.shopping_cart
                        : (row.changeAmount >= 0
                            ? Icons.arrow_upward
                            : Icons.arrow_downward),
                    color: row.isPurchase ? Colors.orange : color,
                  ),
                ),
                title: Text(
                  _reasonLabel(row.reasonType, isChip: true),
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                subtitle: Text(
                  [
                    if (row.when != null)
                      '${row.when!.year}/${row.when!.month.toString().padLeft(2, '0')}/${row.when!.day.toString().padLeft(2, '0')} ${row.when!.hour.toString().padLeft(2, '0')}:${row.when!.minute.toString().padLeft(2, '0')}',
                    if (row.balanceBefore != null && row.balanceAfter != null)
                      '残高 ${row.balanceBefore} → ${row.balanceAfter}',
                    if (row.isPurchase) '※購入明細（残高変動ログとは別）',
                    if (row.relatedId != null && row.relatedId!.isNotEmpty)
                      '関連: ${row.relatedId}',
                  ].join('\n'),
                ),
                isThreeLine: true,
                trailing: Text(
                  '${row.changeAmount >= 0 ? '+' : ''}${row.changeAmount}',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: row.isPurchase ? Colors.orange : color,
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  Future<List<_ChipLogRow>> _loadChipLogs() async {
    final snap = await FirebaseFirestore.instance
        .collection('users')
        .doc(widget.userId)
        .collection('sideGameChipLogs')
        .get();

    final rows = <_ChipLogRow>[];
    for (final doc in snap.docs) {
      final data = doc.data();
      // A-7 flat balance log
      if (data.containsKey('changeAmount') && data.containsKey('reasonType')) {
        final createdAt = data['createdAt'];
        rows.add(
          _ChipLogRow(
            reasonType: data['reasonType'] as String? ?? '',
            changeAmount: (data['changeAmount'] as num?)?.toInt() ?? 0,
            balanceBefore: (data['balanceBefore'] as num?)?.toInt(),
            balanceAfter: (data['balanceAfter'] as num?)?.toInt(),
            relatedId: data['relatedId'] as String?,
            when: createdAt is Timestamp ? createdAt.toDate() : null,
            isPurchase: data['reasonType'] == 'purchase',
          ),
        );
        continue;
      }
      // legacy daily nested logs (購入明細など)
      final logs = data['logs'];
      if (logs is Map) {
        for (final entry in logs.entries) {
          final e = entry.value;
          if (e is! Map) continue;
          final map = Map<String, dynamic>.from(e);
          final category = map['category'] as String? ?? '';
          final reason = map['reasonType'] as String? ?? category;
          final delta = (map['amountDelta'] as num?)?.toInt() ?? 0;
          final appliedAt = map['appliedAt'];
          rows.add(
            _ChipLogRow(
              reasonType: reason == 'sideGame' && category == 'purchase'
                  ? 'purchase'
                  : reason,
              changeAmount: delta,
              when: appliedAt is Timestamp ? appliedAt.toDate() : null,
              isPurchase: category == 'purchase' || reason == 'purchase',
            ),
          );
        }
      }
    }

    rows.sort((a, b) {
      final at = a.when;
      final bt = b.when;
      if (at == null && bt == null) return 0;
      if (at == null) return 1;
      if (bt == null) return -1;
      return bt.compareTo(at);
    });
    return rows;
  }
}

class _ChipLogRow {
  final String reasonType;
  final int changeAmount;
  final int? balanceBefore;
  final int? balanceAfter;
  final String? relatedId;
  final DateTime? when;
  final bool isPurchase;

  const _ChipLogRow({
    required this.reasonType,
    required this.changeAmount,
    this.balanceBefore,
    this.balanceAfter,
    this.relatedId,
    this.when,
    this.isPurchase = false,
  });
}
