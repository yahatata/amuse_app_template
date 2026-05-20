/**
 * 仕様書 [04_仕様書/07_analyticsMonthly更新と日付帰属とline配賦.md] §10.4 / §17 と
 * [02_changeSpec.md] §5.2.5 / §5.5 に基づく、
 * reopen 時の `analyticsMonthly` 反映ロールバックを atomic に実行するヘルパ。
 *
 * 設計方針:
 * - settle 時に書き込まれた contributions（baseline + 当該 cycle 内の adjustments + 当該 cycle 内の collection cashActions）を、
 *   個別 marker をすべて束ねた単一 transaction で「負号で再適用」する。
 * - 個別 marker `{billId}_cycle{cycleNo}_settle` / `adj_{adjustmentId}` / `cash_{cashActionId}` は audit 証跡として残し、
 *   ロールバック完了の証跡として `reopen_{billId}_cycle{oldCycleNo}` marker を新たに作成する。
 *   - 再 settle 時は新しい cycleNo の marker を使うため、再反映と衝突しない。
 * - 既存 add*（settle 経路）には touch せず、Step07 専用の独立した実装。
 * - 重要: 既存の baseline contribution は `addToMonthlyIndex` 等が `categoryBreakdown` / `paymentTotals` /
 *   `tournamentsSnapshot` から計算したもの。ロールバックも同じ source を負号にして適用する。
 *
 * 注意: paymentTotals は仕様書 §8.4 「refund では直接減らさない」に従い、
 * collection の cashAction のみがロールバック対象。
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';

import { calculateCategoryAmounts, distributePaymentMethods } from './helpers';
import {
  AnalyticsTournamentTemplateAggregate,
  buildAdjustmentAnalyticsDelta,
} from './aggregator/adjustmentDelta';
import { buildCashActionAnalyticsDelta } from './aggregator/cashActionDelta';
import type { AdjustmentLine } from '../../bills/services/adjustments';

export interface ReopenRollbackInput {
  /** 旧 cycle で settle 時の bill data（categoryBreakdown / tournamentsSnapshot / paymentTotals / amounts.grandTotalRounded を含む） */
  billDataAtSettle: any;
  /** 旧 cycle 配下の effective adjustments の lines（rollback 対象） */
  adjustmentsLines: AdjustmentLine[][];
  /** 旧 cycle 配下の collection cashActions の methodBreakdown（rollback 対象） */
  collectionCashActionsMethodBreakdown: { method: string; amountIncl: number }[][];
}

export interface ProcessReopenRollbackParams {
  /** `bill.businessDate.substring(0, 7)` */
  monthKey: string;
  /** `bill.businessDate` */
  businessDate: string;
  /** bills コレクションの docId */
  billId: string;
  /** rollback 対象の cycle 番号（reopen 直前の currentSettlementCycle） */
  oldCycleNo: number;
  /** bill.party.userId（byUser ロールバック用） */
  billUserId?: string | null;
  /** rollback 入力データ（settle 時 bill / adjustments / cashActions） */
  input: ReopenRollbackInput;
}

interface AggregatedNegatedDelta {
  /** monthly grossSales 増分（負）。billData の grossSales + 全 adjustment.grossSales を集計したもの */
  grossSalesNeg: number;
  itemsNeg: number;
  extraCostNeg: number;
  sideGameChipNeg: number;
  tournamentsNeg: number;
  /** orderCount 減分（settle baseline 由来は -1、adjustments / cashActions は orderCount に影響しない） */
  orderCountNeg: number;
  /** paymentTotals method ごとの負増分（baseline + collection cashActions の両方を集計） */
  paymentTotalsNeg: Record<string, number>;
  /** byTemplateTournaments の負増分（templateKey ごと） */
  byTemplateTournamentsNeg: AnalyticsTournamentTemplateAggregate[];
}

