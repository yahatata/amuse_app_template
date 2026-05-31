/**
 * ポイント/チップの丸め単位適用（自動・カスタム共通）
 */

import {
  DEFAULT_POINT_AB_ROUNDING_UNIT,
  DEFAULT_SIDE_GAME_CHIP_ROUNDING_UNIT,
} from '../../../shared/config/defaults';

export type PointLikeMethod = 'pointA' | 'pointB' | 'sideGameChip';

export interface RoundingUnits {
  pointAB: number;
  sideGameChip: number;
}

export const DEFAULT_ROUNDING_UNITS: RoundingUnits = {
  pointAB: DEFAULT_POINT_AB_ROUNDING_UNIT,
  sideGameChip: DEFAULT_SIDE_GAME_CHIP_ROUNDING_UNIT,
};

/**
 * カテゴリ金額に対し、残高と丸め単位を考慮した最大使用可能額（円）を返す
 */
export function computeMaxRoundedPointYen(params: {
  method: PointLikeMethod;
  categoryAmountYen: number;
  balance: number;
  chipRate: number;
  roundingUnits: RoundingUnits;
}): number {
  const { method, categoryAmountYen, balance, chipRate, roundingUnits } = params;
  if (categoryAmountYen <= 0) return 0;

  if (method === 'sideGameChip') {
    const unit = roundingUnits.sideGameChip;
    const availableBalanceInYen = balance * chipRate;
    const maxUsableInYen = Math.min(Math.floor(availableBalanceInYen), categoryAmountYen);
    const maxUsableChips = Math.floor(maxUsableInYen / chipRate);
    const usableChipsRounded = Math.floor(maxUsableChips / unit) * unit;
    return Math.floor(usableChipsRounded * chipRate);
  }

  const unit = roundingUnits.pointAB;
  const maxUsable = Math.min(Math.floor(balance), categoryAmountYen);
  return Math.floor(Math.floor(maxUsable) / unit) * unit;
}

export function isChipCountAlignedToUnit(chipCount: number, unit: number): boolean {
  return chipCount >= 0 && chipCount % unit === 0;
}

export function isPointYenAlignedToUnit(yenAmount: number, unit: number): boolean {
  return yenAmount >= 0 && yenAmount % unit === 0;
}
