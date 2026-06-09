import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const CENTRAL_APP_NAME = 'centralMonitoring';

function getCentralFirestore(): FirebaseFirestore.Firestore | null {
  const centralProjectId = process.env.CENTRAL_PROJECT_ID;
  if (!centralProjectId) {
    return null;
  }

  const existingApp = getApps().find((app) => app.name === CENTRAL_APP_NAME);
  if (existingApp) {
    return getFirestore(existingApp);
  }

  const app = initializeApp({ projectId: centralProjectId }, CENTRAL_APP_NAME);
  return getFirestore(app);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/** Firestore が拒否する undefined を再帰的に除去する */
export function omitUndefinedDeep(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => omitUndefinedDeep(item))
      .filter((item) => item !== undefined);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key, omitUndefinedDeep(nested)] as const)
      .filter(([, nested]) => nested !== undefined)
  );
}

function prepareCentralPayload(
  storeId: string,
  data: Record<string, unknown>,
  options?: { enrichTaskLogContext?: boolean }
): Record<string, unknown> {
  const sanitized = omitUndefinedDeep(data) as Record<string, unknown>;

  if (!options?.enrichTaskLogContext) {
    return sanitized;
  }

  const rawContext = sanitized.context;
  const baseContext = isPlainObject(rawContext) ? rawContext : {};
  sanitized.context = {
    ...baseContext,
    storeId,
  };

  return sanitized;
}

/**
 * 中央 Firestore の errorLogs サブコレクションに best-effort write する。
 * 失敗しても caller には伝播しない。TTL: 90日。
 */
export async function writeCentralErrorLog(
  storeId: string,
  data: Record<string, unknown>
): Promise<void> {
  const db = getCentralFirestore();
  if (!db) return;

  try {
    const expireAt = new Date();
    expireAt.setDate(expireAt.getDate() + 90);

    await db
      .collection('errorLogs')
      .doc(storeId)
      .collection('logs')
      .add({
        ...prepareCentralPayload(storeId, data),
        storeId,
        occurredAt: FieldValue.serverTimestamp(),
        expireAt,
        isResolved: false,
      });
  } catch (err) {
    logger.warn('writeCentralErrorLog failed (best-effort)', {
      storeId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * 中央 Firestore の schedulerLogs サブコレクションに best-effort write する。
 * TTL: 30日。
 */
export async function writeCentralSchedulerLog(
  storeId: string,
  data: Record<string, unknown>
): Promise<void> {
  const db = getCentralFirestore();
  if (!db) return;

  try {
    const expireAt = new Date();
    expireAt.setDate(expireAt.getDate() + 30);

    await db
      .collection('schedulerLogs')
      .doc(storeId)
      .collection('runs')
      .add({
        ...prepareCentralPayload(storeId, data),
        storeId,
        loggedAt: FieldValue.serverTimestamp(),
        expireAt,
      });
  } catch (err) {
    logger.warn('writeCentralSchedulerLog failed (best-effort)', {
      storeId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * 中央 Firestore の schedulerTaskDispatchLogs サブコレクションに best-effort write する。
 * TTL: 30日。
 */
export async function writeCentralSchedulerTaskDispatchLog(
  storeId: string,
  data: Record<string, unknown>
): Promise<void> {
  const db = getCentralFirestore();
  if (!db) return;

  try {
    const expireAt = new Date();
    expireAt.setDate(expireAt.getDate() + 30);

    await db
      .collection('schedulerTaskDispatchLogs')
      .doc(storeId)
      .collection('runs')
      .add({
        ...prepareCentralPayload(storeId, data),
        storeId,
        loggedAt: FieldValue.serverTimestamp(),
        expireAt,
      });
  } catch (err) {
    logger.warn('writeCentralSchedulerTaskDispatchLog failed (best-effort)', {
      storeId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * 中央 Firestore の taskLogs サブコレクションに best-effort write する。
 * storeId 引数は店舗 Firebase project ID（= 中央上の店舗識別子）。
 * TTL: 30日。
 */
export async function writeCentralTaskLog(
  storeId: string,
  data: Record<string, unknown>
): Promise<void> {
  const db = getCentralFirestore();
  if (!db) return;

  try {
    const expireAt = new Date();
    expireAt.setDate(expireAt.getDate() + 30);

    await db
      .collection('taskLogs')
      .doc(storeId)
      .collection('runs')
      .add({
        ...prepareCentralPayload(storeId, data, { enrichTaskLogContext: true }),
        storeId,
        loggedAt: FieldValue.serverTimestamp(),
        expireAt,
      });
  } catch (err) {
    logger.warn('writeCentralTaskLog failed (best-effort)', {
      storeId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