function aggregateNegatedDelta(
  input: ReopenRollbackInput,
  billUserId: string | null
): AggregatedNegatedDelta {
  const billData = input.billDataAtSettle ?? {};

  // baseline (settle 時) の category sum を計算
  const baselineCategoryAmounts = calculateCategoryAmounts(billData);
  const baselineItems = baselineCategoryAmounts.get('items') ?? 0;
  const baselineExtraCost = baselineCategoryAmounts.get('extraCost') ?? 0;
  const baselineSideGameChip = baselineCategoryAmounts.get('sideGameChip') ?? 0;
  const baselineTournaments = baselineCategoryAmounts.get('tournaments') ?? 0;
  const baselineGrossSales =
    baselineItems + baselineExtraCost + baselineSideGameChip + baselineTournaments;

  // baseline の paymentTotals（distributePaymentMethods で標準化）
  const basePaymentTotalsMap = distributePaymentMethods(billData.paymentTotals, {
    fallbackCashAmount: billData.amounts?.grandTotalRounded || baselineGrossSales,
  });

  // 集計開始
  let grossSalesNeg = -baselineGrossSales;
  let itemsNeg = -baselineItems;
  let extraCostNeg = -baselineExtraCost;
  let sideGameChipNeg = -baselineSideGameChip;
  let tournamentsNeg = -baselineTournaments;
  const orderCountNeg = -1; // baseline 由来は -1
  const paymentTotalsNeg: Record<string, number> = {};
  basePaymentTotalsMap.forEach((amount, method) => {
    paymentTotalsNeg[method] = (paymentTotalsNeg[method] ?? 0) - amount;
  });

  // baseline の byTemplateTournaments を tournamentsSnapshot から構築
  const tournamentsSnapshot = billData.tournamentsSnapshot ?? {};
  const negatedTemplateMap = new Map<string, AnalyticsTournamentTemplateAggregate>();
  for (const [templateKey, tournamentData] of Object.entries(tournamentsSnapshot)) {
    if (!tournamentData || typeof tournamentData !== 'object') continue;
    const t = tournamentData as Record<string, any>;
    const templateName: string =
      typeof t.templateName === 'string'
        ? t.templateName
        : typeof t.name === 'string'
          ? t.name
          : templateKey;
    // settle path (`addToByTemplateTournaments`) は `entrySalesIncl` 等の `*Incl` フィールド名で書き込んでいる。
    // adjustment path (`buildAdjustmentAnalyticsDelta`) は `entrySales` 等の suffix なし。
    // 同 field 名で書き込まれた値を rollback するため、`*Incl` を優先しつつ legacy 名にフォールバック。
    const entryCount = Number(t.entryCount ?? 0);
    const entrySales = Number(t.entrySalesIncl ?? t.entrySales ?? 0);
    const reentryCount = Number(t.reentryCount ?? 0);
    const reentrySales = Number(t.reentrySalesIncl ?? t.reentrySales ?? 0);
    const addonCount = Number(t.addonCount ?? 0);
    const addonSales = Number(t.addonSalesIncl ?? t.addonSales ?? 0);
    const totalSales = Number(
      t.totalTournamentSalesIncl ?? t.totalSales ?? entrySales + reentrySales + addonSales
    );
    negatedTemplateMap.set(templateKey, {
      templateKey,
      templateName,
      entryCount: -entryCount,
      entrySales: -entrySales,
      reentryCount: -reentryCount,
      reentrySales: -reentrySales,
      addonCount: -addonCount,
      addonSales: -addonSales,
      totalSales: -totalSales,
    });
  }

  // adjustment lines を集計（負号にして加算）
  for (const lines of input.adjustmentsLines) {
    if (lines.length === 0) continue;
    const adjDelta = buildAdjustmentAnalyticsDelta({ lines, billUserId });
    grossSalesNeg += -adjDelta.grossSales;
    itemsNeg += -adjDelta.byCategory.items;
    extraCostNeg += -adjDelta.byCategory.extraCost;
    sideGameChipNeg += -adjDelta.byCategory.sideGameChip;
    tournamentsNeg += -adjDelta.byCategory.tournaments;

    for (const t of adjDelta.byTemplateTournaments) {
      const existing = negatedTemplateMap.get(t.templateKey);
      if (existing) {
        existing.entryCount += -t.entryCount;
        existing.entrySales += -t.entrySales;
        existing.reentryCount += -t.reentryCount;
        existing.reentrySales += -t.reentrySales;
        existing.addonCount += -t.addonCount;
        existing.addonSales += -t.addonSales;
        existing.totalSales += -t.totalSales;
      } else {
        negatedTemplateMap.set(t.templateKey, {
          templateKey: t.templateKey,
          templateName: t.templateName,
          entryCount: -t.entryCount,
          entrySales: -t.entrySales,
          reentryCount: -t.reentryCount,
          reentrySales: -t.reentrySales,
          addonCount: -t.addonCount,
          addonSales: -t.addonSales,
          totalSales: -t.totalSales,
        });
      }
    }
  }

  // collection cashActions の paymentTotals を集計（負号にして加算）
  for (const methodBreakdown of input.collectionCashActionsMethodBreakdown) {
    if (methodBreakdown.length === 0) continue;
    const cashDelta = buildCashActionAnalyticsDelta({
      cashActionType: 'collection',
      methodBreakdown,
    });
    for (const [method, amount] of Object.entries(cashDelta.byPaymentMethod)) {
      paymentTotalsNeg[method] = (paymentTotalsNeg[method] ?? 0) - amount;
    }
  }

  return {
    grossSalesNeg,
    itemsNeg,
    extraCostNeg,
    sideGameChipNeg,
    tournamentsNeg,
    orderCountNeg,
    paymentTotalsNeg,
    byTemplateTournamentsNeg: Array.from(negatedTemplateMap.values()),
  };
}

