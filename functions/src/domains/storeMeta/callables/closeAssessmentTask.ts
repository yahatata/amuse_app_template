/**
 * 閉店認定処理（HTTP Functions）
 * 
 * 処理内容:
 * - 閉店時間超過の確認
 * - ブロッカーの検出（activeStays where isActive == true limit 1で存在確認）
 * - 認定結果のstate docへの記録
 * 
 * 認定結果:
 * - needs_manual_close: 閉店時間超過、手動閉店が必要
 * - needs_manual_close_suppressed: manualOverrideにより抑制された
 * - already_closed: 既に閉店済み
 * - next_day_started: 次営業日が開始している
 * - skipped: スキップ（許容範囲外など）
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { logOpsError } from "../../../shared/logging/logOpsError";
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';

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

function isCloseOverrideActive(
  value: ManualOverrideLike,
  intendedBusinessDateKey: string,
  nowMillis: number
): boolean {
  if (!value || value.type !== 'close_skip') return false;
  if (value.intendedBusinessDateKey !== intendedBusinessDateKey) return false;
  const untilMillis = getOverrideUntilMillis(value);
  return untilMillis != null && untilMillis >= nowMillis;
}

export const closeAssessmentTask = onRequest(
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

      if (payload.action !== 'close_assessment') {
        res.status(400).json({ error: 'Invalid action' });
        return;
      }

      const db = getFirestore();
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);  // UTC+9
      const serverNowJst = jstNow;

      // idempotencyKeyの生成
      const idempotencyKey = `close_assessment_${payload.intendedBusinessDateKey}_${payload.scheduledAt}`;

      // トランザクション内で認定処理を実行
      await db.runTransaction(async (transaction) => {
        const stateDocRef = db.collection('storeMeta').doc('currentBusinessDay');
        const stateDoc = await transaction.get(stateDocRef);

        if (!stateDoc.exists) {
          throw new FunctionCustomError({
            errorKey: 'STORE_STATE_DOC_MISSING',
            message: 'storeMeta/currentBusinessDay が見つかりません',
            context: { reason: 'closeAssessmentTask_tx' },
          });
        }

        const stateData = stateDoc.data()!;
        const closeAssessment = stateData.closeAssessment as any;

        // 冪等性チェック
        if (closeAssessment?.idempotencyKey === idempotencyKey) {
          console.log(`既に同じidempotencyKeyで更新済みです: ${idempotencyKey}`);
          return;  // no-op
        }

        // businessDateKeyの許容範囲検証
        const d = new Date(serverNowJst);
        d.setHours(0, 0, 0, 0);
        const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const yesterdayKey = new Date(d);
        yesterdayKey.setDate(yesterdayKey.getDate() - 1);
        const yesterdayKeyStr = `${yesterdayKey.getFullYear()}-${String(yesterdayKey.getMonth() + 1).padStart(2, '0')}-${String(yesterdayKey.getDate()).padStart(2, '0')}`;

        if (payload.intendedBusinessDateKey !== todayKey && payload.intendedBusinessDateKey !== yesterdayKeyStr) {
          // 許容範囲外
          const decidedAt = Timestamp.now();
          transaction.update(stateDocRef, {
            closeAssessment: {
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
            type: 'close',
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

        const status = stateData.status as string;
        const currentBusinessDateKey = stateData.currentBusinessDateKey as string | null;
        const lastClosedBusinessDateKey = stateData.lastClosedBusinessDateKey as string | null;
        const manualOverride = stateData.manualOverride as ManualOverrideLike;
        const manualOverrides = stateData.manualOverrides as
          | { open?: ManualOverrideLike; close?: ManualOverrideLike }
          | null
          | undefined;
        const closeOverride =
          manualOverrides?.close ?? (manualOverride?.type === 'close_skip' ? manualOverride : null);
        const nowMillis = now.getTime();

        // 既に閉店済みか確認
        if (status === 'closed' && lastClosedBusinessDateKey === payload.intendedBusinessDateKey) {
          const decidedAt = Timestamp.now();
          transaction.update(stateDocRef, {
            closeAssessment: {
              idempotencyKey,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              decidedAt,
              result: 'already_closed',
              blockers: [],
              source: 'task',
              scheduledAt: payload.scheduledAt,
            },
          });
          const logRef = stateDocRef.collection('assessmentLogs').doc(idempotencyKey);
          transaction.set(logRef, {
            type: 'close',
            intendedBusinessDateKey: payload.intendedBusinessDateKey,
            scheduledAt: payload.scheduledAt,
            result: 'already_closed',
            blockers: [],
            decidedAt,
            source: 'task',
            idempotencyKey,
            createdAt: decidedAt,
          });
          return;
        }

        // 次営業日が開始しているか確認
        if (status === 'running' && currentBusinessDateKey !== payload.intendedBusinessDateKey) {
          const decidedAt = Timestamp.now();
          transaction.update(stateDocRef, {
            closeAssessment: {
              idempotencyKey,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              decidedAt,
              result: 'next_day_started',
              blockers: [],
              source: 'task',
              scheduledAt: payload.scheduledAt,
            },
          });
          const logRef = stateDocRef.collection('assessmentLogs').doc(idempotencyKey);
          transaction.set(logRef, {
            type: 'close',
            intendedBusinessDateKey: payload.intendedBusinessDateKey,
            scheduledAt: payload.scheduledAt,
            result: 'next_day_started',
            blockers: [],
            decidedAt,
            source: 'task',
            idempotencyKey,
            createdAt: decidedAt,
          });
          return;
        }

        // manualOverrideの確認
        let result: string;
        let lastSuppressedAt: Timestamp | undefined;
        let suppressedByOverride: boolean | undefined;

        if (isCloseOverrideActive(closeOverride, payload.intendedBusinessDateKey, nowMillis)) {
          result = 'needs_manual_close_suppressed';
          lastSuppressedAt = Timestamp.now();
          suppressedByOverride = true;
        } else if (status === 'running' && currentBusinessDateKey === payload.intendedBusinessDateKey) {
          result = 'needs_manual_close';
        } else {
          result = 'skipped';
        }

        // blockersの判定
        const blockers: string[] = [];
        if (result === 'needs_manual_close' || result === 'needs_manual_close_suppressed') {
          // activeStays where isActive == true limit 1 を取得し、存在すれば blockers に activeStaysNotEmpty を追加
          const activeStaysSnapshot = await db
            .collection('activeStays')
            .where('isActive', '==', true)
            .limit(1)
            .get();
          if (!activeStaysSnapshot.empty) {
            blockers.push('activeStaysNotEmpty');
          }
        }

        // 認定結果の更新とログ記録
        const decidedAt = Timestamp.now();
        transaction.update(stateDocRef, {
          closeAssessment: {
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
          type: 'close',
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
      message: '閉店認定処理でエラーが発生しました:',
      failureType: 'business',
      functionEntry: 'closeAssessmentTask',
      cause: error,
    });
      res.status(500).json({ error: error.message });
    }
  }
);
