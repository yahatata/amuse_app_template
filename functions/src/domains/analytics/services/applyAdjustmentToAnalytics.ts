/**
 * 仕様書 [04_仕様書/07_analyticsMonthly更新と日付帰属とline配賦.md] §10.2 / §13 / §14 / §15 / §16 に基づく、
 * adjustment lines[] からの analyticsMonthly 反映を atomic に実行するヘルパ。
 *
 * 設計方針（[02_changeSpec.md] §5.2.3 / §5.5）:
 * - `processBillAnalyticsAtomically` パターンを踏襲（tx 内で marker check → READ → WRITE → marker create）
 * - marker docId は `adj_{adjustmentId}` で冪等性を保証
 * - 既存 add*（settle 経路）には touch せず、Step07 専用の独立した実装
 * - sign は delta 内に既に embed 済み（直接 `FieldValue.increment(delta.x)`）
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import {
  AdjustmentAnalyticsDelta,
  AnalyticsCategoryAggregate,
  AnalyticsTournamentTemplateAggregate,
} from './aggregator/adjustmentDelta';

export interface ProcessAdjustmentAnalyticsParams {
  /** `bill.businessDate.substring(0, 7)`（仕様書 §7.1） */
  monthKey: string;
  /** `bill.businessDate`（仕様書 §14.2 day bucket = 売上帰属日） */
  businessDate: string;
  /** bills コレクションの docId（log 用） */
  billId: string;
  /** marker docId 構成要素 */
  adjustmentId: string;
  /** 反映する純粋 delta（`buildAdjustmentAnalyticsDelta` で組み立てたもの） */
  delta: AdjustmentAnalyticsDelta;
}

