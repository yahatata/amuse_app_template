import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { getCallerDeviceByUid, hasRequiredOption, isActive } from "../../../shared/devices";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

const getScheduledTournamentsForEditSchema = z.object({
  type: z.enum(['recurrence', 'template']),
  id: z.string(),
  includeCancelled: z.boolean().optional().default(false),
  excludeBeforeBusinessDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "excludeBeforeBusinessDate must be YYYY-MM-DD")
    .optional(),
});

export const getScheduledTournamentsForEdit = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  // デバイス権限の確認（role: admin または options.tournament: true）
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
  }

  const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
  if (!hasPermission) {
    throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
  }

  try {
    const { type, id, includeCancelled, excludeBeforeBusinessDate } =
      getScheduledTournamentsForEditSchema.parse(request.data);

    const db = getFirestore();
    let query: FirebaseFirestore.Query = db.collection('scheduledTournaments');

    if (type === 'recurrence') {
      // recurrenceIdで検索
      query = query.where('recurrenceId', '==', id);
    } else {
      // templateIdで検索
      query = query.where('templateId', '==', id);
    }

    query = includeCancelled
      ? query.where('status', 'in', ['scheduled', 'cancelled'])
      : query.where('status', '==', 'scheduled');

    if (excludeBeforeBusinessDate) {
      query = query.where('businessDate', '>=', excludeBeforeBusinessDate);
    }

    const snapshot = await query.get();
    const tournaments = snapshot.docs.map(doc => ({
      id: doc.id,
      startAt: doc.data().startAt,
      regEndAt: doc.data().regEndAt ?? null,
      status: doc.data().status ?? 'scheduled',
      businessDate: doc.data().businessDate ?? null,
      recurrenceId: doc.data().recurrenceId ?? null,
      name: doc.data().snapshot?.name || '',
    }));
    logOpsSuccess({
      message: 'getScheduledTournamentsForEdit 成功',
      functionEntry: 'getScheduledTournamentsForEdit',
      context: {
        type,
        id,
        includeCancelled,
        excludeBeforeBusinessDate: excludeBeforeBusinessDate ?? null,
        count: tournaments.length,
        callerUid,
      },
    });

    return {
      success: true,
      tournaments,
    };
  } catch (error) {
    const parsed = getScheduledTournamentsForEditSchema.safeParse(request.data);
    const errContext: Record<string, unknown> = { callerUid };
    if (parsed.success) {
      Object.assign(errContext, {
        type: parsed.data.type,
        id: parsed.data.id,
        includeCancelled: parsed.data.includeCancelled,
        excludeBeforeBusinessDate: parsed.data.excludeBeforeBusinessDate ?? null,
      });
    } else {
      errContext.inputParseFailed = true;
    }
    logOpsError({
      message: 'スケジュール済みトーナメント取得エラー:',
      functionEntry: 'getScheduledTournamentsForEdit',
      cause: error,
      context: errContext,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました',
    };
  }
});
