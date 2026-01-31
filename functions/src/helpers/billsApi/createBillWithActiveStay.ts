/**
 * createBillWithActiveStay ヘルパAPI
 * 
 * api_contract.md §2.1 に準拠
 * helper_api_plan.md §1.2, §3 に準拠
 * 
 * 単一トランザクションで原子的に処理:
 * - idempotency チェック（requestHash一致検証）
 * - activeStays 重複チェック
 * - bills 作成（businessDate はサーバ専任）
 * - activeStays 作成
 * - idempotency 記録（expiresAt=now+48h）
 * - extras 作成（入店料がある場合）
 * - todaysBills スケルトン複写（デュアルライト、失敗はwarningログ）
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as crypto from 'crypto';
import { dualWriteTodaysBillsSkeleton, shouldDualWrite } from './dualWrite';
import { getCurrentBusinessDateKeyOrThrow } from '../stateDoc/getCurrentBusinessDateKeyOrThrow';

/**
 * リクエストペイロードの正規化ハッシュを生成
 */
function stableHash(input: unknown): string {
  const json = JSON.stringify(input, Object.keys((input as any) ?? {}).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

/**
 * リクエスト型定義
 */
export interface CreateBillWithActiveStayRequest {
  billId: string; // 必須: 伝票ID（クライアント生成UUID推奨）
  userId: string; // 必須: 顧客UID
  pokerName?: string; // 任意: 表示名
  idempotencyKey: string; // 必須: 冪等性キー
  entranceFee?: number; // 任意: 入店料
  entranceFeeDescription?: string; // 任意: 入店料説明
  // businessDate は受理しない（サーバ専任）
}

/**
 * レスポンス型定義
 */
export interface CreateBillWithActiveStayResponse {
  success: boolean;
  billId: string;
  status: 'open' | 'in_progress';
  businessDate: string; // YYYY-MM-DD形式
  activeStayCreated: boolean;
  diagnostics?: {
    reason?: string; // 冪等性再利用時の理由
    reused?: boolean; // 既存doc再利用フラグ
  };
}

/**
 * createBillWithActiveStay ヘルパAPI
 * 
 * @param request リクエストデータ（businessDate は含めない）
 * @returns レスポンス
 */
export async function createBillWithActiveStay(
  request: CreateBillWithActiveStayRequest
): Promise<CreateBillWithActiveStayResponse> {
  const { billId, userId, pokerName, idempotencyKey, entranceFee = 0, entranceFeeDescription } = request;

  // バリデーション
  if (!billId || !userId || !idempotencyKey) {
    throw new HttpsError(
      'invalid-argument',
      'billId, userId, idempotencyKey are required'
    );
  }

  const db = getFirestore();
  const idempotencyKeyFull = `${billId}:createBill:${idempotencyKey}`;
  const idempotencyRef = db.collection('bills').doc(billId).collection('idempotency').doc(idempotencyKeyFull);
  const billRef = db.collection('bills').doc(billId);
  const activeStayRef = db.collection('activeStays').doc(userId);

  // リクエストハッシュ生成（冪等性検証用）
  const requestHash = stableHash({
    billId,
    userId,
    pokerName: pokerName || null,
    entranceFee,
    entranceFeeDescription: entranceFeeDescription || null,
  });

  // 営業日計算（サーバ専任、state docから取得）
  // Phase1: state docのcurrentBusinessDateKeyを使用（店舗が閉店中の場合はエラー）
  const now = new Date();
  const businessDate = await getCurrentBusinessDateKeyOrThrow();

  // expiresAt = now + 48h
  const expiresAt = Timestamp.fromDate(new Date(now.getTime() + 48 * 60 * 60 * 1000));

  // デュアルライトフラグ取得
  const dualWriteEnabled = shouldDualWrite();

  let reused = false;
  let dualWriteResult: 'success' | 'failed' | 'skipped' = 'skipped';

  try {
    // 単一トランザクション内で原子的に処理
    const result: CreateBillWithActiveStayResponse = await db.runTransaction(async (tx) => {
      // 1) idempotency チェック（replay対応 + ハッシュ一致検証）
      const idemSnap = await tx.get(idempotencyRef);
      if (idemSnap.exists) {
        const prevHash = idemSnap.data()?.requestHash;
        if (prevHash && prevHash !== requestHash) {
          // ハッシュ不一致 → failed-precondition
          throw new HttpsError(
            'failed-precondition',
            'idempotency requestHash mismatch'
          );
        }
        // ハッシュ一致 → 既存docを返却（updatedAt は変更しない）
        reused = true;
        const billSnap = await tx.get(billRef);
        if (!billSnap.exists) {
          throw new HttpsError('internal', 'idempotency exists but bill missing');
        }
        const billData = billSnap.data()!;
        const billStatus = billData.status as string;
        if (billStatus !== 'open' && billStatus !== 'in_progress') {
          throw new HttpsError('internal', 'Invalid bill status for idempotent replay');
        }
        return {
          success: true,
          billId,
          status: billStatus as 'open' | 'in_progress',
          businessDate: billData.businessDate as string,
          activeStayCreated: true,
          diagnostics: {
            reason: 'idempotent replay',
            reused: true,
          },
        };
      }

      // 2) 重複入店チェック（activeStays/{uid} が既に存在し isActive==true の場合）
      const staySnap = await tx.get(activeStayRef);
      if (staySnap.exists && staySnap.data()?.isActive === true) {
        throw new HttpsError(
          'failed-precondition',
          'user already has an active stay'
        );
      }

      // 3) bills/{billId} 作成（サーバ専任 businessDate）
      tx.set(billRef, {
        businessDate,
        status: 'open',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(), // 初回のみ
        billId,
        receiptNumber: null,
        party: {
          userId, // Immutable
          pokerName: pokerName || null,
        },
        place: {
          table: null,
          seat: null,
        },
        meta: {
          schemaVersion: '1.3',
          contentHash: null,
        },
      }, { merge: false });

      // 4) activeStays/{uid} 作成
      tx.set(activeStayRef, {
        uid: userId,
        billId,
        pokerName: pokerName || null,
        isActive: true,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: false });

      // 5) idempotency/{key} 作成（TTLフィールド付き）
      tx.set(idempotencyRef, {
        requestHash,
        expiresAt, // ★ TTL対象（now + 48h）
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: false });

      // 6) 入店料レコード作成（entranceFeeDescription がある場合は作成、金額が0でも作成）
      // 再入店の場合など、entranceFeeDescription が設定されている場合は金額0でも作成
      if (entranceFeeDescription) {
        const extraRef = billRef.collection('extras').doc();
        tx.set(extraRef, {
          name: entranceFeeDescription,
          amountIncl: entranceFee,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else if (entranceFee > 0) {
        // entranceFeeDescription が未設定で金額が0より大きい場合のみ作成
        const extraRef = billRef.collection('extras').doc();
        tx.set(extraRef, {
          name: '入店料',
          amountIncl: entranceFee,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 7) DualWrite (todaysBills/{billId}) - トランザクション内
      const dual = dualWriteTodaysBillsSkeleton(tx, db, {
        enabled: dualWriteEnabled,
        billId,
        userId,
        pokerName: pokerName || null,
        businessDate,
      });
      dualWriteResult = dual.result;

      return {
        success: true,
        billId,
        status: 'open',
        businessDate,
        activeStayCreated: true,
      };
    });

    logger.info('createBillWithActiveStay', {
      op: 'createBillWithActiveStay',
      billId,
      userId,
      idempKey: idempotencyKeyFull,
      result: reused ? 'reused' : 'ok',
      requestHash8: requestHash.substring(0, 8),
      dualWriteEnabled,
      dualWriteResult,
    });

    return result;
  } catch (error) {
    logger.error('createBillWithActiveStay: failed', {
      op: 'createBillWithActiveStay',
      billId,
      userId,
      idempKey: idempotencyKeyFull,
      result: 'fail',
      code: error instanceof HttpsError ? error.code : 'internal',
      reason: error instanceof Error ? error.message : String(error),
      requestHash8: requestHash.substring(0, 8),
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Failed to create bill with active stay');
  }
}
