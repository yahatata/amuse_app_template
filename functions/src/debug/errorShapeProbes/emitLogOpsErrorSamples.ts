/**
 * logOpsError の代表パターンを 1 回だけ Cloud Logging に出す検証用 Callable。
 * 本番業務導線とは分離。呼び出しは devices.role === admin のみ。
 *
 * data: { scenario?: Scenario | 'all' } — 省略時は 'all'（9 パターン連続で logOpsError）
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logOpsError } from '../../shared/logging/logOpsError';
import { FunctionCustomError } from '../../shared/logging/functionCustomError';
import { requireProbeAdmin } from './requireProbeAdmin';

export type LogOpsSampleScenario =
  | 'accounting'
  | 'store'
  | 'tournament'
  | 'external_firestore'
  | 'external_line_api'
  | 'external_auth'
  | 'external_storage'
  | 'external_cloud_tasks'
  | 'function_common'
  | 'all';

const SCENARIOS: Exclude<LogOpsSampleScenario, 'all'>[] = [
  'accounting',
  'store',
  'tournament',
  'external_firestore',
  'external_line_api',
  'external_auth',
  'external_storage',
  'external_cloud_tasks',
  'function_common',
];

function emitAccountingSample(): void {
  logOpsError({
    message: '[probe] logOpsError sample: accounting (function_custom)',
    functionEntry: 'startAccounting',
    operation: 'emitLogOpsErrorSamples',
    cause: new FunctionCustomError({
      errorKey: 'PROBE_LOG_OPS_SAMPLE',
      message: 'intentional probe for startAccounting',
    }),
  });
}

function emitStoreSample(): void {
  logOpsError({
    message: '[probe] logOpsError sample: store (function_custom)',
    functionEntry: 'closeStoreTerminal',
    operation: 'emitLogOpsErrorSamples',
    cause: new FunctionCustomError({
      errorKey: 'PROBE_LOG_OPS_SAMPLE',
      message: 'intentional probe for closeStoreTerminal',
    }),
  });
}

function emitTournamentSample(): void {
  logOpsError({
    message: '[probe] logOpsError sample: tournament (function_custom)',
    functionEntry: 'registerForTournament',
    operation: 'emitLogOpsErrorSamples',
    cause: new FunctionCustomError({
      errorKey: 'PROBE_LOG_OPS_SAMPLE',
      message: 'intentional probe for registerForTournament',
    }),
  });
}

function emitExternalFirestoreSample(): void {
  logOpsError({
    message: '[probe] logOpsError sample: external_api firestore',
    functionEntry: 'getBillPreviewTotals',
    operation: 'emitLogOpsErrorSamples',
    /** プレーンオブジェクト cause だと normalize が [object Object] になるため明示 */
    errorMessage: 'intentional probe (Firestore-shaped)',
    cause: { code: 'NOT_FOUND', message: 'intentional probe (Firestore-shaped)' },
    sourceProductHint: 'firestore',
  });
}

function emitExternalLineSample(): void {
  const res = new Response(null, { status: 502, statusText: 'Bad Gateway' });
  logOpsError({
    message: '[probe] logOpsError sample: external_api line_api (Response)',
    functionEntry: 'lineWebhook',
    operation: 'emitLogOpsErrorSamples',
    errorMessage: 'HTTP 502 Bad Gateway (LINE fetch Response probe)',
    cause: res,
  });
}

function emitExternalAuthSample(): void {
  logOpsError({
    message: '[probe] logOpsError sample: external_api auth',
    functionEntry: 'getFirebaseCustomToken',
    operation: 'emitLogOpsErrorSamples',
    errorMessage: 'intentional probe (Auth-shaped)',
    cause: {
      code: 'auth/user-not-found',
      message: 'intentional probe (Auth-shaped)',
    },
  });
}

function emitExternalStorageSample(): void {
  logOpsError({
    message: '[probe] logOpsError sample: external_api storage',
    functionEntry: 'saveQRCodeToStorage',
    operation: 'emitLogOpsErrorSamples',
    errorMessage: 'intentional probe (Storage-shaped)',
    cause: {
      code: 'storage/object-not-found',
      message: 'intentional probe (Storage-shaped)',
    },
  });
}

function emitExternalCloudTasksSample(): void {
  logOpsError({
    message: '[probe] logOpsError sample: external_api cloud_tasks',
    functionEntry: 'continueBusinessTerminal',
    operation: 'emitLogOpsErrorSamples',
    errorMessage: 'intentional probe (minimal shape + hint)',
    cause: { message: 'intentional probe (minimal shape + hint)' },
    sourceProductHint: 'cloud_tasks',
  });
}

function emitFunctionCommonSample(): void {
  logOpsError({
    message: '[probe] logOpsError sample: function_common (plain Error)',
    functionEntry: 'processVisitByQR',
    operation: 'emitLogOpsErrorSamples',
    cause: new Error('intentional probe: unexpected plain Error'),
  });
}

function runScenario(s: Exclude<LogOpsSampleScenario, 'all'>): void {
  switch (s) {
    case 'accounting':
      emitAccountingSample();
      return;
    case 'store':
      emitStoreSample();
      return;
    case 'tournament':
      emitTournamentSample();
      return;
    case 'external_firestore':
      emitExternalFirestoreSample();
      return;
    case 'external_line_api':
      emitExternalLineSample();
      return;
    case 'external_auth':
      emitExternalAuthSample();
      return;
    case 'external_storage':
      emitExternalStorageSample();
      return;
    case 'external_cloud_tasks':
      emitExternalCloudTasksSample();
      return;
    case 'function_common':
      emitFunctionCommonSample();
      return;
    default: {
      const _exhaustive: never = s;
      throw new HttpsError('invalid-argument', `unknown scenario: ${_exhaustive}`);
    }
  }
}

export const emitLogOpsErrorSamples = onCall(
  { region: 'asia-northeast1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }
    await requireProbeAdmin(request.auth.uid);

    const raw = (request.data as { scenario?: string } | undefined)?.scenario;
    const scenario: LogOpsSampleScenario =
      raw === undefined || raw === '' ? 'all' : (raw as LogOpsSampleScenario);

    if (scenario === 'all') {
      for (const s of SCENARIOS) {
        runScenario(s);
      }
      return {
        ok: true,
        emitted: SCENARIOS.length,
        scenarios: [...SCENARIOS],
      };
    }

    if (!SCENARIOS.includes(scenario as Exclude<LogOpsSampleScenario, 'all'>)) {
      throw new HttpsError(
        'invalid-argument',
        `scenario must be one of: all, ${SCENARIOS.join(', ')}`
      );
    }

    runScenario(scenario as Exclude<LogOpsSampleScenario, 'all'>);
    return { ok: true, emitted: 1, scenarios: [scenario] };
  }
);
