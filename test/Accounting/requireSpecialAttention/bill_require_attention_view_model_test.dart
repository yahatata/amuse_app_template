import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/Accounting/requireSpecialAttention/billRequireAttentionViewModel.dart';

void main() {
  group('classifyBill', () {
    test('status=open + closeSummary.unresolved=true → carryoverUnsettled', () {
      final bill = {
        'status': 'open',
        'closeSummary': {'unresolved': true},
      };
      expect(classifyBill(bill), BillCardType.carryoverUnsettled);
    });

    test('status=open + closeSummary.unresolved=false → null', () {
      final bill = {
        'status': 'open',
        'closeSummary': {'unresolved': false},
      };
      expect(classifyBill(bill), isNull);
    });

    test('status=open + closeSummary 不在 → null', () {
      final bill = {'status': 'open'};
      expect(classifyBill(bill), isNull);
    });

    test('status=settling + closeSummary.unresolved=true → null（settling は除外）', () {
      final bill = {
        'status': 'settling',
        'closeSummary': {'unresolved': true},
      };
      expect(classifyBill(bill), isNull);
    });

    test('status=post_settlement_pending + collection + incl>0 → postSettlementCollectionPending', () {
      final bill = {
        'status': 'post_settlement_pending',
        'postSettlementState': {
          'requiredActionType': 'collection',
          'requiredActionIncl': 1000,
        },
      };
      expect(classifyBill(bill), BillCardType.postSettlementCollectionPending);
    });

    test('status=post_settlement_pending + refund + incl>0 → postSettlementRefundPending', () {
      final bill = {
        'status': 'post_settlement_pending',
        'postSettlementState': {
          'requiredActionType': 'refund',
          'requiredActionIncl': 500,
        },
      };
      expect(classifyBill(bill), BillCardType.postSettlementRefundPending);
    });

    test('status=post_settlement_pending + incl=0 → null', () {
      final bill = {
        'status': 'post_settlement_pending',
        'postSettlementState': {
          'requiredActionType': 'collection',
          'requiredActionIncl': 0,
        },
      };
      expect(classifyBill(bill), isNull);
    });

    test('status=post_settlement_pending + requiredActionType=none → null', () {
      final bill = {
        'status': 'post_settlement_pending',
        'postSettlementState': {
          'requiredActionType': 'none',
          'requiredActionIncl': 0,
        },
      };
      expect(classifyBill(bill), isNull);
    });

    test('status=settled → null', () {
      expect(classifyBill({'status': 'settled'}), isNull);
    });

    test('status=voided → null', () {
      expect(classifyBill({'status': 'voided'}), isNull);
    });

    test('status=post_settlement_resolved → null', () {
      expect(classifyBill({'status': 'post_settlement_resolved'}), isNull);
    });

    test('status=post_settlement_pending + postSettlementState 不在 → null', () {
      expect(classifyBill({'status': 'post_settlement_pending'}), isNull);
    });

    test('1 つの bill が複数 cardType に分類されない（status=open を優先）', () {
      // 不正だが防御的に: status=open のときは postSettlementState は無視される
      final bill = {
        'status': 'open',
        'closeSummary': {'unresolved': true},
        'postSettlementState': {
          'requiredActionType': 'collection',
          'requiredActionIncl': 1000,
        },
      };
      expect(classifyBill(bill), BillCardType.carryoverUnsettled);
    });
  });

  group('computeSortDate', () {
    test('carryoverUnsettled: closedBusinessDate 有 → closedBusinessDate', () {
      final bill = {
        'businessDate': '2026-05-01',
        'closeSummary': {'closedBusinessDate': '2026-05-08'},
      };
      expect(
        computeSortDate(BillCardType.carryoverUnsettled, bill),
        '2026-05-08',
      );
    });

    test('carryoverUnsettled: closedBusinessDate 無 → businessDate fallback', () {
      final bill = {
        'businessDate': '2026-05-01',
        'closeSummary': {'unresolved': true},
      };
      expect(
        computeSortDate(BillCardType.carryoverUnsettled, bill),
        '2026-05-01',
      );
    });

    test('postSettlementCollectionPending: businessDate', () {
      final bill = {'businessDate': '2026-05-01'};
      expect(
        computeSortDate(BillCardType.postSettlementCollectionPending, bill),
        '2026-05-01',
      );
    });

    test('postSettlementRefundPending: businessDate', () {
      final bill = {'businessDate': '2026-05-01'};
      expect(
        computeSortDate(BillCardType.postSettlementRefundPending, bill),
        '2026-05-01',
      );
    });

    test('businessDate 不在 → 空文字', () {
      expect(computeSortDate(BillCardType.postSettlementRefundPending, {}), '');
    });
  });

  group('computeDisplayAmountIncl', () {
    test('carryoverUnsettled: closeSummary.displayAmountAtMark', () {
      final bill = {
        'closeSummary': {'displayAmountAtMark': 2500},
      };
      expect(
        computeDisplayAmountIncl(BillCardType.carryoverUnsettled, bill),
        2500,
      );
    });

    test('postSettlementCollectionPending: requiredActionIncl', () {
      final bill = {
        'postSettlementState': {'requiredActionIncl': 1000},
      };
      expect(
        computeDisplayAmountIncl(
          BillCardType.postSettlementCollectionPending,
          bill,
        ),
        1000,
      );
    });

    test('postSettlementRefundPending: requiredActionIncl', () {
      final bill = {
        'postSettlementState': {'requiredActionIncl': 800},
      };
      expect(
        computeDisplayAmountIncl(
          BillCardType.postSettlementRefundPending,
          bill,
        ),
        800,
      );
    });

    test('field 不在 → 0', () {
      expect(
        computeDisplayAmountIncl(BillCardType.carryoverUnsettled, {}),
        0,
      );
      expect(
        computeDisplayAmountIncl(BillCardType.postSettlementRefundPending, {}),
        0,
      );
    });
  });

  group('computeDisplayLabel', () {
    test('全 cardType のラベル', () {
      expect(computeDisplayLabel(BillCardType.carryoverUnsettled), '未会計');
      expect(
        computeDisplayLabel(BillCardType.postSettlementCollectionPending),
        '追加徴収',
      );
      expect(
        computeDisplayLabel(BillCardType.postSettlementRefundPending),
        '要返金',
      );
    });
  });

  group('computePrimaryAction', () {
    test('carryoverUnsettled → resumeAccounting', () {
      expect(
        computePrimaryAction(BillCardType.carryoverUnsettled),
        PrimaryActionType.resumeAccounting,
      );
    });

    test('postSettlementCollectionPending → collect', () {
      expect(
        computePrimaryAction(BillCardType.postSettlementCollectionPending),
        PrimaryActionType.collect,
      );
    });

    test('postSettlementRefundPending → refund', () {
      expect(
        computePrimaryAction(BillCardType.postSettlementRefundPending),
        PrimaryActionType.refund,
      );
    });
  });

  group('primaryActionLabel', () {
    test('resumeAccounting → 会計を再開する', () {
      expect(primaryActionLabel(PrimaryActionType.resumeAccounting), '会計を再開する');
    });

    test('collect → 徴収する', () {
      expect(primaryActionLabel(PrimaryActionType.collect), '徴収する');
    });

    test('refund → 返金する', () {
      expect(primaryActionLabel(PrimaryActionType.refund), '返金する');
    });
  });

  group('BillRequireAttentionViewModel.fromBill', () {
    test('classifyBill が null → null を返す', () {
      final vm = BillRequireAttentionViewModel.fromBill('B1', {
        'status': 'settled',
      });
      expect(vm, isNull);
    });

    test('carryoverUnsettled の view model 構築', () {
      final bill = {
        'status': 'open',
        'businessDate': '2026-05-01',
        'closeSummary': {
          'unresolved': true,
          'closedBusinessDate': '2026-05-08',
          'displayAmountAtMark': 3500,
        },
        'party': {'userId': 'u1', 'pokerName': 'TestUser'},
      };
      final vm = BillRequireAttentionViewModel.fromBill('B1', bill);
      expect(vm, isNotNull);
      expect(vm!.billId, 'B1');
      expect(vm.cardType, BillCardType.carryoverUnsettled);
      expect(vm.displayLabel, '未会計');
      expect(vm.businessDate, '2026-05-01');
      expect(vm.displayTitle, 'TestUser');
      expect(vm.displayAmountIncl, 3500);
      expect(vm.primaryActionType, PrimaryActionType.resumeAccounting);
      expect(vm.sortDate, '2026-05-08');
      expect(vm.userId, 'u1');
      expect(vm.userDisplayName, 'TestUser');
    });

    test('postSettlementCollectionPending の view model 構築', () {
      final bill = {
        'status': 'post_settlement_pending',
        'businessDate': '2026-05-09',
        'postSettlementState': {
          'requiredActionType': 'collection',
          'requiredActionIncl': 1500,
        },
        'party': {'userId': 'u2', 'pokerName': 'CollectUser'},
      };
      final vm = BillRequireAttentionViewModel.fromBill('B2', bill);
      expect(vm, isNotNull);
      expect(vm!.cardType, BillCardType.postSettlementCollectionPending);
      expect(vm.displayLabel, '追加徴収');
      expect(vm.displayAmountIncl, 1500);
      expect(vm.primaryActionType, PrimaryActionType.collect);
      expect(vm.sortDate, '2026-05-09');
    });

    test('postSettlementRefundPending の view model 構築', () {
      final bill = {
        'status': 'post_settlement_pending',
        'businessDate': '2026-05-09',
        'postSettlementState': {
          'requiredActionType': 'refund',
          'requiredActionIncl': 800,
        },
        'party': {'userId': 'u3', 'pokerName': 'RefundUser'},
      };
      final vm = BillRequireAttentionViewModel.fromBill('B3', bill);
      expect(vm, isNotNull);
      expect(vm!.cardType, BillCardType.postSettlementRefundPending);
      expect(vm.displayLabel, '要返金');
      expect(vm.displayAmountIncl, 800);
      expect(vm.primaryActionType, PrimaryActionType.refund);
    });

    test('pokerName 不在 → displayTitle に billId、userDisplayName に「—」', () {
      final bill = {
        'status': 'open',
        'businessDate': '2026-05-01',
        'closeSummary': {'unresolved': true, 'displayAmountAtMark': 1000},
        'party': {'userId': 'u4'},
      };
      final vm = BillRequireAttentionViewModel.fromBill('B4', bill);
      expect(vm, isNotNull);
      expect(vm!.displayTitle, 'B4');
      expect(vm.userDisplayName, '—');
    });
  });
}
