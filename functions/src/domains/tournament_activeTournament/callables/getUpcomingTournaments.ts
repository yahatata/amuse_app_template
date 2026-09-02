import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError } from "../../../shared/logging/functionCustomError";
import { getStoreConfig } from "../../../shared/config/configLoader";
import {
  getJstCalendarDateKey,
  getJstTodayRangeUtc,
} from "../../../shared/tournament/liffTournamentDateUtils";
import { mapScheduledTournamentsForLiff } from "../../../shared/tournament/mapScheduledTournamentForLiff";
import { getCurrentBusinessDateKeyOrThrow } from "../../storeMeta/repos/getCurrentBusinessDateKeyOrThrow";

function isStoreBusinessDateUnavailable(error: unknown): boolean {
  if (
    error instanceof FunctionCustomError &&
    error.errorKey === 'STORE_BUSINESS_DATE_UNAVAILABLE'
  ) {
    return true;
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'errorKey' in error &&
    (error as { errorKey: unknown }).errorKey === 'STORE_BUSINESS_DATE_UNAVAILABLE'
  );
}

async function resolveTargetBusinessDateForUpcoming(
  db: admin.firestore.Firestore
): Promise<string> {
  try {
    return await getCurrentBusinessDateKeyOrThrow(db);
  } catch (error) {
    if (isStoreBusinessDateUnavailable(error)) {
      return getJstCalendarDateKey();
    }
    throw error;
  }
}

/**
 * LIFF用：当日以降のトーナメント一覧を取得するCloud Function
 */
export const getUpcomingTournaments = onCall(async (request) => {
  const includeAll = Boolean((request.data as { includeAll?: boolean } | undefined)?.includeAll);
  const logContext: Record<string, unknown> = { includeAll };

  try {
    const db = admin.firestore();
    const jstRange = getJstTodayRangeUtc();
    const todayTimestamp = admin.firestore.Timestamp.fromDate(jstRange.start);

    let query = db
      .collection('scheduledTournaments')
      .where('isArchived', '==', false);

    if (!includeAll) {
      const jstNext7Days = new Date(jstRange.start);
      jstNext7Days.setDate(jstNext7Days.getDate() + 7);
      const next7DaysTimestamp = admin.firestore.Timestamp.fromDate(jstNext7Days);
      query = query
        .where('startAt', '>=', todayTimestamp)
        .where('startAt', '<', next7DaysTimestamp)
        .orderBy('startAt', 'asc')
        .limit(100);
    } else {
      query = query
        .where('startAt', '>=', todayTimestamp)
        .orderBy('startAt', 'asc')
        .limit(500);
    }

    const snapshot = await query.get();

    let docsForMapping = snapshot.docs;
    if (!includeAll) {
      const targetBusinessDate = await resolveTargetBusinessDateForUpcoming(db);
      docsForMapping = snapshot.docs.filter((doc) => {
        const businessDate = doc.data().businessDate;
        return typeof businessDate !== 'string' || businessDate !== targetBusinessDate;
      });
      Object.assign(logContext, { targetBusinessDate, excludedTodayBusinessDate: true });
    }

    const templateIds = docsForMapping
      .map((doc) => doc.data().templateId as string | undefined)
      .filter((id): id is string => Boolean(id))
      .filter((id, index, arr) => arr.indexOf(id) === index);

    const templateById = new Map<string, Record<string, unknown>>();
    if (templateIds.length > 0) {
      const templateDocs = await db
        .collection('tournamentTemplates')
        .where(admin.firestore.FieldPath.documentId(), 'in', templateIds)
        .get();
      templateDocs.docs.forEach((doc) => {
        templateById.set(doc.id, doc.data());
      });
    }

    const tournaments = await mapScheduledTournamentsForLiff({
      docs: docsForMapping,
      db,
      templateById,
      includeRegistrationStatus: false,
    });

    tournaments.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

    const message = includeAll
      ? `${tournaments.length}件の全トーナメントを取得しました`
      : `${tournaments.length}件の開催予定トーナメント（1週間先まで）を取得しました`;

    const config = await getStoreConfig();

    Object.assign(logContext, { count: tournaments.length });
    logOpsSuccess({
      message: "getUpcomingTournaments 成功",
      functionEntry: "getUpcomingTournaments",
      context: { count: tournaments.length, includeAll },
    });

    return {
      success: true,
      tournaments,
      count: tournaments.length,
      liffSettings: {
        liffRegistrationEnabled: config.tournament?.liffRegistrationEnabled ?? true,
        liffCalendarEnabled: config.tournament?.liffCalendarEnabled ?? true,
      },
      message,
    };
  } catch (error) {
    logOpsError({
      message: 'Error in getUpcomingTournaments:',
      functionEntry: 'getUpcomingTournaments',
      operation: 'getUpcomingTournamentsCatch',
      cause: error,
      context: logContext,
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    // soft-fail + raw error / 空配列は廃止。失敗は throw（空成功と区別）
    throw new HttpsError('internal', 'Failed to get upcoming tournaments', {
      errorKey: 'TOURNAMENT_INTERNAL_ERROR',
    });
  }
});
