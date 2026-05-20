import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import 'package:amuse_app_template/Accounting/accountingPage.dart';
import 'package:amuse_app_template/Accounting/postSettlementCollectionDialog.dart';
import 'package:amuse_app_template/Accounting/postSettlementRefundDialog.dart';
import 'package:amuse_app_template/Accounting/requireSpecialAttention/billRequireAttentionViewModel.dart';
import 'package:amuse_app_template/Accounting/requireSpecialAttention/userAttentionCounts.dart';
import 'package:amuse_app_template/utils/sectioned_user_list_page.dart';

/// 要対応の会計画面（仕様書 [04_仕様書/06_要対応の会計画面と一覧取得.md] の本実装）。
///
/// 仕様書 §6〜§14:
/// - メニュー入口は `terminalHome` の「要対応の会計」
/// - 表示軸: `日付ごと` / `ユーザー別`
/// - フィルタ: `すべて` / `未会計` / `追加徴収` / `要返金`
/// - 内部カード種別:
///   - `carryover_unsettled`: `status='open'` + `closeSummary.unresolved=true`
///   - `post_settlement_collection_pending`: `status='post_settlement_pending'` + `requiredActionType='collection'` + `requiredActionIncl > 0`
///   - `post_settlement_refund_pending`: `status='post_settlement_pending'` + `requiredActionType='refund'` + `requiredActionIncl > 0`
class RequireSpecialAttentionPage extends StatefulWidget {
  const RequireSpecialAttentionPage({super.key});

  @override
  State<RequireSpecialAttentionPage> createState() =>
      _RequireSpecialAttentionPageState();
}

enum AttentionFilter { all, carryover, collection, refund }

