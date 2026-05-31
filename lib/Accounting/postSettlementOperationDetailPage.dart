import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import 'package:amuse_app_template/Utils/menuItemsManager.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';

class PostSettlementOperationDetailPage extends StatefulWidget {
  final String billId;

  const PostSettlementOperationDetailPage({super.key, required this.billId});

  @override
  State<PostSettlementOperationDetailPage> createState() =>
      _PostSettlementOperationDetailPageState();
}

enum _OperationKind {
  decreaseRefundPending,
  decreaseRefunded,
  increaseCollectionPending,
  increaseCollected,
}

extension _OperationKindX on _OperationKind {
  bool get isDecrease =>
      this == _OperationKind.decreaseRefundPending ||
      this == _OperationKind.decreaseRefunded;

  bool get isImmediate =>
      this == _OperationKind.decreaseRefunded ||
      this == _OperationKind.increaseCollected;

  String get label => switch (this) {
    _OperationKind.decreaseRefundPending => '減額（返金待ち）',
    _OperationKind.decreaseRefunded => '減額（即時返金）',
    _OperationKind.increaseCollectionPending => '増額（追加徴収待ち）',
    _OperationKind.increaseCollected => '増額（即時徴収）',
  };

  String get adjustmentType => switch (this) {
    _OperationKind.decreaseRefundPending => 'decrease_refund_pending',
    _OperationKind.decreaseRefunded => 'decrease_refunded',
    _OperationKind.increaseCollectionPending => 'increase_collection_pending',
    _OperationKind.increaseCollected => 'increase_collected',
  };

  String get submitVerb => switch (this) {
    _OperationKind.decreaseRefundPending => '返金待ちで減額',
    _OperationKind.decreaseRefunded => '即時返金で減額',
    _OperationKind.increaseCollectionPending => '追加徴収待ちで増額',
    _OperationKind.increaseCollected => '即時徴収で増額',
  };
}

enum _InputMode { structured, manual }

enum _IncreaseSourceKind { item, tournament, sideGameChip }

class _TargetCandidate {
  final String localId;
  final String targetCategory;
  final String? targetId;
  final String targetName;
  final String operationType;
  final int availableQty;
  final int unitAmountIncl;
  final int totalAmountIncl;
  final String subtitle;
  final String quantityUnit;

  const _TargetCandidate({
    required this.localId,
    required this.targetCategory,
    required this.targetId,
    required this.targetName,
    required this.operationType,
    required this.availableQty,
    required this.unitAmountIncl,
    required this.totalAmountIncl,
    required this.subtitle,
    required this.quantityUnit,
  });
}

class _DecreaseSelectionRow {
  _DecreaseSelectionRow({
    required this.rowId,
    this.candidateId,
    this.selectedQty,
  });

  final String rowId;
  String? candidateId;
  int? selectedQty;
}

class _IncreasePreparedLine {
  _IncreasePreparedLine({
    required this.lineId,
    required this.targetCategory,
    required this.targetId,
    required this.targetName,
    required this.operationType,
    required this.unitAmountIncl,
    required this.subtitle,
    required this.quantityUnit,
  });

  final String lineId;
  final String targetCategory;
  final String? targetId;
  final String targetName;
  final String operationType;
  final int unitAmountIncl;
  final String subtitle;
  final String quantityUnit;
  int? selectedQty = 1;
}

class _TournamentOption {
  const _TournamentOption({
    required this.templateId,
    required this.name,
    required this.startAt,
    required this.status,
    required this.entryFee,
    required this.reentryFee,
    required this.addonFee,
    required this.existingEntryCount,
    required this.existingReentryCount,
    required this.existingAddonCount,
  });

  final String templateId;
  final String name;
  final Timestamp? startAt;
  final String status;
  final int entryFee;
  final int reentryFee;
  final int addonFee;
  final int existingEntryCount;
  final int existingReentryCount;
  final int existingAddonCount;
}

class _TournamentExistingCounts {
  const _TournamentExistingCounts({
    this.entryCount = 0,
    this.reentryCount = 0,
    this.addonCount = 0,
  });

  final int entryCount;
  final int reentryCount;
  final int addonCount;
}

class _CurrentStateSummary {
  const _CurrentStateSummary({
    required this.itemLineCount,
    required this.extraLineCount,
    required this.tournamentLineCount,
    required this.sideGameChipLineCount,
  });

  final int itemLineCount;
  final int extraLineCount;
  final int tournamentLineCount;
  final int sideGameChipLineCount;
}

class _CurrentStateView {
  const _CurrentStateView({
    required this.decreaseCandidates,
    required this.tournamentExistingCounts,
    required this.summary,
  });

  final List<_TargetCandidate> decreaseCandidates;
  final Map<String, _TournamentExistingCounts> tournamentExistingCounts;
  final _CurrentStateSummary summary;
}

class _CurrentLineAggregate {
  _CurrentLineAggregate({
    required this.key,
    required this.targetCategory,
    required this.targetId,
    required this.targetName,
    required this.operationType,
    required this.quantityUnit,
    required this.unitAmountIncl,
    required this.itemCategory,
    required this.sideGameChipQtyPerPurchase,
    required this.qty,
    required this.amountIncl,
  });

  final String key;
  final String targetCategory;
  final String? targetId;
  final String targetName;
  final String operationType;
  final String quantityUnit;
  final int unitAmountIncl;
  final String? itemCategory;
  final int? sideGameChipQtyPerPurchase;
  int qty;
  int amountIncl;
}

