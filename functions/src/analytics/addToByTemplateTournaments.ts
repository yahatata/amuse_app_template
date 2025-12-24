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
  const tournamentsSnapshot = billData.tournamentsSnapshot || {};
  
  // テンプレートドキュメントのマップを作成
  const templateDocMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();
  if (templateDocs) {
    for (const doc of templateDocs) {
      if (doc.exists) {
        const data = doc.data();
        if (data && data.templateName) {
          const templateKey = doc.id;
          templateDocMap.set(templateKey, doc);
        }
      }
    }
  }
  
  // 各トーナメントを処理（tournamentsSnapshot から取得）
  for (const [templateKey, tournamentData] of Object.entries(tournamentsSnapshot)) {
    if (!tournamentData || typeof tournamentData !== 'object') continue;
    
    const tournament = tournamentData as {
      templateName: string;
      entryCount: number;
      entrySalesIncl: number;
      reentryCount: number;
      reentrySalesIncl: number;
      addonCount: number;
      addonSalesIncl: number;
      totalTournamentSalesIncl: number;
    };
    
    const templateName = tournament.templateName;
    if (!templateName) continue;
    
    const templateRef = admin.firestore()
      .collection('analyticsMonthly')
      .doc(month)
      .collection('byTemplateTournaments')
      .doc(templateKey);
    
    const entrySales = tournament.entrySalesIncl || 0;
    const reentrySales = tournament.reentrySalesIncl || 0;
    const addonSales = tournament.addonSalesIncl || 0;
    const totalTournamentSales = tournament.totalTournamentSalesIncl || 0;
    const entryCount = tournament.entryCount || 0;
    const reentryCount = tournament.reentryCount || 0;
    const addonCount = tournament.addonCount || 0;
    
    // 日別データを更新（dailyDataは使用しないため削除）
    
    // 更新データを準備
    const updateData: any = {
      templateName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    // daily配列の更新（既存の日付があれば更新、なければ追加）
    updateData[`daily.${businessDate}.entryCount`] = admin.firestore.FieldValue.increment(entryCount);
    updateData[`daily.${businessDate}.entrySales`] = admin.firestore.FieldValue.increment(entrySales);
    updateData[`daily.${businessDate}.reentryCount`] = admin.firestore.FieldValue.increment(reentryCount);
    updateData[`daily.${businessDate}.reentrySales`] = admin.firestore.FieldValue.increment(reentrySales);
    updateData[`daily.${businessDate}.addonCount`] = admin.firestore.FieldValue.increment(addonCount);
    updateData[`daily.${businessDate}.addonSales`] = admin.firestore.FieldValue.increment(addonSales);
    updateData[`daily.${businessDate}.totalTournamentSales`] = admin.firestore.FieldValue.increment(totalTournamentSales);
    
    // totals更新
    updateData['totals.entryCount'] = admin.firestore.FieldValue.increment(entryCount);
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
