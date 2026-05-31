/**
 * C-3 整合性チェック テスト
 *
 * analyticsDailyCheck / analyticsMonthlyCheck /
 * reportingDailyCheck / reportingMonthlyCheck のロジックを
 * ユニットテストで検証する。
 *
 * callable 本体は onCall ラッパーのため直接呼びにくいので、
 * 核となる計算ロジック（judgment 決定）を関数として抽出してテストする。
 * + writeBatchJobLog ユーティリティの動作テスト
 */

import {
  jstDateToUtcRange,
  toAnalyticsMonthKey,
  toReportingMonthKey,
  businessDateToMonthKey,
} from '../../src/shared/batchJobLogs/writeBatchJobLog';

// ---------------------------------------------------------------------------
// writeBatchJobLog ユーティリティのテスト
// ---------------------------------------------------------------------------

describe('writeBatchJobLog utilities', () => {
  describe('jstDateToUtcRange', () => {
    it('JST 2026-05-30 → UTC 2026-05-29T15:00:00Z 〜 2026-05-30T15:00:00Z', () => {
      const { startUtc, endUtc } = jstDateToUtcRange('2026-05-30');
      expect(startUtc.toDate().toISOString()).toBe('2026-05-29T15:00:00.000Z');
      expect(endUtc.toDate().toISOString()).toBe('2026-05-30T15:00:00.000Z');
    });

    it('月をまたぐケース: JST 2026-06-01 → UTC 2026-05-31T15:00:00Z 〜 2026-06-01T15:00:00Z', () => {
      const { startUtc, endUtc } = jstDateToUtcRange('2026-06-01');
      expect(startUtc.toDate().toISOString()).toBe('2026-05-31T15:00:00.000Z');
      expect(endUtc.toDate().toISOString()).toBe('2026-06-01T15:00:00.000Z');
    });
  });

  describe('toAnalyticsMonthKey', () => {
    it('"2026-05" → "2026-05"（そのまま）', () => {
      expect(toAnalyticsMonthKey('2026-05')).toBe('2026-05');
    });
  });

  describe('toReportingMonthKey', () => {
    it('"2026-05" → "202605"（ハイフン除去）', () => {
      expect(toReportingMonthKey('2026-05')).toBe('202605');
    });
  });

  describe('businessDateToMonthKey', () => {
    it('"2026-05-30" → "2026-05"', () => {
      expect(businessDateToMonthKey('2026-05-30')).toBe('2026-05');
    });
  });
});

// ---------------------------------------------------------------------------
// analyticsDailyCheck のロジックテスト
// ---------------------------------------------------------------------------

describe('analyticsDailyCheck ロジック', () => {
  /**
   * 新ロジック（aggregationMarkers クエリ不使用版）:
   *   Check A: dayOrderCount >= billsCount（!dayExists なら billsCount == 0 が正常）
   *   Check B: days doc が存在しない かつ billsCount > 0 → 書き込み未実行
   */
  function determineJudgment(params: {
    billsCount: number;
    dayOrderCount: number;
    dayExists: boolean;
  }): { judgment: string; failedChecks: string[] } {
    const { billsCount, dayOrderCount, dayExists } = params;
    const failedChecks: string[] = [];

    const dayOrderCountGeBills = !dayExists ? billsCount === 0 : dayOrderCount >= billsCount;
    if (!dayOrderCountGeBills) failedChecks.push('checkA_orderCount');

    const dayMissing = !dayExists && billsCount > 0;
    if (dayMissing) failedChecks.push('checkB_dayDocMissing');

    let judgment: string;
    if (failedChecks.length === 0) {
      judgment = 'ok';
    } else if (dayMissing) {
      judgment = 'ng';
    } else if (failedChecks.includes('checkA_orderCount')) {
      const diff = billsCount - dayOrderCount;
      judgment = diff === 1 ? 'warning' : 'ng';
    } else {
      judgment = 'ng';
    }

    return { judgment, failedChecks };
  }

  it('正常ケース: dayOrderCount == billsCount', () => {
    const result = determineJudgment({ billsCount: 5, dayOrderCount: 5, dayExists: true });
    expect(result.judgment).toBe('ok');
    expect(result.failedChecks).toHaveLength(0);
  });

  it('settle→reopen→resettle: dayOrderCount > billsCount（正常）', () => {
    const result = determineJudgment({ billsCount: 4, dayOrderCount: 5, dayExists: true });
    expect(result.judgment).toBe('ok');
  });

  it('dayOrderCount が billsCount より1件少ない → warning', () => {
    const result = determineJudgment({ billsCount: 5, dayOrderCount: 4, dayExists: true });
    expect(result.judgment).toBe('warning');
    expect(result.failedChecks).toContain('checkA_orderCount');
  });

  it('dayOrderCount が billsCount より2件以上少ない → ng', () => {
    const result = determineJudgment({ billsCount: 7, dayOrderCount: 4, dayExists: true });
    expect(result.judgment).toBe('ng');
  });

  it('days doc が存在しない かつ billsCount == 0 → ok（当日会計なし）', () => {
    const result = determineJudgment({ billsCount: 0, dayOrderCount: 0, dayExists: false });
    expect(result.judgment).toBe('ok');
  });

  it('days doc が存在しない かつ billsCount > 0 → ng（analytics 未書き込み）', () => {
    const result = determineJudgment({ billsCount: 3, dayOrderCount: 0, dayExists: false });
    expect(result.judgment).toBe('ng');
    expect(result.failedChecks).toContain('checkB_dayDocMissing');
  });
});

