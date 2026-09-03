/**
 * logOpsError error-shape classification regression.
 * Replaces production errorShapeProbes (emitLogOpsErrorSamples / RealSdk) coverage.
 */
import { logger } from 'firebase-functions';
import { logOpsError } from '../../../src/shared/logging/logOpsError';
import { FunctionCustomError } from '../../../src/shared/logging/functionCustomError';

jest.mock('firebase-functions', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../src/shared/centralFirestore/writeToCentralFirestore', () => ({
  writeCentralErrorLog: jest.fn().mockResolvedValue(undefined),
  writeCentralTaskLog: jest.fn().mockResolvedValue(undefined),
  writeCentralSchedulerLog: jest.fn().mockResolvedValue(undefined),
}));

function lastErrorPayload(): Record<string, unknown> {
  expect(logger.error).toHaveBeenCalled();
  const calls = (logger.error as jest.Mock).mock.calls;
  return calls[calls.length - 1][1] as Record<string, unknown>;
}

describe('logOpsErrorShape (probe replacement)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GCLOUD_PROJECT = 'test-logops-shape';
  });

  afterEach(() => {
    delete process.env.GCLOUD_PROJECT;
  });

  it('Case 1: FunctionCustomError → function_custom + errorKey / context merge', () => {
    logOpsError({
      message: 'custom sample',
      functionEntry: 'startAccounting',
      operation: 'shapeProbe',
      cause: new FunctionCustomError({
        errorKey: 'PROBE_LOG_OPS_SAMPLE',
        message: 'intentional probe for startAccounting',
        context: { reason: 'doc_missing' },
      }),
    });

    expect(lastErrorPayload()).toMatchObject({
      errorSource: 'function_custom',
      functionEntry: 'startAccounting',
      operation: 'shapeProbe',
      errorKey: 'PROBE_LOG_OPS_SAMPLE',
      errorMessage: 'intentional probe for startAccounting',
      errorName: 'FunctionCustomError',
      context: { reason: 'doc_missing' },
      projectId: 'test-logops-shape',
    });
  });

  it('Case 2: plain Error → function_common', () => {
    logOpsError({
      message: 'plain sample',
      functionEntry: 'processVisitByQR',
      cause: new Error('intentional probe: unexpected plain Error'),
    });

    const payload = lastErrorPayload();
    expect(payload).toMatchObject({
      errorSource: 'function_common',
      functionEntry: 'processVisitByQR',
      errorMessage: 'intentional probe: unexpected plain Error',
      errorName: 'Error',
    });
    expect(payload).not.toHaveProperty('errorKey');
    expect(payload).not.toHaveProperty('sourceProduct');
  });

  it('Case 3: Firestore-shaped cause → external_api / firestore', () => {
    logOpsError({
      message: 'firestore sample',
      functionEntry: 'getBillPreviewTotals',
      errorMessage: 'intentional probe (Firestore-shaped)',
      cause: { code: 'NOT_FOUND', message: 'intentional probe (Firestore-shaped)' },
      sourceProductHint: 'firestore',
    });

    expect(lastErrorPayload()).toMatchObject({
      errorSource: 'external_api',
      sourceProduct: 'firestore',
      sdkCode: 'NOT_FOUND',
      detailReason: 'intentional probe (Firestore-shaped)',
      errorMessage: 'intentional probe (Firestore-shaped)',
    });
  });

  it('Case 4: Auth-shaped cause → external_api / auth', () => {
    logOpsError({
      message: 'auth sample',
      functionEntry: 'getFirebaseCustomToken',
      errorMessage: 'intentional probe (Auth-shaped)',
      cause: {
        code: 'auth/user-not-found',
        message: 'intentional probe (Auth-shaped)',
      },
    });

    expect(lastErrorPayload()).toMatchObject({
      errorSource: 'external_api',
      sourceProduct: 'auth',
      sdkCode: 'auth/user-not-found',
      detailReason: 'intentional probe (Auth-shaped)',
    });
  });

  it('Case 5: Storage-shaped cause → external_api / storage', () => {
    logOpsError({
      message: 'storage sample',
      functionEntry: 'saveQRCodeToStorage',
      errorMessage: 'intentional probe (Storage-shaped)',
      cause: {
        code: 'storage/object-not-found',
        message: 'intentional probe (Storage-shaped)',
      },
    });

    expect(lastErrorPayload()).toMatchObject({
      errorSource: 'external_api',
      sourceProduct: 'storage',
      sdkCode: 'storage/object-not-found',
      detailReason: 'intentional probe (Storage-shaped)',
    });
  });

  it('Case 5b: Admin Storage message-only Error → storage', () => {
    logOpsError({
      message: 'storage admin message',
      functionEntry: 'saveQRCodeToStorage',
      cause: new Error('No such object: bucket/_errorShapeProbe/does-not-exist.bin'),
      sourceProductHint: 'storage',
    });

    expect(lastErrorPayload()).toMatchObject({
      errorSource: 'external_api',
      sourceProduct: 'storage',
    });
  });

  it('Case 6: HTTP/fetch Response → external_api / line_api', () => {
    const res = new Response(null, { status: 502, statusText: 'Bad Gateway' });
    logOpsError({
      message: 'line http sample',
      functionEntry: 'lineWebhook',
      errorMessage: 'HTTP 502 Bad Gateway (LINE fetch Response probe)',
      cause: res,
    });

    expect(lastErrorPayload()).toMatchObject({
      errorSource: 'external_api',
      sourceProduct: 'line_api',
      httpStatus: 502,
      errorMessage: 'HTTP 502 Bad Gateway (LINE fetch Response probe)',
    });
  });

  it('Case 6b: cloud_tasks via sourceProductHint on minimal cause', () => {
    logOpsError({
      message: 'cloud tasks sample',
      functionEntry: 'continueBusinessTerminal',
      errorMessage: 'intentional probe (minimal shape + hint)',
      cause: { message: 'intentional probe (minimal shape + hint)' },
      sourceProductHint: 'cloud_tasks',
    });

    expect(lastErrorPayload()).toMatchObject({
      errorSource: 'external_api',
      sourceProduct: 'cloud_tasks',
      detailReason: 'intentional probe (minimal shape + hint)',
    });
  });

  it('Case 7: explicit errorSource / errorKey override wins over cause shape', () => {
    logOpsError({
      message: 'override sample',
      functionEntry: 'startAccounting',
      cause: { code: 'NOT_FOUND', message: 'firestore-shaped but overridden' },
      errorSource: 'function_custom',
      errorKey: 'EXPLICIT_OVERRIDE_KEY',
      errorMessage: 'explicit message',
      sourceProduct: 'firestore',
      sdkCode: 'OVERRIDE_SDK',
    });

    expect(lastErrorPayload()).toMatchObject({
      errorSource: 'function_custom',
      errorKey: 'EXPLICIT_OVERRIDE_KEY',
      errorMessage: 'explicit message',
      sourceProduct: 'firestore',
      sdkCode: 'OVERRIDE_SDK',
    });
  });

  it('Case 7b: errorKey alone without FC cause → function_custom', () => {
    logOpsError({
      message: 'errorKey only',
      functionEntry: 'startAccounting',
      cause: new Error('plain but keyed'),
      errorKey: 'KEY_ONLY',
    });

    expect(lastErrorPayload()).toMatchObject({
      errorSource: 'function_custom',
      errorKey: 'KEY_ONLY',
      errorMessage: 'plain but keyed',
    });
  });
});
