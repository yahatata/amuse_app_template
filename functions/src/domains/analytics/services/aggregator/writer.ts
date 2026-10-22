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
    itemsSales: admin.firestore.FieldValue.increment(delta.sales.category.items),
    sideGameChipSales: admin.firestore.FieldValue.increment(delta.sales.category.sideGameChip),
    extraCostSales: admin.firestore.FieldValue.increment(delta.sales.category.extraCost),
    tournamentsSales: admin.firestore.FieldValue.increment(delta.sales.category.tournaments),
    grossSales: admin.firestore.FieldValue.increment(delta.sales.grossSales),
    'events.totalRefundedIncl': admin.firestore.FieldValue.increment(delta.events.totalRefundedIncl),
    'events.totalAdjustmentsIncl': admin.firestore.FieldValue.increment(delta.events.totalAdjustmentsIncl),
    'events.unattributedRefundsIncl': admin.firestore.FieldValue.increment(delta.events.unattributedRefundsIncl),
    'events.unattributedAdjustmentsIncl': admin.firestore.FieldValue.increment(delta.events.unattributedAdjustmentsIncl),
    'net.netSalesIncl': admin.firestore.FieldValue.increment(delta.net.netSalesIncl),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // paymentTotals を動的に追加
  for (const [method, amount] of Object.entries(delta.cashflow.paymentTotals)) {
    monthlyUpdate[`paymentTotals.${method}`] = admin.firestore.FieldValue.increment(amount);
  }

  // refundsByMethod を動的に追加
  for (const [method, amount] of Object.entries(delta.cashflow.refundsByMethod)) {
    monthlyUpdate[`cashflow.refundsByMethod.${method}`] = admin.firestore.FieldValue.increment(amount);
  }

  // 月次 doc が存在しない場合は初期化
  const monthlyDoc = await monthlyRef.get();
  if (!monthlyDoc.exists) {
    await monthlyRef.set({
      itemsSales: 0,
      sideGameChipSales: 0,
      extraCostSales: 0,
      tournamentsSales: 0,
      grossSales: 0,
      orderCount: 0,
      dailySales: {},
      paymentTotals: {},
      events: {
        totalRefundedIncl: 0,
        totalAdjustmentsIncl: 0,
        unattributedRefundsIncl: 0,
        unattributedAdjustmentsIncl: 0,
      },
      cashflow: {
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
      itemsSales: 0,
      sideGameChipSales: 0,
      extraCostSales: 0,
      tournamentsSales: 0,
      grossSales: 0,
      orderCount: 0,
      byCategory: {},
      byPaymentMethod: {},
      events: {
        totalRefundedIncl: 0,
        totalAdjustmentsIncl: 0,
        unattributedRefundsIncl: 0,
        unattributedAdjustmentsIncl: 0,
      },
      cashflow: {
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