class _RequireSpecialAttentionPageState
    extends State<RequireSpecialAttentionPage>
    with SingleTickerProviderStateMixin {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  late TabController _tabController;
  AttentionFilter _filter = AttentionFilter.all;

  /// 3 stream の最新結果をマージしておく `Map<String, BillRequireAttentionViewModel>`（key=billId）
  final Map<String, BillRequireAttentionViewModel> _carryoverBills = {};
  final Map<String, BillRequireAttentionViewModel> _collectionBills = {};
  final Map<String, BillRequireAttentionViewModel> _refundBills = {};

  bool _initializedAtLeastOnce = false;

  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _subCarryover;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _subCollection;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _subRefund;

  /// ユーザー別タブで選択中のユーザー（null のときはユーザー一覧を表示）
  Map<String, dynamic>? _selectedUserCard;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _subscribeStreams();
  }

  @override
  void dispose() {
    _subCarryover?.cancel();
    _subCollection?.cancel();
    _subRefund?.cancel();
    _tabController.dispose();
    super.dispose();
  }

  void _subscribeStreams() {
    _subCarryover = _firestore
        .collection('bills')
        .where('status', isEqualTo: 'open')
        .where('closeSummary.unresolved', isEqualTo: true)
        .snapshots()
        .listen((snap) => _onCarryoverSnap(snap));

    _subCollection = _firestore
        .collection('bills')
        .where('status', isEqualTo: 'post_settlement_pending')
        .where(
          'postSettlementState.requiredActionType',
          isEqualTo: 'collection',
        )
        .snapshots()
        .listen((snap) => _onPostSettlementSnap(snap, _collectionBills));

    _subRefund = _firestore
        .collection('bills')
        .where('status', isEqualTo: 'post_settlement_pending')
        .where('postSettlementState.requiredActionType', isEqualTo: 'refund')
        .snapshots()
        .listen((snap) => _onPostSettlementSnap(snap, _refundBills));
  }

  void _onCarryoverSnap(QuerySnapshot<Map<String, dynamic>> snap) {
    final newMap = <String, BillRequireAttentionViewModel>{};
    for (final doc in snap.docs) {
      final vm = BillRequireAttentionViewModel.fromBill(doc.id, doc.data());
      if (vm != null && vm.cardType == BillCardType.carryoverUnsettled) {
        newMap[doc.id] = vm;
      }
    }
    if (!mounted) return;
    setState(() {
      _carryoverBills
        ..clear()
        ..addAll(newMap);
      _initializedAtLeastOnce = true;
    });
  }

  void _onPostSettlementSnap(
    QuerySnapshot<Map<String, dynamic>> snap,
    Map<String, BillRequireAttentionViewModel> targetMap,
  ) {
    final newMap = <String, BillRequireAttentionViewModel>{};
    for (final doc in snap.docs) {
      final vm = BillRequireAttentionViewModel.fromBill(doc.id, doc.data());
      // requiredActionIncl > 0 のみ classify されるので、ここで再判定で OK
      if (vm == null) continue;
      newMap[doc.id] = vm;
    }
    if (!mounted) return;
    setState(() {
      targetMap
        ..clear()
        ..addAll(newMap);
      _initializedAtLeastOnce = true;
    });
  }

  /// 3 種別を統合した全件 view model（filter 未適用）。
  List<BillRequireAttentionViewModel> get _allVms {
    return [
      ..._carryoverBills.values,
      ..._collectionBills.values,
      ..._refundBills.values,
    ];
  }

  /// フィルタ適用後の view model 一覧。
  List<BillRequireAttentionViewModel> _applyFilter(
    List<BillRequireAttentionViewModel> source,
  ) {
    switch (_filter) {
      case AttentionFilter.all:
        return source;
      case AttentionFilter.carryover:
        return source
            .where((b) => b.cardType == BillCardType.carryoverUnsettled)
            .toList();
      case AttentionFilter.collection:
        return source
            .where(
              (b) => b.cardType == BillCardType.postSettlementCollectionPending,
            )
            .toList();
      case AttentionFilter.refund:
        return source
            .where(
              (b) => b.cardType == BillCardType.postSettlementRefundPending,
            )
            .toList();
    }
  }

  String _formatBusinessDateForDisplay(String key) {
    if (key.isEmpty) return '—';
    return key.replaceAll('-', '/');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('要対応の会計'),
        backgroundColor: Colors.brown[700],
        foregroundColor: Colors.white,
        bottom: TabBar(
          controller: _tabController,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: const [
            Tab(text: '日付ごと'),
            Tab(text: 'ユーザー別'),
          ],
        ),
      ),
      body: Column(
        children: [
          _buildFilterChips(),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildTabByDate(),
                _buildTabByUser(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChips() {
    final entries = const [
      (AttentionFilter.all, 'すべて'),
      (AttentionFilter.carryover, '未会計'),
      (AttentionFilter.collection, '追加徴収'),
      (AttentionFilter.refund, '要返金'),
    ];
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final entry in entries) ...[
                ChoiceChip(
                  label: Text(entry.$2),
                  selected: _filter == entry.$1,
                  onSelected: (sel) {
                    if (!sel) return;
                    setState(() => _filter = entry.$1);
                  },
                ),
                const SizedBox(width: 8),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTabByDate() {
    if (!_initializedAtLeastOnce) {
      return const Center(child: CircularProgressIndicator());
    }
    final filtered = _applyFilter(_allVms);
    if (filtered.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            '要対応の請求書はありません',
            style: TextStyle(fontSize: 16, color: Colors.grey),
          ),
        ),
      );
    }

    // sortDate で grouping、降順
    final byDate = <String, List<BillRequireAttentionViewModel>>{};
    for (final vm in filtered) {
      byDate.putIfAbsent(vm.sortDate, () => []).add(vm);
    }
    final sortedKeys = byDate.keys.toList()..sort((a, b) => b.compareTo(a));

    return ListView.builder(
      padding: const EdgeInsets.only(bottom: 24),
      itemCount: sortedKeys.length,
      itemBuilder: (context, idx) {
        final dateKey = sortedKeys[idx];
        final bills = byDate[dateKey]!;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              color: Colors.brown[50],
              padding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 8,
              ),
              child: Text(
                _formatBusinessDateForDisplay(dateKey),
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            for (final vm in bills) _buildBillCard(context, vm),
          ],
        );
      },
    );
  }

  Widget _buildTabByUser() {
    if (_selectedUserCard != null) {
      return _buildBillsForUser();
    }
    return _buildUserList();
  }

  Widget _buildUserList() {
    if (!_initializedAtLeastOnce) {
      return const Center(child: CircularProgressIndicator());
    }
    final filteredVms = _applyFilter(_allVms);

    // ユーザーカードは「フィルタ適用後の bill が存在するユーザー」一覧
    // ただし件数内訳は **filter 適用前** の全件で集計（仕様書 §11.3）
    final userIdsAfterFilter = filteredVms.map((b) => b.userId).toSet();
    final userCards = <Map<String, dynamic>>[];
    for (final userId in userIdsAfterFilter) {
      final allBillsOfUser =
          _allVms.where((b) => b.userId == userId).toList();
      if (allBillsOfUser.isEmpty) continue;
      final counts = UserAttentionCounts.from(allBillsOfUser);
      final pokerName = allBillsOfUser.first.userDisplayName;
      userCards.add({
        'userId': userId,
        'pokerName': pokerName,
        'counts': counts,
      });
    }

    if (userCards.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            '要対応の請求書を持つユーザーはいません',
            style: TextStyle(fontSize: 16, color: Colors.grey),
          ),
        ),
      );
    }

    return buildSectionedUserListPage(
      users: userCards,
      nameKey: 'pokerName',
      itemBuilder: (context, user) {
        final counts = user['counts'] as UserAttentionCounts;
        final name = (user['pokerName'] ?? '—') as String;
        return Card(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: ListTile(
            title: Text(
              name,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('総件数: ${counts.total} 件'),
                  Text(
                    '未会計 ${counts.carryover} 件 / 追加徴収 ${counts.collection} 件 / 要返金 ${counts.refund} 件',
                    style: const TextStyle(fontSize: 12),
                  ),
                ],
              ),
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => setState(() => _selectedUserCard = user),
          ),
        );
      },
    );
  }

  Widget _buildBillsForUser() {
    final user = _selectedUserCard!;
    final userId = user['userId'] as String? ?? '';
    final pokerName = user['pokerName'] as String? ?? '—';

    final filteredVms = _applyFilter(_allVms)
        .where((b) => b.userId == userId)
        .toList();

    if (filteredVms.isEmpty) {
      return Column(
        children: [
          _buildBackBar(pokerName),
          const Expanded(
            child: Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  '該当する要対応の請求書はありません',
                  style: TextStyle(fontSize: 16, color: Colors.grey),
                ),
              ),
            ),
          ),
        ],
      );
    }

    return Column(
      children: [
        _buildBackBar(pokerName),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.only(bottom: 24),
            itemCount: filteredVms.length,
            itemBuilder: (context, idx) =>
                _buildBillCard(context, filteredVms[idx]),
          ),
        ),
      ],
    );
  }

  Widget _buildBackBar(String pokerName) {
    return Material(
      color: Colors.brown[100],
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => setState(() => _selectedUserCard = null),
                tooltip: 'ユーザー一覧へ',
              ),
              Text(
                '$pokerName の要対応',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _badgeColorForCardType(BillCardType cardType) {
    switch (cardType) {
      case BillCardType.carryoverUnsettled:
        return Colors.brown[700]!;
      case BillCardType.postSettlementCollectionPending:
        return Colors.deepOrange[700]!;
      case BillCardType.postSettlementRefundPending:
        return Colors.indigo[700]!;
    }
  }

  Widget _buildBillCard(
    BuildContext context,
    BillRequireAttentionViewModel vm,
  ) {
    final amount = vm.displayAmountIncl;
    final amountText = '¥${amount.toString()}';
    final actionLabel = primaryActionLabel(vm.primaryActionType);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: _badgeColorForCardType(vm.cardType),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    vm.displayLabel,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    vm.displayTitle,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text(
                  amountText,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              '営業日: ${_formatBusinessDateForDisplay(vm.businessDate)}',
              style: const TextStyle(fontSize: 12, color: Colors.grey),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: ElevatedButton(
                onPressed: () => _onPrimaryAction(context, vm),
                child: Text(actionLabel),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _onPrimaryAction(
    BuildContext context,
    BillRequireAttentionViewModel vm,
  ) async {
    switch (vm.primaryActionType) {
      case PrimaryActionType.resumeAccounting:
        await Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => AccountingPage(
              forUnsettledBillId: vm.billId,
              forUnsettledUserId: vm.userId,
            ),
          ),
        );
        break;
      case PrimaryActionType.collect:
        await showDialog<void>(
          context: context,
          builder: (_) => PostSettlementCollectionDialog(
            billId: vm.billId,
            initialAmountIncl: vm.displayAmountIncl,
          ),
        );
        break;
      case PrimaryActionType.refund:
        await showDialog<void>(
          context: context,
          builder: (_) => PostSettlementRefundDialog(
            billId: vm.billId,
            initialAmountIncl: vm.displayAmountIncl,
          ),
        );
        break;
    }
  }
}