class _PostSettlementOperationDetailPageState
    extends State<PostSettlementOperationDetailPage> {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  bool _loading = true;
  bool _submitting = false;
  String? _error;
  bool _summaryExpanded = false;

  Map<String, dynamic>? _bill;
  List<_TargetCandidate> _decreaseCandidates = [];
  _CurrentStateSummary? _currentStateSummary;
  List<MenuItem> _itemMenuOptions = [];
  List<MenuItem> _sideGameChipMenuOptions = [];
  List<_TournamentOption> _tournamentOptions = [];

  _OperationKind _operationKind = _OperationKind.decreaseRefundPending;
  _InputMode _inputMode = _InputMode.structured;
  _IncreaseSourceKind _increaseSourceKind = _IncreaseSourceKind.item;
  String? _selectedItemCategory;

  final List<_DecreaseSelectionRow> _decreaseRows = [];
  final List<_IncreasePreparedLine> _increaseLines = [];

  final TextEditingController _manualAmountCtrl = TextEditingController();
  final TextEditingController _noteCtrl = TextEditingController();

  String _immediateMethod = 'cash';

  /// 即時精算で使用するユーザー残高（special methods 表示用）
  String? _immediateUserId;
  Map<String, int> _immediateUserBalance = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _manualAmountCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final billSnap = await _firestore
          .collection('bills')
          .doc(widget.billId)
          .get();
      final bill = billSnap.data();
      if (bill == null) {
        throw StateError('bill が見つかりません');
      }
      final cycleNo =
          ((bill['reopenSummary']
                      as Map<String, dynamic>?)?['currentSettlementCycle']
                  as num?)
              ?.toInt() ??
          1;
      final cycleRef = _firestore
          .collection('bills')
          .doc(widget.billId)
          .collection('settlementCycles')
          .doc(cycleNo.toString());
      final baselineSnap = await cycleRef
          .collection('baselineSnapshot')
          .doc('snapshot')
          .get();
      final adjustmentsSnap = await cycleRef
          .collection('adjustments')
          .orderBy('sequenceNo')
          .get();

      final baseline = baselineSnap.data();
      final billBusinessDate = bill['businessDate'] as String?;
      final menus = await _loadMenuOptions();
      final menuById = <String, MenuItem>{
        for (final menu in [...menus.itemOptions, ...menus.sideGameChipOptions])
          menu.id: menu,
      };
      final currentState = _buildCurrentStateView(
        baselineSnapshot: baseline,
        adjustmentDocs: adjustmentsSnap.docs.map((doc) => doc.data()).toList(),
        menuById: menuById,
      );
      final tournamentOptions = await _loadTournamentOptions(
        businessDate: billBusinessDate,
        tournamentExistingCounts: currentState.tournamentExistingCounts,
      );

      // 即時精算の special methods 用にユーザー残高を取得
      final userId =
          ((bill['party'] as Map<String, dynamic>?)?['userId']) as String?;
      Map<String, int> userBalance = {};
      if (userId != null) {
        try {
          final userSnap =
              await _firestore.collection('users').doc(userId).get();
          final ud = userSnap.data() ?? {};
          userBalance = {
            'sideGameChip': (ud['sideGameChip'] as num?)?.toInt() ?? 0,
            'pointA': (ud['pointA'] as num?)?.toInt() ?? 0,
            'pointB': (ud['pointB'] as num?)?.toInt() ?? 0,
          };
        } catch (_) {
          // 残高取得失敗時は special methods を非表示にする（エラーは無視）
        }
      }

      if (!mounted) return;
      setState(() {
        _bill = bill;
        _decreaseCandidates = currentState.decreaseCandidates;
        _currentStateSummary = currentState.summary;
        _itemMenuOptions = menus.itemOptions;
        _sideGameChipMenuOptions = menus.sideGameChipOptions;
        _tournamentOptions = tournamentOptions;
        _selectedItemCategory = _deriveInitialItemCategory(menus.itemOptions);
        _immediateUserId = userId;
        _immediateUserBalance = userBalance;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '伝票詳細の取得に失敗しました: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<({List<MenuItem> itemOptions, List<MenuItem> sideGameChipOptions})>
  _loadMenuOptions() async {
    final fetched = await MenuItemsManager.fetchMenuItems();
    final allMenus = fetched
        ? MenuItemsManager.getDisplayableMenuItems()
        : MenuItemsManager.getDisplayableMenuItems();

    final itemOptions =
        allMenus.where((menu) => menu.category != 'Chip').toList()
          ..sort((a, b) {
            final categoryCompare = a.category.compareTo(b.category);
            if (categoryCompare != 0) return categoryCompare;
            final orderCompare = a.order.compareTo(b.order);
            if (orderCompare != 0) return orderCompare;
            return a.name.compareTo(b.name);
          });

    final sideGameChipOptions =
        allMenus.where((menu) => menu.category == 'Chip').toList()
          ..sort((a, b) {
            final orderCompare = a.order.compareTo(b.order);
            if (orderCompare != 0) return orderCompare;
            return a.name.compareTo(b.name);
          });

    return (itemOptions: itemOptions, sideGameChipOptions: sideGameChipOptions);
  }

  Future<List<_TournamentOption>> _loadTournamentOptions({
    required String? businessDate,
    required Map<String, _TournamentExistingCounts> tournamentExistingCounts,
  }) async {
    if (businessDate == null || businessDate.isEmpty) return const [];

    final snap = await _firestore
        .collection('scheduledTournaments')
        .where('businessDate', isEqualTo: businessDate)
        .get();

    final options =
        snap.docs.map((doc) {
          final data = doc.data();
          final snapshot =
              (data['snapshot'] as Map<String, dynamic>?) ?? const {};
          final existing =
              tournamentExistingCounts[doc.id] ??
              tournamentExistingCounts[data['templateId'] as String? ?? ''] ??
              const _TournamentExistingCounts();
          return _TournamentOption(
            templateId: doc.id,
            name:
                snapshot['name'] as String? ??
                data['templateName'] as String? ??
                '無名トーナメント',
            startAt: data['startAt'] as Timestamp?,
            status: data['status'] as String? ?? '',
            entryFee: (snapshot['entryFee'] as num?)?.toInt() ?? 0,
            reentryFee: (snapshot['reentryFee'] as num?)?.toInt() ?? 0,
            addonFee: (snapshot['addonFee'] as num?)?.toInt() ?? 0,
            existingEntryCount: existing.entryCount,
            existingReentryCount: existing.reentryCount,
            existingAddonCount: existing.addonCount,
          );
        }).toList()..sort((a, b) {
          final aDate = a.startAt?.toDate();
          final bDate = b.startAt?.toDate();
          if (aDate == null && bDate == null) return a.name.compareTo(b.name);
          if (aDate == null) return 1;
          if (bDate == null) return -1;
          return aDate.compareTo(bDate);
        });

    return options;
  }

  _CurrentStateView _buildCurrentStateView({
    required Map<String, dynamic>? baselineSnapshot,
    required List<Map<String, dynamic>> adjustmentDocs,
    required Map<String, MenuItem> menuById,
  }) {
    final aggregates = <String, _CurrentLineAggregate>{};

    void mergeAggregate(_CurrentLineAggregate seed) {
      final existing = aggregates[seed.key];
      if (existing == null) {
        aggregates[seed.key] = seed;
        return;
      }
      existing.qty += seed.qty;
      existing.amountIncl += seed.amountIncl;
    }

    final items = (baselineSnapshot?['items'] as List<dynamic>?) ?? const [];
    for (final raw in items) {
      final data = Map<String, dynamic>.from(raw as Map);
      final qty = (data['qty'] as num?)?.toInt() ?? 0;
      final sales = (data['salesIncl'] as num?)?.toInt() ?? 0;
      if (qty <= 0 || sales <= 0) continue;
      final unit =
          (data['unitPriceIncl'] as num?)?.toInt() ??
          (qty > 0 ? (sales ~/ qty) : sales);
      mergeAggregate(
        _CurrentLineAggregate(
          key: _lineInventoryKey(
            targetCategory: 'item',
            targetId: data['menuItemId'] as String?,
            targetName: data['name'] as String? ?? '商品',
            operationType: 'sale',
            unitAmountIncl: unit,
          ),
          targetCategory: 'item',
          targetId: data['menuItemId'] as String?,
          targetName: data['name'] as String? ?? '商品',
          operationType: 'sale',
          quantityUnit: '件',
          unitAmountIncl: unit,
          itemCategory: data['category'] as String?,
          sideGameChipQtyPerPurchase: null,
          qty: qty,
          amountIncl: sales,
        ),
      );
    }

    final extras = (baselineSnapshot?['extras'] as List<dynamic>?) ?? const [];
    for (final raw in extras) {
      final data = Map<String, dynamic>.from(raw as Map);
      final qty = (data['qty'] as num?)?.toInt() ?? 0;
      final sales = (data['salesIncl'] as num?)?.toInt() ?? 0;
      if (qty <= 0 || sales <= 0) continue;
      final unit =
          (data['unitPriceIncl'] as num?)?.toInt() ??
          (qty > 0 ? (sales ~/ qty) : sales);
      mergeAggregate(
        _CurrentLineAggregate(
          key: _lineInventoryKey(
            targetCategory: 'extra',
            targetId: null,
            targetName: data['name'] as String? ?? '追加料金',
            operationType: 'extra',
            unitAmountIncl: unit,
          ),
          targetCategory: 'extra',
          targetId: null,
          targetName: data['name'] as String? ?? '追加料金',
          operationType: 'extra',
          quantityUnit: '件',
          unitAmountIncl: unit,
          itemCategory: null,
          sideGameChipQtyPerPurchase: null,
          qty: qty,
          amountIncl: sales,
        ),
      );
    }

    final tournaments =
        (baselineSnapshot?['tournaments'] as List<dynamic>?) ?? const [];
    for (final raw in tournaments) {
      final data = Map<String, dynamic>.from(raw as Map);
      final templateId = data['templateId'] as String?;
      final templateName = data['templateName'] as String? ?? 'トーナメント';

      void addTournamentAggregate(
        String operationType,
        String countKey,
        String salesKey,
      ) {
        final count = (data[countKey] as num?)?.toInt() ?? 0;
        final sales = (data[salesKey] as num?)?.toInt() ?? 0;
        if (count <= 0 || sales <= 0) return;
        final unit = count > 0 ? (sales ~/ count) : sales;
        mergeAggregate(
          _CurrentLineAggregate(
            key: _lineInventoryKey(
              targetCategory: 'tournament',
              targetId: templateId,
              targetName: templateName,
              operationType: operationType,
              unitAmountIncl: unit,
            ),
            targetCategory: 'tournament',
            targetId: templateId,
            targetName: templateName,
            operationType: operationType,
            quantityUnit: '件',
            unitAmountIncl: unit,
            itemCategory: null,
            sideGameChipQtyPerPurchase: null,
            qty: count,
            amountIncl: sales,
          ),
        );
      }

      addTournamentAggregate('entry', 'entryCount', 'entrySalesIncl');
      addTournamentAggregate('reentry', 'reentryCount', 'reentrySalesIncl');
      addTournamentAggregate('addon', 'addonCount', 'addonSalesIncl');
    }

    final sideGameChips =
        (baselineSnapshot?['sideGameChips'] as List<dynamic>?) ?? const [];
    for (final raw in sideGameChips) {
      final data = Map<String, dynamic>.from(raw as Map);
      final actionType = data['chipActionType'] as String? ?? 'chip';
      final chipQty = (data['qty'] as num?)?.toInt() ?? 0;
      final sales = (data['amountIncl'] as num?)?.toInt() ?? 0;
      if (chipQty <= 0 || sales <= 0) continue;
      final targetName = actionType == 'purchase'
          ? 'ゲームチップ購入'
          : 'ゲームチップ($actionType)';
      mergeAggregate(
        _CurrentLineAggregate(
          key: _lineInventoryKey(
            targetCategory: 'sideGameChip',
            targetId: null,
            targetName: targetName,
            operationType: 'chip',
            unitAmountIncl: sales,
            sideGameChipQtyPerPurchase: chipQty,
          ),
          targetCategory: 'sideGameChip',
          targetId: null,
          targetName: targetName,
          operationType: 'chip',
          quantityUnit: '回',
          unitAmountIncl: sales,
          itemCategory: null,
          sideGameChipQtyPerPurchase: chipQty,
          qty: 1,
          amountIncl: sales,
        ),
      );
    }

    for (final raw in adjustmentDocs) {
      final state = raw['adjustmentState'] as String? ?? '';
      if (!_adjustmentAffectsCurrentState(state)) continue;
      final lines = (raw['lines'] as List<dynamic>?) ?? const [];
      for (final rawLine in lines) {
        final line = Map<String, dynamic>.from(rawLine as Map);
        final targetCategory = line['targetCategory'] as String? ?? '';
        final targetName = line['targetName'] as String? ?? '';
        final operationType = line['operationType'] as String? ?? '';
        final qtyDelta = (line['qtyDelta'] as num?)?.toInt() ?? 0;
        final amountDelta = (line['amountInclDelta'] as num?)?.toInt() ?? 0;
        if (targetCategory.isEmpty ||
            targetName.isEmpty ||
            operationType.isEmpty ||
            (qtyDelta == 0 && amountDelta == 0)) {
          continue;
        }
        final targetId = line['targetId'] as String?;
        final menu = targetId == null ? null : menuById[targetId];
        final unitAmount = qtyDelta == 0
            ? amountDelta.abs()
            : (amountDelta.abs() ~/ qtyDelta.abs());
        final key = _lineInventoryKey(
          targetCategory: targetCategory,
          targetId: targetId,
          targetName: targetName,
          operationType: operationType,
          unitAmountIncl: unitAmount,
        );
        final existing = aggregates[key];
        if (existing == null) {
          aggregates[key] = _CurrentLineAggregate(
            key: key,
            targetCategory: targetCategory,
            targetId: targetId,
            targetName: targetName,
            operationType: operationType,
            quantityUnit: targetCategory == 'sideGameChip' ? '回' : '件',
            unitAmountIncl: unitAmount,
            itemCategory: menu?.category,
            sideGameChipQtyPerPurchase: null,
            qty: qtyDelta,
            amountIncl: amountDelta,
          );
          continue;
        }
        existing.qty += qtyDelta;
        existing.amountIncl += amountDelta;
      }
    }

    final filtered =
        aggregates.values.where((entry) {
          return entry.qty > 0 && entry.amountIncl > 0;
        }).toList()..sort((a, b) {
          final categoryCompare = a.targetCategory.compareTo(b.targetCategory);
          if (categoryCompare != 0) return categoryCompare;
          final nameCompare = a.targetName.compareTo(b.targetName);
          if (nameCompare != 0) return nameCompare;
          return a.operationType.compareTo(b.operationType);
        });

    final candidates = filtered
        .map(
          (entry) => _TargetCandidate(
            localId: entry.key,
            targetCategory: entry.targetCategory,
            targetId: entry.targetId,
            targetName: entry.targetName,
            operationType: entry.operationType,
            availableQty: entry.qty,
            unitAmountIncl: entry.unitAmountIncl,
            totalAmountIncl: entry.amountIncl,
            subtitle: _buildSubtitleForCurrentEntry(entry),
            quantityUnit: entry.quantityUnit,
          ),
        )
        .toList();

    final tournamentExistingCounts = <String, _TournamentExistingCounts>{};
    for (final entry in filtered.where(
      (entry) =>
          entry.targetCategory == 'tournament' &&
          entry.targetId != null &&
          entry.targetId!.isNotEmpty,
    )) {
      final templateId = entry.targetId!;
      final existing =
          tournamentExistingCounts[templateId] ??
          const _TournamentExistingCounts();
      tournamentExistingCounts[templateId] = switch (entry.operationType) {
        'entry' => _TournamentExistingCounts(
          entryCount: entry.qty,
          reentryCount: existing.reentryCount,
          addonCount: existing.addonCount,
        ),
        'reentry' => _TournamentExistingCounts(
          entryCount: existing.entryCount,
          reentryCount: entry.qty,
          addonCount: existing.addonCount,
        ),
        'addon' => _TournamentExistingCounts(
          entryCount: existing.entryCount,
          reentryCount: existing.reentryCount,
          addonCount: entry.qty,
        ),
        _ => existing,
      };
    }

    return _CurrentStateView(
      decreaseCandidates: candidates,
      tournamentExistingCounts: tournamentExistingCounts,
      summary: _CurrentStateSummary(
        itemLineCount: filtered
            .where((entry) => entry.targetCategory == 'item')
            .length,
        extraLineCount: filtered
            .where((entry) => entry.targetCategory == 'extra')
            .length,
        tournamentLineCount: filtered
            .where((entry) => entry.targetCategory == 'tournament')
            .length,
        sideGameChipLineCount: filtered
            .where((entry) => entry.targetCategory == 'sideGameChip')
            .length,
      ),
    );
  }

  bool _adjustmentAffectsCurrentState(String state) {
    switch (state) {
      case 'effective':
      case 'completed_by_cash_action':
      case 'completed_by_offset':
        return true;
      case 'cancelled_by_reopen':
      default:
        return false;
    }
  }

  String _lineInventoryKey({
    required String targetCategory,
    required String? targetId,
    required String targetName,
    required String operationType,
    required int unitAmountIncl,
    int? sideGameChipQtyPerPurchase,
  }) {
    if (targetCategory == 'sideGameChip' &&
        sideGameChipQtyPerPurchase != null) {
      return '$targetCategory|${targetId ?? ''}|$targetName|$operationType|$unitAmountIncl|$sideGameChipQtyPerPurchase';
    }
    return '$targetCategory|${targetId ?? ''}|$targetName|$operationType|$unitAmountIncl';
  }

  String _buildSubtitleForCurrentEntry(_CurrentLineAggregate entry) {
    switch (entry.targetCategory) {
      case 'item':
        return '商品 / ${entry.itemCategory ?? '分類なし'} / ${entry.qty}件 / ¥${entry.amountIncl}';
      case 'extra':
        return '追加料金 / ${entry.qty}件 / ¥${entry.amountIncl}';
      case 'tournament':
        return 'トーナメント / ${entry.targetName} / ${_tournamentOperationLabel(entry.operationType)} ${entry.qty}件 / ¥${entry.amountIncl}';
      case 'sideGameChip':
        if (entry.sideGameChipQtyPerPurchase != null) {
          return 'ゲームチップ購入 / ${entry.sideGameChipQtyPerPurchase}枚 x ${entry.qty}回 / ¥${entry.amountIncl}';
        }
        return 'ゲームチップ / ${entry.targetName} / ${entry.qty}回 / ¥${entry.amountIncl}';
      default:
        return '${entry.targetName} / ${entry.qty}${entry.quantityUnit} / ¥${entry.amountIncl}';
    }
  }

  String? _deriveInitialItemCategory(List<MenuItem> menus) {
    final categoryOrder =
        StoreConfigService.instance.latestData?.menuCategories ??
        kDefaultMenuCategories;
    for (final category in categoryOrder) {
      if (category == 'Chip') continue;
      if (menus.any((menu) => menu.category == category)) return category;
    }
    if (menus.isNotEmpty) return menus.first.category;
    return null;
  }

  _TargetCandidate? _findCandidate(String? candidateId) {
    if (candidateId == null) return null;
    for (final candidate in _decreaseCandidates) {
      if (candidate.localId == candidateId) return candidate;
    }
    return null;
  }

  int _lineAmountForDecreaseRow(_DecreaseSelectionRow row) {
    final candidate = _findCandidate(row.candidateId);
    final qty = row.selectedQty ?? 0;
    if (candidate == null || qty <= 0) return 0;
    return candidate.unitAmountIncl * qty;
  }

  int _lineAmountForIncreaseLine(_IncreasePreparedLine line) {
    final qty = line.selectedQty ?? 0;
    if (qty <= 0) return 0;
    return line.unitAmountIncl * qty;
  }

  int get _structuredAmountTotal {
    if (_operationKind.isDecrease) {
      return _decreaseRows.fold(
        0,
        (runningTotal, row) => runningTotal + _lineAmountForDecreaseRow(row),
      );
    }
    return _increaseLines.fold(
      0,
      (runningTotal, line) => runningTotal + _lineAmountForIncreaseLine(line),
    );
  }

  int get _manualAmount {
    final value = int.tryParse(_manualAmountCtrl.text.trim());
    return value != null && value > 0 ? value : 0;
  }

  List<int> _quantityOptions(int max) =>
      max <= 0 ? const [] : List<int>.generate(max, (index) => index + 1);

  List<int> get _increaseQuantityOptions => _quantityOptions(20);

  void _showPrioritySnackBar(String message) {
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(SnackBar(content: Text(message)));
  }

  String _tournamentOperationLabel(String operationType) {
    switch (operationType) {
      case 'entry':
        return 'entry';
      case 'reentry':
        return 'reentry';
      case 'addon':
        return 'addon';
      default:
        return operationType;
    }
  }

  String _targetDisplayName({
    required String targetCategory,
    required String targetName,
    required String operationType,
  }) {
    if (targetCategory == 'tournament') {
      return 'トナメ「$targetName」の${_tournamentOperationLabel(operationType)}';
    }
    return targetName;
  }

  List<_TargetCandidate> _availableCandidatesForRow(_DecreaseSelectionRow row) {
    final selectedIds = _decreaseRows
        .where((other) => other.rowId != row.rowId)
        .map((other) => other.candidateId)
        .whereType<String>()
        .toSet();
    return _decreaseCandidates
        .where(
          (candidate) =>
              candidate.localId == row.candidateId ||
              !selectedIds.contains(candidate.localId),
        )
        .toList();
  }

  bool get _canAddMoreDecreaseRows {
    final selectedCount = _decreaseRows
        .map((row) => row.candidateId)
        .whereType<String>()
        .toSet()
        .length;
    return selectedCount < _decreaseCandidates.length;
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'settled':
        return '会計済み';
      case 'post_settlement_pending':
        return '会計後要対応';
      case 'open':
        return '未会計';
      default:
        return status;
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'settled':
        return Colors.green;
      case 'post_settlement_pending':
        return Colors.orange;
      case 'open':
        return Colors.blueGrey;
      default:
        return Colors.grey;
    }
  }

  int _grandTotalIncl() {
    final settlementSnapshot =
        (_bill?['settlementSnapshot'] as Map<String, dynamic>?) ?? const {};
    final snapshotAmounts =
        (settlementSnapshot['amounts'] as Map<String, dynamic>?) ?? const {};
    final rootAmounts =
        (_bill?['amounts'] as Map<String, dynamic>?) ?? const {};
    return ((snapshotAmounts['grandTotalIncl'] ?? rootAmounts['grandTotalIncl'])
                as num?)
            ?.toInt() ??
        0;
  }

  /// 即時精算ドロップダウンの選択肢を構築する。
  /// 即時返金（decrease）の場合は paymentTotals に存在する手段のみ追加。
  /// 即時徴収（increase）の場合は全手段を追加。
  List<DropdownMenuItem<String>> _buildImmediateMethodItems() {
    final fmt = NumberFormat('#,###');
    final chipRate =
        StoreConfigService.instance.latestData?.sideGameChipRate ??
        kDefaultSideGameChipRate;

    final items = <DropdownMenuItem<String>>[
      const DropdownMenuItem(value: 'cash', child: Text('現金')),
      const DropdownMenuItem(
          value: 'credit_card', child: Text('クレジットカード')),
      const DropdownMenuItem(
          value: 'electronic_money', child: Text('電子マネー')),
      const DropdownMenuItem(value: 'qr', child: Text('QR')),
      const DropdownMenuItem(value: 'bank_transfer', child: Text('銀行振込')),
      const DropdownMenuItem(value: 'other', child: Text('その他')),
    ];

    if (_immediateUserId == null) return items;

    final paymentTotals =
        (_bill?['paymentTotals'] as Map<String, dynamic>?) ?? {};
    final isRefund = _operationKind == _OperationKind.decreaseRefunded;

    void addSpecial(String method) {
      // 返金の場合は paymentTotals に記録がある手段のみ
      if (isRefund) {
        final paid = (paymentTotals[method] as num?)?.toInt() ?? 0;
        if (paid <= 0) return;
      }

      final balance = _immediateUserBalance[method] ?? 0;
      String label;
      switch (method) {
        case 'sideGameChip':
          final chipYen = (balance * chipRate).toInt();
          label =
              'ゲームチップ（残高: ${fmt.format(balance)}枚 / ${fmt.format(chipYen)}円相当）';
        case 'pointA':
          label = 'ポイントA（残高: ¥${fmt.format(balance)}）';
        case 'pointB':
          label = 'ポイントB（残高: ¥${fmt.format(balance)}）';
        default:
          return;
      }
      items.add(DropdownMenuItem(value: method, child: Text(label)));
    }

    addSpecial('sideGameChip');
    addSpecial('pointA');
    addSpecial('pointB');

    return items;
  }

  String _methodLabel(String method) {
    switch (method) {
      case 'cash':
        return '現金';
      case 'credit_card':
        return 'クレジットカード';
      case 'electronic_money':
        return '電子マネー';
      case 'qr':
        return 'QR';
      case 'bank_transfer':
        return '銀行振込';
      case 'sideGameChip':
        return 'ゲームチップ';
      case 'pointA':
        return 'ポイントA';
      case 'pointB':
        return 'ポイントB';
      default:
        return method;
    }
  }

  /// 数値をカンマ区切りに整形
  String _fmtNum(int amount) => NumberFormat('#,###').format(amount);

  /// 支払い方法 + 金額を表示用文字列に変換
  /// sideGameChip / pointA / pointB は「枚数 (XXX円相当)」形式、それ以外は「ラベル ¥金額」形式
  String _formatMethodDisplay(String method, int amount) {
    final chipRate =
        StoreConfigService.instance.latestData?.sideGameChipRate ?? 10.0;

    switch (method) {
      case 'sideGameChip':
        final chipCount = (amount / chipRate).floor();
        return 'ゲームチップ $chipCount (${_fmtNum(amount)}円相当)';
      case 'pointA':
        return 'ポイントA ${_fmtNum(amount)} (${_fmtNum(amount)}円相当)';
      case 'pointB':
        return 'ポイントB ${_fmtNum(amount)} (${_fmtNum(amount)}円相当)';
      default:
        return '${_methodLabel(method)} ¥${_fmtNum(amount)}';
    }
  }

  /// paymentMethodsByCategory の key に対応する categoryBreakdown の金額を返す
  /// sideGameChip (pmbc key) → sideGameChips (breakdown key) のマッピングに対応
  int _categoryBreakdownAmount(
    String pmBcKey,
    Map<String, dynamic> categoryBreakdown,
  ) {
    final cbKey = pmBcKey == 'sideGameChip' ? 'sideGameChips' : pmBcKey;
    return (categoryBreakdown[cbKey] as num?)?.toInt() ?? 0;
  }

  String _categoryLabel(String key) {
    switch (key) {
      case 'extraCost':
        return '入店料';
      case 'sideGameChip':
        return 'ゲームチップ';
      case 'tournaments':
        return 'トーナメント';
      case 'items':
        return '商品';
      default:
        return key;
    }
  }

  Widget _buildSummaryCard(
    Map<String, dynamic>? bill,
    String name,
    String status,
  ) {
    final paymentTotals =
        (bill?['paymentTotals'] as Map<String, dynamic>?) ?? {};
    final paymentMethodsByCategory =
        (bill?['draftAccountingInput']?['paymentMethodsByCategory'] ??
                bill?['meta']?['paymentMethodsByCategory'])
            as Map<String, dynamic>?;
    final categoryBreakdown =
        (bill?['categoryBreakdown'] as Map<String, dynamic>?) ?? {};

    // 支払い手段別合計（金額 > 0 のもの）
    final paymentEntries = paymentTotals.entries
        .where((e) => ((e.value as num?)?.toInt() ?? 0) > 0)
        .toList();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    name,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: _statusColor(status).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    _statusLabel(status),
                    style: TextStyle(
                      color: _statusColor(status),
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 16,
              runSpacing: 8,
              children: [
                Text('営業日: ${bill?['businessDate'] ?? '—'}'),
                Text('会計金額: ¥${_grandTotalIncl()}'),
              ],
            ),
            if (_currentStateSummary != null) ...[
              const SizedBox(height: 12),
              // サマリカード（折りたたみ）
              GestureDetector(
                onTap: () => setState(() => _summaryExpanded = !_summaryExpanded),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.indigo[50],
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.indigo.shade100),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 折りたたみヘッダ
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // カテゴリ概要
                                Text(
                                  'サマリ',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: Colors.indigo[700],
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '商品 ${_currentStateSummary?.itemLineCount ?? 0}件 / '
                                  '追加料金 ${_currentStateSummary?.extraLineCount ?? 0}件 / '
                                  'トナメ ${_currentStateSummary?.tournamentLineCount ?? 0}件 / '
                                  'チップ ${_currentStateSummary?.sideGameChipLineCount ?? 0}件',
                                  style: const TextStyle(fontSize: 12),
                                ),
                                if (paymentEntries.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    paymentEntries
                                        .map(
                                          (e) => _formatMethodDisplay(
                                            e.key,
                                            (e.value as num).toInt(),
                                          ),
                                        )
                                        .join(' / '),
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          Icon(
                            _summaryExpanded
                                ? Icons.expand_less
                                : Icons.expand_more,
                            color: Colors.indigo[400],
                          ),
                        ],
                      ),
                      // 展開部分：カテゴリ別支払い内訳
                      if (_summaryExpanded) ...[
                        const Divider(height: 16),
                        const Text(
                          'カテゴリ別支払い内訳',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: Colors.black54,
                          ),
                        ),
                        const SizedBox(height: 6),
                        if (paymentMethodsByCategory == null ||
                            paymentMethodsByCategory.isEmpty)
                          const Text(
                            '支払い詳細は会計後に自動生成されます',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.black54,
                            ),
                          )
                        else
                          for (final entry in paymentMethodsByCategory.entries)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  SizedBox(
                                    width: 80,
                                    child: Text(
                                      _categoryLabel(entry.key),
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ),
                                  Expanded(
                                    child: Text(
                                      _formatPaymentMethodValue(
                                        entry.value,
                                        categoryAmount:
                                            _categoryBreakdownAmount(
                                              entry.key,
                                              categoryBreakdown,
                                            ),
                                      ),
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: 8),
            const Text(
              'このページでは、1件の伝票に対して減額・増額の会計後操作を行います。主語・対象・数量・金額を確認してから実行してください。',
              style: TextStyle(fontSize: 12, color: Colors.black54),
            ),
          ],
        ),
      ),
    );
  }

  /// paymentMethodsByCategory の値（文字列 or List）を表示用テキストに変換
  /// [categoryAmount]: string 形式の場合にカテゴリ全額として使用する金額
  String _formatPaymentMethodValue(dynamic value, {int categoryAmount = 0}) {
    if (value is String) {
      return _formatMethodDisplay(value, categoryAmount);
    }
    if (value is List) {
      return value.map((item) {
        if (item is Map) {
          final method = item['method'] as String? ?? '';
          final amount = (item['amount'] as num?)?.toInt() ?? 0;
          return _formatMethodDisplay(method, amount);
        }
        return item.toString();
      }).join('\n');
    }
    return value?.toString() ?? '—';
  }

  List<String> _operationPreviewLines() {
    if (_inputMode == _InputMode.manual) {
      final amount = _manualAmount;
      final action = _operationKind.isDecrease ? '減額' : '増額';
      return ['調整用追加料金を ¥$amount で $action します。'];
    }

    if (_operationKind.isDecrease) {
      return _decreaseRows.map((row) {
        final candidate = _findCandidate(row.candidateId);
        if (candidate == null) {
          return '対象未選択の明細があります。';
        }
        final qty = row.selectedQty ?? 0;
        final amount = _lineAmountForDecreaseRow(row);
        final targetLabel = _targetDisplayName(
          targetCategory: candidate.targetCategory,
          targetName: candidate.targetName,
          operationType: candidate.operationType,
        );
        return '$targetLabel を $qty${candidate.quantityUnit}、¥$amount で ${_operationKind.submitVerb}。';
      }).toList();
    }

    return _increaseLines.map((line) {
      final qty = line.selectedQty ?? 0;
      final amount = _lineAmountForIncreaseLine(line);
      final targetLabel = _targetDisplayName(
        targetCategory: line.targetCategory,
        targetName: line.targetName,
        operationType: line.operationType,
      );
      return '$targetLabel を $qty${line.quantityUnit}、¥$amount で ${_operationKind.submitVerb}。';
    }).toList();
  }

  void _addEmptyDecreaseRow() {
    if (!_canAddMoreDecreaseRows) {
      _showPrioritySnackBar('追加できる既存明細はもうありません');
      return;
    }
    setState(() {
      _decreaseRows.add(
        _DecreaseSelectionRow(
          rowId: 'decrease-${DateTime.now().microsecondsSinceEpoch}',
        ),
      );
    });
  }

  void _setAllDecreaseRows() {
    final rows = _decreaseCandidates
        .map(
          (candidate) => _DecreaseSelectionRow(
            rowId: 'decrease-${candidate.localId}',
            candidateId: candidate.localId,
            selectedQty: candidate.availableQty,
          ),
        )
        .toList();
    setState(() {
      _decreaseRows
        ..clear()
        ..addAll(rows);
    });
  }

  void _removeDecreaseRow(_DecreaseSelectionRow row) {
    setState(() {
      _decreaseRows.removeWhere((item) => item.rowId == row.rowId);
    });
  }

  void _addIncreaseLine({
    required String lineId,
    required String targetCategory,
    required String? targetId,
    required String targetName,
    required String operationType,
    required int unitAmountIncl,
    required String subtitle,
    required String quantityUnit,
  }) {
    final exists = _increaseLines.any((line) => line.lineId == lineId);
    if (exists) {
      _showPrioritySnackBar('この明細はすでに追加済みです');
      return;
    }
    setState(() {
      _increaseLines.add(
        _IncreasePreparedLine(
          lineId: lineId,
          targetCategory: targetCategory,
          targetId: targetId,
          targetName: targetName,
          operationType: operationType,
          unitAmountIncl: unitAmountIncl,
          subtitle: subtitle,
          quantityUnit: quantityUnit,
        ),
      );
    });
    final displayName = _targetDisplayName(
      targetCategory: targetCategory,
      targetName: targetName,
      operationType: operationType,
    );
    _showPrioritySnackBar('$displayName を明細に追加しました');
  }

  void _removeIncreaseLine(_IncreasePreparedLine line) {
    setState(() {
      _increaseLines.removeWhere((item) => item.lineId == line.lineId);
    });
    final displayName = _targetDisplayName(
      targetCategory: line.targetCategory,
      targetName: line.targetName,
      operationType: line.operationType,
    );
    _showPrioritySnackBar('$displayName を明細から削除しました');
  }

  Future<void> _submitAdjustment() async {
    final note = _noteCtrl.text.trim();
    final sign = _operationKind.isDecrease ? -1 : 1;
    final lines = <Map<String, dynamic>>[];
    var totalAmount = 0;

    if (_inputMode == _InputMode.manual) {
      final amount = _manualAmount;
      if (amount <= 0) {
        setState(() => _error = '追加料金の金額を 1 以上で入力してください');
        return;
      }
      totalAmount = amount;
      lines.add({
        'targetCategory': 'extra',
        'targetId': null,
        'targetName': '調整用追加料金',
        'operationType': 'extra',
        'qtyDelta': sign,
        'amountInclDelta': sign * amount,
        'note': note,
      });
    } else if (_operationKind.isDecrease) {
      if (_decreaseRows.isEmpty) {
        setState(() => _error = '減額対象の明細を追加してください');
        return;
      }
      final seen = <String>{};
      for (final row in _decreaseRows) {
        final candidate = _findCandidate(row.candidateId);
        if (candidate == null) {
          setState(() => _error = '未選択の既存明細があります');
          return;
        }
        if (!seen.add(candidate.localId)) {
          setState(() => _error = '同じ既存明細を重複して選択しています');
          return;
        }
        final qty = row.selectedQty ?? 0;
        if (qty <= 0) {
          setState(() => _error = '${candidate.targetName} の数量を選択してください');
          return;
        }
        if (qty > candidate.availableQty) {
          setState(
            () => _error =
                '${candidate.targetName} は元の ${candidate.availableQty}${candidate.quantityUnit} を超えて減額できません',
          );
          return;
        }
        final amount = candidate.unitAmountIncl * qty;
        totalAmount += amount;
        lines.add({
          'targetCategory': candidate.targetCategory,
          'targetId': candidate.targetId,
          'targetName': candidate.targetName,
          'operationType': candidate.operationType,
          'qtyDelta': -qty,
          'amountInclDelta': -amount,
          'note': note,
        });
      }
    } else {
      if (_increaseLines.isEmpty) {
        setState(() => _error = '増額対象の明細を追加してください');
        return;
      }
      for (final line in _increaseLines) {
        final qty = line.selectedQty ?? 0;
        if (qty <= 0) {
          setState(() => _error = '${line.targetName} の数量を選択してください');
          return;
        }
        final amount = line.unitAmountIncl * qty;
        totalAmount += amount;
        lines.add({
          'targetCategory': line.targetCategory,
          'targetId': line.targetId,
          'targetName': line.targetName,
          'operationType': line.operationType,
          'qtyDelta': qty,
          'amountInclDelta': amount,
          'note': note,
        });
      }
    }

    if (totalAmount <= 0) {
      setState(() => _error = '調整金額が 0 円になっています');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final payload = <String, dynamic>{
        'billId': widget.billId,
        'clientNonce': DateTime.now().microsecondsSinceEpoch.toString(),
        'adjustmentType': _operationKind.adjustmentType,
        'adjustmentAmountIncl': totalAmount,
        'note': note,
        'lines': lines,
        if (_operationKind.isImmediate)
          'immediateCashAction': {'method': _immediateMethod},
      };

      final result = await FunctionsClient.instance
          .httpsCallable('createPostSettlementAdjustment')
          .call(payload);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '会計後操作を記録しました（adjustmentId: ${result.data['adjustmentId'] ?? '—'}）',
          ),
        ),
      );
      Navigator.of(context).pop(true);
    } on FirebaseFunctionsException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '会計後操作に失敗しました: [${e.code}] ${e.message ?? '—'}';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '会計後操作に失敗しました: $e';
      });
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  List<String> get _itemCategories {
    final ordered =
        StoreConfigService.instance.latestData?.menuCategories ??
        kDefaultMenuCategories;
    final existingCategories = _itemMenuOptions
        .map((menu) => menu.category)
        .toSet();
    final result = <String>[];
    for (final category in ordered) {
      if (category == 'Chip') continue;
      if (existingCategories.contains(category)) {
        result.add(category);
      }
    }
    for (final category in existingCategories) {
      if (!result.contains(category)) {
        result.add(category);
      }
    }
    return result;
  }

  List<MenuItem> get _visibleItemMenuOptions {
    final category = _selectedItemCategory;
    if (category == null) return const [];
    return _itemMenuOptions.where((menu) => menu.category == category).toList();
  }

  String _formatTournamentStatus(String status) {
    switch (status) {
      case 'running':
        return '実施中';
      case 'scheduled':
        return '予定';
      case 'registered':
        return 'レジスト済';
      case 'paused':
        return '一時停止';
      case 'completed':
        return '終了';
      default:
        return status;
    }
  }

  String _formatStartAt(Timestamp? timestamp) {
    if (timestamp == null) return '開始時刻未設定';
    final dt = timestamp.toDate();
    return DateFormat('M/d HH:mm').format(dt);
  }

  @override
  Widget build(BuildContext context) {
    final bill = _bill;
    final status = bill == null ? '' : (bill['status'] as String? ?? '');
    final party = bill == null
        ? const <String, dynamic>{}
        : ((bill['party'] as Map<String, dynamic>?) ?? const {});
    final name = party['pokerName'] as String? ?? '名前未設定';

    return Scaffold(
      appBar: AppBar(
        title: const Text('会計後操作'),
        backgroundColor: Colors.indigo[700],
        foregroundColor: Colors.white,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null && bill == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error!, style: const TextStyle(color: Colors.red)),
                    const SizedBox(height: 12),
                    ElevatedButton(
                      onPressed: _load,
                      child: const Text('再読み込み'),
                    ),
                  ],
                ),
              ),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildSummaryCard(bill, name, status),
                  const SizedBox(height: 16),
                  Text('操作を選択', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final kind in _OperationKind.values)
                        ChoiceChip(
                          label: Text(kind.label),
                          selected: _operationKind == kind,
                          onSelected: _submitting
                              ? null
                              : (selected) {
                                  if (!selected) return;
                                  setState(() {
                                    _operationKind = kind;
                                  });
                                },
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  _buildOperationBody(),
                  if (_error != null && bill != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: const TextStyle(color: Colors.red)),
                  ],
                ],
              ),
            ),
    );
  }

  Widget _buildOperationBody() {
    final structuredLabel = _operationKind.isDecrease
        ? '既存明細から選ぶ'
        : 'メニュー・トナメから追加する';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '対象明細の組み立て',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                SegmentedButton<_InputMode>(
                  segments: [
                    ButtonSegment(
                      value: _InputMode.structured,
                      label: Text(structuredLabel),
                    ),
                    ButtonSegment(
                      value: _InputMode.manual,
                      label: Text(
                        _operationKind.isDecrease ? '返金内容を手入力' : '追加料金を手入力',
                      ),
                    ),
                  ],
                  selected: {_inputMode},
                  onSelectionChanged: _submitting
                      ? null
                      : (selection) {
                          setState(() {
                            _inputMode = selection.first;
                          });
                        },
                ),
                const SizedBox(height: 12),
                if (_inputMode == _InputMode.manual)
                  _buildManualInputs()
                else if (_operationKind.isDecrease)
                  _buildDecreaseStructuredInputs()
                else
                  _buildIncreaseStructuredInputs(),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '操作メモと精算方法',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                if (_operationKind.isImmediate) ...[
                  DropdownButtonFormField<String>(
                    value: _immediateMethod,
                    decoration: const InputDecoration(labelText: '即時精算の方法'),
                    items: _buildImmediateMethodItems(),
                    onChanged: _submitting
                        ? null
                        : (value) {
                            if (value == null) return;
                            setState(() {
                              _immediateMethod = value;
                            });
                          },
                  ),
                  const SizedBox(height: 12),
                ],
                TextField(
                  controller: _noteCtrl,
                  enabled: !_submitting,
                  decoration: const InputDecoration(
                    labelText: 'メモ',
                    helperText: '不足 / 誤請求 / 追加注文など、後で読める理由を 1 つ残します',
                  ),
                  maxLines: 2,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          color: Colors.indigo[50],
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '確認用の文章',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  '合計金額: ¥${_inputMode == _InputMode.manual ? _manualAmount : _structuredAmountTotal}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                for (final line in _operationPreviewLines())
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Text('・$line', style: const TextStyle(fontSize: 14)),
                  ),
                if (_operationKind.isImmediate)
                  Text(
                    '・即時精算の方法: ${_methodLabel(_immediateMethod)}',
                    style: const TextStyle(fontSize: 14),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton.icon(
            onPressed: _submitting ? null : _submitAdjustment,
            icon: _submitting
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.playlist_add_check),
            label: Text(_operationKind.label),
          ),
        ),
      ],
    );
  }

  Widget _buildManualInputs() {
    final helper = _operationKind.isDecrease
        ? '例外対応として、返金内容を手入力します。対象名や種別は固定で記録します。'
        : '例外対応として、追加料金を増額します。対象名や種別は固定で記録します。';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          helper,
          style: const TextStyle(fontSize: 12, color: Colors.black54),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _manualAmountCtrl,
          enabled: !_submitting,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: '追加料金の金額（税込）',
            helperText: '数量入力は不要です。入力した金額がそのまま 1 明細になります。',
          ),
          onChanged: (_) => setState(() {}),
        ),
      ],
    );
  }

  Widget _buildDecreaseStructuredInputs() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '既存の購入明細から、減額したい行を複数追加できます。数量は右側の候補から選択します。',
          style: TextStyle(fontSize: 12, color: Colors.black54),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: _submitting ? null : _addEmptyDecreaseRow,
              icon: const Icon(Icons.add),
              label: const Text('対象明細を追加'),
            ),
            OutlinedButton.icon(
              onPressed: _submitting || _decreaseCandidates.isEmpty
                  ? null
                  : _setAllDecreaseRows,
              icon: const Icon(Icons.library_add_check),
              label: const Text('すべての明細を対象にする'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (_decreaseRows.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.grey[50],
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey.shade300),
            ),
            child: const Text(
              'まだ減額対象の明細は追加されていません。まずは「対象明細を追加」または「すべての明細を対象にする」を押してください。',
            ),
          ),
        for (final row in _decreaseRows) ...[
          _buildDecreaseRow(row),
          const SizedBox(height: 12),
        ],
      ],
    );
  }

  Widget _buildDecreaseRow(_DecreaseSelectionRow row) {
    final candidate = _findCandidate(row.candidateId);
    final amount = _lineAmountForDecreaseRow(row);
    final availableEntries = _availableCandidatesForRow(row);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                flex: 5,
                child: DropdownButtonFormField<String>(
                  value: row.candidateId,
                  decoration: const InputDecoration(labelText: '既存明細'),
                  hint: const Text('選択してください'),
                  isExpanded: true,
                  items: [
                    for (final entry in availableEntries)
                      DropdownMenuItem(
                        value: entry.localId,
                        child: Text('${entry.targetName} / ${entry.subtitle}'),
                      ),
                  ],
                  onChanged: _submitting
                      ? null
                      : (value) {
                          setState(() {
                            row.candidateId = value;
                            row.selectedQty = null;
                          });
                        },
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 92,
                child: DropdownButtonFormField<int>(
                  value: row.selectedQty,
                  decoration: InputDecoration(
                    labelText: '数量',
                    hintText: candidate == null ? '' : '選択',
                    helperText: candidate == null
                        ? null
                        : '/${candidate.availableQty}${candidate.quantityUnit}',
                  ),
                  items: candidate == null
                      ? const []
                      : [
                          for (final qty in _quantityOptions(
                            candidate.availableQty,
                          ))
                            DropdownMenuItem(
                              value: qty,
                              child: Text(qty.toString()),
                            ),
                        ],
                  onChanged: _submitting || candidate == null
                      ? null
                      : (value) {
                          setState(() {
                            row.selectedQty = value;
                          });
                        },
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 110,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Text(
                      '金額',
                      style: TextStyle(fontSize: 12, color: Colors.black54),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      amount > 0 ? '¥$amount' : '¥—',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: _submitting ? null : () => _removeDecreaseRow(row),
                icon: const Icon(Icons.delete_outline),
                tooltip: 'この明細を外す',
              ),
            ],
          ),
          if (candidate != null) ...[
            const SizedBox(height: 8),
            Text(
              candidate.subtitle,
              style: const TextStyle(fontSize: 12, color: Colors.black54),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildIncreaseStructuredInputs() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '増額では、今回追加したい明細をメニュー・当日トナメから選んで組み立てます。既存明細の一覧は表示しません。',
          style: TextStyle(fontSize: 12, color: Colors.black54),
        ),
        const SizedBox(height: 12),
        SegmentedButton<_IncreaseSourceKind>(
          segments: const [
            ButtonSegment(value: _IncreaseSourceKind.item, label: Text('item')),
            ButtonSegment(
              value: _IncreaseSourceKind.tournament,
              label: Text('tournament'),
            ),
            ButtonSegment(
              value: _IncreaseSourceKind.sideGameChip,
              label: Text('sideGameChip'),
            ),
          ],
          selected: {_increaseSourceKind},
          onSelectionChanged: _submitting
              ? null
              : (selection) {
                  setState(() {
                    _increaseSourceKind = selection.first;
                  });
                },
        ),
        const SizedBox(height: 12),
        _buildIncreaseCatalog(),
        const SizedBox(height: 16),
        const Text(
          '追加予定の明細',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        if (_increaseLines.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.grey[50],
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey.shade300),
            ),
            child: const Text('まだ追加予定の明細はありません。上の一覧から追加してください。'),
          ),
        for (final line in _increaseLines) ...[
          _buildIncreaseLineCard(line),
          const SizedBox(height: 12),
        ],
      ],
    );
  }

  Widget _buildIncreaseCatalog() {
    switch (_increaseSourceKind) {
      case _IncreaseSourceKind.item:
        return _buildItemCatalog();
      case _IncreaseSourceKind.tournament:
        return _buildTournamentCatalog();
      case _IncreaseSourceKind.sideGameChip:
        return _buildSideGameChipCatalog();
    }
  }

  Widget _buildItemCatalog() {
    final categories = _itemCategories;
    if (categories.isEmpty || _visibleItemMenuOptions.isEmpty) {
      return const Text(
        '表示できる item メニューがありません。getMenuItems の結果を確認してください。',
        style: TextStyle(color: Colors.black54),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('カテゴリー', style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final category in categories) ...[
                ChoiceChip(
                  label: Text(category),
                  selected: _selectedItemCategory == category,
                  onSelected: _submitting
                      ? null
                      : (selected) {
                          if (!selected) return;
                          setState(() {
                            _selectedItemCategory = category;
                          });
                        },
                ),
                const SizedBox(width: 8),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        for (final menu in _visibleItemMenuOptions) ...[
          Card(
            child: ListTile(
              title: Text(menu.name),
              subtitle: Text('${menu.category} / ¥${menu.price}'),
              trailing: FilledButton.tonalIcon(
                onPressed: _submitting
                    ? null
                    : () => _addIncreaseLine(
                        lineId: 'item:${menu.id}:sale',
                        targetCategory: 'item',
                        targetId: menu.id,
                        targetName: menu.name,
                        operationType: 'sale',
                        unitAmountIncl: menu.price,
                        subtitle: 'item / ${menu.category} / 単価 ¥${menu.price}',
                        quantityUnit: '件',
                      ),
                icon: const Icon(Icons.add),
                label: const Text('追加'),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildSideGameChipCatalog() {
    if (_sideGameChipMenuOptions.isEmpty) {
      return const Text(
        'Chip カテゴリーのメニューがありません。メニュー設定を確認してください。',
        style: TextStyle(color: Colors.black54),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'ゲームチップの追加候補',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        for (final menu in _sideGameChipMenuOptions) ...[
          Card(
            child: ListTile(
              title: Text(menu.name),
              subtitle: Text('Chip / ¥${menu.price}'),
              trailing: FilledButton.tonalIcon(
                onPressed: _submitting
                    ? null
                    : () => _addIncreaseLine(
                        lineId: 'sideGameChip:${menu.id}:chip',
                        targetCategory: 'sideGameChip',
                        targetId: menu.id,
                        targetName: menu.name,
                        operationType: 'chip',
                        unitAmountIncl: menu.price,
                        subtitle: 'sideGameChip / 単価 ¥${menu.price}',
                        quantityUnit: '件',
                      ),
                icon: const Icon(Icons.add),
                label: const Text('追加'),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildTournamentCatalog() {
    if (_tournamentOptions.isEmpty) {
      return const Text(
        'この営業日に対象トーナメントがありません。',
        style: TextStyle(color: Colors.black54),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '当日開催・開催済みトーナメント',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        for (final tournament in _tournamentOptions) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          tournament.name,
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),
                      Text(
                        '${_formatStartAt(tournament.startAt)} / ${_formatTournamentStatus(tournament.status)}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: Colors.black54,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '現在の bill 内回数: entry ${tournament.existingEntryCount} / reentry ${tournament.existingReentryCount} / addon ${tournament.existingAddonCount}',
                    style: const TextStyle(fontSize: 12),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (tournament.entryFee > 0)
                        FilledButton.tonal(
                          onPressed: _submitting
                              ? null
                              : () => _addIncreaseLine(
                                  lineId:
                                      'tournament:${tournament.templateId}:entry',
                                  targetCategory: 'tournament',
                                  targetId: tournament.templateId,
                                  targetName: tournament.name,
                                  operationType: 'entry',
                                  unitAmountIncl: tournament.entryFee,
                                  subtitle:
                                      'tournament / entry / 既存 ${tournament.existingEntryCount}件 / 単価 ¥${tournament.entryFee}',
                                  quantityUnit: '件',
                                ),
                          child: Text('entry を追加 (¥${tournament.entryFee})'),
                        ),
                      if (tournament.reentryFee > 0)
                        FilledButton.tonal(
                          onPressed: _submitting
                              ? null
                              : () => _addIncreaseLine(
                                  lineId:
                                      'tournament:${tournament.templateId}:reentry',
                                  targetCategory: 'tournament',
                                  targetId: tournament.templateId,
                                  targetName: tournament.name,
                                  operationType: 'reentry',
                                  unitAmountIncl: tournament.reentryFee,
                                  subtitle:
                                      'tournament / reentry / 既存 ${tournament.existingReentryCount}件 / 単価 ¥${tournament.reentryFee}',
                                  quantityUnit: '件',
                                ),
                          child: Text(
                            'reentry を追加 (¥${tournament.reentryFee})',
                          ),
                        ),
                      if (tournament.addonFee > 0)
                        FilledButton.tonal(
                          onPressed: _submitting
                              ? null
                              : () => _addIncreaseLine(
                                  lineId:
                                      'tournament:${tournament.templateId}:addon',
                                  targetCategory: 'tournament',
                                  targetId: tournament.templateId,
                                  targetName: tournament.name,
                                  operationType: 'addon',
                                  unitAmountIncl: tournament.addonFee,
                                  subtitle:
                                      'tournament / addon / 既存 ${tournament.existingAddonCount}件 / 単価 ¥${tournament.addonFee}',
                                  quantityUnit: '件',
                                ),
                          child: Text('addon を追加 (¥${tournament.addonFee})'),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildIncreaseLineCard(_IncreasePreparedLine line) {
    final amount = _lineAmountForIncreaseLine(line);
    final displayName = _targetDisplayName(
      targetCategory: line.targetCategory,
      targetName: line.targetName,
      operationType: line.operationType,
    );
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayName,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      line.subtitle,
                      style: const TextStyle(
                        fontSize: 12,
                        color: Colors.black54,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 92,
                child: DropdownButtonFormField<int>(
                  value: line.selectedQty,
                  decoration: InputDecoration(
                    labelText: '数量',
                    helperText: line.quantityUnit,
                  ),
                  items: [
                    for (final qty in _increaseQuantityOptions)
                      DropdownMenuItem(value: qty, child: Text(qty.toString())),
                  ],
                  onChanged: _submitting
                      ? null
                      : (value) {
                          setState(() {
                            line.selectedQty = value;
                          });
                        },
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 110,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Text(
                      '金額',
                      style: TextStyle(fontSize: 12, color: Colors.black54),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      amount > 0 ? '¥$amount' : '¥—',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: _submitting ? null : () => _removeIncreaseLine(line),
                icon: const Icon(Icons.delete_outline),
                tooltip: 'この明細を外す',
              ),
            ],
          ),
        ],
      ),
    );
  }
}