export async function processAdjustmentAnalyticsAtomically(
  db: FirebaseFirestore.Firestore,
  params: ProcessAdjustmentAnalyticsParams
): Promise<void> {
  const { monthKey, businessDate, billId, adjustmentId, delta } = params;

  const monthlyRef = db.collection('analyticsMonthly').doc(monthKey);
  const dailyRef = monthlyRef.collection('days').doc(businessDate);
  const byCategoryRef = monthlyRef.collection('byCategory').doc('summary');
  const markerRef = monthlyRef.collection('aggregationMarkers').doc(`adj_${adjustmentId}`);

  const userId = delta.userId;
  const byUserRef = userId ? monthlyRef.collection('byUser').doc(userId) : undefined;

  const templateRefs = delta.byTemplateTournaments.map((t) =>
    monthlyRef.collection('byTemplateTournaments').doc(t.templateKey)
  );

  await db.runTransaction(async (tx) => {
    // --- READ phase ---
    const markerDoc = await tx.get(markerRef);
    if (markerDoc.exists) {
      logger.info('processAdjustmentAnalyticsAtomically: marker already exists, skipping', {
        billId,
        adjustmentId,
        monthKey,
      });
      return;
    }

    const reads = [
      tx.get(monthlyRef),
      tx.get(dailyRef),
      tx.get(byCategoryRef),
      ...(byUserRef ? [tx.get(byUserRef)] : []),
      ...templateRefs.map((ref) => tx.get(ref)),
    ];
    const results = await Promise.all(reads);
    const monthlyDoc = results[0];
    const dailyDoc = results[1];
    const byCategoryDoc = results[2];
    let idx = 3;
    const byUserDoc = byUserRef ? results[idx++] : undefined;
    const templateDocs = results.slice(idx);

    logger.info('processAdjustmentAnalyticsAtomically: starting analytics update', {
      billId,
      adjustmentId,
      monthKey,
      businessDate,
    });

    // --- WRITE phase ---

    if (!monthlyDoc.exists) {
      tx.set(monthlyRef, initialMonthlyDoc());
    }
    tx.update(monthlyRef, buildMonthlyAdjustmentUpdate(delta, businessDate));

    if (!dailyDoc.exists) {
      tx.set(dailyRef, initialDailyDoc());
    }
    tx.update(dailyRef, buildDailyAdjustmentUpdate(delta));

    if (!byCategoryDoc.exists) {
      tx.set(byCategoryRef, initialByCategoryDoc());
    }
    tx.update(byCategoryRef, buildByCategoryAdjustmentUpdate(delta));

    if (byUserRef && byUserDoc) {
      if (!byUserDoc.exists) {
        tx.set(byUserRef, initialByUserDoc());
      }
      tx.update(byUserRef, buildByUserAdjustmentUpdate(delta, businessDate));
    }

    delta.byTemplateTournaments.forEach((template, i) => {
      const ref = templateRefs[i];
      const doc = templateDocs[i];
      if (!doc.exists) {
        tx.set(ref, initialByTemplateTournamentDoc(template));
      }
      tx.update(ref, buildByTemplateTournamentAdjustmentUpdate(template, businessDate));
    });

    // --- marker create ---
    tx.create(markerRef, {
      type: 'adjustment',
      billId,
      adjustmentId,
      monthKey,
      businessDate,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info('processAdjustmentAnalyticsAtomically: analytics update completed', {
      billId,
      adjustmentId,
      monthKey,
      businessDate,
      grossSales: delta.grossSales,
      tournamentTemplates: delta.byTemplateTournaments.length,
    });
  });
}

// --- monthly ---

// 既存 add* と同様、Firestore update 引数の型整合のため any を許容する。
// nested map 更新（dot-notation）と FieldValue を混ぜるため型を厳格にできない。

function initialMonthlyDoc(): Record<string, any> {
  return {
    grossSales: 0,
    itemsSales: 0,
    extraCostSales: 0,
    sideGameChipSales: 0,
    tournamentsSales: 0,
    orderCount: 0,
    avgOrderValue: 0,
    dailySales: {},
    paymentTotals: {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildMonthlyAdjustmentUpdate(
  delta: AdjustmentAnalyticsDelta,
  businessDate: string
): Record<string, any> {
  return {
    grossSales: admin.firestore.FieldValue.increment(delta.grossSales),
    itemsSales: admin.firestore.FieldValue.increment(delta.byCategory.items),
    extraCostSales: admin.firestore.FieldValue.increment(delta.byCategory.extraCost),
    sideGameChipSales: admin.firestore.FieldValue.increment(delta.byCategory.sideGameChip),
    tournamentsSales: admin.firestore.FieldValue.increment(delta.byCategory.tournaments),
    [`dailySales.${businessDate}`]: admin.firestore.FieldValue.increment(delta.grossSales),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

// --- daily ---

function initialDailyDoc(): Record<string, any> {
  return {
    grossSales: 0,
    itemsSales: 0,
    extraCostSales: 0,
    sideGameChipSales: 0,
    tournamentsSales: 0,
    orderCount: 0,
    byCategory: {},
    byPaymentMethod: {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildDailyAdjustmentUpdate(delta: AdjustmentAnalyticsDelta): Record<string, any> {
  return {
    grossSales: admin.firestore.FieldValue.increment(delta.grossSales),
    itemsSales: admin.firestore.FieldValue.increment(delta.byCategory.items),
    extraCostSales: admin.firestore.FieldValue.increment(delta.byCategory.extraCost),
    sideGameChipSales: admin.firestore.FieldValue.increment(delta.byCategory.sideGameChip),
    tournamentsSales: admin.firestore.FieldValue.increment(delta.byCategory.tournaments),
    'byCategory.items': admin.firestore.FieldValue.increment(delta.byCategory.items),
    'byCategory.extraCost': admin.firestore.FieldValue.increment(delta.byCategory.extraCost),
    'byCategory.sideGameChip': admin.firestore.FieldValue.increment(delta.byCategory.sideGameChip),
    'byCategory.tournaments': admin.firestore.FieldValue.increment(delta.byCategory.tournaments),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

// --- byCategory ---

function initialByCategoryDoc(): Record<string, any> {
  return {
    totals: {},
    orderCounts: {},
    itemSales: {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildByCategoryAdjustmentUpdate(
  delta: AdjustmentAnalyticsDelta
): Record<string, any> {
  const cat: AnalyticsCategoryAggregate = delta.byCategory;
  return {
    'totals.items': admin.firestore.FieldValue.increment(cat.items),
    'totals.extraCost': admin.firestore.FieldValue.increment(cat.extraCost),
    'totals.sideGameChip': admin.firestore.FieldValue.increment(cat.sideGameChip),
    'totals.tournaments': admin.firestore.FieldValue.increment(cat.tournaments),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

// --- byUser ---

function initialByUserDoc(): Record<string, any> {
  return {
    grossSales: 0,
    itemsSales: 0,
    extraCostSales: 0,
    sideGameChipSales: 0,
    tournamentsSales: 0,
    orderCount: 0,
    dailySales: {},
    paymentTotals: {},
    pokerName: '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildByUserAdjustmentUpdate(
  delta: AdjustmentAnalyticsDelta,
  businessDate: string
): Record<string, any> {
  return {
    grossSales: admin.firestore.FieldValue.increment(delta.grossSales),
    itemsSales: admin.firestore.FieldValue.increment(delta.byCategory.items),
    extraCostSales: admin.firestore.FieldValue.increment(delta.byCategory.extraCost),
    sideGameChipSales: admin.firestore.FieldValue.increment(delta.byCategory.sideGameChip),
    tournamentsSales: admin.firestore.FieldValue.increment(delta.byCategory.tournaments),
    [`dailySales.${businessDate}`]: admin.firestore.FieldValue.increment(delta.grossSales),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

// --- byTemplateTournaments ---

function initialByTemplateTournamentDoc(
  template: AnalyticsTournamentTemplateAggregate
): Record<string, any> {
  return {
    templateName: template.templateName,
    daily: {},
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
  };
}

function buildByTemplateTournamentAdjustmentUpdate(
  template: AnalyticsTournamentTemplateAggregate,
  businessDate: string
): Record<string, any> {
  return {
    templateName: template.templateName,
    [`daily.${businessDate}.entryCount`]: admin.firestore.FieldValue.increment(template.entryCount),
    [`daily.${businessDate}.entrySales`]: admin.firestore.FieldValue.increment(template.entrySales),
    [`daily.${businessDate}.reentryCount`]: admin.firestore.FieldValue.increment(template.reentryCount),
    [`daily.${businessDate}.reentrySales`]: admin.firestore.FieldValue.increment(template.reentrySales),
    [`daily.${businessDate}.addonCount`]: admin.firestore.FieldValue.increment(template.addonCount),
    [`daily.${businessDate}.addonSales`]: admin.firestore.FieldValue.increment(template.addonSales),
    [`daily.${businessDate}.totalTournamentSales`]: admin.firestore.FieldValue.increment(
      template.totalSales
    ),
    'totals.entryCount': admin.firestore.FieldValue.increment(template.entryCount),
    'totals.entrySales': admin.firestore.FieldValue.increment(template.entrySales),
    'totals.reentryCount': admin.firestore.FieldValue.increment(template.reentryCount),
    'totals.reentrySales': admin.firestore.FieldValue.increment(template.reentrySales),
    'totals.addonCount': admin.firestore.FieldValue.increment(template.addonCount),
    'totals.addonSales': admin.firestore.FieldValue.increment(template.addonSales),
    'totals.totalTournamentSales': admin.firestore.FieldValue.increment(template.totalSales),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}
