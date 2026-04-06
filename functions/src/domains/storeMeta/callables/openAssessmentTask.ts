/**
 * 開店認定処理（HTTP Functions）
 * 
 * 処理内容:
 * - 前回の閉店処理が正常に完了しているか確認（storeMetaのみで判定、ドキュメント走査なし）
 * - businessHoursMonthlyMap参照や「前営業日＝前日」計算は行わない
 * - lastClosedBusinessDateKey と intendedBusinessDateKey の厳密整合は Phase5 では要求しない
 * - 認定結果のstate docへの記録
 * 
 * 認定結果:
 * - ready_to_open: 開店条件を満たしている
 * - needs_manual_open: 手動開店が必要
 * - already_running: 既に営業中
 * - skipped: スキップ（許容範囲外など）
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { logOpsError } from "../../../shared/logging/logOpsError";
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';

type OpenAssessmentAction = 'open_assessment' | 'open_assessment_recheck';

type ManualOverrideLike = {
  type?: string;
  intendedBusinessDateKey?: string;
  overrideUntil?: { toMillis?: () => number } | Date;
} | null;

function getOverrideUntilMillis(value: ManualOverrideLike): number | null {
  if (!value?.overrideUntil) return null;
  if (value.overrideUntil instanceof Date) return value.overrideUntil.getTime();
  if (typeof value.overrideUntil?.toMillis === 'function') {
    return value.overrideUntil.toMillis();
  }
  return null;
}

function isOpenOverrideActive(
  value: ManualOverrideLike,
  intendedBusinessDateKey: string,
  nowMillis: number
): boolean {
  if (!value || value.type !== 'open_skip') return false;
  if (value.intendedBusinessDateKey !== intendedBusinessDateKey) return false;
  const untilMillis = getOverrideUntilMillis(value);
  return untilMillis != null && untilMillis >= nowMillis;
}

export const openAssessmentTask = onRequest(
  {
    region: 'asia-northeast1',
  },
  async (req, res) => {
    try {
      const payload = req.body as {
        action: string;
        intendedBusinessDateKey: string;
        scheduledAt: string;
      };

      const action = payload.action as OpenAssessmentAction;
      if (action !== 'open_assessment' && action !== 'open_assessment_recheck') {
        res.status(400).json({ error: 'Invalid action' });
        return;
      }
      if (
        typeof payload.intendedBusinessDateKey !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(payload.intendedBusinessDateKey)
      ) {
        res.status(400).json({ error: 'Invalid intendedBusinessDateKey' });
        return;
      }
      if (
        typeof payload.scheduledAt !== 'string' ||
        payload.scheduledAt.trim().length === 0
      ) {
        res.status(400).json({ error: 'Invalid scheduledAt' });
        return;
      }

      const db = getFirestore();
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);  // UTC+9
      const serverNowJst = jstNow;

      // idempotencyKeyの生成
      const idempotencyKey = `${action}_${payload.intendedBusinessDateKey}_${payload.scheduledAt}`;

      // トランザクション内で認定処理を実行
      await db.runTransaction(async (transaction) => {
        const stateDocRef = db.collection('storeMeta').doc('currentBusinessDay');
        const stateDoc = await transaction.get(stateDocRef);

        if (!stateDoc.exists) {
          throw new FunctionCustomError({
            errorKey: 'STORE_STATE_DOC_MISSING',
            message: 'storeMeta/currentBusinessDay が見つかりません',
            context: { reason: 'openAssessmentTask_tx' },
          });
        }

        const stateData = stateDoc.data()!;
        const openAssessment = stateData.openAssessment as any;

        // 冪等性チェック
        if (openAssessment?.idempotencyKey === idempotencyKey) {
          console.log(`既に同じidempotencyKeyで更新済みです: ${idempotencyKey}`);
          return;  // no-op
        }

        // businessDateKeyの許容範囲検証（通常評価のみ。再評価では日付範囲スキップ）
        if (action === 'open_assessment') {
          const d = new Date(serverNowJst);
          d.setHours(0, 0, 0, 0);
          const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const tomorrowKey = new Date(d);
          tomorrowKey.setDate(tomorrowKey.getDate() + 1);
          const tomorrowKeyStr = `${tomorrowKey.getFullYear()}-${String(tomorrowKey.getMonth() + 1).padStart(2, '0')}-${String(tomorrowKey.getDate()).padStart(2, '0')}`;

          if (payload.intendedBusinessDateKey !== todayKey && payload.intendedBusinessDateKey !== tomorrowKeyStr) {
            // 許容範囲外
            const decidedAt = Timestamp.now();
            transaction.update(stateDocRef, {
              openAssessment: {
                idempotencyKey,
                intendedBusinessDateKey: payload.intendedBusinessDateKey,
                decidedAt,
                result: 'skipped',
                blockers: ['date_out_of_range'],
                source: 'task',
                scheduledAt: payload.scheduledAt,
              },
            });
            const logRef = stateDocRef.collection('assessmentLogs').doc(idempotencyKey);
            transaction.set(logRef, {
              type: 'open',
              action,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              scheduledAt: payload.scheduledAt,
              result: 'skipped',
              blockers: ['date_out_of_range'],
              decidedAt,
              source: 'task',
              idempotencyKey,
              createdAt: decidedAt,
            });
            return;
          }
        }

        const status = stateData.status as string;
        const currentBusinessDateKey = stateData.currentBusinessDateKey as string | null;
        const lastClosedBusinessDateKey = stateData.lastClosedBusinessDateKey as string | null;
        const lastError = stateData.lastError as any;
        const manualOverride = stateData.manualOverride as ManualOverrideLike;
        const manualOverrides = stateData.manualOverrides as
          | { open?: ManualOverrideLike; close?: ManualOverrideLike }
          | null
          | undefined;
        const openOverride =
          manualOverrides?.open ?? (manualOverride?.type === 'open_skip' ? manualOverride : null);
        const nowMillis = now.getTime();
        const openOverrideActive = isOpenOverrideActive(
          openOverride,
          payload.intendedBusinessDateKey,
          nowMillis
        );

        // 既に営業中か確認
        if (status === 'running' && currentBusinessDateKey === payload.intendedBusinessDateKey) {
          const decidedAt = Timestamp.now();
          transaction.update(stateDocRef, {
            openAssessment: {
              idempotencyKey,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              decidedAt,
              result: 'already_running',
              blockers: [],
              source: 'task',
              scheduledAt: payload.scheduledAt,
            },
          });
          const logRef = stateDocRef.collection('assessmentLogs').doc(idempotencyKey);
          transaction.set(logRef, {
            type: 'open',
            action,
            intendedBusinessDateKey: payload.intendedBusinessDateKey,
            scheduledAt: payload.scheduledAt,
            result: 'already_running',
            blockers: [],
            decidedAt,
            source: 'task',
            idempotencyKey,
            createdAt: decidedAt,
          });
          return;
        }

        // 営業中に別日付の開店が走ることを防止
        if (status === 'running' && currentBusinessDateKey !== payload.intendedBusinessDateKey) {
          const decidedAt = Timestamp.now();
          const lastSuppressedAt = openOverrideActive ? Timestamp.now() : undefined;
          transaction.update(stateDocRef, {
            openAssessment: {
              idempotencyKey,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              decidedAt,
              result: 'skipped',
              blockers: ['already_running_different_date'],
              source: 'task',
              scheduledAt: payload.scheduledAt,
              ...(lastSuppressedAt && { lastSuppressedAt }),
              ...(openOverrideActive ? { suppressedByOverride: true } : {}),
            },
          });
          const logRef = stateDocRef.collection('assessmentLogs').doc(idempotencyKey);
          const logData: Record<string, unknown> = {
            type: 'open',
            action,
            intendedBusinessDateKey: payload.intendedBusinessDateKey,
            scheduledAt: payload.scheduledAt,
            result: 'skipped',
            blockers: ['already_running_different_date'],
            decidedAt,
            source: 'task',
            idempotencyKey,
            createdAt: decidedAt,
          };
          if (openOverrideActive) {
            logData.suppressedByOverride = true;
          }
          transaction.set(logRef, logData);
          return;
        }

        // 開店条件の確認（storeMetaのみで判定）
        // 注意: businessHoursMonthlyMap参照や「前営業日＝前日」計算は行わない
        // lastClosedBusinessDateKey と intendedBusinessDateKey の厳密整合は Phase5 では要求しない
        let result: string;
        const blockers: string[] = [];
        let lastSuppressedAt: Timestamp | undefined;
        let suppressedByOverride: boolean | undefined;

        if (status === 'closed' || status === 'error') {
          // 前回の閉店処理が正常に完了しているか確認（storeMetaのみで判定）
          if (status !== 'closed') {
            blockers.push('status_not_closed');
          }
          if (!lastClosedBusinessDateKey) {
            blockers.push('lastClosedBusinessDateKey_missing');
          }
          if (lastError !== null) {
            blockers.push('lastError_exists');
          }

          if (blockers.length === 0) {
            result = 'ready_to_open';
          } else {
            result = 'needs_manual_open';
          }
        } else {
          result = 'skipped';
        }

        // manualOverrideの確認（manualOverrides.open を優先、旧manualOverrideはfallback）
        if (openOverrideActive) {
          lastSuppressedAt = Timestamp.now();
          suppressedByOverride = true;
          // resultは維持（needs_manual_openのまま）
        }

        // 認定結果の更新とログ記録
        const decidedAt = Timestamp.now();
        transaction.update(stateDocRef, {
          openAssessment: {
            idempotencyKey,
            intendedBusinessDateKey: payload.intendedBusinessDateKey,
            decidedAt,
            result,
            blockers,
            source: 'task',
            scheduledAt: payload.scheduledAt,
            ...(lastSuppressedAt && { lastSuppressedAt }),
            ...(suppressedByOverride !== undefined && { suppressedByOverride }),
          },
        });
        const logRef = stateDocRef.collection('assessmentLogs').doc(idempotencyKey);
        const logData: Record<string, unknown> = {
          type: 'open',
          action,
          intendedBusinessDateKey: payload.intendedBusinessDateKey,
          scheduledAt: payload.scheduledAt,
          result,
          blockers,
          decidedAt,
          source: 'task',
          idempotencyKey,
          createdAt: decidedAt,
        };
        if (suppressedByOverride !== undefined) {
          logData.suppressedByOverride = suppressedByOverride;
        }
        transaction.set(logRef, logData);
      });

      res.status(200).json({ success: true });
    } catch (error: any) {
      logOpsError({
      message: '開店認定処理でエラーが発生しました:',
      failureType: 'business',
      functionEntry: 'openAssessmentTask',
      cause: error,
    });
      res.status(500).json({ error: error.message });
    }
  }
);
