/**
 * Step 4: enqueue バッチのコアロジック
 *
 * 対象期間内の scheduledTournament を取得し、taskIndex と突合して Cloud Tasks を投入する。
 * changeSpec Step 4 準拠。
 */

import * as crypto from 'crypto';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { logOpsError } from '../../../shared/logging/logOpsError';
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import { validateStoreTenantForProduction, isProductionRuntime } from '../../../shared/runtime';
import { resolveStoreTenantForWrite } from '../../../shared/runtime/storeTenantIdentity';
import { enqueueTournamentTask } from './tasks';

const HORIZON_DAYS = 14;
const LOOKBACK_HOURS = 6;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 500;
const CONCURRENCY_LIMIT = 5;

export const TASK_TYPES = ['startTournament', 'closeRegistration'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export interface RunEnqueueOptions {
  horizonDays?: number;
  lookbackHours?: number;
  tenantId?: string;
  storeId?: string;
  rangeStartAt?: string;
  rangeEndAt?: string;
  now?: Date;
}

export interface RunEnqueueResult {
  success: boolean;
  processedCount: number;
  enqueuedCount: number;
  errors?: Array<{ tournamentId: string; error: string }>;
}

/**
 * planHash を算出（changeSpec 5.1）
 */
export function computePlanHash(
  taskType: string,
  tournamentId: string,
  targetAt: Date | Timestamp,
  planVersion: number
): string {
  const targetAtMillis =
    targetAt instanceof Timestamp ? targetAt.toMillis() : new Date(targetAt).getTime();
  const input = `${taskType}:${tournamentId}:${targetAtMillis}:${planVersion}`;
  // taskName 衝突防止のため 32 文字（spec「16文字程度」より延長。フル64も可）
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 32);
}

/**
 * regEndAt を再計算（changeSpec 3）
 * blindTemplate 取得不能時は null を返す（closeRegistration をスキップ）
 */
export async function computeRegEndAt(
  db: FirebaseFirestore.Firestore,
  startAt: Date | Timestamp,
  blindStructureId: string | undefined
): Promise<Date | null> {
  if (!blindStructureId) return null;

  const blindDoc = await db.collection('blindTemplates').doc(blindStructureId).get();
  if (!blindDoc.exists) return null;

  const blind = blindDoc.data()!;
  const levels = blind.levels || [];
  const lateRegUntilLev = blind.lateRegUntilLev ?? 0;
  const breakDuration = (blind.breakDuration ?? 0) * 60;

  if (levels.length === 0) return null;

  if (lateRegUntilLev <= 0) {
    const startMs = startAt instanceof Timestamp ? startAt.toMillis() : new Date(startAt).getTime();
    return new Date(startMs);
  }

  const stages: Array<{ type: string; lev?: number; durationSec: number }> = [];
  for (const level of levels) {
    stages.push({
      type: 'level',
      lev: level.level,
      durationSec: (level.duration || 0) * 60,
    });
    if (level.hasBreakAfter) {
      stages.push({ type: 'break', durationSec: breakDuration });
    }
  }

  let totalDurationSec = 0;
  for (const stage of stages) {
    if (stage.type === 'level' && stage.lev === lateRegUntilLev + 1) break;
    totalDurationSec += stage.durationSec;
  }

  const startMs = startAt instanceof Timestamp ? startAt.toMillis() : new Date(startAt).getTime();
  return new Date(startMs + totalDurationSec * 1000);
}

/**
 * Step 8.5: 必須フィールドの検証（タスク種別ごとの共通必須のみ）。
 * startTournament に必要な最低限を検証。closeRegistration は blindStructure が
 * 実質必須だが、processTournament 内で regEndAt が null のときスキップする。
 *
 * タスク種別ごとの必須条件:
 * - startTournament: startAt, storeId, tenantId（blindStructure は任意）
 * - closeRegistration: 上記＋blindStructureId/blindStructure（processTournament で regEndAt 再計算時に検知、該当 taskType のみスキップ）
 *
 * テスト用に export。
 */
export function validateRequiredFields(data: FirebaseFirestore.DocumentData): string | null {
  if (!data.startAt) return 'missing_startAt';
  try {
    const raw = data.startAt;
    const startAt = typeof raw?.toDate === 'function' ? raw.toDate() : raw instanceof Date ? raw : new Date(raw);
    if (!(startAt instanceof Date) || isNaN(startAt.getTime())) return 'invalid_startAt';
  } catch {
    return 'invalid_startAt';
  }

  const storeId = data.storeId;
  if (!storeId || typeof storeId !== 'string' || storeId.trim() === '') return 'missing_storeId';

  const tenantId = data.tenantId;
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') return 'missing_tenantId';

  // blindStructure は closeRegistration のみ必須。startTournament は不要。
  // processTournament 内で regEndAt が null のとき closeRegistration をスキップする。

  return null;
}

