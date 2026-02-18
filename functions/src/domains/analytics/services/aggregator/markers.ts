/**
 * Aggregation Markers 管理
 * 
 * 冪等性制御のため、処理済み billId/eventId を記録する。
 * 
 * 注意: checkAndSetBillMarker は廃止（トランザクション外で marker を作成する設計が欠損リスクがあるため）
 * - enqueueSettlement から参照を削除（processBillAnalyticsAtomically を使用）
 * - marker の作成は processBillAnalyticsAtomically 内でトランザクション内で実施
 */

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Event 用マーカー: 既に処理済みなら true、未処理なら false を返し、マーカーを作成
 * 
 * 注意: この関数はトランザクション外で marker を作成する設計になっており、欠損固定のリスクがある
 * - 今回のスコープでは bill marker のみ対応
 * - Event marker の欠損固定リスクは別チケットで対応予定
 */

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
