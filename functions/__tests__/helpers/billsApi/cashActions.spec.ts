/**
 * services/cashActions.ts の unit test。
 *
 * Step03 で `buildImmediateCashActionDoc` の最小 shape を、
 * Step04 で `buildCashActionDoc` / `validateMethodBreakdown` / `validateAllocations` /
 * `applyAllocationsToAdjustments` / `resolveCashflowBusinessDate` を検証する。
 *
 * 仕様書 04_cashActions管理.md §6 / §8 / §9 / §10 / §15 に対応。
 */

import {
  applyAllocationsToAdjustments,
  buildCashActionDoc,
  buildImmediateCashActionDoc,
  ExistingAdjustmentForAllocation,
  resolveCashflowBusinessDate,
  validateAllocations,
  validateMethodBreakdown,
} from '../../../src/domains/bills/services/cashActions';

// calcBusinessDate を mock するためのセットアップ
jest.mock('../../../src/domains/bills/repos/calcBusinessDate', () => ({
  calcBusinessDate: jest.fn(),
}));
import { calcBusinessDate as calcBusinessDateMock } from '../../../src/domains/bills/repos/calcBusinessDate';

describe('services/cashActions buildImmediateCashActionDoc', () => {
  const baseInput = {
    sequenceNo: 2,
    cashActionType: 'refund' as const,
    amountIncl: 1000,
    executedAt: new Date('2026-05-09T00:00:00Z'),
    executedBy: 'uid-A',
    cashflowBusinessDate: '2026-05-09',
    method: 'cash',
    allocationAdjustmentId: 'adj-xyz',
  };

  it('最小 field を全て満たす shape を返す', () => {
    const doc = buildImmediateCashActionDoc(baseInput);
    expect(doc).toMatchObject({
      sequenceNo: 2,
      cashActionType: 'refund',
      amountIncl: 1000,
      executedBy: 'uid-A',
      cashflowBusinessDate: '2026-05-09',
      methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
      allocations: [{ adjustmentId: 'adj-xyz', amountIncl: 1000 }],
      note: '',
    });
    expect(doc.executedAt).toEqual(baseInput.executedAt);
  });

  it('collection でも対応する', () => {
    const doc = buildImmediateCashActionDoc({
      ...baseInput,
      cashActionType: 'collection',
      method: 'credit_card',
    });
    expect(doc.cashActionType).toBe('collection');
    expect(doc.methodBreakdown).toEqual([{ method: 'credit_card', amountIncl: 1000 }]);
  });

  it('note を渡したら保持される', () => {
    const doc = buildImmediateCashActionDoc({
      ...baseInput,
      note: 'memo',
    });
    expect(doc.note).toBe('memo');
  });

  it('amountIncl <= 0 を弾く', () => {
    expect(() => buildImmediateCashActionDoc({ ...baseInput, amountIncl: 0 })).toThrow(/must be > 0/);
    expect(() => buildImmediateCashActionDoc({ ...baseInput, amountIncl: -100 })).toThrow(/must be > 0/);
  });

  it('cashActionType が不正だと弾く', () => {
    expect(() =>
      buildImmediateCashActionDoc({ ...baseInput, cashActionType: 'unknown' as any })
    ).toThrow(/cashActionType/);
  });

  it('method が空だと弾く', () => {
    expect(() => buildImmediateCashActionDoc({ ...baseInput, method: '' })).toThrow(/non-empty/);
  });

  it('allocationAdjustmentId が空だと弾く', () => {
    expect(() =>
      buildImmediateCashActionDoc({ ...baseInput, allocationAdjustmentId: '' })
    ).toThrow(/allocationAdjustmentId/);
  });

  it('cashflowBusinessDate が空だと弾く', () => {
    expect(() =>
      buildImmediateCashActionDoc({ ...baseInput, cashflowBusinessDate: '' })
    ).toThrow(/cashflowBusinessDate/);
  });

  it('executedBy が null でも受理する', () => {
    const doc = buildImmediateCashActionDoc({ ...baseInput, executedBy: null });
    expect(doc.executedBy).toBeNull();
  });

  it('sum(methodBreakdown[].amountIncl) === amountIncl', () => {
    const doc = buildImmediateCashActionDoc(baseInput);
    const sum = doc.methodBreakdown.reduce((acc, e) => acc + e.amountIncl, 0);
    expect(sum).toBe(doc.amountIncl);
  });

  it('sum(allocations[].amountIncl) === amountIncl', () => {
    const doc = buildImmediateCashActionDoc(baseInput);
    const sum = doc.allocations.reduce((acc, e) => acc + e.amountIncl, 0);
    expect(sum).toBe(doc.amountIncl);
  });
});