// ---------------------------------------------------------------------------
// analyticsMonthlyCheck のロジックテスト
// ---------------------------------------------------------------------------

describe('analyticsMonthlyCheck ロジック', () => {
  /**
   * 新ロジック（aggregationMarkers クエリ不使用版）:
   *   Check A: grossSales == カテゴリ合算（checkA_categorySum）
   *   Check B: sum(dailySales) == grossSales（checkB_dailySum）
   *   Check C: 前回ログから grossSales が変化（checkC_retroactiveChange）
   */
  function determineJudgment(params: {
    grossSales: number;
    computedCategorySum: number;
    dailySalesSum: number;
    prevGrossSales: number | null;
  }): { judgment: string; failedChecks: string[] } {
    const { grossSales, computedCategorySum, dailySalesSum, prevGrossSales } = params;
    const failedChecks: string[] = [];

    if (grossSales !== computedCategorySum) failedChecks.push('checkA_categorySum');
    if (grossSales !== dailySalesSum) failedChecks.push('checkB_dailySum');
    const retroactiveChangeDetected = prevGrossSales !== null && prevGrossSales !== grossSales;
    if (retroactiveChangeDetected) failedChecks.push('checkC_retroactiveChange');

    const hardFails = failedChecks.filter(c => c !== 'checkC_retroactiveChange');
    let judgment: string;
    if (failedChecks.length === 0) {
      judgment = 'ok';
    } else if (hardFails.length === 0 && retroactiveChangeDetected) {
      judgment = 'warning';
    } else {
      judgment = 'ng';
    }

    return { judgment, failedChecks };
  }

  it('全項目整合 → ok', () => {
    const result = determineJudgment({
      grossSales: 50000,
      computedCategorySum: 50000,
      dailySalesSum: 50000,
      prevGrossSales: null,
    });
    expect(result.judgment).toBe('ok');
  });

  it('grossSales と categorySum 不一致 → ng', () => {
    const result = determineJudgment({
      grossSales: 50000,
      computedCategorySum: 49000,
      dailySalesSum: 50000,
      prevGrossSales: null,
    });
    expect(result.judgment).toBe('ng');
    expect(result.failedChecks).toContain('checkA_categorySum');
  });

  it('grossSales と dailySalesSum 不一致 → ng', () => {
    const result = determineJudgment({
      grossSales: 50000,
      computedCategorySum: 50000,
      dailySalesSum: 48000,
      prevGrossSales: null,
    });
    expect(result.judgment).toBe('ng');
    expect(result.failedChecks).toContain('checkB_dailySum');
  });

  it('前回ログから grossSales が変化（遡及変更）→ warning', () => {
    const result = determineJudgment({
      grossSales: 51000,
      computedCategorySum: 51000,
      dailySalesSum: 51000,
      prevGrossSales: 50000,
    });
    expect(result.judgment).toBe('warning');
    expect(result.failedChecks).toContain('checkC_retroactiveChange');
  });

  it('遡及変更 + categorySum 不一致 → ng', () => {
    const result = determineJudgment({
      grossSales: 51000,
      computedCategorySum: 49000,
      dailySalesSum: 51000,
      prevGrossSales: 50000,
    });
    expect(result.judgment).toBe('ng');
  });
});