/**
 * 対象 tournament について taskIndex を突合し、必要に応じて Cloud Tasks を投入
 */
async function processTournament(
  db: FirebaseFirestore.Firestore,
  tournamentId: string,
  doc: FirebaseFirestore.DocumentData,
  now: Date,
  thirtyDaysFromNow: Date
): Promise<{ enqueued: number }> {
  let enqueued = 0;
  const planVersion = doc.schedulePlanVersion ?? 0;
  // Phase0A D-13: 本番で storeId/tenantId 欠損・default-store は throw（failed 扱い）
  if (isProductionRuntime()) {
    validateStoreTenantForProduction(doc.storeId, doc.tenantId);
  }
  const { storeId } = resolveStoreTenantForWrite(doc.storeId, doc.tenantId);
  const startAt = doc.startAt?.toDate?.() ?? (doc.startAt instanceof Date ? doc.startAt : null);
  if (!startAt) return { enqueued };

  const snapshot = doc.snapshot || {};
  const blindStructureId = snapshot.blindStructure || snapshot.blindStructureId;

  const regEndAt = await computeRegEndAt(db, startAt, blindStructureId);

  const taskIndexRef = (t: TaskType) =>
    db.collection('scheduledTournaments').doc(tournamentId).collection('taskIndex').doc(t);

  const results: Record<TaskType, 'done' | 'pending'> = {
    startTournament: 'pending',
    closeRegistration: 'pending',
  };

  for (const taskType of TASK_TYPES) {
    const targetAt =
      taskType === 'startTournament' ? startAt : taskType === 'closeRegistration' ? regEndAt : null;
    if (!targetAt) {
      // closeRegistration が blindTemplate 欠落でスキップ(null) の場合は「未完」扱い。
      // results.closeRegistration は初期値 'pending' のまま → taskSyncNeeded を false に落とさない（再試行対象として残す）。
      continue;
    }

    const targetTimestamp = targetAt instanceof Timestamp ? targetAt : Timestamp.fromDate(targetAt);
    const planHash = computePlanHash(taskType, tournamentId, targetAt, planVersion);

    const idxRef = taskIndexRef(taskType);
    const idxSnap = await idxRef.get();

    const enqueueDueDate = targetTimestamp.toDate();

    let currentPlanHash = '';
    let currentState = 'pending';

    if (idxSnap.exists) {
      const idxData = idxSnap.data()!;
      currentPlanHash = idxData.planHash ?? '';
      currentState = idxData.enqueueState ?? 'pending';
    }

    if (currentPlanHash && currentPlanHash === planHash) {
      if (currentState === 'enqueued' || currentState === 'executed') {
        results[taskType] = 'done';
        continue;
      }
    }

    const updateData: Record<string, unknown> = {
      taskType,
      targetAt: targetTimestamp,
      enqueueDueAt: targetTimestamp,
      planVersion,
      planHash,
      enqueueState: 'pending',
      lastEvaluatedAt: Timestamp.now(),
    };

    if (!idxSnap.exists) {
      await idxRef.set(updateData);
    } else {
      await idxRef.update(updateData);
    }

    if (enqueueDueDate <= thirtyDaysFromNow) {
      try {
        const taskName = await enqueueTournamentTask(
          tournamentId,
          taskType,
          planVersion,
          planHash,
          enqueueDueDate.toISOString(),
          storeId,
          enqueueDueDate
        );
        enqueued++;
        const deterministicName = `${tournamentId}-${taskType}-${planHash}`;
        await idxRef.update({
          enqueueState: 'enqueued',
          taskName: taskName || deterministicName,
          lastEnqueuedAt: Timestamp.now(),
        });
        results[taskType] = 'done';
      } catch (err) {
        logOpsError({
          message: 'enqueueTournamentTask failed',
          functionEntry: 'runEnqueueTournamentTasks',
          operation: 'enqueueTournamentTask',
          cause: err,
          context: { tournamentId, taskType },
          sourceProductHint: 'cloud_tasks',
        });
        await idxRef.update({
          enqueueState: 'failed',
          error: {
            code: 'ENQUEUE_FAILED',
            message: err instanceof Error ? err.message : String(err),
            at: Timestamp.now(),
          },
        });
      }
    } else {
      results[taskType] = 'pending';
    }
  }

  const allDone = results.startTournament !== 'pending' && results.closeRegistration !== 'pending';
  if (allDone) {
    const tRef = db.collection('scheduledTournaments').doc(tournamentId);
    await tRef.update({ taskSyncNeeded: false });
  }

  return { enqueued };
}

