/**
 * Analytics 書き込みロジック
 * 
 * 注意: net.balanceDueIncl は nightly 再計算の結果が"正"。逐次更新しない。
 */

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { MonthlyDailyDelta, WriteContext, EventDoc } from './types';

/**
 * 月次/日次 doc に delta を適用（FieldValue.increment 使用）
 */
export async function applyMonthlyDailyDelta(
  monthKey: string,
  businessDate: string,
  delta: MonthlyDailyDelta,
  ctx: WriteContext
): Promise<void> {
  const db = getFirestore();
  const monthlyRef = db.collection('analyticsMonthly').doc(monthKey);
  const dailyRef = monthlyRef.collection('days').doc(businessDate);

  // 月次 doc 更新
  const monthlyUpdate: Record<string, any> = {
    'sales.grossIncl': admin.firestore.FieldValue.increment(delta.sales.grossIncl),
    'sales.category.items': admin.firestore.FieldValue.increment(delta.sales.category.items),
    'sales.category.extraCost': admin.firestore.FieldValue.increment(delta.sales.category.extraCost),
    'sales.category.sideGameChips': admin.firestore.FieldValue.increment(delta.sales.category.sideGameChips),
    'sales.category.tournaments': admin.firestore.FieldValue.increment(delta.sales.category.tournaments),
    'events.totalRefundedIncl': admin.firestore.FieldValue.increment(delta.events.totalRefundedIncl),
    'events.totalAdjustmentsIncl': admin.firestore.FieldValue.increment(delta.events.totalAdjustmentsIncl),
    'events.unattributedRefundsIncl': admin.firestore.FieldValue.increment(delta.events.unattributedRefundsIncl),
    'events.unattributedAdjustmentsIncl': admin.firestore.FieldValue.increment(delta.events.unattributedAdjustmentsIncl),
    'net.netSalesIncl': admin.firestore.FieldValue.increment(delta.net.netSalesIncl),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // paymentTotals を動的に追加
  for (const [method, amount] of Object.entries(delta.cashflow.paymentTotals)) {
    monthlyUpdate[`cashflow.paymentTotals.${method}`] = admin.firestore.FieldValue.increment(amount);
  }

  // refundsByMethod を動的に追加
  for (const [method, amount] of Object.entries(delta.cashflow.refundsByMethod)) {
    monthlyUpdate[`cashflow.refundsByMethod.${method}`] = admin.firestore.FieldValue.increment(amount);
  }

  // 月次 doc が存在しない場合は初期化
  const monthlyDoc = await monthlyRef.get();
  if (!monthlyDoc.exists) {
    await monthlyRef.set({
      sales: {
        grossIncl: 0,
        category: { items: 0, extraCost: 0, sideGameChips: 0, tournaments: 0 },
      },
      events: {
        totalRefundedIncl: 0,
        totalAdjustmentsIncl: 0,
        unattributedRefundsIncl: 0,
        unattributedAdjustmentsIncl: 0,
      },
      cashflow: {
        paymentTotals: {},
        refundsByMethod: {},
      },
      net: {
        netSalesIncl: 0,
        balanceDueIncl: 0, // nightly 再計算で上書き
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await monthlyRef.update(monthlyUpdate);

  // 日次 doc 更新（同様の構造）
  const dailyUpdate = { ...monthlyUpdate };
  const dailyDoc = await dailyRef.get();
  if (!dailyDoc.exists) {
    await dailyRef.set({
      sales: {
        grossIncl: 0,
        category: { items: 0, extraCost: 0, sideGameChips: 0, tournaments: 0 },
      },
      events: {
        totalRefundedIncl: 0,
        totalAdjustmentsIncl: 0,
        unattributedRefundsIncl: 0,
        unattributedAdjustmentsIncl: 0,
      },
      cashflow: {
        paymentTotals: {},
        refundsByMethod: {},
      },
      net: {
        netSalesIncl: 0,
        balanceDueIncl: 0,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await dailyRef.update(dailyUpdate);
}

/**
 * eventsLog にイベントを追加
 */
export async function appendEventLog(
  monthKey: string,
  event: EventDoc,
  billId: string
): Promise<void> {
  const db = getFirestore();
  const eventLogRef = db
    .collection('analyticsMonthly')
    .doc(monthKey)
    .collection('eventsLog')
    .doc(event.eventId);

  await eventLogRef.set({
    billId,
    type: event.type,
    amountIncl: event.refund?.amountIncl || event.adjustment?.amountIncl || 0,
    originBusinessDate: event.originBusinessDate,
    eventBusinessDate: event.eventBusinessDate,
    attribution: event.attribution || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
