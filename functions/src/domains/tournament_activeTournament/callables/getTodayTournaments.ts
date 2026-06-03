import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { getStoreConfig } from "../../../shared/config/configLoader";
import {
  getJstTodayRangeUtc,
} from "../../../shared/tournament/liffTournamentDateUtils";
import {
  loadRegisteredTemplateIdsForUser,
  mapScheduledTournamentsForLiff,
} from "../../../shared/tournament/mapScheduledTournamentForLiff";

/**
 * LIFF用：本日開催のトーナメント一覧を取得するCloud Function
 */
export const getTodayTournaments = onCall(async (request) => {
  const logContext: Record<string, unknown> = {};
  try {
    const db = admin.firestore();
    const jstRange = getJstTodayRangeUtc();
    Object.assign(logContext, { jstDateKey: jstRange.dateKey });

    const startTimestamp = admin.firestore.Timestamp.fromDate(jstRange.start);
    const endTimestamp = admin.firestore.Timestamp.fromDate(jstRange.end);

    const snapshot = await db
      .collection('scheduledTournaments')
      .where('isArchived', '==', false)
      .where('startAt', '>=', startTimestamp)
      .where('startAt', '<', endTimestamp)
      .orderBy('startAt', 'asc')
      .limit(50)
      .get();

    const templateIds = snapshot.docs
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

    let registeredTemplateIds: Set<string> | undefined;
    if (request.auth?.uid) {
      registeredTemplateIds = await loadRegisteredTemplateIdsForUser(
        db,
        request.auth.uid,
        templateIds
      );
    }

    const tournaments = await mapScheduledTournamentsForLiff({
      docs: snapshot.docs,
      db,
      templateById,
      includeRegistrationStatus: true,
      registeredTemplateIds,
    });

    const config = await getStoreConfig();

    Object.assign(logContext, { count: tournaments.length });
    logOpsSuccess({
      message: "getTodayTournaments 成功",
      functionEntry: "getTodayTournaments",
      context: { count: tournaments.length, jstDateKey: jstRange.dateKey },
    });

    return {
      success: true,
      data: tournaments,
      count: tournaments.length,
      liffSettings: {
        liffRegistrationEnabled: config.tournament?.liffRegistrationEnabled ?? true,
        liffCalendarEnabled: config.tournament?.liffCalendarEnabled ?? true,
      },
      message: `${tournaments.length}件の本日開催トーナメントを取得しました`,
    };
  } catch (error) {
    logOpsError({
      message: 'Error in getTodayTournaments:',
      functionEntry: 'getTodayTournaments',
      operation: 'getTodayTournamentsCatch',
      cause: error,
      context: logContext,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      data: [],
      count: 0,
      liffSettings: {
        liffRegistrationEnabled: true,
        liffCalendarEnabled: true,
      },
      message: '本日開催トーナメントの取得に失敗しました',
    };
  }
});
