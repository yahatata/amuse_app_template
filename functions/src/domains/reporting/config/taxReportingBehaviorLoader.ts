/**
 * storeMeta/taxReportingBehavior 取得層
 *
 * 読み取り優先度: ① storeMeta/taxReportingBehavior → ② defaults.ts
 * 未存在時・読み取り失敗時は defaults にフォールバック。
 */

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { DEFAULT_TAX_REPORTING_BEHAVIOR } from './defaults';
import type { TaxReportingBehavior } from '../types';

export async function loadTaxReportingBehavior(): Promise<TaxReportingBehavior> {
  const db = getFirestore();
  const docRef = db.collection('storeMeta').doc('taxReportingBehavior');

  try {
    const doc = await docRef.get();
    if (!doc.exists) {
      return { ...DEFAULT_TAX_REPORTING_BEHAVIOR };
    }
    const data = doc.data() as Record<string, unknown> | undefined;
    return mergeWithDefaults(data ?? {});
  } catch (err) {
    logger.warn('taxReportingBehaviorLoader: read failed, using defaults', { error: String(err) });
    return { ...DEFAULT_TAX_REPORTING_BEHAVIOR };
  }
}

function mergeWithDefaults(raw: Record<string, unknown>): TaxReportingBehavior {
  const defaults = DEFAULT_TAX_REPORTING_BEHAVIOR;
  const dateRuleRaw = raw.dateRule as Record<string, unknown> | undefined;
  const revenueRaw = raw.revenueRecognition as Record<string, unknown> | undefined;

  return {
    dateRule: {
      settle: (dateRuleRaw?.settle === 'settledAt' || dateRuleRaw?.settle === 'businessDate')
        ? dateRuleRaw.settle : defaults.dateRule.settle,
      adjustment: (dateRuleRaw?.adjustment === 'adjustmentDate' || dateRuleRaw?.adjustment === 'originalBillDate')
        ? dateRuleRaw.adjustment : defaults.dateRule.adjustment,
      immediateCashAction: (dateRuleRaw?.immediateCashAction === 'cashActionDate' || dateRuleRaw?.immediateCashAction === 'adjustmentDate')
        ? dateRuleRaw.immediateCashAction : defaults.dateRule.immediateCashAction,
      laterCashAction: (dateRuleRaw?.laterCashAction === 'cashActionDate' || dateRuleRaw?.laterCashAction === 'originalBillDate')
        ? dateRuleRaw.laterCashAction : defaults.dateRule.laterCashAction,
      resettle: (dateRuleRaw?.resettle === 'settledAt' || dateRuleRaw?.resettle === 'businessDate')
        ? dateRuleRaw.resettle : defaults.dateRule.resettle,
    },
    revenueRecognition: {
      basis: (revenueRaw?.basis === 'accrual' || revenueRaw?.basis === 'cash')
        ? revenueRaw.basis : defaults.revenueRecognition.basis,
      pendingAdjustmentTiming: 'onCashAction',
    },
    reopenPolicy: {
      reportingTreatment: 'reverseInOriginalMonth',
    },
    granularity: {
      reportingEntry: 'lineLevel',
    },
  };
}
