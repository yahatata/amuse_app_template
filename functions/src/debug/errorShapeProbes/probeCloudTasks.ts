import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { CloudTasksClient } from '@google-cloud/tasks';
import { logErrorShapeObservation } from './serializeErrorForProbe';
import { requireProbeAdmin } from './requireProbeAdmin';

/**
 * Cloud Tasks: 意図的に存在しないキューに対して createTask を試みる。
 *
 * 主目的は queue 不存在による失敗の観察だが、環境・IAM により NOT_FOUND 以外
 * （PERMISSION_DENIED, INVALID_ARGUMENT 等）が返る場合もあり、いずれも観察対象とする。
 */
export const probeCloudTasksErrorShape = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }
  await requireProbeAdmin(request.auth.uid);

  const projectId =
    process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.PROJECT_ID;
  if (!projectId) {
    throw new HttpsError('failed-precondition', 'GCLOUD_PROJECT / GCP_PROJECT が取得できません');
  }

  const location = process.env.TASKS_LOCATION || 'us-central1';
  const client = new CloudTasksClient();
  const parent = client.queuePath(projectId, location, '_error_shape_probe_nonexistent_queue');

  try {
    await client.createTask({
      parent,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: 'https://example.com/error-shape-probe',
        },
      },
    });
    throw new HttpsError('internal', 'expected Cloud Tasks error did not occur');
  } catch (e) {
    if (e instanceof HttpsError) {
      throw e;
    }
    logErrorShapeObservation('cloudTasks', e);
    return {
      ok: false,
      probe: 'cloudTasks',
    };
  }
});
