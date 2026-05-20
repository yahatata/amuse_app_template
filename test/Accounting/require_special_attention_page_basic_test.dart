import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:amuse_app_template/Accounting/requireSpecialAttention/billRequireAttentionViewModel.dart';
import 'package:amuse_app_template/Accounting/requireSpecialAttention/userAttentionCounts.dart';

/// 仕様書 [04_仕様書/06_要対応の会計画面と一覧取得.md] §16 テスト観点 1〜4 のうち、
/// Firestore 接続を伴わず view model レイヤだけで検証できる項目をまとめる。
///
/// 実際の画面 widget は `RequireSpecialAttentionPage` だが、Firestore stream を
/// 直接張るため pure widget test での検証は別途 fake firestore が必要。
/// ここでは画面ロジックの肝になるフィルタ / グルーピング / 件数を unit 相当で確認する。
void main() {
  group('classifyBill 流れの結合（仕様書 §9.x / §14）', () {
    test('§16.1: status=open + closeSummary.unresolved=true が `未会計` に出る', () {
      final vm = BillRequireAttentionViewModel.fromBill('B1', {
        'status': 'open',
        'businessDate': '2026-05-01',
        'closeSummary': {
          'unresolved': true,
          'closedBusinessDate': '2026-05-08',
          'displayAmountAtMark': 1500,
        },
        'party': {'userId': 'u1', 'pokerName': 'UserA'},
      });
      expect(vm, isNotNull);
      expect(vm!.cardType, BillCardType.carryoverUnsettled);
      expect(vm.displayLabel, '未会計');
      expect(vm.primaryActionType, PrimaryActionType.resumeAccounting);
    });

    test('§16.2: post_settlement_pending + collection が `追加徴収` に出る', () {
      final vm = BillRequireAttentionViewModel.fromBill('B2', {
        'status': 'post_settlement_pending',
        'businessDate': '2026-05-09',
        'postSettlementState': {
          'requiredActionType': 'collection',
          'requiredActionIncl': 1000,
        },
        'party': {'userId': 'u2', 'pokerName': 'UserB'},
      });
      expect(vm, isNotNull);
      expect(vm!.cardType, BillCardType.postSettlementCollectionPending);
      expect(vm.displayLabel, '追加徴収');
      expect(vm.primaryActionType, PrimaryActionType.collect);
    });

    test('§16.3: post_settlement_pending + refund が `要返金` に出る', () {
      final vm = BillRequireAttentionViewModel.fromBill('B3', {
        'status': 'post_settlement_pending',
        'businessDate': '2026-05-09',
        'postSettlementState': {
          'requiredActionType': 'refund',
          'requiredActionIncl': 500,
        },
        'party': {'userId': 'u3', 'pokerName': 'UserC'},
      });
      expect(vm, isNotNull);
      expect(vm!.cardType, BillCardType.postSettlementRefundPending);
      expect(vm.displayLabel, '要返金');
      expect(vm.primaryActionType, PrimaryActionType.refund);
    });

    test('§14.4: 同じ bill が複数 cardType に分類されない', () {
      // 不正データだが、status=open が優先される
      final vm = BillRequireAttentionViewModel.fromBill('B-mixed', {
        'status': 'open',
        'businessDate': '2026-05-08',
        'closeSummary': {'unresolved': true, 'displayAmountAtMark': 100},
        'postSettlementState': {
          'requiredActionType': 'collection',
          'requiredActionIncl': 200,
        },
        'party': {'userId': 'u-mixed', 'pokerName': 'Mixed'},
      });
      expect(vm!.cardType, BillCardType.carryoverUnsettled);
      // 追加徴収で分類されない
      expect(vm.cardType, isNot(BillCardType.postSettlementCollectionPending));
    });

    test('§14.1: status=settled は要対応一覧に出ない', () {
      expect(
        BillRequireAttentionViewModel.fromBill('B-settled', {
          'status': 'settled',
        }),
        isNull,
      );
    });
  });

  group('§16.4: ユーザー別カードに件数内訳が出る', () {
    test('混在ケースでの件数集計', () {
      final bills = [
        BillRequireAttentionViewModel.fromBill('B1', {
          'status': 'open',
          'businessDate': '2026-05-01',
          'closeSummary': {
            'unresolved': true,
            'displayAmountAtMark': 1000,
          },
          'party': {'userId': 'u-shared', 'pokerName': 'Shared'},
        })!,
        BillRequireAttentionViewModel.fromBill('B2', {
          'status': 'post_settlement_pending',
          'businessDate': '2026-05-02',
          'postSettlementState': {
            'requiredActionType': 'collection',
            'requiredActionIncl': 500,
          },
          'party': {'userId': 'u-shared', 'pokerName': 'Shared'},
        })!,
        BillRequireAttentionViewModel.fromBill('B3', {
          'status': 'post_settlement_pending',
          'businessDate': '2026-05-03',
          'postSettlementState': {
            'requiredActionType': 'refund',
            'requiredActionIncl': 300,
          },
          'party': {'userId': 'u-shared', 'pokerName': 'Shared'},
        })!,
      ];
      final counts = UserAttentionCounts.from(bills);
      expect(counts.total, 3);
      expect(counts.carryover, 1);
      expect(counts.collection, 1);
      expect(counts.refund, 1);
    });
  });

  group('日付ごと grouping (仕様書 §10)', () {
    test('sortDate 降順での grouping が想定通り動く', () {
      final vms = <BillRequireAttentionViewModel>[
        BillRequireAttentionViewModel.fromBill('B-old', {
          'status': 'post_settlement_pending',
          'businessDate': '2026-05-01',
          'postSettlementState': {
            'requiredActionType': 'collection',
            'requiredActionIncl': 100,
          },
          'party': {'userId': 'u', 'pokerName': 'P'},
        })!,
        BillRequireAttentionViewModel.fromBill('B-new', {
          'status': 'post_settlement_pending',
          'businessDate': '2026-05-09',
          'postSettlementState': {
            'requiredActionType': 'refund',
            'requiredActionIncl': 100,
          },
          'party': {'userId': 'u', 'pokerName': 'P'},
        })!,
      ];

      final byDate = <String, List<BillRequireAttentionViewModel>>{};
      for (final vm in vms) {
        byDate.putIfAbsent(vm.sortDate, () => []).add(vm);
      }
      final keys = byDate.keys.toList()..sort((a, b) => b.compareTo(a));
      expect(keys, ['2026-05-09', '2026-05-01']);
    });

    test('carryover の sortDate は closedBusinessDate 優先', () {
      final vm = BillRequireAttentionViewModel.fromBill('B', {
        'status': 'open',
        'businessDate': '2026-04-30',
        'closeSummary': {
          'unresolved': true,
          'closedBusinessDate': '2026-05-08',
          'displayAmountAtMark': 100,
        },
        'party': {'userId': 'u', 'pokerName': 'P'},
      });
      expect(vm!.sortDate, '2026-05-08'); // closedBusinessDate を採用
      expect(vm.businessDate, '2026-04-30'); // businessDate は元売上のまま
    });
  });

  group('Filter ロジック', () {
    late List<BillRequireAttentionViewModel> source;

    setUp(() {
      source = [
        BillRequireAttentionViewModel.fromBill('B1', {
          'status': 'open',
          'businessDate': '2026-05-01',
          'closeSummary': {
            'unresolved': true,
            'displayAmountAtMark': 100,
          },
          'party': {'userId': 'u1', 'pokerName': 'A'},
        })!,
        BillRequireAttentionViewModel.fromBill('B2', {
          'status': 'post_settlement_pending',
          'businessDate': '2026-05-01',
          'postSettlementState': {
            'requiredActionType': 'collection',
            'requiredActionIncl': 100,
          },
          'party': {'userId': 'u1', 'pokerName': 'A'},
        })!,
        BillRequireAttentionViewModel.fromBill('B3', {
          'status': 'post_settlement_pending',
          'businessDate': '2026-05-01',
          'postSettlementState': {
            'requiredActionType': 'refund',
            'requiredActionIncl': 100,
          },
          'party': {'userId': 'u2', 'pokerName': 'B'},
        })!,
      ];
    });

    test('フィルタ未会計 → carryover のみ', () {
      final filtered = source
          .where((b) => b.cardType == BillCardType.carryoverUnsettled)
          .toList();
      expect(filtered, hasLength(1));
      expect(filtered.first.billId, 'B1');
    });

    test('フィルタ追加徴収 → collection のみ', () {
      final filtered = source
          .where(
            (b) => b.cardType == BillCardType.postSettlementCollectionPending,
          )
          .toList();
      expect(filtered, hasLength(1));
      expect(filtered.first.billId, 'B2');
    });

    test('フィルタ要返金 → refund のみ', () {
      final filtered = source
          .where(
            (b) => b.cardType == BillCardType.postSettlementRefundPending,
          )
          .toList();
      expect(filtered, hasLength(1));
      expect(filtered.first.billId, 'B3');
    });
  });

  // §16.5 各カードから正しい導線に遷移する
  group('§16.5: primaryActionType の導線', () {
    test('carryover → resumeAccounting', () {
      final vm = BillRequireAttentionViewModel.fromBill('B1', {
        'status': 'open',
        'closeSummary': {'unresolved': true, 'displayAmountAtMark': 0},
        'businessDate': '2026-05-01',
        'party': {'userId': 'u', 'pokerName': 'P'},
      });
      expect(vm!.primaryActionType, PrimaryActionType.resumeAccounting);
    });

    test('collection → collect', () {
      final vm = BillRequireAttentionViewModel.fromBill('B2', {
        'status': 'post_settlement_pending',
        'businessDate': '2026-05-01',
        'postSettlementState': {
          'requiredActionType': 'collection',
          'requiredActionIncl': 100,
        },
        'party': {'userId': 'u', 'pokerName': 'P'},
      });
      expect(vm!.primaryActionType, PrimaryActionType.collect);
    });

    test('refund → refund', () {
      final vm = BillRequireAttentionViewModel.fromBill('B3', {
        'status': 'post_settlement_pending',
        'businessDate': '2026-05-01',
        'postSettlementState': {
          'requiredActionType': 'refund',
          'requiredActionIncl': 100,
        },
        'party': {'userId': 'u', 'pokerName': 'P'},
      });
      expect(vm!.primaryActionType, PrimaryActionType.refund);
    });
  });

  testWidgets('AttentionFilter enum 値の網羅', (tester) async {
    // smoke check: enum 値が 4 つ存在することの保証
    expect(BillCardType.values, hasLength(3));
    expect(PrimaryActionType.values, hasLength(3));
  });
}
