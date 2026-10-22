/**
 * reportingMonthly/{monthKey} への増分更新ロジック。
 *
 * aggregationMarkers サブコレクションで冪等性を担保する。
 * パターン参照: functions/src/domains/analytics/services/aggregator/markers.ts
 */

import * as admin from 'firebase-admin';
import { Firestore } from 'firebase-admin/firestore';

import type { ReportingEntry } from '../types';

export async function applyEntryToReportingMonthly(
  db: Firestore,
  entry: ReportingEntry,
): Promise<void> {
  const monthKey = entry.reportingMonth;
  const monthlyRef = db.collection('reportingMonthly').doc(monthKey);
  const markerRef = monthlyRef
    .collection('aggregationMarkers')
    .doc(`entries_${entry.entryId}`);

  const markerDoc = await markerRef.get();
  if (markerDoc.exists) {
    return;
  }

  await markerRef.set({
    entryId: entry.entryId,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const update: Record<string, unknown> = {
    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const totalAmount = Object.values(entry.categoryBreakdown)
    .reduce((sum, cat) => sum + cat.amountIncl, 0);
  update['totalAmountIncl'] = admin.firestore.FieldValue.increment(totalAmount);

  for (const [key, val] of Object.entries(entry.categoryBreakdown)) {
    update[`categoryBreakdown.${key}.amountIncl`] = admin.firestore.FieldValue.increment(val.amountIncl);
  }

  for (const [key, val] of Object.entries(entry.paymentBreakdown)) {
    update[`paymentMethodBreakdown.${key}`] = admin.firestore.FieldValue.increment(val);
  }

  for (const [key, val] of Object.entries(entry.categoryPaymentMatrix)) {
    update[`categoryPaymentMatrix.${key}`] = admin.firestore.FieldValue.increment(val);
  }

  const monthlyDoc = await monthlyRef.get();
  if (!monthlyDoc.exists) {
    await monthlyRef.set({
      monthKey,
      totalAmountIncl: 0,
      categoryBreakdown: {},
      paymentMethodBreakdown: {},
      categoryPaymentMatrix: {},
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  await monthlyRef.update(update);
}
