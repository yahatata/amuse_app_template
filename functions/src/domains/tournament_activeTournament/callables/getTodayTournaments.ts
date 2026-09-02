import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldPath, getFirestore } from "firebase-admin/firestore";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError } from "../../../shared/logging/functionCustomError";
import { getStoreConfig } from "../../../shared/config/configLoader";
import { getCurrentBusinessDateKeyOrThrow } from "../../storeMeta/repos/getCurrentBusinessDateKeyOrThrow";
import { getJstCalendarDateKey } from "../../../shared/tournament/liffTournamentDateUtils";
import {
  loadRegisteredTemplateIdsForUser,
  mapScheduledTournamentsForLiff,
} from "../../../shared/tournament/mapScheduledTournamentForLiff";

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

/**
 * LIFF用：本日開催のトーナメント一覧を取得するCloud Function
 *
 * 「本日」の businessDate:
 * - 店舗営業中: currentBusinessDateKey
 * - 店舗営業外: JST 暦日 yyyy-MM-dd
 */
export const getTodayTournaments = onCall(async (request) => {
  const logContext: Record<string, unknown> = {};
  try {
    const db = getFirestore();
    const config = await getStoreConfig(db);
    const liffSettings = {
      liffRegistrationEnabled: config.tournament?.liffRegistrationEnabled ?? true,
      liffCalendarEnabled: config.tournament?.liffCalendarEnabled ?? true,
    };

    let targetBusinessDate: string;
    let todayDateSource: 'currentBusinessDateKey' | 'jstCalendarDateKey';

    try {
      targetBusinessDate = await getCurrentBusinessDateKeyOrThrow(db);
      todayDateSource = 'currentBusinessDateKey';
    } catch (error) {
      if (isStoreBusinessDateUnavailable(error)) {
        targetBusinessDate = getJstCalendarDateKey();
        todayDateSource = 'jstCalendarDateKey';
      } else {
        throw error;
      }
    }

    Object.assign(logContext, { targetBusinessDate, todayDateSource });

    const snapshot = await db
      .collection('scheduledTournaments')
      .where('businessDate', '==', targetBusinessDate)
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
        .where(FieldPath.documentId(), 'in', templateIds)
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

    Object.assign(logContext, { count: tournaments.length });
    logOpsSuccess({
      message: "getTodayTournaments 成功",
      functionEntry: "getTodayTournaments",
      context: {
        count: tournaments.length,
        targetBusinessDate,
        todayDateSource,
      },
    });

    return {
      success: true,
      data: tournaments,
      count: tournaments.length,
      /** 一覧フィルタに使った営業日（yyyy-MM-dd）。LIFF 見出しと揃える */
      targetBusinessDate,
      todayDateSource,
      liffSettings,
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

    if (error instanceof HttpsError) {
      throw error;
    }

    // soft-fail + raw error / 空配列は廃止。失敗は throw（空成功と区別）
    throw new HttpsError('internal', 'Failed to get today tournaments', {
      errorKey: 'TOURNAMENT_INTERNAL_ERROR',
    });
  }
});
