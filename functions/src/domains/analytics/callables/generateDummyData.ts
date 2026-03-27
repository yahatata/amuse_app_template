import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { logOpsError } from "../../../shared/logging/logOpsError";

// ランダムな値を生成する関数（-25%〜+25%の範囲）
function getRandomValue(baseValue: number): number {
  const variation = 0.5; // ±25%の範囲
  const randomFactor = 1 + (Math.random() - 0.5) * variation;
  return Math.round(baseValue * randomFactor);
}

// 月の日付を生成する関数
function generateDailySales(month: string): Record<string, number> {
  const [year, monthNum] = month.split('-');
  const daysInMonth = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
  const dailySales: Record<string, number> = {};
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${monthNum}-${day.toString().padStart(2, '0')}`;
    dailySales[date] = getRandomValue(150000); // ベース値を150,000円に設定
  }
  
  return dailySales;
}

export const generateDummyData = onCall({
  timeoutSeconds: 540, // 9分のタイムアウト
  memory: "1GiB", // メモリを1GBに設定
}, async (request) => {
  const db = getFirestore();
  const months = ["2025-05", "2025-06", "2025-07", "2025-08"];

  try {
    logger.info(`4ヶ月分のダミーデータ生成開始: ${months.join(', ')}`);

    // 各月のデータを並列生成
    const monthPromises = months.map(async (month) => {
      logger.info(`月次データ生成開始: ${month}`);
      
      // 1. 月次インデックスドキュメントの作成
      const monthlyRef = db.collection('analyticsMonthly').doc(month);
      await monthlyRef.set({
        itemsSales: getRandomValue(1250000),
        sideGameChipSales: getRandomValue(850000),
        extraCostSales: getRandomValue(320000),
        tournamentsSales: getRandomValue(2100000),
        grossSales: getRandomValue(4520000),
        orderCount: getRandomValue(1250),
        avgOrderValue: getRandomValue(3616),
        dailySales: generateDailySales(month),
        paymentTotals: {
          cash: getRandomValue(1800000),
          credit_card: getRandomValue(1200000),
          electronic_money: getRandomValue(850000),
          pointA: getRandomValue(450000),
          pointB: getRandomValue(220000),
          sideGameChip: 0,
        },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

      // 2. daysサブコレクションの作成
      const daysCollection = db.collection('analyticsMonthly').doc(month).collection('days');
      const [year, monthNum] = month.split('-');
      const daysInMonth = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
      
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${monthNum}-${day.toString().padStart(2, '0')}`;
        const dailySales = getRandomValue(150000);
        const orderCount = getRandomValue(20);
      
        await daysCollection.doc(dateStr).set({
          itemsSales: Math.floor(dailySales * 0.28),
          sideGameChipSales: Math.floor(dailySales * 0.19),
          extraCostSales: Math.floor(dailySales * 0.07),
          tournamentsSales: Math.floor(dailySales * 0.46),
          grossSales: dailySales,
          orderCount: orderCount,
          byCategory: {
            items: Math.floor(dailySales * 0.28),
            sideGameChip: Math.floor(dailySales * 0.19),
            extraCost: Math.floor(dailySales * 0.07),
            tournaments: Math.floor(dailySales * 0.46),
          },
          byPaymentMethod: {
            cash: Math.floor(dailySales * 0.40),
            credit_card: Math.floor(dailySales * 0.27),
            electronic_money: Math.floor(dailySales * 0.19),
            pointA: Math.floor(dailySales * 0.10),
            pointB: Math.floor(dailySales * 0.04),
          },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      }

      // 3. byCategoryサブコレクションの作成
      const byCategoryRef = db.collection('analyticsMonthly').doc(month).collection('byCategory').doc('summary');
      await byCategoryRef.set({
        totals: {
          items: getRandomValue(1250000),
          sideGameChip: getRandomValue(850000),
          extraCost: getRandomValue(320000),
          tournaments: getRandomValue(2100000),
        },
        orderCounts: {
          items: getRandomValue(850),
          sideGameChip: getRandomValue(420),
          extraCost: getRandomValue(180),
          tournaments: getRandomValue(320),
        },
        itemSales: {
          "menu001": {
            qty: getRandomValue(45),
            sales: getRandomValue(67500),
            name: "ビール",
            category: "items"
          },
          "menu002": {
            qty: getRandomValue(32),
            sales: getRandomValue(48000),
            name: "ハイボール",
            category: "items"
          },
          "menu003": {
            qty: getRandomValue(28),
            sales: getRandomValue(42000),
            name: "ウイスキー",
            category: "items"
          },
          "menu004": {
            qty: getRandomValue(55),
            sales: getRandomValue(82500),
            name: "チップス",
            category: "items"
          },
          "menu005": {
            qty: getRandomValue(38),
            sales: getRandomValue(57000),
          name: "ナッツ",
          category: "items"
        },
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

      // 4. byTemplateTournamentsサブコレクションの作成（30個のトーナメントテンプレート）
      const byTemplateTournamentsCollection = db.collection('analyticsMonthly').doc(month).collection('byTemplateTournaments');
    const tournamentTemplates = [
      { id: "template001", name: "ポーカーナイト" },
      { id: "template002", name: "トーナメントA" },
      { id: "template003", name: "トーナメントB" },
      { id: "template004", name: "ポーカーチャンピオンシップ" },
      { id: "template005", name: "ビギナーズトーナメント" },
      { id: "template006", name: "ハイローラー" },
      { id: "template007", name: "スーパーサテライト" },
      { id: "template008", name: "メガトーナメント" },
      { id: "template009", name: "フリーズアウト" },
      { id: "template010", name: "リバーシー" },
      { id: "template011", name: "ポーカーマスター" },
      { id: "template012", name: "チャンピオンシップ" },
      { id: "template013", name: "スーパーサテライト2" },
      { id: "template014", name: "メガトーナメント2" },
      { id: "template015", name: "フリーズアウト2" },
      { id: "template016", name: "リバーシー2" },
      { id: "template017", name: "ポーカーマスター2" },
      { id: "template018", name: "チャンピオンシップ2" },
      { id: "template019", name: "スーパーサテライト3" },
      { id: "template020", name: "メガトーナメント3" },
      { id: "template021", name: "フリーズアウト3" },
      { id: "template022", name: "リバーシー3" },
      { id: "template023", name: "ポーカーマスター3" },
      { id: "template024", name: "チャンピオンシップ3" },
      { id: "template025", name: "スーパーサテライト4" },
      { id: "template026", name: "メガトーナメント4" },
      { id: "template027", name: "フリーズアウト4" },
      { id: "template028", name: "リバーシー4" },
      { id: "template029", name: "ポーカーマスター4" },
      { id: "template030", name: "チャンピオンシップ4" },
    ];

      for (const template of tournamentTemplates.slice(0, 10)) { // 30個から10個に削減
        const entryCount = getRandomValue(25);
        const entrySales = getRandomValue(150000);
        const reentryCount = getRandomValue(8);
        const reentrySales = getRandomValue(40000);
        const addonCount = getRandomValue(5);
        const addonSales = getRandomValue(15000);
      const totalTournamentSales = entrySales + reentrySales + addonSales;

        const dailyData: any = {};
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${monthNum}-${day.toString().padStart(2, '0')}`;
          const dailyEntryCount = getRandomValue(2);
          const dailyEntrySales = getRandomValue(15000);
          const dailyReentryCount = getRandomValue(1);
          const dailyReentrySales = getRandomValue(5000);
          const dailyAddonCount = getRandomValue(1);
          const dailyAddonSales = getRandomValue(3000);
          const dailyTotalSales = dailyEntrySales + dailyReentrySales + dailyAddonSales;

        dailyData[`${dateStr}.entryCount`] = dailyEntryCount;
        dailyData[`${dateStr}.entrySales`] = dailyEntrySales;
        dailyData[`${dateStr}.reentryCount`] = dailyReentryCount;
        dailyData[`${dateStr}.reentrySales`] = dailyReentrySales;
        dailyData[`${dateStr}.addonCount`] = dailyAddonCount;
        dailyData[`${dateStr}.addonSales`] = dailyAddonSales;
        dailyData[`${dateStr}.totalTournamentSales`] = dailyTotalSales;
      }

      await byTemplateTournamentsCollection.doc(template.id).set({
        templateName: template.name,
        daily: dailyData,
        totals: {
          entryCount: entryCount,
          entrySales: entrySales,
          reentryCount: reentryCount,
          reentrySales: reentrySales,
          addonCount: addonCount,
          addonSales: addonSales,
          totalTournamentSales: totalTournamentSales,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

      // 5. byUserサブコレクションの作成（80個のユーザー）
      const byUserCollection = db.collection('analyticsMonthly').doc(month).collection('byUser');
    const pokerNames = [
      "ポーカープレイヤー1", "ポーカープレイヤー2", "ポーカープレイヤー3", "ポーカープレイヤー4", "ポーカープレイヤー5",
      "ポーカープレイヤー6", "ポーカープレイヤー7", "ポーカープレイヤー8", "ポーカープレイヤー9", "ポーカープレイヤー10",
      "ポーカープレイヤー11", "ポーカープレイヤー12", "ポーカープレイヤー13", "ポーカープレイヤー14", "ポーカープレイヤー15",
      "ポーカープレイヤー16", "ポーカープレイヤー17", "ポーカープレイヤー18", "ポーカープレイヤー19", "ポーカープレイヤー20",
      "ポーカープレイヤー21", "ポーカープレイヤー22", "ポーカープレイヤー23", "ポーカープレイヤー24", "ポーカープレイヤー25",
      "ポーカープレイヤー26", "ポーカープレイヤー27", "ポーカープレイヤー28", "ポーカープレイヤー29", "ポーカープレイヤー30",
      "ポーカープレイヤー31", "ポーカープレイヤー32", "ポーカープレイヤー33", "ポーカープレイヤー34", "ポーカープレイヤー35",
      "ポーカープレイヤー36", "ポーカープレイヤー37", "ポーカープレイヤー38", "ポーカープレイヤー39", "ポーカープレイヤー40",
      "ポーカープレイヤー41", "ポーカープレイヤー42", "ポーカープレイヤー43", "ポーカープレイヤー44", "ポーカープレイヤー45",
      "ポーカープレイヤー46", "ポーカープレイヤー47", "ポーカープレイヤー48", "ポーカープレイヤー49", "ポーカープレイヤー50",
      "ポーカープレイヤー51", "ポーカープレイヤー52", "ポーカープレイヤー53", "ポーカープレイヤー54", "ポーカープレイヤー55",
      "ポーカープレイヤー56", "ポーカープレイヤー57", "ポーカープレイヤー58", "ポーカープレイヤー59", "ポーカープレイヤー60",
      "ポーカープレイヤー61", "ポーカープレイヤー62", "ポーカープレイヤー63", "ポーカープレイヤー64", "ポーカープレイヤー65",
      "ポーカープレイヤー66", "ポーカープレイヤー67", "ポーカープレイヤー68", "ポーカープレイヤー69", "ポーカープレイヤー70",
      "ポーカープレイヤー71", "ポーカープレイヤー72", "ポーカープレイヤー73", "ポーカープレイヤー74", "ポーカープレイヤー75",
      "ポーカープレイヤー76", "ポーカープレイヤー77", "ポーカープレイヤー78", "ポーカープレイヤー79", "ポーカープレイヤー80"
    ];

      for (let i = 0; i < 20; i++) { // ユーザー数を80から20に削減
        const userId = `user${(i + 1).toString().padStart(3, '0')}`;
        const pokerName = pokerNames[i];
        const orderCount = getRandomValue(15);
        const grossSales = getRandomValue(50000);
        const itemsSales = getRandomValue(Math.floor(grossSales * 0.3));
        const sideGameChipSales = getRandomValue(Math.floor(grossSales * 0.15));
        const extraCostSales = getRandomValue(Math.floor(grossSales * 0.08));
        const tournamentsSales = grossSales - itemsSales - sideGameChipSales - extraCostSales;

        const dailySales: any = {};
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${monthNum}-${day.toString().padStart(2, '0')}`;
          if (Math.random() > 0.7) { // 30%の確率でその日に来店
            dailySales[dateStr] = getRandomValue(5000);
          }
        }

        const paymentTotals = {
          cash: getRandomValue(Math.floor(grossSales * 0.4)),
          credit_card: getRandomValue(Math.floor(grossSales * 0.3)),
          electronic_money: getRandomValue(Math.floor(grossSales * 0.15)),
          pointA: getRandomValue(Math.floor(grossSales * 0.1)),
          pointB: getRandomValue(Math.floor(grossSales * 0.05)),
          sideGameChip: 0,
        };

        await byUserCollection.doc(userId).set({
        grossSales: grossSales,
        itemsSales: itemsSales,
        extraCostSales: extraCostSales,
        sideGameChipSales: sideGameChipSales,
        tournamentsSales: tournamentsSales,
        orderCount: orderCount,
        dailySales: dailySales,
        paymentTotals: paymentTotals,
        pokerName: pokerName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

      logger.info(`月次データ生成完了: ${month}`);
      return month;
    });

    // すべての月の処理を並列実行
    await Promise.all(monthPromises);

    logger.info(`4ヶ月分のダミーデータ生成完了: ${months.join(', ')}`);
    return {
      success: true,
      message: `4ヶ月分のダミーデータ生成完了: ${months.join(', ')}`,
      data: {
        monthlyIndex: 4,
        days: 31 + 30 + 31 + 31, // 5月(31日) + 6月(30日) + 7月(31日) + 8月(31日)
        byCategory: 4,
        byTemplateTournaments: 40, // 10 × 4ヶ月
        byUser: 80, // 20 × 4ヶ月
      }
    };

  } catch (error) {
    logOpsError({
      message: '4ヶ月分のダミーデータ生成エラー:',
      failureType: 'business',
      functionEntry: 'generateDummyData',
      cause: error,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