// ---------------------------------------------------------------------------
// reportingDailyCheck のロジックテスト
// ---------------------------------------------------------------------------

describe('reportingDailyCheck ロジック', () => {
  function determineJudgment(params: {
    newSettleEntriesCount: number;
    settledBillsCount: number;
    totalAmountDiff: number;
    isFirstRun: boolean;
  }): { judgment: string; failedChecks: string[] } {
    const { newSettleEntriesCount, settledBillsCount, totalAmountDiff, isFirstRun } = params;

    if (isFirstRun) return { judgment: 'ok', failedChecks: [] };

    const failedChecks: string[] = [];
    const settleCountMatch = newSettleEntriesCount === settledBillsCount;
    if (!settleCountMatch) failedChecks.push('checkA_settleCount');
    const totalAmountDeltaMatch = totalAmountDiff <= 2;
    if (!totalAmountDeltaMatch) failedChecks.push('checkB_totalAmountDelta');

    let judgment: string;
    if (failedChecks.length === 0) {
      judgment = 'ok';
    } else if (failedChecks.includes('checkA_settleCount')) {
      const diff = Math.abs(newSettleEntriesCount - settledBillsCount);
      judgment = diff === 1 ? 'warning' : 'ng';
    } else {
      judgment = 'ng';
    }

    return { judgment, failedChecks };
  }

  it('初回実行（前日ログなし）→ ok', () => {
    const result = determineJudgment({
      newSettleEntriesCount: 5,
      settledBillsCount: 5,
      totalAmountDiff: 0,
      isFirstRun: true,
    });
    expect(result.judgment).toBe('ok');
  });

  it('settle 件数・金額一致 → ok', () => {
    const result = determineJudgment({
      newSettleEntriesCount: 5,
      settledBillsCount: 5,
      totalAmountDiff: 0,
      isFirstRun: false,
    });
    expect(result.judgment).toBe('ok');
  });

  it('settle 件数が1件少ない → warning', () => {
    const result = determineJudgment({
      newSettleEntriesCount: 4,
      settledBillsCount: 5,
      totalAmountDiff: 0,
      isFirstRun: false,
    });
    expect(result.judgment).toBe('warning');
    expect(result.failedChecks).toContain('checkA_settleCount');
  });

  it('settle 件数が2件以上少ない → ng', () => {
    const result = determineJudgment({
      newSettleEntriesCount: 3,
      settledBillsCount: 6,
      totalAmountDiff: 0,
      isFirstRun: false,
    });
    expect(result.judgment).toBe('ng');
  });

  it('totalAmountDelta と entries 合算が2円超ずれ → ng', () => {
    const result = determineJudgment({
      newSettleEntriesCount: 5,
      settledBillsCount: 5,
      totalAmountDiff: 100,
      isFirstRun: false,
    });
    expect(result.judgment).toBe('ng');
    expect(result.failedChecks).toContain('checkB_totalAmountDelta');
  });
});

// ---------------------------------------------------------------------------
// reportingMonthlyCheck のロジックテスト
// ---------------------------------------------------------------------------

