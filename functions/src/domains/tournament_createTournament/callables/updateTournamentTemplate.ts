import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { z } from "zod";
import { getCallerDeviceByUid, hasRequiredOption, isActive } from "../../../shared/devices";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from "../../../shared/logging/functionCustomError";
import { resolveAddonLimitPerPlayer } from "../../../shared/tournament/resolveAddonLimitPerPlayer";
import { computeRegEndAt } from "../services/enqueueTournamentTasksCore";
import { getStoreConfig } from "../../../shared/config/configLoader";
import { validatePointConfigFromStoreConfig } from "../../../shared/config/validatePointConfig";
import { assertRewardPointTypeForTemplate } from "../../tournament_activeTournament/helpers/rewardPointType";

const updateTournamentTemplateSchema = z.object({
  templateId: z.string(),
  name: z.string().optional(),
  entryFee: z.number().optional(),
  isReentry: z.boolean().optional(),
  maxReentries: z.number().optional().nullable(),
  reentryFee: z.number().optional().nullable(),
  startStack: z.number().optional(),
  isAddon: z.boolean().optional(),
  addonFee: z.number().optional(),
  addonStack: z.number().optional(),
  addonLimitPerPlayer: z.number().optional(),
  blindStructure: z.string().optional(),
  prizeRatio: z.number().optional(),
  color: z.string().optional(),
  pointType: z.string().optional(),
  selectedTournamentIds: z.array(z.string()),
});

