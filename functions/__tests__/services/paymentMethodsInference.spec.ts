/**
 * paymentMethodsInference.ts のユニットテスト
 *
 * Firestore 不要。pure 関数の振る舞いを検証する。
 */

import { resolveBaseMethod } from '../../src/domains/bills/services/paymentMethodsInference';

// ---------------------------------------------------------------------------
// resolveBaseMethod
// ---------------------------------------------------------------------------

describe('resolveBaseMethod', () => {
  it('現金のみ → cash を返す', () => {
    expect(resolveBaseMethod({ cash: 5000 })).toBe('cash');
  });

  it('クレジットカードのみ → credit_card を返す', () => {
    expect(resolveBaseMethod({ credit_card: 3000 })).toBe('credit_card');
  });

  it('電子マネーのみ → electronic_money を返す', () => {
    expect(resolveBaseMethod({ electronic_money: 2000 })).toBe('electronic_money');
  });

  it('cash > credit_card → cash を返す', () => {
    expect(resolveBaseMethod({ cash: 5000, credit_card: 3000 })).toBe('cash');
  });

  it('credit_card > cash → credit_card を返す', () => {
    expect(resolveBaseMethod({ cash: 2000, credit_card: 5000 })).toBe('credit_card');
  });

  it('同額の場合は cash を優先（NON_SPECIAL_METHODS 先頭順）', () => {
    expect(resolveBaseMethod({ cash: 5000, credit_card: 5000 })).toBe('cash');
  });

  it('ポイントのみ（non-special なし）→ null を返す', () => {
    expect(resolveBaseMethod({ pointA: 3000 })).toBeNull();
  });

  it('空の paymentTotals → null を返す', () => {
    expect(resolveBaseMethod({})).toBeNull();
  });

  it('ポイント + cash → cash を返す', () => {
    expect(resolveBaseMethod({ cash: 4000, pointA: 3000 })).toBe('cash');
  });

  it('金額が 0 の non-special は無視される', () => {
    expect(resolveBaseMethod({ cash: 0, credit_card: 2000 })).toBe('credit_card');
  });

  it('全ての non-special が 0 → null を返す', () => {
    expect(resolveBaseMethod({ cash: 0, credit_card: 0, electronic_money: 0 })).toBeNull();
  });
});
