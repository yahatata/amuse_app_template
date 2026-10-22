/**
 * 給与計算の端数処理ユーティリティ
 *
 * 参照: 01_CALC_SPEC セクション10、02_CONFIG_SPEC セクション4
 */

import type { RoundingMethod } from '../../../shared/config/payrollConfigTypes';

/**
 * 小数第2位まで保持する（小数第3位を四捨五入）。
 * 中間計算値の精度保持に使用する。
 */
export function truncateTo2Decimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 円の単位で端数処理を行う。
 *
 * unit: 1=1円単位、10=10円単位、100=100円単位、1000=1000円単位
 * 有効値は 10 の冪のみ（1 / 10 / 100 / 1000）。
 * grossPay の最終丸めにのみ使用する。
 */
export function roundToYenUnit(
  value: number,
  method: RoundingMethod,
  unit: number
): number {
  switch (method) {
    case 'ceil':  return Math.ceil(value  / unit) * unit;
    case 'floor': return Math.floor(value / unit) * unit;
    case 'round': return Math.round(value / unit) * unit;
  }
}
