import { CloudTasksClient } from '@google-cloud/tasks';
import { logger } from 'firebase-functions';
import { getEnv } from './env';

// 環境変数から設定を取得
const PROJECT_ID = process.env.PROJECT_ID || 'amuse-app-template';
const REGION = process.env.REGION || 'asia-northeast1';
const QUEUE_NAME = process.env.QUEUE_NAME || 'tournament-queue';
const CONTROL_HOOK_URL = process.env.CONTROL_HOOK_URL;
const TASK_SA = process.env.TASK_SA || 'tasks-invoker@amuse-app-template-cloudTask.iam.gserviceaccount.com';

// Cloud Tasks クライアント
const client = new CloudTasksClient();

/**
 * タスクの種類
 */
export type TaskKind = 'start' | 'regist';

/**
 * タスク投入のパラメータ
 */
export interface ScheduleTaskParams {
  kind: TaskKind;
  tournamentId: string;
  revision: number;
  scheduledTime: Date;
}

/**
 * Cloud Tasks にタスクを投入
 */
export async function scheduleTask(params: ScheduleTaskParams): Promise<string> {
  try {
    // 環境変数の検証
    if (!CONTROL_HOOK_URL) {
      throw new Error('CONTROL_HOOK_URL environment variable is not set');
    }

    // キュー名の構築
    const queuePath = client.queuePath(PROJECT_ID, REGION, QUEUE_NAME);

    // タスクのペイロード
    const payload = {
      kind: params.kind,
      tournamentId: params.tournamentId,
      revision: params.revision
    };

    // タスクの設定
    const task = {
      httpRequest: {
        httpMethod: 'POST' as const,
        url: CONTROL_HOOK_URL,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        oidcToken: {
          serviceAccountEmail: TASK_SA,
        },
      },
      scheduleTime: {
        seconds: Math.floor(params.scheduledTime.getTime() / 1000),
      },
    };

    logger.info('scheduleTask: Creating task', {
      queuePath,
      kind: params.kind,
      tournamentId: params.tournamentId,
      revision: params.revision,
      scheduledTime: params.scheduledTime.toISOString()
    });

    // タスクを作成
    const [response] = await client.createTask({
      parent: queuePath,
      task: task,
    });

    const taskName = response.name || '';
    logger.info('scheduleTask: Task created successfully', {
      taskName,
      kind: params.kind,
      tournamentId: params.tournamentId
    });

    return taskName;

  } catch (error) {
    logger.error('scheduleTask: Error creating task', {
      error: error instanceof Error ? error.message : 'Unknown error',
      params
    });
    throw error;
  }
}

/**
 * 指定されたキュー内のタスクを一覧取得（デバッグ用）
 */
export async function listTasks(): Promise<any[]> {
  try {
    const queuePath = client.queuePath(PROJECT_ID, REGION, QUEUE_NAME);
    
    const [tasks] = await client.listTasks({
      parent: queuePath,
    });

    logger.info('listTasks: Retrieved tasks', {
      count: tasks.length,
      queuePath
    });

    return tasks;

  } catch (error) {
    logger.error('listTasks: Error listing tasks', error);
    throw error;
  }
}

/**
 * 指定されたタスクを削除（デバッグ用）
 */
export async function deleteTask(taskName: string): Promise<void> {
  try {
    await client.deleteTask({ name: taskName });
    
    logger.info('deleteTask: Task deleted successfully', { taskName });

  } catch (error) {
    logger.error('deleteTask: Error deleting task', {
      error: error instanceof Error ? error.message : 'Unknown error',
      taskName
    });
    throw error;
  }
}

/**
 * 開始タスクを投入
 */
export async function enqueueStartTask(tournamentId: string, scheduledTime: Date, rev: number): Promise<string> {
  // 環境変数を遅延取得
  const controlHookUrl = getEnv('CONTROL_HOOK_URL');
  const tasksQueue = getEnv('TASKS_QUEUE');
  const tasksLocation = getEnv('TASKS_LOCATION');
  const tasksInvokerSa = getEnv('TASKS_INVOKER_SA');

  // 安全ログ（先頭数文字＋長さのみ）
  console.log(
    `Enqueue with env: HOOK=${controlHookUrl.slice(0, 25)}... (len=${controlHookUrl.length}), ` +
    `QUEUE=${tasksQueue} LOC=${tasksLocation} SA=${tasksInvokerSa.split('@')[0]}@...`
  );

  const queuePath = client.queuePath(PROJECT_ID, tasksLocation, tasksQueue);

  const payload = {
    action: 'start',
    tournamentId: tournamentId,
    rev: rev
  };

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: controlHookUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      oidcToken: {
        serviceAccountEmail: tasksInvokerSa,
      },
    },
    scheduleTime: {
      seconds: Math.floor(scheduledTime.getTime() / 1000),
    },
  };

  logger.info('enqueueStartTask: Creating start task', {
    tournamentId,
    scheduledTime: scheduledTime.toISOString(),
    rev: rev
  });

  const [response] = await client.createTask({
    parent: queuePath,
    task: task,
  });

  const taskName = response.name || '';
  logger.info('enqueueStartTask: Start task created successfully', {
    taskName,
    tournamentId
  });

  return taskName;
}

/**
 * レジスト確定タスクを投入
 */
export async function enqueueRegistTask(tournamentId: string, scheduledTime: Date, rev: number): Promise<string> {
  // 環境変数を遅延取得
  const controlHookUrl = getEnv('CONTROL_HOOK_URL');
  const tasksQueue = getEnv('TASKS_QUEUE');
  const tasksLocation = getEnv('TASKS_LOCATION');
  const tasksInvokerSa = getEnv('TASKS_INVOKER_SA');

  // 安全ログ（先頭数文字＋長さのみ）
  console.log(
    `Enqueue with env: HOOK=${controlHookUrl.slice(0, 25)}... (len=${controlHookUrl.length}), ` +
    `QUEUE=${tasksQueue} LOC=${tasksLocation} SA=${tasksInvokerSa.split('@')[0]}@...`
  );

  const queuePath = client.queuePath(PROJECT_ID, tasksLocation, tasksQueue);

  const payload = {
    action: 'regist',
    tournamentId: tournamentId,
    rev: rev
  };

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: controlHookUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      oidcToken: {
        serviceAccountEmail: tasksInvokerSa,
      },
    },
    scheduleTime: {
      seconds: Math.floor(scheduledTime.getTime() / 1000),
    },
  };

  logger.info('enqueueRegistTask: Creating regist task', {
    tournamentId,
    scheduledTime: scheduledTime.toISOString(),
    rev: rev
  });

  const [response] = await client.createTask({
    parent: queuePath,
    task: task,
  });

  const taskName = response.name || '';
  logger.info('enqueueRegistTask: Regist task created successfully', {
    taskName,
    tournamentId
  });

  return taskName;
}
