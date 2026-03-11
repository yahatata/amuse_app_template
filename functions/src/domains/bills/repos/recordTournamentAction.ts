/**
 * recordTournamentAction ヘルパAPI
 * 
 * api_contract.md §2.5 に準拠
 * helper_api_plan.md §2 に準拠
 * 
 * 強い冪等（時間窓なし、expiresAt廃止）を採用
 * トーナメント参加・リバイ・アドオンを /tournaments/{tplId} に集約
 */

import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as crypto from 'crypto';
import { shouldDualWrite, legacyRecordTournamentActionUpdate } from './dualWrite';

/**
 * リクエストペイロードの正規化ハッシュを生成
 */
function stableHash(input: unknown): string {
  const json = JSON.stringify(input, Object.keys((input as any) ?? {}).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

export interface RecordTournamentActionRequest {
  billId: string;
  templateId: string;
  action: 'entry' | 'reentry' | 'addon';
  templateName: string;
  entryFeeIncl: number | null;
  reentryFeeIncl: number | null;
  addonFeeIncl: number | null;
  startAt: admin.firestore.Timestamp | null;
  idempotencyKey: string;
}

export interface RecordTournamentActionResponse {
  success: boolean;
  billId: string;
  templateId: string;
  action: 'entry' | 'reentry' | 'addon';
  entryCount: number;
  reentryCount: number;
  addonCount: number;
  registeredAt: string; // ISO8601形式（entry時のみ）
  lastReentryAt: string | null; // ISO8601形式（reentry時のみ）
  lastAddonAt: string | null; // ISO8601形式（addon時のみ）
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}

/**
 * 伝票にトーナメントアクションを記録
 * 
 * @param request リクエスト
 * @returns レスポンス
 */
export async function recordTournamentAction(request: RecordTournamentActionRequest): Promise<RecordTournamentActionResponse> {
  const { billId, templateId, action, templateName, entryFeeIncl, reentryFeeIncl, addonFeeIncl, startAt, idempotencyKey } = request;

  // バリデーション
  if (!billId || !templateId || !action || !idempotencyKey) {
    throw new HttpsError('invalid-argument', 'billId, templateId, action, idempotencyKey are required');
  }

  if (action !== 'entry' && action !== 'reentry' && action !== 'addon') {
    throw new HttpsError('invalid-argument', `action must be 'entry', 'reentry', or 'addon'`);
  }

  const db = getFirestore();
  const billRef = db.collection('bills').doc(billId);
  const tournamentRef = billRef.collection('tournaments').doc(templateId);
  const idempotencyRef = billRef.collection('idempotency').doc(idempotencyKey);

  // requestHash を生成（billId, templateId, action, entryFeeIncl, reentryFeeIncl, addonFeeIncl を正規化）
  const requestHash = stableHash({
    billId,
    templateId,
    action,
    entryFeeIncl,
    reentryFeeIncl,
    addonFeeIncl,
  });

  let reused = false;

  try {
    const result: RecordTournamentActionResponse = await db.runTransaction(async (tx) => {
      // 1) 強い冪等チェック
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
        // ハッシュ一致 → 既存docを返却（親updatedAtは更新しない）
        reused = true;
        
        // 既存の tournament ドキュメントを取得して返す
        const tournamentSnap = await tx.get(tournamentRef);
        if (!tournamentSnap.exists) {
          throw new HttpsError('internal', 'idempotency exists but tournament missing');
        }
        
        const tournamentData = tournamentSnap.data()!;
        const registeredAt = tournamentData.registeredAt;
        const lastReentryAt = tournamentData.lastReentryAt;
        const lastAddonAt = tournamentData.lastAddonAt;
        
        const registeredAtIso = registeredAt && registeredAt.toDate ? registeredAt.toDate().toISOString() : new Date().toISOString();
        const lastReentryAtIso = lastReentryAt && lastReentryAt.toDate ? lastReentryAt.toDate().toISOString() : null;
        const lastAddonAtIso = lastAddonAt && lastAddonAt.toDate ? lastAddonAt.toDate().toISOString() : null;
        
        // 既存レスポンスを返却（親updatedAtは更新しない）
        return {
          success: true,
          billId,
          templateId,
          action,
          entryCount: tournamentData.entryCount || 0,
          reentryCount: tournamentData.reentryCount || 0,
          addonCount: tournamentData.addonCount || 0,
          registeredAt: registeredAtIso,
          lastReentryAt: lastReentryAtIso,
          lastAddonAt: lastAddonAtIso,
          diagnostics: {
            reason: 'idempotent replay',
            reused: true,
          },
        };
      }

      // 2) bills/{billId} を読み込み、status チェック
      const billSnap = await tx.get(billRef);
      if (!billSnap.exists) {
        throw new HttpsError('not-found', `Bill not found: ${billId}`);
      }

      const billData = billSnap.data()!;
      const status = billData.status as string;
      
      // 許可: open/in_progress、拒否: settling/settled/voided
      const allowed = status === 'open' || status === 'in_progress';
      if (!allowed) {
        throw new HttpsError('failed-precondition', `Cannot record tournament action for bill with status: ${status}`);
      }

      // 3) /bills/{billId}/tournaments/{tplId} を読み込み（存在チェック）
      const tournamentSnap = await tx.get(tournamentRef);
      const tournamentExists = tournamentSnap.exists;
      const tournamentData = tournamentExists ? tournamentSnap.data()! : null;

      // 4) アクションに応じてカウンターを更新
      const now = admin.firestore.FieldValue.serverTimestamp();
      let entryCount = tournamentData?.entryCount || 0;
      let reentryCount = tournamentData?.reentryCount || 0;
      let addonCount = tournamentData?.addonCount || 0;
      let registeredAt: admin.firestore.FieldValue | admin.firestore.Timestamp | null = tournamentData?.registeredAt || null;
      let lastReentryAt: admin.firestore.FieldValue | admin.firestore.Timestamp | null = tournamentData?.lastReentryAt || null;
      let lastAddonAt: admin.firestore.FieldValue | admin.firestore.Timestamp | null = tournamentData?.lastAddonAt || null;

      if (action === 'entry') {
        entryCount = 1;
        registeredAt = now;
      } else if (action === 'reentry') {
        reentryCount = (reentryCount || 0) + 1;
        lastReentryAt = now;
      } else if (action === 'addon') {
        addonCount = (addonCount || 0) + 1;
        lastAddonAt = now;
      }

      // 5) /bills/{billId}/tournaments/{tplId} をupsert
      // nullが渡された場合は既存の値を保持（各アクションで必要なフィールドのみを更新）
      const tournamentUpdate: any = {
        templateId,
        templateName: templateName || tournamentData?.templateName || null,
        entryFeeIncl: entryFeeIncl !== null && entryFeeIncl !== undefined ? entryFeeIncl : (tournamentData?.entryFeeIncl ?? null),
        reentryFeeIncl: reentryFeeIncl !== null && reentryFeeIncl !== undefined ? reentryFeeIncl : (tournamentData?.reentryFeeIncl ?? null),
        addonFeeIncl: addonFeeIncl !== null && addonFeeIncl !== undefined ? addonFeeIncl : (tournamentData?.addonFeeIncl ?? null),
        entryCount,
        reentryCount,
        addonCount,
        registeredAt: registeredAt || null,
        startAt: startAt || tournamentData?.startAt || null,
        lastReentryAt: lastReentryAt || null,
        lastAddonAt: lastAddonAt || null,
        pointsAwarded: tournamentData?.pointsAwarded || null,
      };

      tx.set(tournamentRef, tournamentUpdate, { merge: true });

      // 6) 親 /bills/{billId}.updatedAt を更新
      tx.update(billRef, {
        updatedAt: now,
      });

      // 7) /bills/{billId}/idempotency/{idempotencyKey} を作成
      tx.set(idempotencyRef, {
        requestHash,
        createdAt: now,
        templateId, // templateId を保存（replay 時に使用）
        // expiresAt は保存しない（会計確定時に一括削除）
      });

      // 8) トランザクション内では registeredAt/lastReentryAt/lastAddonAt の実値を取得できないため、
      // トランザクション外で取得する（戻り値は後で設定）
      return {
        success: true,
        billId,
        templateId,
        action,
        entryCount,
        reentryCount,
        addonCount,
        registeredAt: '', // トランザクション外で設定
        lastReentryAt: null, // トランザクション外で設定
        lastAddonAt: null, // トランザクション外で設定
      };
    });

    // 9) トランザクション後に tournament ドキュメントを読み直して registeredAt/lastReentryAt/lastAddonAt の実値を取得
    const tournamentSnap = await tournamentRef.get();
    if (!tournamentSnap.exists) {
      throw new HttpsError('internal', 'Tournament document not found after transaction');
    }
    const tournamentData = tournamentSnap.data()!;
    const registeredAt = tournamentData.registeredAt;
    const lastReentryAt = tournamentData.lastReentryAt;
    const lastAddonAt = tournamentData.lastAddonAt;
    
    const registeredAtIso = registeredAt && registeredAt.toDate ? registeredAt.toDate().toISOString() : new Date().toISOString();
    const lastReentryAtIso = lastReentryAt && lastReentryAt.toDate ? lastReentryAt.toDate().toISOString() : null;
    const lastAddonAtIso = lastAddonAt && lastAddonAt.toDate ? lastAddonAt.toDate().toISOString() : null;

    // registeredAt/lastReentryAt/lastAddonAt を設定
    result.registeredAt = registeredAtIso;
    result.lastReentryAt = lastReentryAtIso;
    result.lastAddonAt = lastAddonAtIso;

    // 10) デュアルライト: todaysBills.tournaments マップに該当要素をupsert（トランザクション外でベストエフォート）
    // idempotent replay の場合は DualWrite をスキップ（完全 no-op 保証）
    let dualWriteResult: 'success' | 'failed' | 'skipped' = 'skipped';

    if ((await shouldDualWrite()) && !reused) {
      try {
        await legacyRecordTournamentActionUpdate(db, {
          billId,
          templateId,
          templateName,
          entryFee: entryFeeIncl ?? null,
          reentryFee: reentryFeeIncl ?? null,
          addonFee: addonFeeIncl ?? null,
          entryCount: result.entryCount,
          reentryCount: result.reentryCount,
          addonCount: result.addonCount,
          registeredAt: registeredAtIso,
          lastReentryAt: lastReentryAtIso,
          lastAddonAt: lastAddonAtIso,
          startAt: startAt ? startAt.toDate().toISOString() : null,
        });
        dualWriteResult = 'success';
        logger.info('dualWrite recordTournamentAction ok', {
          op: 'recordTournamentAction',
          billId,
          templateId,
          action,
          dualWriteResult: 'success',
        });
      } catch (error: any) {
        dualWriteResult = 'failed';
        logger.warn('dualWrite recordTournamentAction failed', {
          op: 'recordTournamentAction',
          billId,
          templateId,
          action,
          dualWriteResult: 'failed',
          reason: error?.message || String(error),
        });
      }
    } else {
      logger.info('dualWrite recordTournamentAction skipped', {
        op: 'recordTournamentAction',
        billId,
        templateId,
        action,
        dualWriteResult: 'skipped',
      });
    }

    logger.info('recordTournamentAction success', {
      op: 'recordTournamentAction',
      billId,
      templateId,
      action,
      idempKey: idempotencyKey,
      result: reused ? 'reused' : 'ok',
      dualWriteResult,
    });

    return result;
  } catch (error) {
    logger.error('recordTournamentAction failed', {
      op: 'recordTournamentAction',
      billId,
      templateId,
      action,
      idempKey: idempotencyKey,
      result: 'fail',
      code: error instanceof HttpsError ? error.code : 'internal',
      reason: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Failed to record tournament action');
  }
}

