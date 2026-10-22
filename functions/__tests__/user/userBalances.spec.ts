import {
  assertUsableBalanceValue,
  enabledBalanceIds,
  readAllStandardBalancesForMigration,
  readBalanceField,
  readBalanceOrZeroIfMissing,
  balanceField,
} from '../../src/domains/user/helpers/userBalances';
import { FunctionCustomError } from '../../src/shared/logging/functionCustomError';

describe('userBalances', () => {
  it('フィールド欠損 → missing 0', () => {
    expect(readBalanceField({}, 'pointA')).toEqual({
      kind: 'missing',
      value: 0,
    });
    expect(readBalanceOrZeroIfMissing({}, 'pointC')).toBe(0);
  });

  it('undefined 値かつキーあり → missing', () => {
    expect(readBalanceField({ pointA: undefined }, 'pointA')).toEqual({
      kind: 'missing',
      value: 0,
    });
  });

  it('明示 null → corrupt', () => {
    const r = readBalanceField({ pointA: null }, 'pointA');
    expect(r.kind).toBe('corrupt');
    expect(() => readBalanceOrZeroIfMissing({ pointA: null }, 'pointA')).toThrow(
      FunctionCustomError,
    );
  });

  it('正常な 0 / 正整数', () => {
    expect(readBalanceField({ pointA: 0 }, 'pointA')).toEqual({
      kind: 'ok',
      value: 0,
    });
    expect(readBalanceField({ pointA: 42 }, 'pointA')).toEqual({
      kind: 'ok',
      value: 42,
    });
  });

  it('負数・小数・NaN・Infinity・string → corrupt', () => {
    expect(readBalanceField({ pointA: -1 }, 'pointA').kind).toBe('corrupt');
    expect(readBalanceField({ pointA: 1.5 }, 'pointA').kind).toBe('corrupt');
    expect(readBalanceField({ pointA: NaN }, 'pointA').kind).toBe('corrupt');
    expect(readBalanceField({ pointA: Infinity }, 'pointA').kind).toBe(
      'corrupt',
    );
    expect(readBalanceField({ pointA: '1' }, 'pointA').kind).toBe('corrupt');
  });

  it('assertUsableBalanceValue', () => {
    expect(assertUsableBalanceValue(0)).toBe(0);
    try {
      assertUsableBalanceValue(null);
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(FunctionCustomError);
      expect((e as FunctionCustomError).errorKey).toBe('INVALID_BALANCE');
    }
  });

  it('unknown balance ID', () => {
    try {
      balanceField('pointZ');
      fail('expected throw');
    } catch (e) {
      expect((e as FunctionCustomError).errorKey).toBe('INVALID_BALANCE');
    }
  });

  it('全 6 残高読取', () => {
    expect(readAllStandardBalancesForMigration({})).toEqual({
      pointA: 0,
      pointB: 0,
      pointC: 0,
      pointD: 0,
      pointE: 0,
      sideGameChip: 0,
    });
  });

  it('enabledBalanceIds', () => {
    expect(
      enabledBalanceIds({
        pointSettings: {
          pointA: { enabled: true },
          pointB: { enabled: false },
          pointC: { enabled: true },
        },
        sideGameChipSettings: { enabled: true },
      }),
    ).toEqual(['pointA', 'pointC', 'sideGameChip']);
  });
});