/**
 * メイン実行
 */
export async function runEnqueueTournamentTasks(
  options: RunEnqueueOptions = {}
): Promise<RunEnqueueResult> {
  const { getStoreConfig } = await import('../../../shared/config/configLoader');
  const storeConfig = await getStoreConfig();
  if (!storeConfig.features?.enqueueSchedulerEnabled) {
    logger.info('runEnqueueTournamentTasks: スキップ（features.enqueueSchedulerEnabled != true）');
    return { success: true, processedCount: 0, enqueuedCount: 0 };
  }

  const horizonDays = options.horizonDays ?? HORIZON_DAYS;
  const lookbackHours = options.lookbackHours ?? LOOKBACK_HOURS;

  const db = getFirestore();
  const now = options.now ?? new Date();
  if (
    (options.rangeStartAt && !options.rangeEndAt) ||
    (!options.rangeStartAt && options.rangeEndAt)
  ) {
    throw new FunctionCustomError({
      errorKey: 'TOURNAMENT_INVALID_STATE',
      message: 'Both rangeStartAt and rangeEndAt are required when explicit range is used',
      context: { phase: 'enqueue', reason: 'range_partial' },
    });
  }
  const hasExplicitRange = Boolean(options.rangeStartAt && options.rangeEndAt);
  const rangeStart = hasExplicitRange ?
    new Date(options.rangeStartAt as string) :
    new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
  const rangeEnd = hasExplicitRange ?
    new Date(options.rangeEndAt as string) :
    new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    throw new FunctionCustomError({
      errorKey: 'TOURNAMENT_INVALID_STATE',
      message: 'Invalid enqueue rangeStartAt/rangeEndAt',
      context: { phase: 'enqueue', reason: 'range_parse' },
    });
  }
  if (rangeStart.getTime() >= rangeEnd.getTime()) {
    throw new FunctionCustomError({
      errorKey: 'TOURNAMENT_INVALID_STATE',
      message: 'enqueue rangeStartAt must be before rangeEndAt',
      context: { phase: 'enqueue', reason: 'range_order' },
    });
  }

  const thirtyDaysFromNow = new Date(now.getTime() + THIRTY_DAYS_MS);

  const rangeStartTs = Timestamp.fromDate(rangeStart);
  const rangeEndTs = Timestamp.fromDate(rangeEnd);

  let query: FirebaseFirestore.Query = db
    .collection('scheduledTournaments')
    .where('status', '==', 'scheduled');

  if (options.storeId) {
    query = query.where('storeId', '==', options.storeId);
  }
  if (options.tenantId) {
    query = query.where('tenantId', '==', options.tenantId);
  }

  query = query
    .where('startAt', '>=', rangeStartTs)
    .where('startAt', '<', rangeEndTs)
    .orderBy('startAt')
    .limit(BATCH_LIMIT);

  const snapshot = await query.get();
  const errors: Array<{ tournamentId: string; error: string }> = [];
  let processedCount = 0;
  let enqueuedCount = 0;

  // Step 8.5: 既存データ混入ガード - 必須フィールドが揃っていない doc を即スキップ
  const toProcess: Array<{ id: string; data: FirebaseFirestore.DocumentData }> = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.isArchived === true) continue;
    if (data.taskSyncNeeded === false) continue;

    const skipReason = validateRequiredFields(data);
    if (skipReason) {
      logger.warn('runEnqueueTournamentTasks: skipping doc (incomplete/invalid)', {
        tournamentId: doc.id,
        reason: skipReason,
      });
      continue;
    }

    toProcess.push({ id: doc.id, data });
  }

  for (let i = 0; i < toProcess.length; i += CONCURRENCY_LIMIT) {
    const chunk = toProcess.slice(i, i + CONCURRENCY_LIMIT);
    const results = await Promise.all(
      chunk.map(async ({ id, data }) => {
        try {
          const { enqueued } = await processTournament(
            db,
            id,
            data,
            now,
            thirtyDaysFromNow
          );
          return { success: true as const, enqueued };
        } catch (err) {
          errors.push({
            tournamentId: id,
            error: err instanceof Error ? err.message : String(err),
          });
          return { success: false as const, enqueued: 0 };
        }
      })
    );
    processedCount += results.filter((r) => r.success).length;
    enqueuedCount += results.reduce((sum, r) => sum + r.enqueued, 0);
  }

  return {
    success: errors.length === 0,
    processedCount,
    enqueuedCount,
    errors: errors.length > 0 ? errors : undefined,
  };
}