export const updateTournamentTemplate = onCall(async (request) => {
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
    const { templateId, selectedTournamentIds, ...updateData } = 
      updateTournamentTemplateSchema.parse(request.data);

    const db = getFirestore();

    if (updateData.pointType !== undefined) {
      const storeConfig = await getStoreConfig(db);
      const validatedConfig = validatePointConfigFromStoreConfig(storeConfig);
      updateData.pointType = assertRewardPointTypeForTemplate(
        updateData.pointType,
        validatedConfig,
      );
    }

    const templateRef = db.collection('tournamentTemplates').doc(templateId);
    const existingTemplateSnap = await templateRef.get();
    if (!existingTemplateSnap.exists) {
      throw new HttpsError('not-found', `テンプレートID "${templateId}" が見つかりません`);
    }

    const cur = existingTemplateSnap.data() as Record<string, unknown>;
    const effectiveIsAddon =
      typeof updateData.isAddon === 'boolean'
        ? updateData.isAddon
        : cur.isAddon === true;
    const mergedLimitRawTemplate =
      updateData.addonLimitPerPlayer !== undefined
        ? updateData.addonLimitPerPlayer
        : cur.addonLimitPerPlayer;
    const addonLimitNormalized = resolveAddonLimitPerPlayer({
      isAddon: effectiveIsAddon,
      addonLimitPerPlayer: mergedLimitRawTemplate,
    });
    if (
      effectiveIsAddon &&
      updateData.addonLimitPerPlayer !== undefined &&
      (!(typeof updateData.addonLimitPerPlayer === 'number') ||
        !Number.isInteger(updateData.addonLimitPerPlayer) ||
        updateData.addonLimitPerPlayer < 1)
    ) {
      logger.warn(
        'updateTournamentTemplate: addonLimitPerPlayer は不正または未満のため正規化しました',
      );
    }

    const batch = db.batch();

    // 1. tournamentTemplatesを更新
    const templateFields = {
      ...updateData,
      addonLimitPerPlayer: addonLimitNormalized,
      updatedAt: new Date(),
    };
    const sanitizedTemplatePayload = Object.fromEntries(
      Object.entries(templateFields).filter(([, value]) => value !== undefined),
    );

    batch.update(templateRef, sanitizedTemplatePayload);

    // 2. 選択されたscheduledTournamentsのsnapshotを更新
    if (selectedTournamentIds.length > 0) {
      for (const tournamentId of selectedTournamentIds) {
        const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
        const tournamentDoc = await tournamentRef.get();
        if (!tournamentDoc.exists) {
          continue;
        }
        const tournamentData = tournamentDoc.data() as Record<string, unknown>;
        const existingStartAtRaw = tournamentData.startAt as {toDate?: () => Date} | undefined;
        const existingStartAt = existingStartAtRaw?.toDate?.() ?? null;
        const existingSnapshot = (tournamentData.snapshot ?? {}) as Record<string, unknown>;
        const existingBlindStructure = String(
          existingSnapshot.blindStructure ?? existingSnapshot.blindStructureId ?? ''
        );
        const nextBlindStructure = updateData.blindStructure ?? existingBlindStructure;
        const hasBlindStructureChange =
          updateData.blindStructure !== undefined &&
          nextBlindStructure !== existingBlindStructure;
        
        const mergedIsAddon =
          typeof updateData.isAddon === 'boolean'
            ? updateData.isAddon
            : existingSnapshot.isAddon === true;
        const mergedLimitRawSnapshot =
          updateData.addonLimitPerPlayer !== undefined
            ? updateData.addonLimitPerPlayer
            : existingSnapshot.addonLimitPerPlayer;
        const addonLimitSnap = resolveAddonLimitPerPlayer({
          isAddon: mergedIsAddon,
          addonLimitPerPlayer: mergedLimitRawSnapshot,
        });

        // 更新されたテンプレートデータでsnapshotを更新
        const snapshotUpdateData = {
          name: updateData.name,
          entryFee: updateData.entryFee,
          isReentry: updateData.isReentry,
          maxReentries: updateData.maxReentries,
          reentryFee: updateData.reentryFee,
          isAddon: updateData.isAddon,
          addonFee: updateData.addonFee,
          addonStack: updateData.addonStack,
          addonLimitPerPlayer: addonLimitSnap,
          startStack: updateData.startStack,
          blindStructure: updateData.blindStructure,
          prizeRatio: updateData.prizeRatio,
          color: updateData.color,
          pointType: updateData.pointType,
          isArchived: false,
          updatedAt: new Date(),
        };

        // nullでない値のみを更新
        const filteredSnapshotData = Object.fromEntries(
          Object.entries(snapshotUpdateData).filter(([_, value]) => value !== undefined)
        );

        const tournamentUpdateData: any = {
          snapshot: filteredSnapshotData,
          updatedAt: new Date(),
        };

        if (hasBlindStructureChange) {
          if (existingStartAt) {
            const regEndAtDate = await computeRegEndAt(
              db,
              existingStartAt,
              nextBlindStructure
            );
            tournamentUpdateData.regEndAt = Timestamp.fromDate(
              regEndAtDate ?? existingStartAt
            );
          }
          tournamentUpdateData.schedulePlanVersion = FieldValue.increment(1);
          tournamentUpdateData.schedulePlanUpdatedAt = Timestamp.now();
          tournamentUpdateData.taskSyncNeeded = true;
          tournamentUpdateData.taskSyncReason = ['regEndAtChangedByTemplate'];
        }

        batch.update(tournamentRef, tournamentUpdateData);
      }
    }

    await batch.commit();
    logOpsSuccess({
      message: 'updateTournamentTemplate 成功',
      functionEntry: 'updateTournamentTemplate',
      context: {
        templateId,
        selectedTournamentCount: selectedTournamentIds.length,
        callerUid,
      },
    });

    return {
      success: true,
      message: 'トーナメントテンプレートを更新しました',
    };
  } catch (error) {
    const parsed = updateTournamentTemplateSchema.safeParse(request.data);
    const errContext: Record<string, unknown> = { callerUid };
    if (parsed.success) {
      Object.assign(errContext, {
        templateId: parsed.data.templateId,
        selectedTournamentCount: parsed.data.selectedTournamentIds.length,
      });
    } else {
      errContext.inputParseFailed = true;
    }
    logOpsError({
      message: 'トーナメントテンプレート更新エラー:',
      functionEntry: 'updateTournamentTemplate',
      cause: error,
      context: errContext,
    });
    if (error instanceof FunctionCustomError) {
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました',
    };
  }
});
