import {
  computeMaxRoundedPointYen,
  isChipCountAlignedToUnit,
  isPointYenAlignedToUnit,
} from '../../src/domains/bills/services/paymentRounding';

describe('paymentRounding', () => {
  const roundingUnits = { pointAB: 1000, sideGameChip: 100 };

  it('sideGameChip: 2400円カテゴリ・240枚残高 → 2000円（200枚）', () => {
    expect(
      computeMaxRoundedPointYen({
        method: 'sideGameChip',
        categoryAmountYen: 2400,
        balance: 240,
        chipRate: 10,
        roundingUnits,
      }),
    ).toBe(2000);
  });

  it('pointA: 3500円カテゴリ・5000円残高 → 3000円', () => {
    expect(
      computeMaxRoundedPointYen({
        method: 'pointA',
        categoryAmountYen: 3500,
        balance: 5000,
        chipRate: 10,
        roundingUnits,
      }),
    ).toBe(3000);
  });

  it('isChipCountAlignedToUnit', () => {
    expect(isChipCountAlignedToUnit(200, 100)).toBe(true);
    expect(isChipCountAlignedToUnit(240, 100)).toBe(false);
  });

  it('isPointYenAlignedToUnit', () => {
    expect(isPointYenAlignedToUnit(2000, 1000)).toBe(true);
    expect(isPointYenAlignedToUnit(2400, 1000)).toBe(false);
  });
});
