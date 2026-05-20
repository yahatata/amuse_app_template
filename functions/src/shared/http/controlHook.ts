import { Request, Response } from 'express';
import { logger } from 'firebase-functions';
import { logOpsError, logOpsInfo, logOpsSuccess } from '../logging/logOpsError';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

/**
 * Cloud Tasks からの HTTP リクエストを受け付けるエンドポイント
 * トーナメントの自動開始とレイトレジ締切を処理
 *
 * Step 6: 新 payload（taskType, planVersion, planHash）と旧 payload（action, rev）の両方を受付
 */

const VALID_TASK_TYPES = ['startTournament', 'closeRegistration'] as const;
type NewTaskType = (typeof VALID_TASK_TYPES)[number];

interface NewPayload {
  tournamentId: string;
  taskType: string;
  planVersion: number;
  planHash: string;
  scheduledAt?: string;
  storeId?: string;
}

function isNewPayload(body: unknown): body is NewPayload {
  return (
    typeof body === 'object' &&
    body !== null &&
    'taskType' in body &&
    typeof (body as NewPayload).taskType === 'string'
  );
}

function isOldPayload(body: unknown): body is { action: string; tournamentId: string; rev: number } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'action' in body &&
    typeof (body as { action: string }).action === 'string'
  );
}

/** 7.3, Step 8.5: taskIndex 不在時のログ必須 5 項目。warn で検知性向上 */
function logTaskIndexMissing(
  tournamentId: string,
  taskType: string,
  planVersion: number,
  planHash: string,
  cloudTaskName: string | undefined
) {
  logger.warn('controlHook: taskIndex missing, no-op', {
    tournamentId,
    taskType,
    planVersion,
    planHash,
    cloudTaskName: cloudTaskName ?? null,
  });
}

/** Cloud Tasks が渡すタスク名ヘッダ（取得可能な場合） */
function getCloudTaskName(req: Request): string | undefined {
  const v =
    req.headers['x-cloudtasks-taskname'] ??
    req.headers['X-CloudTasks-TaskName'];
  return typeof v === 'string' ? v : undefined;
}

/**
 * taskIndex 不在の no-op が「本処理がまだ適用される状態なのに index だけ無い」実行漏れ疑いか。
 * runTransaction 内の更新条件と整合させる。
 */
function isTaskIndexMissingSuspiciousExecutionGap(
  taskType: NewTaskType,
  tournamentData: Record<string, unknown>,
  runtimeData: Record<string, unknown>
): boolean {
  const status = tournamentData.status as string | undefined;
  if (taskType === 'startTournament') {
    return status === 'scheduled' && !runtimeData.startedAt;
  }
  if (taskType === 'closeRegistration') {
    return status === 'running' && !runtimeData.registAt;
  }
  return false;
}

