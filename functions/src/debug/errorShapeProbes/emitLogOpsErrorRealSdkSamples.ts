/**
 * 実 SDK / 実 HTTP を一度だけ失敗させ、その Error を cause に logOpsError する（本番に近い shape）。
 * Cloud Logging には logOpsError 形式で載せる。
 *
 * data: { scenario?: RealSdkScenario | 'all' } — 省略時は 'all'
 *
 * 呼び出しは devices.role === admin のみ（requireProbeAdmin）。
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { CloudTasksClient } from '@google-cloud/tasks';
import { logOpsError } from '../../shared/logging/logOpsError';
import { FunctionCustomError } from '../../shared/logging/functionCustomError';
import { requireProbeAdmin } from './requireProbeAdmin';

/** 存在しない doc への update（読み取り専用・delete なし） */
const PROBE_COLLECTION = '_errorShapeProbe';
const PROBE_DOC_ID = 'intentionally_missing_doc';

const NONEXISTENT_UID = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxx';

const PROBE_OBJECT_PATH = '_errorShapeProbe/does-not-exist.bin';

export type RealSdkScenario =
  | 'external_firestore'
  | 'external_auth'
  | 'external_storage'
  | 'external_cloud_tasks'
  | 'external_line_api'
  | 'function_custom'
  | 'function_common'
  | 'all';

const SCENARIOS: Exclude<RealSdkScenario, 'all'>[] = [
  'external_firestore',
  'external_auth',
  'external_storage',
  'external_cloud_tasks',
  'external_line_api',
  'function_custom',
  'function_common',
];

async function emitExternalFirestoreReal(): Promise<void> {
  try {
    const db = getFirestore();
    await db.collection(PROBE_COLLECTION).doc(PROBE_DOC_ID).update({ _probe: true });
    throw new HttpsError('internal', 'expected Firestore error did not occur');
  } catch (e) {
    if (e instanceof HttpsError) {
      throw e;
    }
    logOpsError({
      message: '[probe-real-sdk] Firestore Admin: update on missing doc',
      functionEntry: 'getBillPreviewTotals',
      operation: 'realSdkFirestore',
      cause: e,
      sourceProductHint: 'firestore',
    });
  }
}

async function emitExternalAuthReal(): Promise<void> {
  try {
    await admin.auth().getUser(NONEXISTENT_UID);
    throw new HttpsError('internal', 'expected Auth error did not occur');
  } catch (e) {
    if (e instanceof HttpsError) {
      throw e;
    }
    logOpsError({
      message: '[probe-real-sdk] Auth Admin: getUser on missing uid',
      functionEntry: 'getFirebaseCustomToken',
      operation: 'realSdkAuth',
      cause: e,
    });
  }
}

async function emitExternalStorageReal(): Promise<void> {
  try {
    const bucket = getStorage().bucket();
    await bucket.file(PROBE_OBJECT_PATH).getMetadata();
    throw new HttpsError('internal', 'expected Storage error did not occur');
  } catch (e) {
    if (e instanceof HttpsError) {
      throw e;
    }
    logOpsError({
      message: '[probe-real-sdk] Storage: getMetadata on missing object',
      functionEntry: 'saveQRCodeToStorage',
      operation: 'realSdkStorage',
      cause: e,
      sourceProductHint: 'storage',
    });
  }
}

async function emitExternalCloudTasksReal(): Promise<void> {
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
    logOpsError({
      message: '[probe-real-sdk] Cloud Tasks: createTask on missing queue',
      functionEntry: 'continueBusinessTerminal',
      operation: 'realSdkCloudTasks',
      cause: e,
      sourceProductHint: 'cloud_tasks',
    });
  }
}

/**
 * 実ネットワークの HTTP 502 Response（LINE Messaging の fetch 失敗に近い表層）。
 */
async function emitExternalLineApiReal(): Promise<void> {
  try {
    const res = await fetch('https://httpstat.us/502', {
      signal: AbortSignal.timeout(20000),
    });
    logOpsError({
      message: '[probe-real-sdk] fetch: HTTP 502 Response (LINE 相当)',
      functionEntry: 'lineWebhook',
      operation: 'realSdkLineHttp',
      cause: res,
    });
  } catch (e) {
    logOpsError({
      message: '[probe-real-sdk] fetch failed (network / timeout)',
      functionEntry: 'lineWebhook',
      operation: 'realSdkLineHttp',
      cause: e,
      sourceProductHint: 'line_api',
    });
  }
}

function emitFunctionCustomReal(): void {
  logOpsError({
    message: '[probe-real-sdk] FunctionCustomError（業務キーは本番と同じ形式）',
    functionEntry: 'getCurrentBusinessDateKeyOrThrow',
    operation: 'realSdkFunctionCustom',
    cause: new FunctionCustomError({
      errorKey: 'STORE_STATE_DOC_MISSING',
      message:
        'storeMeta/currentBusinessDay document does not exist. (probe-real-sdk)',
      context: { reason: 'doc_missing' },
    }),
  });
}

function emitFunctionCommonReal(): void {
  logOpsError({
    message: '[probe-real-sdk] plain Error (function_common)',
    functionEntry: 'processVisitByQR',
    operation: 'realSdkFunctionCommon',
    cause: new Error('intentional probe-real-sdk: unexpected plain Error'),
  });
}

async function runScenario(s: Exclude<RealSdkScenario, 'all'>): Promise<void> {
  switch (s) {
    case 'external_firestore':
      await emitExternalFirestoreReal();
      return;
    case 'external_auth':
      await emitExternalAuthReal();
      return;
    case 'external_storage':
      await emitExternalStorageReal();
      return;
    case 'external_cloud_tasks':
      await emitExternalCloudTasksReal();
      return;
    case 'external_line_api':
      await emitExternalLineApiReal();
      return;
    case 'function_custom':
      emitFunctionCustomReal();
      return;
    case 'function_common':
      emitFunctionCommonReal();
      return;
    default: {
      const _exhaustive: never = s;
      throw new HttpsError('invalid-argument', `unknown scenario: ${_exhaustive}`);
    }
  }
}

export const emitLogOpsErrorRealSdkSamples = onCall(
  { region: 'asia-northeast1', timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }
    await requireProbeAdmin(request.auth.uid);

    const raw = (request.data as { scenario?: string } | undefined)?.scenario;
    const scenario: RealSdkScenario =
      raw === undefined || raw === '' ? 'all' : (raw as RealSdkScenario);

    if (scenario === 'all') {
      for (const s of SCENARIOS) {
        await runScenario(s);
      }
      return {
        ok: true,
        emitted: SCENARIOS.length,
        scenarios: [...SCENARIOS],
        mode: 'real_sdk',
      };
    }

    if (!SCENARIOS.includes(scenario as Exclude<RealSdkScenario, 'all'>)) {
      throw new HttpsError(
        'invalid-argument',
        `scenario must be one of: all, ${SCENARIOS.join(', ')}`
      );
    }

    await runScenario(scenario as Exclude<RealSdkScenario, 'all'>);
    return { ok: true, emitted: 1, scenarios: [scenario], mode: 'real_sdk' };
  }
);
