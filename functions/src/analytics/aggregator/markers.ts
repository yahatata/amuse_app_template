/**
 * Aggregation Markers 管理
 * 
 * 冪等性制御のため、処理済み billId/eventId を記録する。
 */

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Settlement 用マーカー: 既に処理済みなら true、未処理なら false を返し、マーカーを作成
 */
export async function checkAndSetBillMarker(
  monthKey: string,
  billId: string
): Promise<boolean> {
  const db = getFirestore();
  const markerRef = db
    .collection('analyticsMonthly')
    .doc(monthKey)
    .collection('aggregationMarkers')
    .doc(billId);

  const markerDoc = await markerRef.get();
  if (markerDoc.exists) {
    return true; // 既に処理済み
  }

  await markerRef.set({
    billId,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return false; // 新規処理
}

/**
 * Event 用マーカー: 既に処理済みなら true、未処理なら false を返し、マーカーを作成
 */
export async function checkAndSetEventMarker(
  monthKey: string,
  eventId: string
): Promise<boolean> {
  const db = getFirestore();
  const markerRef = db
    .collection('analyticsMonthly')
    .doc(monthKey)
    .collection('aggregationMarkers')
    .doc(`events_${eventId}`);

  const markerDoc = await markerRef.get();
  if (markerDoc.exists) {
    return true; // 既に処理済み
  }

  await markerRef.set({
    eventId,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return false; // 新規処理
}
