import * as admin from 'firebase-admin';
import { Firestore, WriteBatch } from 'firebase-admin/firestore';

import type { ReportingEntry } from '../types';

export interface RebuildResult {
  monthKey: string;
  totalEntriesProcessed: number;
  totalAmountIncl: number;
}

const MAX_BATCH_OPS = 499;

async function commitBatchChunked(
  db: Firestore,
  ops: Array<(batch: WriteBatch) => void>,
): Promise<void> {
  for (let i = 0; i < ops.length; i += MAX_BATCH_OPS) {
    const chunk = ops.slice(i, i + MAX_BATCH_OPS);
    const batch = db.batch();
    for (const op of chunk) {
      op(batch);
    }
    await batch.commit();
  }
}

/**
 * 指定月の reportingMonthly を reportingEntries から全件再集計する。
 * Firestore batch の 500 ops 上限に対応し、自動的にチャンク分割する。
 */
export async function rebuildReportingMonthly(
  db: Firestore,
  monthKey: string,
): Promise<RebuildResult> {
  const entriesSnap = await db
    .collection('reportingEntries')
    .where('reportingMonth', '==', monthKey)
    .get();

  let totalAmountIncl = 0;
  const categoryBreakdown: Record<string, { amountIncl: number }> = {};
  const paymentMethodBreakdown: Record<string, number> = {};
  const categoryPaymentMatrix: Record<string, number> = {};

  for (const doc of entriesSnap.docs) {
    const entry = doc.data() as ReportingEntry;

    for (const [key, val] of Object.entries(entry.categoryBreakdown ?? {})) {
      if (!categoryBreakdown[key]) {
        categoryBreakdown[key] = { amountIncl: 0 };
      }
      categoryBreakdown[key].amountIncl += val.amountIncl ?? 0;
    }

    for (const [key, val] of Object.entries(entry.paymentBreakdown ?? {})) {
      paymentMethodBreakdown[key] = (paymentMethodBreakdown[key] ?? 0) + val;
    }

    for (const [key, val] of Object.entries(entry.categoryPaymentMatrix ?? {})) {
      categoryPaymentMatrix[key] = (categoryPaymentMatrix[key] ?? 0) + val;
    }
  }

  totalAmountIncl = Object.values(categoryBreakdown).reduce(
    (sum, cat) => sum + cat.amountIncl, 0,
  );

  const monthlyRef = db.collection('reportingMonthly').doc(monthKey);

  // Phase 1: delete existing markers (chunked)
  const markersSnap = await monthlyRef.collection('aggregationMarkers').get();
  if (markersSnap.docs.length > 0) {
    const deleteOps = markersSnap.docs.map(
      (markerDoc) => (batch: WriteBatch) => batch.delete(markerDoc.ref),
    );
    await commitBatchChunked(db, deleteOps);
  }

  // Phase 2: set monthly doc + recreate markers (chunked)
  const writeOps: Array<(batch: WriteBatch) => void> = [];

  writeOps.push((batch) =>
    batch.set(monthlyRef, {
      monthKey,
      totalAmountIncl,
      categoryBreakdown,
      paymentMethodBreakdown,
      categoryPaymentMatrix,
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }),
  );

  for (const doc of entriesSnap.docs) {
    const markerRef = monthlyRef.collection('aggregationMarkers').doc(`entries_${doc.id}`);
    writeOps.push((batch) =>
      batch.set(markerRef, {
        entryId: doc.id,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    );
  }

  await commitBatchChunked(db, writeOps);

  return {
    monthKey,
    totalEntriesProcessed: entriesSnap.docs.length,
    totalAmountIncl,
  };
}
