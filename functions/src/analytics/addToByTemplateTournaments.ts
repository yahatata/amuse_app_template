import { Transaction } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
// import { calculateTournamentSales } from "./helpers";

export async function addToByTemplateTournaments(
  transaction: Transaction,
  month: string,
  businessDate: string,
  billData: any,
  templateDocs?: FirebaseFirestore.DocumentSnapshot[]
): Promise<void> {
  const tournaments = billData.tournaments || {};
  
  // テンプレートドキュメントのマップを作成
  const templateDocMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  if (templateDocs) {
    for (const doc of templateDocs) {
      if (doc.exists) {
        const data = doc.data();
        if (data && data.templateName) {
          const templateKey = data.templateName.replace(/[^a-zA-Z0-9]/g, '_');
          templateDocMap.set(templateKey, doc);
        }
      }
    }
  }
  
  // 各トーナメントを処理
  for (const [, tournamentData] of Object.entries(tournaments)) {
    if (!tournamentData || typeof tournamentData !== 'object') continue;
    
    const templateName = (tournamentData as any).templateName;
    const templateId = (tournamentData as any).templateId;
    if (!templateName) continue;
    
    // templateKeyを作成（templateIdを優先、なければtemplateNameをキー化）
    const templateKey = templateId || templateName.replace(/[^a-zA-Z0-9]/g, '_');
    const templateRef = admin.firestore()
      .collection('analyticsMonthly')
      .doc(month)
      .collection('byTemplateTournaments')
      .doc(templateKey);
    
    const tournament = tournamentData as any;
    const entryFee = tournament.entryFee || 0;
    const reentryCount = tournament.reentryCount || 0;
    const reentryFee = tournament.reentryFee || 0;
    const addonCount = tournament.addonCount || 0;
    const addonFee = tournament.addonFee || 0;
    
    const entrySales = entryFee;
    const reentrySales = reentryFee * reentryCount;
    const addonSales = addonFee * addonCount;
    const totalTournamentSales = entrySales + reentrySales + addonSales;
    
    // 日別データを更新（dailyDataは使用しないため削除）
    
    // 更新データを準備
    const updateData: any = {
      templateName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    // daily配列の更新（既存の日付があれば更新、なければ追加）
    updateData[`daily.${businessDate}.entryCount`] = admin.firestore.FieldValue.increment(1);
    updateData[`daily.${businessDate}.entrySales`] = admin.firestore.FieldValue.increment(entrySales);
    updateData[`daily.${businessDate}.reentryCount`] = admin.firestore.FieldValue.increment(reentryCount);
    updateData[`daily.${businessDate}.reentrySales`] = admin.firestore.FieldValue.increment(reentrySales);
    updateData[`daily.${businessDate}.addonCount`] = admin.firestore.FieldValue.increment(addonCount);
    updateData[`daily.${businessDate}.addonSales`] = admin.firestore.FieldValue.increment(addonSales);
    updateData[`daily.${businessDate}.totalTournamentSales`] = admin.firestore.FieldValue.increment(totalTournamentSales);
    
    // totals更新
    updateData['totals.entryCount'] = admin.firestore.FieldValue.increment(1);
    updateData['totals.entrySales'] = admin.firestore.FieldValue.increment(entrySales);
    updateData['totals.reentryCount'] = admin.firestore.FieldValue.increment(reentryCount);
    updateData['totals.reentrySales'] = admin.firestore.FieldValue.increment(reentrySales);
    updateData['totals.addonCount'] = admin.firestore.FieldValue.increment(addonCount);
    updateData['totals.addonSales'] = admin.firestore.FieldValue.increment(addonSales);
    updateData['totals.totalTournamentSales'] = admin.firestore.FieldValue.increment(totalTournamentSales);
    
    // ドキュメントが存在しない場合は初期化
    const templateDoc = templateDocMap.get(templateKey);
    if (!templateDoc || !templateDoc.exists) {
      transaction.set(templateRef, {
        templateName,
        daily: [],
        totals: {
          entryCount: 0,
          entrySales: 0,
          reentryCount: 0,
          reentrySales: 0,
          addonCount: 0,
          addonSales: 0,
          totalTournamentSales: 0,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    
    transaction.update(templateRef, updateData);
  }
}
