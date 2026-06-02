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
import { logOpsError, logOpsInfo, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import { extractSchedulerChildExecutionMetadata } from '../../scheduler/supervisor/schedulerCorrelation';

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

/** 対象営業日が手動閉店済みか（YYYY-MM-DD ゼロ埋め前提の文字列比較）。 */
export function isTargetDayAlreadyClosed(
  lastClosedBusinessDateKey: string | null | undefined,
  intendedBusinessDateKey: string
): boolean {
  const lastClosed = lastClosedBusinessDateKey?.trim();
  if (!lastClosed) return false;
  return lastClosed >= intendedBusinessDateKey;
}

export const closeAssessmentTask = onRequest(
  {
    region: 'asia-northeast1',
  },
  async (req, res) => {
    const schedulerMetadata = extractSchedulerChildExecutionMetadata(req.body);
    try {
      const payload = req.body as {
        action: string;
        intendedBusinessDateKey: string;
        scheduledAt: string;
        schedulerParentJobKey?: string;
        schedulerParentPlanningDate?: string;
        schedulerParentPlannedRunAt?: string;
        schedulerParentIdempotencyKey?: string;
        schedulerParentSupervisorRunId?: string;
        schedulerChildUnitKey?: string;
        schedulerChildFunctionEntry?: string;
      };

      if (payload.action !== 'close_assessment') {
        res.status(400).json({ error: 'Invalid action' });
        return;
      }

      const db = getFirestore();
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);  // UTC+9
      const serverNowJst = jstNow;
      let taskResult = 'unknown';
      let taskBlockers: string[] = [];

      const setTaskOutcome = (result: string, blockers: string[] = []) => {
        taskResult = result;
        taskBlockers = [...blockers];
      };

      // idempotencyKeyの生成
      const idempotencyKey = `close_assessment_${payload.intendedBusinessDateKey}_${payload.scheduledAt}`;

      let staleSkipLogContext: Record<string, unknown> | null = null;

      logOpsInfo({
        message: 'closeAssessmentTask start',
        functionEntry: 'closeAssessmentTask',
        operation: 'start',
        context: {
          intendedBusinessDateKey: payload.intendedBusinessDateKey,
          idempotencyKey,
          scheduledAt: payload.scheduledAt,
          ...schedulerMetadata,
        },
      });

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
          setTaskOutcome('duplicate_idempotency');
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
          setTaskOutcome('skipped', ['date_out_of_range']);
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
          setTaskOutcome('already_closed');
          return;
        }

        // 対象営業日は手動閉店済み → 古い close_assessment タスクを無害化
        if (
          isTargetDayAlreadyClosed(
            lastClosedBusinessDateKey,
            payload.intendedBusinessDateKey
          )
        ) {
          const decidedAt = Timestamp.now();
          staleSkipLogContext = {
            intendedBusinessDateKey: payload.intendedBusinessDateKey,
            currentBusinessDateKey: currentBusinessDateKey ?? null,
            lastClosedBusinessDateKey: lastClosedBusinessDateKey ?? null,
            scheduledAt: payload.scheduledAt,
            reason: 'target_day_already_closed',
          };
          transaction.update(stateDocRef, {
            closeAssessment: {
              idempotencyKey,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              decidedAt,
              result: 'skipped',
              blockers: ['target_day_already_closed'],
              source: 'task',
              scheduledAt: payload.scheduledAt,
              currentBusinessDateKey: currentBusinessDateKey ?? null,
              lastClosedBusinessDateKey: lastClosedBusinessDateKey ?? null,
            },
          });
          const logRef = stateDocRef.collection('assessmentLogs').doc(idempotencyKey);
          transaction.set(logRef, {
            type: 'close',
            intendedBusinessDateKey: payload.intendedBusinessDateKey,
            scheduledAt: payload.scheduledAt,
            result: 'skipped',
            blockers: ['target_day_already_closed'],
            decidedAt,
            source: 'task',
            idempotencyKey,
            createdAt: decidedAt,
            currentBusinessDateKey: currentBusinessDateKey ?? null,
            lastClosedBusinessDateKey: lastClosedBusinessDateKey ?? null,
          });
          setTaskOutcome('skipped', ['target_day_already_closed']);
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
          setTaskOutcome('next_day_started');
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
        setTaskOutcome(result, blockers);
      });

      if (staleSkipLogContext != null) {
        logOpsInfo({
          message: 'closeAssessmentTask stale task skipped',
          functionEntry: 'closeAssessmentTask',
          operation: 'staleTaskSkipped',
          context: staleSkipLogContext,
        });
      }

      logOpsSuccess({
        message: 'closeAssessmentTask 成功',
        functionEntry: 'closeAssessmentTask',
        context: {
          intendedBusinessDateKey: payload.intendedBusinessDateKey,
          scheduledAt: payload.scheduledAt,
          idempotencyKey: `close_assessment_${payload.intendedBusinessDateKey}_${payload.scheduledAt}`,
          result: taskResult,
          blockers: taskBlockers,
          ...schedulerMetadata,
        },
      });

      res.status(200).json({ success: true });
    } catch (error: any) {
      logOpsError({
        message: '閉店認定処理でエラーが発生しました:',
        functionEntry: 'closeAssessmentTask',
        cause: error,
        context: {
          intendedBusinessDateKey: (req.body as { intendedBusinessDateKey?: string })?.intendedBusinessDateKey,
          action: (req.body as { action?: string })?.action,
          ...schedulerMetadata,
        },
      });
      res.status(500).json({ error: error.message });
    }
  }
);
