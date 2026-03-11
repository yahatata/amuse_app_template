/**
 * updateBill ヘルパAPI
 * 
 * api_contract.md §2.5 に準拠
 * helper_api_plan.md §2 に準拠
 * 
 * LWW（Last Write Wins）方式を採用
 * 親ドキュメントの安全なフィールドのみ更新（businessDate 変更拒否を含む）
 */

import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { shouldDualWrite, legacyUpdateBillUpdate } from './dualWrite';

export interface UpdateBillRequest {
  billId: string;
  updates: {
    status?: string;
    'ops.*'?: any; // ただし ops.accountingStartedAt は基本的に startAccounting の責務
    'meta.*'?: any;
    // businessDate, amounts.*, categoryBreakdown, paymentTotals, itemsSnapshot, postEvents.*, paymentsSummary.* は更新不可
  };
}

export interface UpdateBillResponse {
  success: boolean;
  billId: string;
  updatedFields: string[];
}

/**
 * 更新を拒否するフィールドのリスト
 */
const FORBIDDEN_FIELDS = [
  'businessDate',
  'amounts',
  'categoryBreakdown',
  'paymentTotals',
  'itemsSnapshot',
  'postEvents',
  'paymentsSummary',
];

/**
 * フィールド名が禁止されているかチェック
 */
function isForbiddenField(fieldName: string): boolean {
  // 完全一致またはプレフィックス一致をチェック
  return FORBIDDEN_FIELDS.some(forbidden => 
    fieldName === forbidden || fieldName.startsWith(`${forbidden}.`)
  );
}

/**
 * 伝票の親ドキュメントの安全なフィールドのみを更新
 * 
 * @param request リクエスト
 * @returns レスポンス
 */
export async function updateBill(request: UpdateBillRequest): Promise<UpdateBillResponse> {
  const { billId, updates } = request;

  // バリデーション
  if (!billId) {
    throw new HttpsError('invalid-argument', 'billId is required');
  }

  if (!updates || Object.keys(updates).length === 0) {
    throw new HttpsError('invalid-argument', 'updates must not be empty');
  }

  // businessDate の変更を拒否（パターンA）
  if ((updates as any).businessDate !== undefined) {
    throw new HttpsError('invalid-argument', 'businessDate cannot be updated');
  }

  // 禁止フィールドのチェック
  for (const fieldName of Object.keys(updates)) {
    if (isForbiddenField(fieldName)) {
      throw new HttpsError('invalid-argument', `Field '${fieldName}' cannot be updated`);
    }
  }

  const db = getFirestore();
  const billRef = db.collection('bills').doc(billId);

  try {
    const result: UpdateBillResponse = await db.runTransaction(async (tx) => {
      // 1) bill の存在確認
      const billSnap = await tx.get(billRef);
      if (!billSnap.exists) {
        throw new HttpsError('not-found', `Bill ${billId} not found`);
      }

      const now = admin.firestore.Timestamp.now();

      // 2) /bills/{billId} の安全なフィールドを更新
      // LWW方式のため、serverTimestamp() 到着順で最終値を採用
      const updateData: Record<string, any> = {
        updatedAt: now,
      };

      // updates の各フィールドを展開
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'ops.*' || key === 'meta.*') {
          // ops.* や meta.* の場合は、value がオブジェクトとして展開される想定
          if (typeof value === 'object' && value !== null) {
            for (const [subKey, subValue] of Object.entries(value)) {
              const fullKey = key === 'ops.*' ? `ops.${subKey}` : `meta.${subKey}`;
              // ops.accountingStartedAt は startAccounting の責務
              if (fullKey === 'ops.accountingStartedAt') {
                throw new HttpsError('invalid-argument', 'ops.accountingStartedAt should be updated via startAccounting');
              }
              updateData[fullKey] = subValue;
            }
          }
        } else {
          updateData[key] = value;
        }
      }

      tx.update(billRef, updateData);

      const updatedFields = Object.keys(updates);

      return {
        success: true,
        billId,
        updatedFields,
      };
    });

    // 3) デュアルライト: todaysBills の該当フィールドを更新（トランザクション外でベストエフォート）
    let dualWriteResult: 'success' | 'failed' | 'skipped' = 'skipped';
    
    if (await shouldDualWrite()) {
      try {
        await legacyUpdateBillUpdate(db, {
          billId,
          updates,
        });
        dualWriteResult = 'success';
        logger.info('dualWrite updateBill ok', {
          op: 'updateBill',
          billId,
          dualWriteResult: 'success',
        });
      } catch (error: any) {
        // 失敗時は警告ログのみ（bills を正とする）
        dualWriteResult = 'failed';
        logger.warn('dualWrite updateBill failed', {
          op: 'updateBill',
          billId,
          dualWriteResult: 'failed',
          reason: error?.message || String(error),
        });
      }
    } else {
      logger.info('dualWrite updateBill skipped', {
        op: 'updateBill',
        billId,
        dualWriteResult: 'skipped',
      });
    }

    logger.info('updateBill success', {
      op: 'updateBill',
      billId,
      result: 'ok',
      updatedFields: result.updatedFields,
      dualWriteResult,
    });

    return result;
  } catch (error) {
    logger.error('updateBill failed', {
      op: 'updateBill',
      billId,
      result: 'fail',
      code: error instanceof HttpsError ? error.code : 'internal',
      reason: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `updateBill failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

