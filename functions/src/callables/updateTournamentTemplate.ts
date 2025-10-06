import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";

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
  blindStructure: z.string().optional(),
  prizeRatio: z.number().optional(),
  color: z.string().optional(),
  pointType: z.string().optional(),
  selectedTournamentIds: z.array(z.string()),
});

export const updateTournamentTemplate = onCall(async (request) => {
  try {
    const { templateId, selectedTournamentIds, ...updateData } = 
      updateTournamentTemplateSchema.parse(request.data);

    const db = getFirestore();
    const batch = db.batch();

    // 1. tournamentTemplatesを更新
    const templateRef = db.collection('tournamentTemplates').doc(templateId);
    const templateUpdateData = {
      ...updateData,
      updatedAt: new Date(),
    };

    batch.update(templateRef, templateUpdateData);

    // 2. 選択されたscheduledTournamentsのsnapshotを更新
    if (selectedTournamentIds.length > 0) {
      for (const tournamentId of selectedTournamentIds) {
        const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
        
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

        batch.update(tournamentRef, {
          snapshot: filteredSnapshotData,
          updatedAt: new Date(),
        });
      }
    }

    await batch.commit();

    return {
      success: true,
      message: 'トーナメントテンプレートを更新しました',
    };
  } catch (error) {
    console.error('トーナメントテンプレート更新エラー:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました',
    };
  }
});
