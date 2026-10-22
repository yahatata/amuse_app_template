import {
  ALL_BALANCE_IDS,
  CASH_LIKE_METHODS,
  CURRENCY_POINT_IDS,
  SIDE_GAME_CHIP_ID,
  balanceDisplayOrder,
  initialZeroBalanceFields,
  isBalanceId,
  isCashLikeMethod,
  isCurrencyPointId,
} from '../../src/domains/user/types/pointIds';

describe('pointIds', () => {
  it('通貨型 ID は A〜E の 5 つ', () => {
    expect([...CURRENCY_POINT_IDS]).toEqual([
      'pointA',
      'pointB',
      'pointC',
      'pointD',
      'pointE',
    ]);
  });

  it('sideGameChip は通貨型に含まれない', () => {
    expect(CURRENCY_POINT_IDS).not.toContain(SIDE_GAME_CHIP_ID);
    expect(isCurrencyPointId(SIDE_GAME_CHIP_ID)).toBe(false);
  });

  it('全残高 ID は通貨型 + chip', () => {
    expect([...ALL_BALANCE_IDS]).toEqual([
      'pointA',
      'pointB',
      'pointC',
      'pointD',
      'pointE',
      'sideGameChip',
    ]);
  });

  it('型ガード', () => {
    expect(isCurrencyPointId('pointA')).toBe(true);
    expect(isCurrencyPointId('pointZ')).toBe(false);
    expect(isBalanceId('sideGameChip')).toBe(true);
    expect(isBalanceId('cash')).toBe(false);
    expect(isCashLikeMethod('cash')).toBe(true);
    expect(isCashLikeMethod('pointA')).toBe(false);
  });

  it('表示順は ALL_BALANCE_IDS と同じ', () => {
    expect(balanceDisplayOrder()).toEqual(ALL_BALANCE_IDS);
  });

  it('initialZeroBalanceFields は 6 キーすべて 0', () => {
    expect(initialZeroBalanceFields()).toEqual({
      pointA: 0,
      pointB: 0,
      pointC: 0,
      pointD: 0,
      pointE: 0,
      sideGameChip: 0,
    });
  });

  it('CASH_LIKE_METHODS', () => {
    expect([...CASH_LIKE_METHODS]).toEqual([
      'cash',
      'credit_card',
      'electronic_money',
    ]);
  });
});
