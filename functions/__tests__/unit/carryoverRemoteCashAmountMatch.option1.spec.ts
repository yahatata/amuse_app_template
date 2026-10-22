/**
 * C1-B Option 1: claim === payment の純 unit（Emulator 不要）。
 */

import { assertPaymentTotalMatchesCategoryTotal } from '../../src/domains/bills/services/billCategoryAmounts';
import { FunctionCustomError } from '../../src/shared/logging/functionCustomError';

describe('C1-B Option 1 payment total match (unit)', () => {
  const categoryAmounts = {
    extraCost: 5000,
    items: 0,
    tournaments: 0,
    sideGameChip: 0,
  };

  it('exact → ok', () => {
    expect(() =>
      assertPaymentTotalMatchesCategoryTotal({
        categoryAmounts,
        paymentMethodsByAmount: { cash: 5000 },
        billId: 'b1',
      }),
    ).not.toThrow();
  });

  it('under → ACCOUNTING_PAYMENT_TOTAL_MISMATCH', () => {
    try {
      assertPaymentTotalMatchesCategoryTotal({
        categoryAmounts,
        paymentMethodsByAmount: { cash: 4000 },
        billId: 'b1',
      });
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(FunctionCustomError);
      expect((e as FunctionCustomError).errorKey).toBe(
        'ACCOUNTING_PAYMENT_TOTAL_MISMATCH',
      );
    }
  });

  it('over → ACCOUNTING_PAYMENT_TOTAL_MISMATCH', () => {
    try {
      assertPaymentTotalMatchesCategoryTotal({
        categoryAmounts,
        paymentMethodsByAmount: { cash: 6000 },
        billId: 'b1',
      });
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(FunctionCustomError);
      expect((e as FunctionCustomError).errorKey).toBe(
        'ACCOUNTING_PAYMENT_TOTAL_MISMATCH',
      );
    }
  });
});
