import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import {
  enqueueTournamentTasksReplanTask,
} from "../../scheduler/replan/enqueueTournamentTasksReplanTask";
import {
  type EnqueueTournamentTasksReplanReason,
  upsertEnqueueTournamentTasksReplanRequest,
} from "../../scheduler/replan/enqueueTournamentTasksReplanRequest";

function getNestedValue(
  source: Record<string, unknown>,
  path: string
): unknown {
  const keys = path.split(".");
  let current: unknown = source;
  for (const key of keys) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function normalizeValueForCompare(value: unknown): unknown {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as {toMillis?: () => number}).toMillis === "function"
  ) {
    return (value as {toMillis: () => number}).toMillis();
  }
  return value;
}

function hasChanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  path: string
): boolean {
  const beforeValue = normalizeValueForCompare(getNestedValue(before, path));
  const afterValue = normalizeValueForCompare(getNestedValue(after, path));
  return JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
}

function hasScheduleImpactChange(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): boolean {
  const scheduleFields = [
    "startAt",
    "regEndAt",
    "schedulePlanVersion",
    "schedulePlanUpdatedAt",
    "snapshot.blindStructure",
    "snapshot.blindStructureId",
    "templateId",
  ];
  return scheduleFields.some((path) => hasChanged(before, after, path));
}

function inferReason(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): EnqueueTournamentTasksReplanReason {
  if (
    hasChanged(before, after, "snapshot.blindStructure") ||
    hasChanged(before, after, "snapshot.blindStructureId") ||
    hasChanged(before, after, "templateId")
  ) {
    return "templateUpdated";
  }
  if (hasChanged(before, after, "recurrenceId")) {
    return "recurrenceUpdated";
  }
  return "scheduledTournamentUpdated";
}

export const enqueueTournamentTasksReplanOnWrite = onDocumentWritten(
  "scheduledTournaments/{tournamentId}",
  async (event) => {
    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;

    if (!beforeSnap?.exists || !afterSnap?.exists) {
      return;
    }

    const beforeData = beforeSnap.data() as Record<string, unknown>;
    const afterData = afterSnap.data() as Record<string, unknown>;
    if (afterData.taskSyncNeeded !== true) {
      return;
    }

    if (!hasScheduleImpactChange(beforeData, afterData)) {
      return;
    }

    const reason = inferReason(beforeData, afterData);
    await upsertEnqueueTournamentTasksReplanRequest({
      requestedBy: "firestore-trigger",
      reason,
    });
    await enqueueTournamentTasksReplanTask();

    logger.info("enqueueTournamentTasksReplanOnWrite: request enqueued", {
      tournamentId: event.params.tournamentId,
      reason,
    });
  }
);
