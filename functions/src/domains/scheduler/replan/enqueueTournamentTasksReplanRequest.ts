import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { getRequiredProjectId } from '../../../shared/runtime/projectId';

export const ENQUEUE_TOURNAMENT_REPLAN_REQUESTS_COLLECTION =
  'enqueueTournamentTasksReplanRequests';
export const ENQUEUE_TOURNAMENT_REPLAN_REQUEST_DOC_ID =
  'enqueueTournamentTasksByScheduler';

export type EnqueueTournamentTasksReplanRequestedBy =
  | 'firestore-trigger'
  | 'manual-callable';

export type EnqueueTournamentTasksReplanReason =
  | 'scheduledTournamentUpdated'
  | 'templateUpdated'
  | 'recurrenceUpdated'
  | 'manual';

export interface EnqueueTournamentTasksReplanRequest {
  requestType: 'enqueueTournamentTasksByScheduler';
  projectId: string;
  requestedAt: Timestamp;
  requestedBy: EnqueueTournamentTasksReplanRequestedBy;
  reason: EnqueueTournamentTasksReplanReason;
  isProcessing: boolean;
  lastTriggeredAt?: Timestamp;
  lastCompletedAt?: Timestamp;
  targetRangeStartAt: Timestamp;
  targetRangeEndAt: Timestamp;
  aggregateVersion: number;
}

export interface UpsertEnqueueTournamentTasksReplanRequestInput {
  requestedBy: EnqueueTournamentTasksReplanRequestedBy;
  reason: EnqueueTournamentTasksReplanReason;
  now?: Date;
}

function buildDefaultRange(now: Date): { startAt: Date; endAt: Date } {
  return {
    startAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
    endAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
  };
}

export async function upsertEnqueueTournamentTasksReplanRequest(
  input: UpsertEnqueueTournamentTasksReplanRequestInput
): Promise<void> {
  const db = getFirestore();
  const now = input.now ?? new Date();
  const projectId = getRequiredProjectId();
  const requestRef = db
    .collection(ENQUEUE_TOURNAMENT_REPLAN_REQUESTS_COLLECTION)
    .doc(ENQUEUE_TOURNAMENT_REPLAN_REQUEST_DOC_ID);

  const range = buildDefaultRange(now);

  await db.runTransaction(async (tx) => {
    const current = await tx.get(requestRef);
    const currentVersion =
      current.exists &&
      typeof current.data()?.aggregateVersion === 'number' &&
      Number.isInteger(current.data()?.aggregateVersion)
        ? (current.data()!.aggregateVersion as number)
        : 0;

    tx.set(
      requestRef,
      {
        requestType: 'enqueueTournamentTasksByScheduler',
        projectId,
        requestedAt: FieldValue.serverTimestamp(),
        requestedBy: input.requestedBy,
        reason: input.reason,
        isProcessing: false,
        targetRangeStartAt: Timestamp.fromDate(range.startAt),
        targetRangeEndAt: Timestamp.fromDate(range.endAt),
        aggregateVersion: currentVersion + 1,
      },
      { merge: true }
    );
  });
}

export async function getEnqueueTournamentTasksReplanRequest(): Promise<EnqueueTournamentTasksReplanRequest | null> {
  const db = getFirestore();
  const requestRef = db
    .collection(ENQUEUE_TOURNAMENT_REPLAN_REQUESTS_COLLECTION)
    .doc(ENQUEUE_TOURNAMENT_REPLAN_REQUEST_DOC_ID);
  const snap = await requestRef.get();
  if (!snap.exists) return null;
  return snap.data() as EnqueueTournamentTasksReplanRequest;
}

export async function markEnqueueTournamentTasksReplanCompleted(): Promise<void> {
  const db = getFirestore();
  const requestRef = db
    .collection(ENQUEUE_TOURNAMENT_REPLAN_REQUESTS_COLLECTION)
    .doc(ENQUEUE_TOURNAMENT_REPLAN_REQUEST_DOC_ID);

  await requestRef.set(
    {
      isProcessing: false,
      lastCompletedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function releaseEnqueueTournamentTasksReplanProcessing(): Promise<void> {
  const db = getFirestore();
  const requestRef = db
    .collection(ENQUEUE_TOURNAMENT_REPLAN_REQUESTS_COLLECTION)
    .doc(ENQUEUE_TOURNAMENT_REPLAN_REQUEST_DOC_ID);

  await requestRef.set(
    {
      isProcessing: false,
    },
    { merge: true }
  );
}

export async function markEnqueueTournamentTasksReplanCompletedBestEffort(): Promise<void> {
  try {
    await markEnqueueTournamentTasksReplanCompleted();
  } catch (error) {
    logger.error('enqueueTournamentTasksReplanRequests complete update failed', {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function releaseEnqueueTournamentTasksReplanProcessingBestEffort(): Promise<void> {
  try {
    await releaseEnqueueTournamentTasksReplanProcessing();
  } catch (error) {
    logger.error('enqueueTournamentTasksReplanRequests release failed', {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
