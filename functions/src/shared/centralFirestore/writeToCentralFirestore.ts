import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const CENTRAL_APP_NAME = 'centralMonitoring';

const CENTRAL_PROJECT_ID_FALLBACK = 'amuse-central-monitoring';

function getCentralFirestore(): FirebaseFirestore.Firestore | null {
  const centralProjectId =
    process.env.CENTRAL_PROJECT_ID ?? CENTRAL_PROJECT_ID_FALLBACK;

  const existingApp = getApps().find((app) => app.name === CENTRAL_APP_NAME);
  if (existingApp) {
    return getFirestore(existingApp);
  }

  const app = initializeApp({ projectId: centralProjectId }, CENTRAL_APP_NAME);
  return getFirestore(app);
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
        ...data,
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
        ...data,
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
 * 中央 Firestore の taskLogs サブコレクションに best-effort write する。
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
        ...data,
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
