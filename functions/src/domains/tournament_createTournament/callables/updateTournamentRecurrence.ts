import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { getCallerDeviceByUid, hasRequiredOption, isActive } from "../../../shared/devices";
import { logOpsError } from "../../../shared/logging/logOpsError";
import { computeRegEndAt } from "../services/enqueueTournamentTasksCore";

const updateTournamentRecurrenceSchema = z.object({
  recurrenceId: z.string(),
  isActive: z.boolean().optional(),
  templateId: z.string().optional(),
  interval: z.number().min(1).max(5).optional(),
  byWeekday: z.array(z.string()).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  selectedTournamentIds: z.array(z.string()),
});

export const updateTournamentRecurrence = onCall(async (request) => {
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
    const { recurrenceId, isActive, templateId, interval, byWeekday, startTime, selectedTournamentIds } = 
      updateTournamentRecurrenceSchema.parse(request.data);

    const db = getFirestore();
    const batch = db.batch();

    // 1. tournamentRecurrencesを更新
    const recurrenceRef = db.collection('tournamentRecurrences').doc(recurrenceId);
    const updateData: any = {};
    
    if (isActive !== undefined) updateData.isActive = isActive;
    if (templateId !== undefined) updateData.templateId = templateId;
    if (interval !== undefined) updateData.interval = interval;
    if (byWeekday !== undefined) updateData.byWeekday = byWeekday;
    if (startTime !== undefined) updateData.startTime = startTime;
    updateData.updatedAt = new Date();

    batch.update(recurrenceRef, updateData);

    // 2. 選択されたscheduledTournamentsを更新
    if (selectedTournamentIds.length > 0) {
      // テンプレートが変更された場合、新しいテンプレートデータを取得
      let newTemplateData = null;
      if (templateId) {
        const templateDoc = await db.collection('tournamentTemplates').doc(templateId).get();
        if (templateDoc.exists) {
          newTemplateData = templateDoc.data();
        }
      }

      for (const tournamentId of selectedTournamentIds) {
        const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
        const tournamentDoc = await tournamentRef.get();
        if (!tournamentDoc.exists) {
          continue;
        }
        const tournamentData = tournamentDoc.data() as Record<string, unknown>;
        
        const tournamentUpdateData: any = {
          updatedAt: new Date(),
        };

        // テンプレートが変更された場合、snapshotを更新
        if (newTemplateData) {
          tournamentUpdateData.templateId = templateId;
          tournamentUpdateData.snapshot = {
            name: newTemplateData.name || '',
            entryFee: newTemplateData.entryFee || 0,
            isReentry: newTemplateData.isReentry || false,
            maxReentries: newTemplateData.maxReentries || null,
            reentryFee: newTemplateData.reentryFee || null,
            isAddon: newTemplateData.isAddon || false,
            addonFee: newTemplateData.addonFee || null,
            addonStack: newTemplateData.addonStack || null,
            startStack: newTemplateData.startStack || 0,
            blindStructure: newTemplateData.blindStructure || '',
            prizeRatio: newTemplateData.prizeRatio || 0.7,
            color: newTemplateData.color || '#2196F3',
            pointType: newTemplateData.pointType || 'pointA',
            isArchived: false,
            updatedAt: new Date(),
          };
        }

        const existingStartAtRaw = tournamentData.startAt as {toDate?: () => Date} | undefined;
        const existingStartAt = existingStartAtRaw?.toDate?.() ?? null;
        let nextStartAt = existingStartAt;

        // startTimeが変更された場合、startAtを更新
        if (startTime !== undefined && existingStartAt) {
          const [hours, minutes] = startTime.split(':').map(Number);
          const jstDate = new Date(existingStartAt);
          jstDate.setHours(hours, minutes, 0, 0);
          const newStartAt = new Date(jstDate.getTime() - (9 * 60 * 60 * 1000));
          tournamentUpdateData.startAt = newStartAt;
          nextStartAt = newStartAt;
        }

        // 定期開催が停止された場合
        if (isActive === false) {
          tournamentUpdateData.status = 'cancelled';
        }

        // Step 3: version++ / taskSyncNeeded / regEndAt の同時更新
        const hasStartAtChange = startTime !== undefined && Boolean(existingStartAt);
        const hasTemplateChange = newTemplateData !== null;
        const hasScheduleChange = hasStartAtChange || hasTemplateChange;

        if (hasScheduleChange) {
          const existingSnapshot = (tournamentData.snapshot ?? {}) as Record<string, unknown>;
          const existingBlindStructure = String(
            existingSnapshot.blindStructure ?? existingSnapshot.blindStructureId ?? ''
          );
          const templateBlindStructure = hasTemplateChange ?
            String(
              newTemplateData?.blindStructure ??
              newTemplateData?.blindStructureId ??
              ''
            ) :
            existingBlindStructure;
          const blindStructureForRecalc = templateBlindStructure || existingBlindStructure;

          if (nextStartAt) {
            const regEndAtDate = await computeRegEndAt(
              db,
              nextStartAt,
              blindStructureForRecalc
            );
            tournamentUpdateData.regEndAt = Timestamp.fromDate(
              regEndAtDate ?? nextStartAt
            );
          }

          tournamentUpdateData.schedulePlanVersion = FieldValue.increment(1);
          tournamentUpdateData.schedulePlanUpdatedAt = Timestamp.now();
          tournamentUpdateData.taskSyncNeeded = true;
          tournamentUpdateData.taskSyncReason = hasStartAtChange ?
            ['startAtChanged'] :
            ['regEndAtChangedByTemplate'];
        } else if (isActive === false) {
          tournamentUpdateData.taskSyncNeeded = false;
        }

        batch.update(tournamentRef, tournamentUpdateData);
      }
    }

    await batch.commit();

    return {
      success: true,
      message: '定期開催設定を更新しました',
    };
  } catch (error) {
    logOpsError({
      message: '定期開催設定更新エラー:',
      functionEntry: 'updateTournamentRecurrence',
      cause: error,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました',
    };
  }
});