export const controlHook = async (req: Request, res: Response) => {
  try {
    if (req.method !== 'POST') {
      logger.warn('controlHook: Invalid method', { method: req.method });
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('controlHook: Missing or invalid authorization header');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = req.body;

    // 4.1 payload 分岐
    if (isNewPayload(body)) {
      await handleNewPayload(req, res, body);
      return;
    }
    if (isOldPayload(body)) {
      await handleOldPayload(req, res, body);
      return;
    }

    logger.warn('controlHook: Neither taskType nor action present');
    res.status(400).json({ error: 'Missing taskType or action in payload' });
  } catch (error) {
    logOpsError({
      message: 'controlHook: Error processing request',
      functionEntry: 'controlHookHttp',
      operation: 'validateControlHookRequest',
      cause: error,
    });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/** 新 payload 処理（5章） */
async function handleNewPayload(
  req: Request,
  res: Response,
  body: NewPayload
): Promise<void> {
  logOpsInfo({
    message: 'controlHookHttp start',
    functionEntry: 'controlHookHttp',
    operation: 'start',
    context: {
      tournamentId: body.tournamentId,
      taskType: body.taskType,
      planVersion: body.planVersion,
      planHash: body.planHash,
    },
  });

  const { tournamentId, taskType, planVersion, planHash } = body;
  const db = getFirestore();
  const taskIndexRef = db
    .collection('scheduledTournaments')
    .doc(tournamentId)
    .collection('taskIndex')
    .doc(taskType);

  const updateTaskIndexFailed = async (code: string, message: string) => {
    const snap = await taskIndexRef.get();
    if (snap.exists) {
      await taskIndexRef.update({
        enqueueState: 'failed',
        error: { code, message, at: Timestamp.now() },
      });
    }
  };

  try {
  // 4.2, 5.1 必須検証
  if (
    !tournamentId ||
    typeof tournamentId !== 'string' ||
    !taskType ||
    typeof taskType !== 'string' ||
    planVersion === undefined ||
    planVersion === null ||
    !planHash ||
    typeof planHash !== 'string'
  ) {
    logger.warn('controlHook: New payload missing required fields', {
      tournamentId: !!tournamentId,
      taskType: !!taskType,
      planVersion,
      planHash: !!planHash,
    });
    res.status(400).json({
      error: 'Missing required parameters: tournamentId, taskType, planVersion, planHash',
    });
    return;
  }

  if (!VALID_TASK_TYPES.includes(taskType as NewTaskType)) {
    logger.warn('controlHook: Invalid taskType', { taskType });
    res.status(400).json({
      error: 'Invalid taskType. Must be "startTournament" or "closeRegistration"',
    });
    return;
  }

  const cloudTaskName = getCloudTaskName(req);
  const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
  const runtimeRef = tournamentRef.collection('views').doc('runtime');

  // 2. tournament, runtime 取得 → 不在時 404
  const [tournamentDoc, runtimeDoc] = await Promise.all([
    tournamentRef.get(),
    runtimeRef.get(),
  ]);

  if (!tournamentDoc.exists || !runtimeDoc.exists) {
    const code = !tournamentDoc.exists ? 'TOURNAMENT_NOT_FOUND' : 'RUNTIME_NOT_FOUND';
    const taskIndexSnap = await taskIndexRef.get();
    if (taskIndexSnap.exists) {
      const now = Timestamp.now();
      await taskIndexRef.update({
        enqueueState: 'failed',
        error: {
          code,
          message: `${code}: ${tournamentId}`,
          at: now,
        },
      });
    }
    logger.warn('controlHook: tournament/runtime not found', {
      tournamentId,
      taskType,
      code,
    });
    res.status(404).json({ error: code });
    return;
  }

  const tournamentData = tournamentDoc.data() as Record<string, unknown>;
  const runtimeData = runtimeDoc.data() as Record<string, unknown>;

  // 3. taskIndex 取得 → 存在しない場合 200 no-op（実行漏れ疑い時は logOpsError）
  const taskIndexSnap = await taskIndexRef.get();
  if (!taskIndexSnap.exists) {
    const typedTaskType = taskType as NewTaskType;
    const suspicious = isTaskIndexMissingSuspiciousExecutionGap(
      typedTaskType,
      tournamentData,
      runtimeData
    );
    if (suspicious) {
      logOpsError({
        message:
          'controlHook: taskIndex 不在かつ本処理未実行状態のため enqueue/データ整合性の確認が必要（Cloud Tasks は 200 で成功扱いのまま）',
        functionEntry: 'controlHookHttp',
        operation: 'controlHookTaskIndexMissingSuspicious',
        cause: new Error('control_hook_task_index_missing_suspicious'),
        context: {
          tournamentId,
          taskType,
          planVersion,
          planHash,
          cloudTaskName: cloudTaskName ?? null,
          tournamentStatus: (tournamentData.status as string | undefined) ?? null,
          hasStartedAt: Boolean(runtimeData.startedAt),
          hasRegistAt: Boolean(runtimeData.registAt),
        },
      });
    } else {
      logTaskIndexMissing(tournamentId, taskType, planVersion, planHash, cloudTaskName);
    }
    res.status(200).json({ success: true, message: 'no-op (taskIndex missing)' });
    return;
  }

  const taskIndexData = taskIndexSnap.data()!;
  const schedulePlanVersion = tournamentData.schedulePlanVersion ?? 0;
  const now = Timestamp.now();

  // 4. schedulePlanVersion 比較
  if (schedulePlanVersion !== planVersion) {
    await taskIndexRef.update({
      enqueueState: 'executed',
      lastRunAt: now,
      lastRunResult: 'noop',
    });
    logger.info('controlHook: no-op version mismatch', {
      tournamentId,
      taskType,
      schedulePlanVersion,
      planVersion,
    });
    res.status(200).json({ success: true, message: 'no-op (version mismatch)' });
    return;
  }

  // 5. planHash 比較
  const taskIndexPlanHash = taskIndexData.planHash ?? '';
  if (taskIndexPlanHash !== planHash) {
    await taskIndexRef.update({
      enqueueState: 'executed',
      lastRunAt: now,
      lastRunResult: 'noop',
    });
    logger.info('controlHook: no-op hash mismatch', {
      tournamentId,
      taskType,
    });
    res.status(200).json({ success: true, message: 'no-op (hash mismatch)' });
    return;
  }

  // 6. トランザクション内で本処理
  await db.runTransaction(async (transaction) => {
    const [tDoc, rDoc] = await Promise.all([
      transaction.get(tournamentRef),
      transaction.get(runtimeRef),
    ]);
    const tData = tDoc.data()!;
    const rData = rDoc.data()!;

    let mainSuccess = false;

    if (taskType === 'startTournament') {
      if (tData.status === 'scheduled' && !rData.startedAt) {
        transaction.update(tournamentRef, { status: 'running', updatedAt: now });
        transaction.update(runtimeRef, {
          status: 'running',
          startedAt: now,
          updatedAt: now,
        });
        mainSuccess = true;
      }
    } else if (taskType === 'closeRegistration') {
      if (tData.status === 'running' && !rData.registAt) {
        transaction.update(tournamentRef, { status: 'registered', updatedAt: now });
        transaction.update(runtimeRef, {
          status: 'registered',
          registAt: now,
          updatedAt: now,
        });
        mainSuccess = true;
      }
    }

    const lastRunResult = mainSuccess ? 'success' : 'noop';
    transaction.update(taskIndexRef, {
      enqueueState: 'executed',
      lastRunAt: now,
      lastRunResult,
    });
  });

  logOpsSuccess({
    message: 'controlHook 新payload 処理完了',
    functionEntry: 'controlHookHttp',
    operation: 'executeNewPayloadTask',
    context: { tournamentId, taskType, planVersion, planHash },
  });

  res.status(200).json({
    success: true,
    message: `Task ${taskType} processed for tournament ${tournamentId}`,
  });
  } catch (err) {
    try {
      await updateTaskIndexFailed(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : String(err)
      );
    } catch (e) {
      logger.warn('controlHook: Failed to update taskIndex to failed', e);
    }
    logOpsError({
      message: 'controlHook: Error processing new payload',
      functionEntry: 'controlHookHttp',
      operation: 'executeNewPayloadTask',
      cause: err,
      sourceProductHint: 'firestore',
    });
    res.status(500).json({
      error: 'Internal server error',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

/** 旧 payload 処理（6章・後方互換） */
async function handleOldPayload(
  req: Request,
  res: Response,
  body: { action: string; tournamentId: string; rev: number }
): Promise<void> {
  logOpsInfo({
    message: 'controlHookHttp start',
    functionEntry: 'controlHookHttp',
    operation: 'start',
    context: {
      action: body.action,
      tournamentId: body.tournamentId,
      rev: body.rev,
    },
  });

  const { action, tournamentId, rev } = body;

  if (!action || !tournamentId || rev === undefined) {
    logger.warn('controlHook: Missing required parameters (old)', {
      action,
      tournamentId,
      rev,
    });
    res.status(400).json({
      error: 'Missing required parameters: action, tournamentId, rev',
    });
    return;
  }

  if (!['start', 'regist'].includes(action)) {
    logger.warn('controlHook: Invalid action', { action });
    res.status(400).json({
      error: 'Invalid action. Must be "start" or "regist"',
    });
    return;
  }

  logger.info('controlHook: Processing task (legacy)', { action, tournamentId, rev });

  const db = getFirestore();
  const now = Timestamp.now();
  const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
  const runtimeRef = tournamentRef.collection('views').doc('runtime');

  try {
    await db.runTransaction(async (transaction) => {
      const [tournamentDoc, runtimeDoc] = await Promise.all([
        transaction.get(tournamentRef),
        transaction.get(runtimeRef),
      ]);

      if (!tournamentDoc.exists || !runtimeDoc.exists) {
        throw new Error(`Tournament or runtime document not found: ${tournamentId}`);
      }

      const tournamentData = tournamentDoc.data()!;
      const runtimeData = runtimeDoc.data()!;

      if (action === 'start') {
        const currentStartRev = runtimeData.startRev || 1;
        if (rev < currentStartRev) {
          logger.info('controlHook: Ignoring old start task', {
            tournamentId,
            taskRev: rev,
            currentRev: currentStartRev,
          });
          return;
        }
        if (rev > currentStartRev) {
          logger.warn('controlHook: Unexpected future start task', {
            tournamentId,
            taskRev: rev,
            currentRev: currentStartRev,
          });
          return;
        }

        if (tournamentData.status === 'scheduled' && !runtimeData.startedAt) {
          transaction.update(tournamentRef, { status: 'running', updatedAt: now });
          transaction.update(runtimeRef, {
            status: 'running',
            startedAt: now,
            updatedAt: now,
          });
        } else {
          logger.info('controlHook: Tournament already started or not scheduled', {
            tournamentId,
            currentStatus: tournamentData.status,
            hasStartedAt: !!runtimeData.startedAt,
          });
        }
      } else if (action === 'regist') {
        const currentRegistRev = runtimeData.registRev || 1;
        if (rev < currentRegistRev) {
          logger.info('controlHook: Ignoring old regist task', {
            tournamentId,
            taskRev: rev,
            currentRev: currentRegistRev,
          });
          return;
        }
        if (rev > currentRegistRev) {
          logger.warn('controlHook: Unexpected future regist task', {
            tournamentId,
            taskRev: rev,
            currentRev: currentRegistRev,
          });
          return;
        }

        if (tournamentData.status === 'running' && !runtimeData.registAt) {
          transaction.update(tournamentRef, { status: 'registered', updatedAt: now });
          transaction.update(runtimeRef, {
            status: 'registered',
            registAt: now,
            updatedAt: now,
          });
        } else {
          logger.info('controlHook: Registration already closed or not running', {
            tournamentId,
            currentStatus: tournamentData.status,
            hasRegistAt: !!runtimeData.registAt,
          });
        }
      }
    });

    logOpsSuccess({
      message: 'controlHook 旧payload 処理完了',
      functionEntry: 'controlHookHttp',
      operation: 'executeLegacyPayloadTask',
      context: { tournamentId, action, rev },
    });

    res.status(200).json({
      success: true,
      message: `Task ${action} processed for tournament ${tournamentId}`,
    });
  } catch (error) {
    logOpsError({
      message: 'controlHook: Error processing legacy request',
      functionEntry: 'controlHookHttp',
      operation: 'executeLegacyPayloadTask',
      cause: error,
      sourceProductHint: 'firestore',
    });
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
