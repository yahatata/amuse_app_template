/**
 * デュアルライト処理ユーティリティ
 * 
 * helper_api_plan.md §3 に準拠:
 * - 正（真実源）は bills
 * - todaysBills への複写は最小限・ベストエフォート
 * - 再試行は行わず、失敗は Cloud Logging のみ記録
 * - docID は必ず billId
 */

import { Transaction } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';

/**
 * WRITE_TODAYS_BILLS_IN_PARALLEL フラグを取得
 */
export function shouldDualWrite(): boolean {
  // 環境変数を優先
  if (process.env.WRITE_TODAYS_BILLS_IN_PARALLEL) {
    return process.env.WRITE_TODAYS_BILLS_IN_PARALLEL === 'true';
  }
  
  // functions:config を次に試行
  try {
    const functions = require('firebase-functions');
    const config = functions.config();
    if (config?.bills?.write_todays_bills_in_parallel) {
      return config.bills.write_todays_bills_in_parallel === true;
    }
  } catch (error) {
    // config が未設定の場合は無視
  }
  
  // デフォルト: false（Phase1 開始時は true に設定する想定）
  return false;
}

/**
 * createBillWithActiveStay のデュアルライト処理（トランザクション内）
 * 
 * @param tx トランザクション
 * @param db Firestore インスタンス
 * @param params パラメータ
 * @returns デュアルライト結果
 */
export function dualWriteTodaysBillsSkeleton(
  tx: Transaction,
  db: admin.firestore.Firestore,
  params: {
    enabled: boolean;
    billId: string;
    userId: string;
    pokerName?: string | null;
    businessDate: string;
  }
): { enabled: boolean; result: 'success' | 'failed' | 'skipped' } {
  if (!params.enabled) {
    return { enabled: false, result: 'skipped' };
  }

  const legacyRef = db.collection('todaysBills').doc(params.billId); // ★ docIDは必ず billId
  
  try {
    // スケルトン最小限のみ（金額フィールドは書かない）
    tx.set(legacyRef, {
      status: 'open',
      pokerName: params.pokerName ?? '',
      items: [],
      sideGameChip: [], // 旧コレでは単数名を使用
      place: {
        table: null,
        seat: null,
      },
      date: params.businessDate,
      userId: params.userId,
      // totalPrice 等の金額フィールドは書かない（新 bills がSSoT）
    }, { merge: false });
    
    return { enabled: true, result: 'success' };
  } catch (error: any) {
    // 失敗時は throw せず warning ログに留める（bills を正とする）
    logger.warn('dualWriteTodaysBillsSkeleton failed', {
      billId: params.billId,
      userId: params.userId,
      reason: error?.message || String(error),
    });
    
    return { enabled: true, result: 'failed' };
  }
}

// ===== appendItem 用のデュアルライト更新ユーティリティ =====

/**
 * appendItem の DualWrite 更新
 * - docID は必ず billId
 * - items 配列に legacyItem を arrayUnion で追加
 * - ここは薄いラッパー：テストで jest.mock して throw させる
 */
export async function legacyAppendItemUpdate(
  tx: Transaction,
  db: admin.firestore.Firestore,
  params: {
    billId: string;
    legacyItem: any;
  }
): Promise<void> {
  const legacyRef = db.collection('todaysBills').doc(params.billId);
  tx.update(legacyRef, {
    items: admin.firestore.FieldValue.arrayUnion(params.legacyItem),
  });
}

// ===== appendSideGameChip 用のデュアルライト更新ユーティリティ =====

/**
 * appendSideGameChip の DualWrite 更新
 * - docID は必ず billId
 * - sideGameChip 配列に legacyChip を arrayUnion で追加
 * - トランザクション外でベストエフォート実行（bills のトランザクション完了後）
 * - ここは薄いラッパー：テストで jest.mock して throw させる
 */
export async function legacyAppendSideGameChipUpdate(
  db: admin.firestore.Firestore,
  params: {
    billId: string;
    legacyChip: any;
  }
): Promise<void> {
  const legacyRef = db.collection('todaysBills').doc(params.billId);
  await legacyRef.update({
    sideGameChip: admin.firestore.FieldValue.arrayUnion(params.legacyChip),
  });
}
