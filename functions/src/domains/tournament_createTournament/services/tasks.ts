import { CloudTasksClient } from '@google-cloud/tasks';
import { logger } from 'firebase-functions';
import { getEnv } from '../../../shared/firebase';

const PROJECT_ID = process.env.PROJECT_ID || 'amuse-app-template';
const client = new CloudTasksClient();

/**
 * Step 4: 新 payload で Cloud Tasks にタスクを投入
 */
export async function enqueueTournamentTask(
  tournamentId: string,
  taskType: string,
  planVersion: number,
  planHash: string,
  scheduledAt: string,
  storeId: string,
  enqueueDueAt: Date
): Promise<string> {
  const controlHookUrl = getEnv('CONTROL_HOOK_URL');
  const tasksQueue = getEnv('TASKS_QUEUE');
  const tasksLocation = getEnv('TASKS_LOCATION');
  const tasksInvokerSa = getEnv('TASKS_INVOKER_SA');

  const queuePath = client.queuePath(PROJECT_ID, tasksLocation, tasksQueue);

  const payload = {
    tournamentId,
    taskType,
    planVersion,
    planHash,
    scheduledAt,
    storeId,
  };

  // changeSpec 13: deterministic taskName で重複投入防止
  const taskId = `${tournamentId}-${taskType}-${planHash}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const deterministicTaskName = `${queuePath}/tasks/${taskId}`;

  const task = {
    name: deterministicTaskName,
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
      seconds: Math.floor(enqueueDueAt.getTime() / 1000),
    },
  };

  logger.info('enqueueTournamentTask: Creating task', {
    tournamentId,
    taskType,
    planVersion,
  });

  const [response] = await client.createTask({
    parent: queuePath,
    task,
  });

  const taskName = response.name || '';
  logger.info('enqueueTournamentTask: Task created', { taskName, tournamentId, taskType });
  return taskName;
}
