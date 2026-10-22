import {
  CONFIG_POINT_INVALID,
  tryValidatePointConfig,
  validatePointConfig,
} from '../../src/shared/config/validatePointConfig';
import { FunctionCustomError } from '../../src/shared/logging/functionCustomError';

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    pointSettings: {
      pointA: { enabled: true, displayName: 'トーナメントポイント' },
      pointB: { enabled: true, displayName: '来店ポイント' },
      pointC: { enabled: false, displayName: 'ポイントC' },
      pointD: { enabled: false, displayName: 'ポイントD' },
      pointE: { enabled: false, displayName: 'ポイントE' },
    },
    sideGameChipSettings: {
      enabled: true,
      displayName: 'サイドゲームチップ',
    },
    rankingRewardPointTypes: ['pointA'],
    categoryPaymentMethods: {
      extraCost: ['cash', 'credit_card', 'electronic_money'],
      sideGameChip: ['cash', 'credit_card', 'electronic_money'],
      items: [
        'cash',
        'credit_card',
        'electronic_money',
        'pointA',
        'pointB',
        'sideGameChip',
      ],
      tournaments: [
        'cash',
        'credit_card',
        'electronic_money',
        'pointA',
        'pointB',
      ],
    },
    pointPriority: ['pointA', 'pointB', 'sideGameChip'],
    balancePaymentSettings: {
      pointA: {
        conversion: { referenceUnits: 1, balanceUnits: 1 },
        usageUnit: 1000,
      },
      pointB: {
        conversion: { referenceUnits: 1, balanceUnits: 1 },
        usageUnit: 1000,
      },
      sideGameChip: {
        conversion: { referenceUnits: 10, balanceUnits: 1 },
        usageUnit: 1000,
      },
    },
    categoryOrder: ['extraCost', 'sideGameChip', 'tournaments', 'items'],
    ...overrides,
  };
}

describe('validatePointConfig', () => {
  it('正常 config', () => {
    const r = validatePointConfig(validInput());
    expect(r.pointSettings.pointA.displayName).toBe('トーナメントポイント');
    expect(r.rankingRewardPointTypes).toEqual(['pointA']);
  });

  it('pointPriority 不完全一致を許容（支払可能だが priority 外）', () => {
    const r = validatePointConfig(
      validInput({ pointPriority: ['pointA'] }),
    );
    expect(r.pointPriority).toEqual(['pointA']);
  });

  it('pointA〜E の欠番', () => {
    const pointSettings = {
      ...(validInput().pointSettings as Record<string, unknown>),
    };
    delete pointSettings.pointC;
    const r = tryValidatePointConfig(validInput({ pointSettings }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorKey).toBe(CONFIG_POINT_INVALID);
  });

  it('displayName 空白', () => {
    const r = tryValidatePointConfig(
      validInput({
        pointSettings: {
          ...(validInput().pointSettings as object),
          pointA: { enabled: true, displayName: '   ' },
        },
      }),
    );
    expect(r.ok).toBe(false);
  });

  it('displayName 最大長超過', () => {
    const r = tryValidatePointConfig(
      validInput({
        pointSettings: {
          ...(validInput().pointSettings as object),
          pointA: { enabled: true, displayName: 'あ'.repeat(41) },
        },
      }),
    );
    expect(r.ok).toBe(false);
  });

  it('unknown ID in categoryPaymentMethods', () => {
    const r = tryValidatePointConfig(
      validInput({
        categoryPaymentMethods: {
          items: ['cash', 'pointZ'],
        },
      }),
    );
    expect(r.ok).toBe(false);
  });

  it('rankingRewardPointTypes 重複', () => {
    const r = tryValidatePointConfig(
      validInput({ rankingRewardPointTypes: ['pointA', 'pointA'] }),
    );
    expect(r.ok).toBe(false);
  });

  it('disabled と categoryPaymentMethods の矛盾', () => {
    const r = tryValidatePointConfig(
      validInput({
        categoryPaymentMethods: {
          items: ['cash', 'pointC'],
        },
        balancePaymentSettings: {
          pointC: {
            conversion: { referenceUnits: 1, balanceUnits: 1 },
            usageUnit: 1000,
          },
        },
        pointPriority: [],
      }),
    );
    expect(r.ok).toBe(false);
  });

  it('disabled と pointPriority の矛盾', () => {
    const r = tryValidatePointConfig(
      validInput({ pointPriority: ['pointA', 'pointC'] }),
    );
    expect(r.ok).toBe(false);
  });

  it('disabled と rankingRewardPointTypes の矛盾', () => {
    const r = tryValidatePointConfig(
      validInput({ rankingRewardPointTypes: ['pointC'] }),
    );
    expect(r.ok).toBe(false);
  });

  it('sideGameChip の報酬許可禁止', () => {
    const r = tryValidatePointConfig(
      validInput({ rankingRewardPointTypes: ['sideGameChip'] }),
    );
    expect(r.ok).toBe(false);
  });

  it('換算設定欠損', () => {
    const r = tryValidatePointConfig(
      validInput({
        balancePaymentSettings: {
          pointA: {
            conversion: { referenceUnits: 1, balanceUnits: 1 },
            usageUnit: 1000,
          },
        },
      }),
    );
    expect(r.ok).toBe(false);
  });

  it.each([
    [{ referenceUnits: 0, balanceUnits: 1 }, 'referenceUnits 0'],
    [{ referenceUnits: -1, balanceUnits: 1 }, 'referenceUnits 負'],
    [{ referenceUnits: 1.5, balanceUnits: 1 }, 'referenceUnits 小数'],
  ])('referenceUnits 不正 %#', (conversion) => {
    const r = tryValidatePointConfig(
      validInput({
        balancePaymentSettings: {
          ...(validInput().balancePaymentSettings as object),
          pointA: { conversion, usageUnit: 1000 },
        },
      }),
    );
    expect(r.ok).toBe(false);
  });

  it.each([0, -1, 1.5])('usageUnit 不正 %p', (usageUnit) => {
    const r = tryValidatePointConfig(
      validInput({
        balancePaymentSettings: {
          ...(validInput().balancePaymentSettings as object),
          pointA: {
            conversion: { referenceUnits: 1, balanceUnits: 1 },
            usageUnit,
          },
        },
      }),
    );
    expect(r.ok).toBe(false);
  });

  it('config 未設定時に fallback しない', () => {
    const r = tryValidatePointConfig({});
    expect(r.ok).toBe(false);
    expect(() => validatePointConfig({})).toThrow(FunctionCustomError);
  });

  it('空の rankingRewardPointTypes は可', () => {
    const r = validatePointConfig(
      validInput({ rankingRewardPointTypes: [] }),
    );
    expect(r.rankingRewardPointTypes).toEqual([]);
  });

  it('categoryOrder 欠落は CONFIG_POINT_INVALID', () => {
    const input = validInput();
    delete (input as { categoryOrder?: unknown }).categoryOrder;
    const r = tryValidatePointConfig(input);
    expect(r.ok).toBe(false);
  });
});