export async function processReopenRollbackAnalyticsAtomically(
  db: FirebaseFirestore.Firestore,
  params: ProcessReopenRollbackParams
): Promise<void> {
  const { monthKey, businessDate, billId, oldCycleNo, billUserId, input } = params;

  const userId = typeof billUserId === 'string' && billUserId.length > 0 ? billUserId : null;

  const monthlyRef = db.collection('analyticsMonthly').doc(monthKey);
  const dailyRef = monthlyRef.collection('days').doc(businessDate);
  const byCategoryRef = monthlyRef.collection('byCategory').doc('summary');
  const byUserRef = userId ? monthlyRef.collection('byUser').doc(userId) : undefined;
  const markerRef = monthlyRef
    .collection('aggregationMarkers')
    .doc(`reopen_${billId}_cycle${oldCycleNo}`);

  const aggregated = aggregateNegatedDelta(input, userId);

  const templateRefs = aggregated.byTemplateTournamentsNeg.map((t) =>
    monthlyRef.collection('byTemplateTournaments').doc(t.templateKey)
  );

  await db.runTransaction(async (tx) => {
    const markerDoc = await tx.get(markerRef);
    if (markerDoc.exists) {
      logger.info('processReopenRollbackAnalyticsAtomically: marker already exists, skipping', {
        billId,
        oldCycleNo,
        monthKey,
      });
      return;
    }

    const reads: Promise<FirebaseFirestore.DocumentSnapshot>[] = [
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

    logger.info('processReopenRollbackAnalyticsAtomically: starting analytics rollback', {
      billId,
      oldCycleNo,
      monthKey,
      businessDate,
      grossSalesNeg: aggregated.grossSalesNeg,
      paymentMethodsNegCount: Object.keys(aggregated.paymentTotalsNeg).length,
      templatesNegCount: aggregated.byTemplateTournamentsNeg.length,
    });

    if (!monthlyDoc.exists) {
      tx.set(monthlyRef, initialMonthlyDoc());
    }
    tx.update(monthlyRef, buildMonthlyRollbackUpdate(aggregated, businessDate));

    if (!dailyDoc.exists) {
      tx.set(dailyRef, initialDailyDoc());
    }
    tx.update(dailyRef, buildDailyRollbackUpdate(aggregated));

    if (!byCategoryDoc.exists) {
      tx.set(byCategoryRef, initialByCategoryDoc());
    }
    tx.update(byCategoryRef, buildByCategoryRollbackUpdate(aggregated));

    if (byUserRef && byUserDoc) {
      if (!byUserDoc.exists) {
        tx.set(byUserRef, initialByUserDoc());
      }
      tx.update(byUserRef, buildByUserRollbackUpdate(aggregated, businessDate));
    }

    aggregated.byTemplateTournamentsNeg.forEach((template, i) => {
      const ref = templateRefs[i];
      const doc = templateDocs[i];
      if (!doc.exists) {
        tx.set(ref, initialByTemplateTournamentDoc(template));
      }
      tx.update(ref, buildByTemplateTournamentRollbackUpdate(template, businessDate));
    });

    tx.create(markerRef, {
      type: 'reopen_rollback',
      billId,
      oldCycleNo,
      monthKey,
      businessDate,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info('processReopenRollbackAnalyticsAtomically: analytics rollback completed', {
      billId,
      oldCycleNo,
      monthKey,
      businessDate,
    });
  });
}

// --- doc init helpers (settle/adj/cash と同じ shape) ---

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

function initialByCategoryDoc(): Record<string, any> {
  return {
    totals: {},
    orderCounts: {},
    itemSales: {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

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

// --- update helpers (negated increment 群) ---

function buildMonthlyRollbackUpdate(
  agg: AggregatedNegatedDelta,
  businessDate: string
): Record<string, any> {
  const update: Record<string, any> = {
    grossSales: admin.firestore.FieldValue.increment(agg.grossSalesNeg),
    itemsSales: admin.firestore.FieldValue.increment(agg.itemsNeg),
    extraCostSales: admin.firestore.FieldValue.increment(agg.extraCostNeg),
    sideGameChipSales: admin.firestore.FieldValue.increment(agg.sideGameChipNeg),
    tournamentsSales: admin.firestore.FieldValue.increment(agg.tournamentsNeg),
    orderCount: admin.firestore.FieldValue.increment(agg.orderCountNeg),
    [`dailySales.${businessDate}`]: admin.firestore.FieldValue.increment(agg.grossSalesNeg),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  for (const [method, amount] of Object.entries(agg.paymentTotalsNeg)) {
    update[`paymentTotals.${method}`] = admin.firestore.FieldValue.increment(amount);
  }
  return update;
}

function buildDailyRollbackUpdate(agg: AggregatedNegatedDelta): Record<string, any> {
  const update: Record<string, any> = {
    grossSales: admin.firestore.FieldValue.increment(agg.grossSalesNeg),
    itemsSales: admin.firestore.FieldValue.increment(agg.itemsNeg),
    extraCostSales: admin.firestore.FieldValue.increment(agg.extraCostNeg),
    sideGameChipSales: admin.firestore.FieldValue.increment(agg.sideGameChipNeg),
    tournamentsSales: admin.firestore.FieldValue.increment(agg.tournamentsNeg),
    orderCount: admin.firestore.FieldValue.increment(agg.orderCountNeg),
    'byCategory.items': admin.firestore.FieldValue.increment(agg.itemsNeg),
    'byCategory.extraCost': admin.firestore.FieldValue.increment(agg.extraCostNeg),
    'byCategory.sideGameChip': admin.firestore.FieldValue.increment(agg.sideGameChipNeg),
    'byCategory.tournaments': admin.firestore.FieldValue.increment(agg.tournamentsNeg),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  for (const [method, amount] of Object.entries(agg.paymentTotalsNeg)) {
    update[`byPaymentMethod.${method}`] = admin.firestore.FieldValue.increment(amount);
  }
  return update;
}

function buildByCategoryRollbackUpdate(agg: AggregatedNegatedDelta): Record<string, any> {
  return {
    'totals.items': admin.firestore.FieldValue.increment(agg.itemsNeg),
    'totals.extraCost': admin.firestore.FieldValue.increment(agg.extraCostNeg),
    'totals.sideGameChip': admin.firestore.FieldValue.increment(agg.sideGameChipNeg),
    'totals.tournaments': admin.firestore.FieldValue.increment(agg.tournamentsNeg),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function buildByUserRollbackUpdate(
  agg: AggregatedNegatedDelta,
  businessDate: string
): Record<string, any> {
  const update: Record<string, any> = {
    grossSales: admin.firestore.FieldValue.increment(agg.grossSalesNeg),
    itemsSales: admin.firestore.FieldValue.increment(agg.itemsNeg),
    extraCostSales: admin.firestore.FieldValue.increment(agg.extraCostNeg),
    sideGameChipSales: admin.firestore.FieldValue.increment(agg.sideGameChipNeg),
    tournamentsSales: admin.firestore.FieldValue.increment(agg.tournamentsNeg),
    orderCount: admin.firestore.FieldValue.increment(agg.orderCountNeg),
    [`dailySales.${businessDate}`]: admin.firestore.FieldValue.increment(agg.grossSalesNeg),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  for (const [method, amount] of Object.entries(agg.paymentTotalsNeg)) {
    update[`paymentTotals.${method}`] = admin.firestore.FieldValue.increment(amount);
  }
  return update;
}

function buildByTemplateTournamentRollbackUpdate(
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
    [`daily.${businessDate}.totalTournamentSales`]: admin.firestore.FieldValue.increment(template.totalSales),
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
