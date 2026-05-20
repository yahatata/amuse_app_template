/**
 * 仕様書 [04_仕様書/07_analyticsMonthly更新と日付帰属とline配賦.md] §10.3 / §11 / §8.4 に基づく、
 * cashAction methodBreakdown[] からの analyticsMonthly 反映を atomic に実行するヘルパ。
 *
 * 設計方針（[02_changeSpec.md] §5.2.4 / §5.5）:
 * - collection の場合のみ paymentTotals を increment
 * - refund の場合は early return（仕様書 §8.4 paymentTotals 直接減らさず）
 * - marker docId は `cash_{cashActionId}` で冪等性を保証
 * - 既存 add*（settle 経路）には touch せず、Step07 専用の独立した実装
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { CashActionAnalyticsDelta } from './aggregator/cashActionDelta';

export interface ProcessCashActionAnalyticsParams {
  /** `bill.businessDate.substring(0, 7)`（仕様書 §8.3 売上帰属月） */
  monthKey: string;
  /** `bill.businessDate`（仕様書 §11 / §8.3） */
  businessDate: string;
  /** bills コレクションの docId（log 用） */
  billId: string;
  /** marker docId 構成要素 */
  cashActionId: string;
  /** collection / refund 種別 */
  cashActionType: 'collection' | 'refund';
  /** 反映する純粋 delta（`buildCashActionAnalyticsDelta` で組み立てたもの） */
  delta: CashActionAnalyticsDelta;
  /** bill.party.userId（byUser.paymentTotals 反映用） */
  billUserId?: string | null;
}

export async function processCashActionAnalyticsAtomically(
  db: FirebaseFirestore.Firestore,
  params: ProcessCashActionAnalyticsParams
): Promise<void> {
  const { monthKey, businessDate, billId, cashActionId, cashActionType, delta, billUserId } = params;

  if (cashActionType === 'refund') {
    logger.info('processCashActionAnalyticsAtomically: refund → no-op (仕様書 §8.4)', {
      billId,
      cashActionId,
    });
    return;
  }

  const methodEntries = Object.entries(delta.byPaymentMethod);
  if (methodEntries.length === 0) {
    logger.info('processCashActionAnalyticsAtomically: empty byPaymentMethod → no-op', {
      billId,
      cashActionId,
    });
    return;
  }

  const monthlyRef = db.collection('analyticsMonthly').doc(monthKey);
  const dailyRef = monthlyRef.collection('days').doc(businessDate);
  const markerRef = monthlyRef.collection('aggregationMarkers').doc(`cash_${cashActionId}`);

  const userId = typeof billUserId === 'string' && billUserId.length > 0 ? billUserId : null;
  const byUserRef = userId ? monthlyRef.collection('byUser').doc(userId) : undefined;

  await db.runTransaction(async (tx) => {
    const markerDoc = await tx.get(markerRef);
    if (markerDoc.exists) {
      logger.info('processCashActionAnalyticsAtomically: marker already exists, skipping', {
        billId,
        cashActionId,
        monthKey,
      });
      return;
    }

    const reads = [
      tx.get(monthlyRef),
      tx.get(dailyRef),
      ...(byUserRef ? [tx.get(byUserRef)] : []),
    ];
    const results = await Promise.all(reads);
    const monthlyDoc = results[0];
    const dailyDoc = results[1];
    const byUserDoc = byUserRef ? results[2] : undefined;

    logger.info('processCashActionAnalyticsAtomically: starting analytics update', {
      billId,
      cashActionId,
      monthKey,
      businessDate,
      methodCount: methodEntries.length,
    });

    if (!monthlyDoc.exists) {
      tx.set(monthlyRef, initialMonthlyDoc());
    }
    tx.update(monthlyRef, buildMonthlyPaymentTotalsUpdate(methodEntries));

    if (!dailyDoc.exists) {
      tx.set(dailyRef, initialDailyDoc());
    }
    tx.update(dailyRef, buildDailyPaymentTotalsUpdate(methodEntries));

    if (byUserRef && byUserDoc) {
      if (!byUserDoc.exists) {
        tx.set(byUserRef, initialByUserDoc());
      }
      tx.update(byUserRef, buildByUserPaymentTotalsUpdate(methodEntries));
    }

    tx.create(markerRef, {
      type: 'cashAction',
      billId,
      cashActionId,
      cashActionType,
      monthKey,
      businessDate,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info('processCashActionAnalyticsAtomically: analytics update completed', {
      billId,
      cashActionId,
      monthKey,
      businessDate,
    });
  });
}

function initialMonthlyDoc(): Record<string, any> {
  return {
    grossSales: 0,
    itemsSales: 0,
    extraCostSales: 0,
    sideGameChipSales: 0,
    tournamentsSales: 0,
    orderCount: 0,
    avgOrderValue: 0,
    dailySales: {},
    paymentTotals: {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function initialDailyDoc(): Record<string, any> {
  return {
    grossSales: 0,
    itemsSales: 0,
    extraCostSales: 0,
    sideGameChipSales: 0,
    tournamentsSales: 0,
    orderCount: 0,
    byCategory: {},
    byPaymentMethod: {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function initialByUserDoc(): Record<string, any> {
  return {
    grossSales: 0,
    itemsSales: 0,
    extraCostSales: 0,
    sideGameChipSales: 0,
    tournamentsSales: 0,
    orderCount: 0,
    dailySales: {},
    paymentTotals: {},
    pokerName: '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildMonthlyPaymentTotalsUpdate(
  methodEntries: [string, number][]
): Record<string, any> {
  const update: Record<string, any> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  for (const [method, amount] of methodEntries) {
    update[`paymentTotals.${method}`] = admin.firestore.FieldValue.increment(amount);
  }
  return update;
}

function buildDailyPaymentTotalsUpdate(
  methodEntries: [string, number][]
): Record<string, any> {
  const update: Record<string, any> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  for (const [method, amount] of methodEntries) {
    update[`byPaymentMethod.${method}`] = admin.firestore.FieldValue.increment(amount);
  }
  return update;
}

function buildByUserPaymentTotalsUpdate(
  methodEntries: [string, number][]
): Record<string, any> {
  const update: Record<string, any> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  for (const [method, amount] of methodEntries) {
    update[`paymentTotals.${method}`] = admin.firestore.FieldValue.increment(amount);
  }
  return update;
}
