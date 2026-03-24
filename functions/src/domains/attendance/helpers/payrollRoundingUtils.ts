/**
 * 給与計算の端数処理ユーティリティ
 *
 * 参照: 01_CALC_SPEC セクション10、02_CONFIG_SPEC セクション4
 */

import type { RoundingMethod } from '../../../shared/config/payrollConfigTypes';

/**
 * 金額の端数処理を行う。
 *
 * precision > 0: 小数点以下 precision 桁で処理（例: precision=2 → 小数第2位）
 * precision = 0: 1の位で処理
 * precision < 0: 10の位以上で処理（例: precision=-1 → 10の位）
 */
export function payrollRound(
  value: number,
  method: RoundingMethod,
  precision: number
): number {
  const factor = Math.pow(10, precision);
  const shifted = value * factor;
  switch (method) {
    case 'ceil':
      return Math.ceil(shifted) / factor;
    case 'floor':
      return Math.floor(shifted) / factor;
    case 'round':
      return Math.round(shifted) / factor;
  }
}
