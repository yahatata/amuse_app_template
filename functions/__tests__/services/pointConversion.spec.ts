import {
  balanceToReferenceAmount,
  referenceToBalanceAmount,
} from '../../src/domains/bills/services/pointConversion';

describe('pointConversion', () => {
  it('1:1', () => {
    const c = { referenceUnits: 1, balanceUnits: 1 };
    expect(referenceToBalanceAmount(1000, c)).toEqual({ ok: true, amount: 1000 });
    expect(balanceToReferenceAmount(1000, c)).toEqual({ ok: true, amount: 1000 });
  });

  it('残高1＝基準値10', () => {
    const c = { referenceUnits: 10, balanceUnits: 1 };
    expect(referenceToBalanceAmount(100, c)).toEqual({ ok: true, amount: 10 });
    expect(balanceToReferenceAmount(10, c)).toEqual({ ok: true, amount: 100 });
  });

  it('残高2＝基準値1', () => {
    const c = { referenceUnits: 1, balanceUnits: 2 };
    expect(referenceToBalanceAmount(5, c)).toEqual({ ok: true, amount: 10 });
    expect(balanceToReferenceAmount(10, c)).toEqual({ ok: true, amount: 5 });
  });

  it('割り切れない', () => {
    const c = { referenceUnits: 10, balanceUnits: 1 };
    const r = referenceToBalanceAmount(15, c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorKey).toBe('CONVERSION_NOT_INTEGER');
  });

  it('0', () => {
    const c = { referenceUnits: 10, balanceUnits: 1 };
    expect(referenceToBalanceAmount(0, c)).toEqual({ ok: true, amount: 0 });
  });

  it('不正 unit', () => {
    const r = referenceToBalanceAmount(10, { referenceUnits: 0, balanceUnits: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorKey).toBe('INVALID_ARGUMENT');
  });

  it('未約分比率でも動作', () => {
    const c = { referenceUnits: 20, balanceUnits: 2 }; // = 10:1
    expect(referenceToBalanceAmount(100, c)).toEqual({ ok: true, amount: 10 });
    expect(balanceToReferenceAmount(10, c)).toEqual({ ok: true, amount: 100 });
  });

  it('overflow', () => {
    const r = referenceToBalanceAmount(Number.MAX_SAFE_INTEGER, {
      referenceUnits: 1,
      balanceUnits: 2,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorKey).toBe('CONVERSION_OVERFLOW');
  });
});
