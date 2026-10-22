import { computeMaxConvertibleReferenceAmount } from '../../src/domains/bills/services/maxConvertibleReferenceAmount';

describe('computeMaxConvertibleReferenceAmount', () => {
  it('1:1 usageUnit 1000', () => {
    const r = computeMaxConvertibleReferenceAmount({
      remainingReferenceAmount: 3000,
      availableBalance: 2500,
      conversion: { referenceUnits: 1, balanceUnits: 1 },
      usageUnit: 1000,
    });
    expect(r).toEqual({
      ok: true,
      referenceAmount: 2000,
      balanceAmount: 2000,
    });
  });

  it('残高1＝基準値10', () => {
    const r = computeMaxConvertibleReferenceAmount({
      remainingReferenceAmount: 5000,
      availableBalance: 50,
      conversion: { referenceUnits: 10, balanceUnits: 1 },
      usageUnit: 1000,
    });
    // kMaxByRemain=5, kMaxByBal=floor(50*10/(1000*1))=0 → 0充当
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('zero_allocation');
  });

  it('残高1＝基準値10 usageUnit 100', () => {
    const r = computeMaxConvertibleReferenceAmount({
      remainingReferenceAmount: 500,
      availableBalance: 50,
      conversion: { referenceUnits: 10, balanceUnits: 1 },
      usageUnit: 100,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.referenceAmount).toBe(500);
      expect(r.balanceAmount).toBe(50);
    }
  });

  it('残高2＝基準値1・利用単位10', () => {
    const r = computeMaxConvertibleReferenceAmount({
      remainingReferenceAmount: 100,
      availableBalance: 100,
      conversion: { referenceUnits: 1, balanceUnits: 2 },
      usageUnit: 10,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.referenceAmount).toBe(50);
      expect(r.balanceAmount).toBe(100);
    }
  });

  it('残高不足', () => {
    const r = computeMaxConvertibleReferenceAmount({
      remainingReferenceAmount: 5000,
      availableBalance: 0,
      conversion: { referenceUnits: 1, balanceUnits: 1 },
      usageUnit: 1000,
    });
    expect(r.ok).toBe(false);
  });

  it('残額不足', () => {
    const r = computeMaxConvertibleReferenceAmount({
      remainingReferenceAmount: 500,
      availableBalance: 10000,
      conversion: { referenceUnits: 1, balanceUnits: 1 },
      usageUnit: 1000,
    });
    expect(r.ok).toBe(false);
  });

  it('大きな値でもループせず完了', () => {
    const start = Date.now();
    const r = computeMaxConvertibleReferenceAmount({
      remainingReferenceAmount: 1_000_000_000,
      availableBalance: 1_000_000_000,
      conversion: { referenceUnits: 1, balanceUnits: 1 },
      usageUnit: 1,
    });
    expect(Date.now() - start).toBeLessThan(50);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.referenceAmount).toBe(1_000_000_000);
      expect(r.balanceAmount).toBe(1_000_000_000);
    }
  });

  it('overflow', () => {
    const r = computeMaxConvertibleReferenceAmount({
      remainingReferenceAmount: Number.MAX_SAFE_INTEGER,
      availableBalance: Number.MAX_SAFE_INTEGER,
      conversion: { referenceUnits: Number.MAX_SAFE_INTEGER, balanceUnits: 2 },
      usageUnit: Number.MAX_SAFE_INTEGER,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('overflow');
  });

  it('不正入力', () => {
    const r = computeMaxConvertibleReferenceAmount({
      remainingReferenceAmount: -1,
      availableBalance: 10,
      conversion: { referenceUnits: 1, balanceUnits: 1 },
      usageUnit: 1000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_input');
  });
});