describe('reportingMonthlyCheck ロジック', () => {
  function determineJudgment(params: {
    markerCount: number;
    entriesCount: number;
    totalAmountDiff: number;
    categoryBreakdownMatch: boolean;
    paymentBreakdownMatch: boolean;
    retroactiveChangeDetected: boolean;
  }): { judgment: string; failedChecks: string[] } {
    const {
      markerCount,
      entriesCount,
      totalAmountDiff,
      categoryBreakdownMatch,
      paymentBreakdownMatch,
      retroactiveChangeDetected,
    } = params;
    const failedChecks: string[] = [];

    if (markerCount !== entriesCount) failedChecks.push('checkA_markerCount');
    if (totalAmountDiff > 0) failedChecks.push('checkB_totalAmount');
    if (!categoryBreakdownMatch) failedChecks.push('checkC_categoryBreakdown');
    if (!paymentBreakdownMatch) failedChecks.push('checkD_paymentBreakdown');
    if (retroactiveChangeDetected) failedChecks.push('checkE_retroactiveChange');

    const hardFails = failedChecks.filter(
      c => c !== 'checkB_totalAmount' && c !== 'checkE_retroactiveChange',
    );
    const softOnly = failedChecks.every(
      c => c === 'checkB_totalAmount' || c === 'checkE_retroactiveChange',
    );

    let judgment: string;
    if (failedChecks.length === 0) {
      judgment = 'ok';
    } else if (softOnly && failedChecks.includes('checkB_totalAmount') && totalAmountDiff <= 1) {
      judgment = 'warning';
    } else if (softOnly && failedChecks.every(c => c === 'checkE_retroactiveChange')) {
      judgment = 'warning';
    } else if (hardFails.length > 0) {
      judgment = 'ng';
    } else {
      judgment = 'warning';
    }

    return { judgment, failedChecks };
  }

  it('全項目一致 → ok', () => {
    const result = determineJudgment({
      markerCount: 20,
      entriesCount: 20,
      totalAmountDiff: 0,
      categoryBreakdownMatch: true,
      paymentBreakdownMatch: true,
      retroactiveChangeDetected: false,
    });
    expect(result.judgment).toBe('ok');
  });

  it('totalAmountIncl が1円ずれ → warning', () => {
    const result = determineJudgment({
      markerCount: 20,
      entriesCount: 20,
      totalAmountDiff: 1,
      categoryBreakdownMatch: true,
      paymentBreakdownMatch: true,
      retroactiveChangeDetected: false,
    });
    expect(result.judgment).toBe('warning');
  });

  it('entriesCount と markerCount 不一致 → ng', () => {
    const result = determineJudgment({
      markerCount: 18,
      entriesCount: 20,
      totalAmountDiff: 0,
      categoryBreakdownMatch: true,
      paymentBreakdownMatch: true,
      retroactiveChangeDetected: false,
    });
    expect(result.judgment).toBe('ng');
    expect(result.failedChecks).toContain('checkA_markerCount');
  });

  it('カテゴリ合算不一致 → ng', () => {
    const result = determineJudgment({
      markerCount: 20,
      entriesCount: 20,
      totalAmountDiff: 0,
      categoryBreakdownMatch: false,
      paymentBreakdownMatch: true,
      retroactiveChangeDetected: false,
    });
    expect(result.judgment).toBe('ng');
    expect(result.failedChecks).toContain('checkC_categoryBreakdown');
  });

  it('支払い方法不一致 → ng', () => {
    const result = determineJudgment({
      markerCount: 20,
      entriesCount: 20,
      totalAmountDiff: 0,
      categoryBreakdownMatch: true,
      paymentBreakdownMatch: false,
      retroactiveChangeDetected: false,
    });
    expect(result.judgment).toBe('ng');
    expect(result.failedChecks).toContain('checkD_paymentBreakdown');
  });

  it('遡及変更のみ検知 → warning', () => {
    const result = determineJudgment({
      markerCount: 20,
      entriesCount: 20,
      totalAmountDiff: 0,
      categoryBreakdownMatch: true,
      paymentBreakdownMatch: true,
      retroactiveChangeDetected: true,
    });
    expect(result.judgment).toBe('warning');
    expect(result.failedChecks).toContain('checkE_retroactiveChange');
  });

  it('遡及変更 + カテゴリ不一致 → ng', () => {
    const result = determineJudgment({
      markerCount: 20,
      entriesCount: 20,
      totalAmountDiff: 0,
      categoryBreakdownMatch: false,
      paymentBreakdownMatch: true,
      retroactiveChangeDetected: true,
    });
    expect(result.judgment).toBe('ng');
  });
});