describe('services/cashActions buildCashActionDoc (Step04)', () => {
  const baseInput = {
    sequenceNo: 3,
    cashActionType: 'refund' as const,
    amountIncl: 1000,
    executedAt: new Date('2026-05-09T01:00:00Z'),
    executedBy: 'uid-B',
    cashflowBusinessDate: '2026-05-09',
    methodBreakdown: [{ method: 'cash' as const, amountIncl: 1000 }],
    allocations: [{ adjustmentId: 'adj-1', amountIncl: 1000 }],
  };

  it('multi method で組み立てられる', () => {
    const doc = buildCashActionDoc({
      ...baseInput,
      methodBreakdown: [
        { method: 'cash', amountIncl: 600 },
        { method: 'credit_card', amountIncl: 400 },
      ],
    });
    expect(doc.methodBreakdown).toEqual([
      { method: 'cash', amountIncl: 600 },
      { method: 'credit_card', amountIncl: 400 },
    ]);
  });

  it('multi allocation で組み立てられる', () => {
    const doc = buildCashActionDoc({
      ...baseInput,
      allocations: [
        { adjustmentId: 'adj-1', amountIncl: 600 },
        { adjustmentId: 'adj-2', amountIncl: 400 },
      ],
    });
    expect(doc.allocations).toHaveLength(2);
    expect(doc.allocations.reduce((acc, a) => acc + a.amountIncl, 0)).toBe(1000);
  });

  it('amountIncl !== sum(methodBreakdown) で throw', () => {
    expect(() =>
      buildCashActionDoc({
        ...baseInput,
        methodBreakdown: [{ method: 'cash', amountIncl: 999 }],
      })
    ).toThrow(/sum\(methodBreakdown/);
  });

  it('amountIncl !== sum(allocations) で throw', () => {
    expect(() =>
      buildCashActionDoc({
        ...baseInput,
        allocations: [{ adjustmentId: 'adj-1', amountIncl: 999 }],
      })
    ).toThrow(/sum\(allocations/);
  });

  it('allocations 空で throw', () => {
    expect(() =>
      buildCashActionDoc({
        ...baseInput,
        allocations: [],
      })
    ).toThrow(/allocations must contain at least 1/);
  });

  it('methodBreakdown 空で throw', () => {
    expect(() =>
      buildCashActionDoc({
        ...baseInput,
        methodBreakdown: [],
      })
    ).toThrow(/methodBreakdown must contain at least 1/);
  });
});

describe('services/cashActions validateMethodBreakdown', () => {
  it('1 件 / multi で正常受理', () => {
    expect(() =>
      validateMethodBreakdown({
        methodBreakdown: [{ method: 'cash', amountIncl: 1000 }],
        expectedAmountIncl: 1000,
      })
    ).not.toThrow();
    expect(() =>
      validateMethodBreakdown({
        methodBreakdown: [
          { method: 'cash', amountIncl: 600 },
          { method: 'credit_card', amountIncl: 400 },
        ],
        expectedAmountIncl: 1000,
      })
    ).not.toThrow();
  });

  it('合計不一致で throw', () => {
    expect(() =>
      validateMethodBreakdown({
        methodBreakdown: [{ method: 'cash', amountIncl: 999 }],
        expectedAmountIncl: 1000,
      })
    ).toThrow(/sum\(methodBreakdown/);
  });

  it('method 文字列空で throw', () => {
    expect(() =>
      validateMethodBreakdown({
        methodBreakdown: [{ method: '', amountIncl: 1000 }],
        expectedAmountIncl: 1000,
      })
    ).toThrow(/non-empty/);
  });

  it('method 値域外で throw', () => {
    expect(() =>
      validateMethodBreakdown({
        methodBreakdown: [{ method: 'wechat_pay', amountIncl: 1000 }],
        expectedAmountIncl: 1000,
      })
    ).toThrow(/not in current-scope set/);
  });

  it('amountIncl <= 0 で throw', () => {
    expect(() =>
      validateMethodBreakdown({
        methodBreakdown: [{ method: 'cash', amountIncl: 0 }],
        expectedAmountIncl: 0,
      })
    ).toThrow(/must be > 0/);
  });
});

describe('services/cashActions validateAllocations', () => {
  const adj1: ExistingAdjustmentForAllocation = {
    adjustmentId: 'adj-1',
    cycleNo: 1,
    adjustmentDirection: 'decrease',
    adjustmentState: 'effective',
    requiredActionRemainingIncl: 1000,
  };
  const adj2: ExistingAdjustmentForAllocation = {
    adjustmentId: 'adj-2',
    cycleNo: 1,
    adjustmentDirection: 'increase',
    adjustmentState: 'effective',
    requiredActionRemainingIncl: 500,
  };
  const adj3OtherCycle: ExistingAdjustmentForAllocation = {
    adjustmentId: 'adj-3',
    cycleNo: 2,
    adjustmentDirection: 'decrease',
    adjustmentState: 'effective',
    requiredActionRemainingIncl: 800,
  };
  const adjCompleted: ExistingAdjustmentForAllocation = {
    adjustmentId: 'adj-c',
    cycleNo: 1,
    adjustmentDirection: 'decrease',
    adjustmentState: 'completed_by_offset',
    requiredActionRemainingIncl: 0,
  };

  it('happy: refund cashAction で decrease 系 adjustment へ全額 allocate', () => {
    expect(() =>
      validateAllocations({
        allocations: [{ adjustmentId: 'adj-1', amountIncl: 1000 }],
        cashActionAmountIncl: 1000,
        existingAdjustments: [adj1],
        expectedCycleNo: 1,
        expectedDirection: 'decrease',
      })
    ).not.toThrow();
  });

  it('allocation 空で throw', () => {
    expect(() =>
      validateAllocations({
        allocations: [],
        cashActionAmountIncl: 0,
        existingAdjustments: [adj1],
        expectedCycleNo: 1,
        expectedDirection: 'decrease',
      })
    ).toThrow(/at least 1 entry/);
  });

  it('合計不一致で throw', () => {
    expect(() =>
      validateAllocations({
        allocations: [{ adjustmentId: 'adj-1', amountIncl: 500 }],
        cashActionAmountIncl: 1000,
        existingAdjustments: [adj1],
        expectedCycleNo: 1,
        expectedDirection: 'decrease',
      })
    ).toThrow(/sum\(allocations/);
  });

  it('異 cycle adjustment に allocate で throw', () => {
    expect(() =>
      validateAllocations({
        allocations: [{ adjustmentId: 'adj-3', amountIncl: 800 }],
        cashActionAmountIncl: 800,
        existingAdjustments: [adj3OtherCycle],
        expectedCycleNo: 1,
        expectedDirection: 'decrease',
      })
    ).toThrow(/cycle/);
  });

  it('direction 不整合で throw（refund cashAction で increase 系 adjustment）', () => {
    expect(() =>
      validateAllocations({
        allocations: [{ adjustmentId: 'adj-2', amountIncl: 500 }],
        cashActionAmountIncl: 500,
        existingAdjustments: [adj2],
        expectedCycleNo: 1,
        expectedDirection: 'decrease', // refund だから decrease を期待
      })
    ).toThrow(/direction/);
  });

  it('completed_by_offset 済 adjustment に allocate で throw', () => {
    expect(() =>
      validateAllocations({
        allocations: [{ adjustmentId: 'adj-c', amountIncl: 1 }],
        cashActionAmountIncl: 1,
        existingAdjustments: [adjCompleted],
        expectedCycleNo: 1,
        expectedDirection: 'decrease',
      })
    ).toThrow(/effective/);
  });

  it('over-allocation で throw', () => {
    expect(() =>
      validateAllocations({
        allocations: [{ adjustmentId: 'adj-1', amountIncl: 2000 }],
        cashActionAmountIncl: 2000,
        existingAdjustments: [adj1],
        expectedCycleNo: 1,
        expectedDirection: 'decrease',
      })
    ).toThrow(/over-allocation/);
  });

  it('同一 adjustmentId 重複 allocation で throw', () => {
    expect(() =>
      validateAllocations({
        allocations: [
          { adjustmentId: 'adj-1', amountIncl: 500 },
          { adjustmentId: 'adj-1', amountIncl: 500 },
        ],
        cashActionAmountIncl: 1000,
        existingAdjustments: [adj1],
        expectedCycleNo: 1,
        expectedDirection: 'decrease',
      })
    ).toThrow(/duplicate/);
  });

  it('存在しない adjustmentId に allocate で throw', () => {
    expect(() =>
      validateAllocations({
        allocations: [{ adjustmentId: 'adj-missing', amountIncl: 1 }],
        cashActionAmountIncl: 1,
        existingAdjustments: [adj1],
        expectedCycleNo: 1,
        expectedDirection: 'decrease',
      })
    ).toThrow(/not found/);
  });

  it('multi adjustment で部分 allocate でき、合計検証も通る', () => {
    const adjA: ExistingAdjustmentForAllocation = { ...adj1, adjustmentId: 'adj-A', requiredActionRemainingIncl: 600 };
    const adjB: ExistingAdjustmentForAllocation = { ...adj1, adjustmentId: 'adj-B', requiredActionRemainingIncl: 400 };
    expect(() =>
      validateAllocations({
        allocations: [
          { adjustmentId: 'adj-A', amountIncl: 600 },
          { adjustmentId: 'adj-B', amountIncl: 400 },
        ],
        cashActionAmountIncl: 1000,
        existingAdjustments: [adjA, adjB],
        expectedCycleNo: 1,
        expectedDirection: 'decrease',
      })
    ).not.toThrow();
  });
});

describe('services/cashActions applyAllocationsToAdjustments', () => {
  const adj1: ExistingAdjustmentForAllocation = {
    adjustmentId: 'adj-1',
    cycleNo: 1,
    adjustmentDirection: 'decrease',
    adjustmentState: 'effective',
    requiredActionRemainingIncl: 1000,
  };
  const adj2: ExistingAdjustmentForAllocation = {
    adjustmentId: 'adj-2',
    cycleNo: 1,
    adjustmentDirection: 'decrease',
    adjustmentState: 'effective',
    requiredActionRemainingIncl: 500,
  };

  it('1 件 allocation で remaining 部分減（completed には遷移しない）', () => {
    const result = applyAllocationsToAdjustments({
      allocations: [{ adjustmentId: 'adj-1', amountIncl: 600 }],
      existingAdjustments: [adj1, adj2],
    });
    expect(result.patches.size).toBe(1);
    expect(result.patches.get('adj-1')).toEqual({ requiredActionRemainingIncl: 400 });
    const updatedAdj1 = result.adjustmentsAfterUpdate.find((a) => a.adjustmentId === 'adj-1');
    expect(updatedAdj1?.requiredActionRemainingIncl).toBe(400);
    expect(updatedAdj1?.adjustmentState).toBe('effective');
    const updatedAdj2 = result.adjustmentsAfterUpdate.find((a) => a.adjustmentId === 'adj-2');
    expect(updatedAdj2?.requiredActionRemainingIncl).toBe(500);
  });

  it('1 件 allocation で remaining=0 → completed_by_cash_action 遷移', () => {
    const result = applyAllocationsToAdjustments({
      allocations: [{ adjustmentId: 'adj-1', amountIncl: 1000 }],
      existingAdjustments: [adj1, adj2],
    });
    expect(result.patches.get('adj-1')).toEqual({
      requiredActionRemainingIncl: 0,
      adjustmentState: 'completed_by_cash_action',
    });
    const updatedAdj1 = result.adjustmentsAfterUpdate.find((a) => a.adjustmentId === 'adj-1');
    expect(updatedAdj1?.adjustmentState).toBe('completed_by_cash_action');
  });

  it('multi allocation で同時 remaining 減', () => {
    const result = applyAllocationsToAdjustments({
      allocations: [
        { adjustmentId: 'adj-1', amountIncl: 1000 },
        { adjustmentId: 'adj-2', amountIncl: 500 },
      ],
      existingAdjustments: [adj1, adj2],
    });
    expect(result.patches.size).toBe(2);
    expect(result.patches.get('adj-1')?.adjustmentState).toBe('completed_by_cash_action');
    expect(result.patches.get('adj-2')?.adjustmentState).toBe('completed_by_cash_action');
  });

  it('over-allocation で throw（validation 漏れの safety net）', () => {
    expect(() =>
      applyAllocationsToAdjustments({
        allocations: [{ adjustmentId: 'adj-1', amountIncl: 2000 }],
        existingAdjustments: [adj1],
      })
    ).toThrow(/over-allocation/);
  });

  it('同一 adjustmentId に対する複数 allocation は合算される', () => {
    // 通常は validateAllocations で禁止されるが、applyAllocationsToAdjustments 単独では合算する
    const result = applyAllocationsToAdjustments({
      allocations: [
        { adjustmentId: 'adj-1', amountIncl: 400 },
        { adjustmentId: 'adj-1', amountIncl: 600 },
      ],
      existingAdjustments: [adj1],
    });
    expect(result.patches.get('adj-1')?.requiredActionRemainingIncl).toBe(0);
    expect(result.patches.get('adj-1')?.adjustmentState).toBe('completed_by_cash_action');
  });
});

describe('services/cashActions resolveCashflowBusinessDate', () => {
  beforeEach(() => {
    (calcBusinessDateMock as jest.Mock).mockReset();
  });

  it('inputBusinessDate 指定があれば優先採用', async () => {
    (calcBusinessDateMock as jest.Mock).mockResolvedValue({ status: 'OK', businessDateKey: '2026-05-08' });
    const result = await resolveCashflowBusinessDate({
      inputBusinessDate: '2026-05-09',
      executedAt: new Date('2026-05-09T00:00:00Z'),
      billBusinessDate: '2026-05-07',
    });
    expect(result).toBe('2026-05-09');
    expect(calcBusinessDateMock).not.toHaveBeenCalled();
  });

  it('input なし、calcBusinessDate=OK → calcBusinessDate の値を採用', async () => {
    (calcBusinessDateMock as jest.Mock).mockResolvedValue({ status: 'OK', businessDateKey: '2026-05-08' });
    const result = await resolveCashflowBusinessDate({
      inputBusinessDate: null,
      executedAt: new Date('2026-05-09T00:00:00Z'),
      billBusinessDate: '2026-05-07',
    });
    expect(result).toBe('2026-05-08');
    expect(calcBusinessDateMock).toHaveBeenCalled();
  });

  it('input なし、calcBusinessDate=NONE → bill.businessDate を borrow', async () => {
    (calcBusinessDateMock as jest.Mock).mockResolvedValue({ status: 'NONE' });
    const result = await resolveCashflowBusinessDate({
      inputBusinessDate: null,
      executedAt: new Date('2026-05-09T00:00:00Z'),
      billBusinessDate: '2026-05-07',
    });
    expect(result).toBe('2026-05-07');
  });

  it('input なし、calcBusinessDate=AMBIGUOUS → bill.businessDate を borrow', async () => {
    (calcBusinessDateMock as jest.Mock).mockResolvedValue({ status: 'AMBIGUOUS', candidates: ['2026-05-08', '2026-05-09'] });
    const result = await resolveCashflowBusinessDate({
      inputBusinessDate: null,
      executedAt: new Date('2026-05-09T00:00:00Z'),
      billBusinessDate: '2026-05-07',
    });
    expect(result).toBe('2026-05-07');
  });

  it('input なし、calcBusinessDate が throw → bill.businessDate を borrow', async () => {
    (calcBusinessDateMock as jest.Mock).mockRejectedValue(new Error('emulator failure'));
    const result = await resolveCashflowBusinessDate({
      inputBusinessDate: null,
      executedAt: new Date('2026-05-09T00:00:00Z'),
      billBusinessDate: '2026-05-07',
    });
    expect(result).toBe('2026-05-07');
  });

  it('input なし、calcBusinessDate=NONE、bill.businessDate も空 → throw', async () => {
    (calcBusinessDateMock as jest.Mock).mockResolvedValue({ status: 'NONE' });
    await expect(
      resolveCashflowBusinessDate({
        inputBusinessDate: null,
        executedAt: new Date('2026-05-09T00:00:00Z'),
        billBusinessDate: '',
      })
    ).rejects.toThrow(/cashflowBusinessDate cannot be resolved/);
  });
});
