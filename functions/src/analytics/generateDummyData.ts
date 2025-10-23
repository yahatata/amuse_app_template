import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";

export const generateDummyData = onCall(async (request) => {
  const db = getFirestore();
  const month = "2025-09";

  try {
    logger.info(`ダミーデータ生成開始: ${month}`);

    // 1. 月次インデックスドキュメントの作成
    const monthlyRef = db.collection('analyticsMonthly').doc(month);
    await monthlyRef.set({
      itemsSales: 1250000,
      sideGameChipSales: 850000,
      extraCostSales: 320000,
      tournamentsSales: 2100000,
      grossSales: 4520000,
      orderCount: 1250,
      avgOrderValue: 3616,
      dailySales: {
        "2025-09-01": 145000,
        "2025-09-02": 152000,
        "2025-09-03": 138000,
        "2025-09-04": 167000,
        "2025-09-05": 189000,
        "2025-09-06": 201000,
        "2025-09-07": 195000,
        "2025-09-08": 143000,
        "2025-09-09": 156000,
        "2025-09-10": 174000,
        "2025-09-11": 182000,
        "2025-09-12": 198000,
        "2025-09-13": 215000,
        "2025-09-14": 203000,
        "2025-09-15": 179000,
        "2025-09-16": 186000,
        "2025-09-17": 192000,
        "2025-09-18": 208000,
        "2025-09-19": 221000,
        "2025-09-20": 234000,
        "2025-09-21": 198000,
        "2025-09-22": 187000,
        "2025-09-23": 201000,
        "2025-09-24": 213000,
        "2025-09-25": 226000,
        "2025-09-26": 245000,
        "2025-09-27": 238000,
        "2025-09-28": 192000,
        "2025-09-29": 178000,
        "2025-09-30": 165000,
      },
      paymentTotals: {
        cash: 1800000,
        credit_card: 1200000,
        electronic_money: 850000,
        pointA: 450000,
        pointB: 220000,
        sideGameTip: 0,
        sideGameChip: 0,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 2. daysサブコレクションの作成（30日分）
    const daysCollection = db.collection('analyticsMonthly').doc(month).collection('days');
    for (let day = 1; day <= 30; day++) {
      const dateStr = `2025-09-${day.toString().padStart(2, '0')}`;
      const dailySales = 120000 + Math.floor(Math.random() * 80000);
      const orderCount = 15 + Math.floor(Math.random() * 25);
      
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
        items: 1250000,
        sideGameChip: 850000,
        extraCost: 320000,
        tournaments: 2100000,
      },
      orderCounts: {
        items: 850,
        sideGameChip: 420,
        extraCost: 180,
        tournaments: 320,
      },
      itemSales: {
        "menu001": {
          qty: 45,
          sales: 67500,
          name: "ビール",
          category: "items"
        },
        "menu002": {
          qty: 32,
          sales: 48000,
          name: "ハイボール",
          category: "items"
        },
        "menu003": {
          qty: 28,
          sales: 42000,
          name: "ウイスキー",
          category: "items"
        },
        "menu004": {
          qty: 55,
          sales: 82500,
          name: "チップス",
          category: "items"
        },
        "menu005": {
          qty: 38,
          sales: 57000,
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

    for (const template of tournamentTemplates) {
      const entryCount = 15 + Math.floor(Math.random() * 35);
      const entrySales = entryCount * (5000 + Math.floor(Math.random() * 10000));
      const reentryCount = Math.floor(entryCount * 0.3);
      const reentrySales = reentryCount * (3000 + Math.floor(Math.random() * 5000));
      const addonCount = Math.floor(entryCount * 0.2);
      const addonSales = addonCount * (2000 + Math.floor(Math.random() * 3000));
      const totalTournamentSales = entrySales + reentrySales + addonSales;

      const dailyData: any = {};
      for (let day = 1; day <= 30; day++) {
        const dateStr = `2025-09-${day.toString().padStart(2, '0')}`;
        const dailyEntryCount = Math.floor(Math.random() * 3);
        const dailyEntrySales = dailyEntryCount * (5000 + Math.floor(Math.random() * 10000));
        const dailyReentryCount = Math.floor(dailyEntryCount * 0.3);
        const dailyReentrySales = dailyReentryCount * (3000 + Math.floor(Math.random() * 5000));
        const dailyAddonCount = Math.floor(dailyEntryCount * 0.2);
        const dailyAddonSales = dailyAddonCount * (2000 + Math.floor(Math.random() * 3000));
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

    for (let i = 0; i < 80; i++) {
      const userId = `user${(i + 1).toString().padStart(3, '0')}`;
      const pokerName = pokerNames[i];
      const orderCount = 5 + Math.floor(Math.random() * 20);
      const grossSales = 15000 + Math.floor(Math.random() * 85000);
      const itemsSales = Math.floor(grossSales * (0.2 + Math.random() * 0.3));
      const sideGameChipSales = Math.floor(grossSales * (0.1 + Math.random() * 0.2));
      const extraCostSales = Math.floor(grossSales * (0.05 + Math.random() * 0.1));
      const tournamentsSales = grossSales - itemsSales - sideGameChipSales - extraCostSales;

      const dailySales: any = {};
      for (let day = 1; day <= 30; day++) {
        const dateStr = `2025-09-${day.toString().padStart(2, '0')}`;
        if (Math.random() > 0.7) { // 30%の確率でその日に来店
          dailySales[dateStr] = 2000 + Math.floor(Math.random() * 8000);
        }
      }

      const paymentTotals = {
        cash: Math.floor(grossSales * (0.3 + Math.random() * 0.2)),
        credit_card: Math.floor(grossSales * (0.2 + Math.random() * 0.2)),
        electronic_money: Math.floor(grossSales * (0.1 + Math.random() * 0.2)),
        pointA: Math.floor(grossSales * (0.05 + Math.random() * 0.15)),
        pointB: Math.floor(grossSales * (0.02 + Math.random() * 0.08)),
        sideGameTip: 0,
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

    logger.info(`ダミーデータ生成完了: ${month}`);
    return {
      success: true,
      message: `ダミーデータ生成完了: ${month}`,
      data: {
        monthlyIndex: 1,
        days: 30,
        byCategory: 1,
        byTemplateTournaments: 30,
        byUser: 80,
      }
    };

  } catch (error) {
    logger.error('ダミーデータ生成エラー:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
