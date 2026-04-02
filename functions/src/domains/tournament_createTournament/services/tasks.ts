import { CloudTasksClient } from '@google-cloud/tasks';
import { logger } from 'firebase-functions';
import {
  TOURNAMENT_TASKS_QUEUE,
  TOURNAMENT_TASKS_REGION,
  TOURNAMENT_INVOKER_SA_PREFIX,
  buildInvokerSaEmail,
} from '../../../shared/config/cloudTasksConfig';
import { getRequiredProjectId } from '../../../shared/runtime/projectId';
import { getTaskEndpoints } from '../../../shared/secrets/secretManager';
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
  const projectId = getRequiredProjectId();
  const { controlHookUrl } = await getTaskEndpoints();
  const tasksQueue = TOURNAMENT_TASKS_QUEUE;
  const tasksLocation = TOURNAMENT_TASKS_REGION;
  const tasksInvokerSa = buildInvokerSaEmail(
    TOURNAMENT_INVOKER_SA_PREFIX,
    projectId
  );

  const queuePath = client.queuePath(projectId, tasksLocation, tasksQueue);

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
