/**
 * Analytics Aggregator テスト
 * 
 * Firestore Emulator を使用した統合テスト
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { enqueueSettlement, enqueueEvent } from '../../src/domains/analytics/services/aggregator';
import { BillDoc, EventDoc } from '../../src/domains/analytics/services/aggregator/types';

describe('Analytics Aggregator', () => {
  let testEnv: any;

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
    
    testEnv = await initializeTestEnvironment({
      projectId: 'test-project',
    });
    
    if (admin.apps.length > 0) {
      await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
    }
    admin.initializeApp({ projectId: 'test-project' });
  });

  afterAll(async () => {
    await testEnv.cleanup();
    if (admin.apps.length) {
      await Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean));
    }
    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  beforeEach(async () => {
    // 各テストケースの前にデータをクリア
    await testEnv.clearFirestore();
  });

  describe('Settlement', () => {
    it('親 1 リード → 月/日 doc に increment、aggregationMarkers/{billId} 作成、2 回目は no-op', async () => {
      const bill: BillDoc = {
        billId: 'bill_001',
        businessDate: '2025-10-23',
        status: 'settled',
        amounts: {
          grandTotalRounded: 5000,
        },
        categoryBreakdown: {
          items: 3000,
          extraCost: 500,
          sideGameChips: 1000,
          tournaments: 500,
        },
        paymentTotals: {
          cash: 3000,
          credit_card: 2000,
        },
        paymentsSummary: {
          paidTotalIncl: 5000,
          balanceDueIncl: 0,
        },
      };

      // 1回目: 正常処理
      await enqueueSettlement(bill);

      const monthlyDoc = await getFirestore()
        .collection('analyticsMonthly')
        .doc('2025-10')
        .get();

      expect(monthlyDoc.data()?.sales.grossIncl).toBe(5000);
      expect(monthlyDoc.data()?.sales.category.items).toBe(3000);
      expect(monthlyDoc.data()?.sales.category.extraCost).toBe(500);
      expect(monthlyDoc.data()?.sales.category.sideGameChips).toBe(1000);
      expect(monthlyDoc.data()?.sales.category.tournaments).toBe(500);
      expect(monthlyDoc.data()?.cashflow.paymentTotals.cash).toBe(3000);
      expect(monthlyDoc.data()?.cashflow.paymentTotals.credit_card).toBe(2000);

      const markerDoc = await getFirestore()
        .collection('analyticsMonthly')
        .doc('2025-10')
        .collection('aggregationMarkers')
        .doc('bill_001')
        .get();

      expect(markerDoc.exists).toBe(true);

      // 2回目: no-op（マーカーでブロック）
      await enqueueSettlement(bill);

      const monthlyDoc2 = await getFirestore()
        .collection('analyticsMonthly')
        .doc('2025-10')
        .get();

      // 値が増えていないことを確認
      expect(monthlyDoc2.data()?.sales.grossIncl).toBe(5000);
    });
  });

  describe('Event (refund 3,000)', () => {
    it('events/refunds/cashflow/net の増減を確認、eventsLog 追記、aggregationMarkers/events/{eventId} 作成、2 回目 no-op', async () => {
      const bill: BillDoc = {
        billId: 'bill_002',
        businessDate: '2025-10-23',
        status: 'settled',
        amounts: {
          grandTotalRounded: 10000,
        },
        postEvents: {
          totalRefundedIncl: 0,
          totalAdjustmentsIncl: 0,
          netSalesIncl: 10000,
        },
      };

      const event: EventDoc = {
        eventId: 'event_refund_001',
        type: 'refund',
        originBusinessDate: '2025-10-23',
        eventBusinessDate: '2025-10-24',
        refund: {
          amountIncl: 3000,
          method: 'cash',
        },
      };

      // 1回目: 正常処理
      await enqueueEvent(bill, event, false);

      const monthlyDoc = await getFirestore()
        .collection('analyticsMonthly')
        .doc('2025-10')
        .get();

      expect(monthlyDoc.data()?.events.totalRefundedIncl).toBe(3000);
      expect(monthlyDoc.data()?.events.unattributedRefundsIncl).toBe(3000);
      expect(monthlyDoc.data()?.cashflow.refundsByMethod.cash).toBe(3000);
      expect(monthlyDoc.data()?.net.netSalesIncl).toBe(-3000);

      const eventLogDoc = await getFirestore()
        .collection('analyticsMonthly')
        .doc('2025-10')
        .collection('eventsLog')
        .doc('event_refund_001')
        .get();

      expect(eventLogDoc.exists).toBe(true);
      expect(eventLogDoc.data()?.amountIncl).toBe(3000);

      const markerDoc = await getFirestore()
        .collection('analyticsMonthly')
        .doc('2025-10')
        .collection('aggregationMarkers')
        .doc('events_event_refund_001')
        .get();

      expect(markerDoc.exists).toBe(true);

      // 2回目: no-op
      await enqueueEvent(bill, event, false);

      const monthlyDoc2 = await getFirestore()
        .collection('analyticsMonthly')
        .doc('2025-10')
        .get();

      expect(monthlyDoc2.data()?.events.totalRefundedIncl).toBe(3000); // 増えていない
    });
  });
});
