import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/Accounting/requireSpecialAttention/billRequireAttentionViewModel.dart';
import 'package:amuse_app_template/Accounting/requireSpecialAttention/userAttentionCounts.dart';

BillRequireAttentionViewModel _buildVm(BillCardType cardType, String billId) {
  switch (cardType) {
    case BillCardType.carryoverUnsettled:
      return BillRequireAttentionViewModel.fromBill(billId, {
        'status': 'open',
        'closeSummary': {
          'unresolved': true,
          'displayAmountAtMark': 1000,
        },
        'businessDate': '2026-05-01',
        'party': {'userId': 'u1', 'pokerName': 'TestUser'},
      })!;
    case BillCardType.postSettlementCollectionPending:
      return BillRequireAttentionViewModel.fromBill(billId, {
        'status': 'post_settlement_pending',
        'businessDate': '2026-05-01',
        'postSettlementState': {
          'requiredActionType': 'collection',
          'requiredActionIncl': 500,
        },
        'party': {'userId': 'u1', 'pokerName': 'TestUser'},
      })!;
    case BillCardType.postSettlementRefundPending:
      return BillRequireAttentionViewModel.fromBill(billId, {
        'status': 'post_settlement_pending',
        'businessDate': '2026-05-01',
        'postSettlementState': {
          'requiredActionType': 'refund',
          'requiredActionIncl': 300,
        },
        'party': {'userId': 'u1', 'pokerName': 'TestUser'},
      })!;
  }
}

void main() {
  group('UserAttentionCounts.from', () {
    test('全 0 件', () {
      final c = UserAttentionCounts.from([]);
      expect(c.total, 0);
      expect(c.carryover, 0);
      expect(c.collection, 0);
      expect(c.refund, 0);
    });

    test('carryover 1 件のみ', () {
      final c = UserAttentionCounts.from([
        _buildVm(BillCardType.carryoverUnsettled, 'B1'),
      ]);
      expect(c.total, 1);
      expect(c.carryover, 1);
      expect(c.collection, 0);
      expect(c.refund, 0);
    });

    test('collection 2 件のみ', () {
      final c = UserAttentionCounts.from([
        _buildVm(BillCardType.postSettlementCollectionPending, 'B1'),
        _buildVm(BillCardType.postSettlementCollectionPending, 'B2'),
      ]);
      expect(c.total, 2);
      expect(c.carryover, 0);
      expect(c.collection, 2);
      expect(c.refund, 0);
    });

    test('refund 1 件のみ', () {
      final c = UserAttentionCounts.from([
        _buildVm(BillCardType.postSettlementRefundPending, 'B1'),
      ]);
      expect(c.total, 1);
      expect(c.carryover, 0);
      expect(c.collection, 0);
      expect(c.refund, 1);
    });

    test('混在: carryover 1 + collection 2 + refund 1', () {
      final c = UserAttentionCounts.from([
        _buildVm(BillCardType.carryoverUnsettled, 'B1'),
        _buildVm(BillCardType.postSettlementCollectionPending, 'B2'),
        _buildVm(BillCardType.postSettlementCollectionPending, 'B3'),
        _buildVm(BillCardType.postSettlementRefundPending, 'B4'),
      ]);
      expect(c.total, 4);
      expect(c.carryover, 1);
      expect(c.collection, 2);
      expect(c.refund, 1);
    });
  });
}
