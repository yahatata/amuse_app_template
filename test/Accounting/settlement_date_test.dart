import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:amuse_app_template/Accounting/settlement_date.dart';

void main() {
  group('settlementDateKeyFromDateTime (JST)', () {
    test('JST 当日の昼は同じ calendar date', () {
      // 2026-08-25 12:00 JST = 2026-08-25 03:00 UTC
      final dt = DateTime.utc(2026, 8, 25, 3);
      expect(settlementDateKeyFromDateTime(dt), '2026-08-25');
    });

    test('UTC 前日夜でも JST では翌日', () {
      // 2026-08-24 16:00 UTC = 2026-08-25 01:00 JST
      final dt = DateTime.utc(2026, 8, 24, 16);
      expect(settlementDateKeyFromDateTime(dt), '2026-08-25');
    });

    test('JST 日付境界直前', () {
      // 2026-08-24 14:59 UTC = 2026-08-24 23:59 JST
      final dt = DateTime.utc(2026, 8, 24, 14, 59);
      expect(settlementDateKeyFromDateTime(dt), '2026-08-24');
    });
  });

  group('jstDayRangeTimestamps', () {
    test('半開区間が JST 1 日分', () {
      final range = jstDayRangeTimestamps('2026-08-25');
      expect(
        settlementDateKeyFromTimestamp(range.start),
        '2026-08-25',
      );
      // end は翌日 00:00 JST なのでキーは 26
      expect(
        settlementDateKeyFromTimestamp(range.end),
        '2026-08-26',
      );
      expect(range.end.compareTo(range.start), greaterThan(0));
    });
  });

  group('resolveSettlementDateKey / matching', () {
    test('normal same-day: businessDate=settle date', () {
      final bill = <String, dynamic>{
        'businessDate': '2026-08-25',
        'status': 'settled',
        'ops': {
          'accountingCompletedAt': Timestamp.fromDate(
            DateTime.utc(2026, 8, 25, 3),
          ),
        },
      };
      expect(resolveSettlementDateKey(bill), '2026-08-25');
      expect(billMatchesSettlementDateKey(bill, '2026-08-25'), isTrue);
      expect(billMatchesSettlementDateKey(bill, '2026-08-24'), isFalse);
    });

    test('C1-B cross-day: businessDate 前日・settle 当日', () {
      final bill = <String, dynamic>{
        'businessDate': '2026-08-24',
        'status': 'settled',
        'ops': {
          'accountingCompletedAt': Timestamp.fromDate(
            DateTime.utc(2026, 8, 25, 5),
          ),
        },
      };
      expect(resolveSettlementDateKey(bill), '2026-08-25');
      expect(billMatchesSettlementDateKey(bill, '2026-08-25'), isTrue);
      expect(billMatchesSettlementDateKey(bill, '2026-08-24'), isFalse);
    });

    test('re-settle next day uses latest accountingCompletedAt', () {
      final bill = <String, dynamic>{
        'businessDate': '2026-08-24',
        'status': 'settled',
        'ops': {
          'accountingCompletedAt': Timestamp.fromDate(
            DateTime.utc(2026, 8, 26, 4),
          ),
        },
      };
      expect(resolveSettlementDateKey(bill), '2026-08-26');
      expect(billMatchesSettlementDateKey(bill, '2026-08-25'), isFalse);
      expect(billMatchesSettlementDateKey(bill, '2026-08-26'), isTrue);
    });

    test('okibake remote: settle timestamp drives date', () {
      final bill = <String, dynamic>{
        'billType': 'okibake_remote_payment',
        'businessDate': '2026-08-20',
        'status': 'settled',
        'ops': {
          'accountingCompletedAt': Timestamp.fromDate(
            DateTime.utc(2026, 8, 25, 6),
          ),
        },
      };
      expect(resolveSettlementDateKey(bill), '2026-08-25');
    });

    test('post-settlement does not move settlement date key', () {
      final bill = <String, dynamic>{
        'businessDate': '2026-08-24',
        'status': 'post_settlement_pending',
        'updatedAt': Timestamp.fromDate(DateTime.utc(2026, 8, 26, 10)),
        'ops': {
          'accountingCompletedAt': Timestamp.fromDate(
            DateTime.utc(2026, 8, 25, 5),
          ),
        },
        'postSettlementState': {
          'lastRecordAt': Timestamp.fromDate(DateTime.utc(2026, 8, 26, 10)),
        },
      };
      expect(resolveSettlementDateKey(bill), '2026-08-25');
      expect(isPostSettlementListStatus(bill['status'] as String?), isTrue);
    });

    test('legacy missing accountingCompletedAt falls back to businessDate', () {
      final bill = <String, dynamic>{
        'businessDate': '2026-08-25',
        'status': 'settled',
        'ops': {
          'accountingCompletedAt': null,
        },
      };
      expect(resolveSettlementDateKey(bill), '2026-08-25');
      expect(isLegacySettlementDateFallbackBill(bill), isTrue);
      expect(billMatchesSettlementDateKey(bill, '2026-08-25'), isTrue);
    });

    test('legacy fallback excludes bills that already have accountingCompletedAt',
        () {
      final bill = <String, dynamic>{
        'businessDate': '2026-08-24',
        'status': 'settled',
        'ops': {
          'accountingCompletedAt': Timestamp.fromDate(
            DateTime.utc(2026, 8, 25, 5),
          ),
        },
      };
      expect(isLegacySettlementDateFallbackBill(bill), isFalse);
    });
  });

  group('reopen visibility contract', () {
    test('open status is not a list target', () {
      expect(isPostSettlementListStatus('open'), isFalse);
      expect(isPostSettlementListStatus('settled'), isTrue);
      expect(isPostSettlementListStatus('post_settlement_pending'), isTrue);
    });
  });
}
