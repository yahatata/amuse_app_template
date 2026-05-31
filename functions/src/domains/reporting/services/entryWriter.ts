import { Firestore } from 'firebase-admin/firestore';

import type { ReportingEntry } from '../types';

/**
 * reportingEntries/{entryId} に create で書き込む。
 * 既に存在する場合（ALREADY_EXISTS = gRPC code 6）は冪等扱いで { written: false } を返す。
 */
export async function writeReportingEntry(
  db: Firestore,
  entry: ReportingEntry,
): Promise<{ written: boolean }> {
  const docRef = db.collection('reportingEntries').doc(entry.entryId);
  try {
    await docRef.create(entry as unknown as Record<string, unknown>);
    return { written: true };
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 6) {
      return { written: false };
    }
    throw err;
  }
}
