/**
 * A-7: トーナメント順位報酬の pointType 検証
 */

import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import {
  isCurrencyPointId,
  SIDE_GAME_CHIP_ID,
  type CurrencyPointId,
} from '../../user/types/pointIds';
import type { ValidatedPointConfig } from '../../../shared/config/validatePointConfig';

export function assertRewardPointTypeForTemplate(
  pointType: unknown,
  config: ValidatedPointConfig,
): CurrencyPointId {
  if (pointType === SIDE_GAME_CHIP_ID) {
    throw new FunctionCustomError({
      errorKey: 'REWARD_POINT_TYPE_INACTIVE',
      message: 'sideGameChip は順位報酬ポイントに指定できません',
      context: { pointType },
    });
  }
  if (!isCurrencyPointId(pointType)) {
    throw new FunctionCustomError({
      errorKey: 'REWARD_POINT_TYPE_INACTIVE',
      message: `不正な報酬ポイント種別です: ${String(pointType)}`,
      context: { pointType },
    });
  }
  if (!config.pointSettings[pointType]?.enabled) {
    throw new FunctionCustomError({
      errorKey: 'REWARD_POINT_TYPE_INACTIVE',
      message: `${pointType} は現在無効です`,
      context: { pointType },
    });
  }
  if (!config.rankingRewardPointTypes.includes(pointType)) {
    throw new FunctionCustomError({
      errorKey: 'REWARD_POINT_TYPE_INACTIVE',
      message: `${pointType} は順位報酬の許可一覧に含まれていません`,
      context: { pointType },
    });
  }
  return pointType;
}

/**
 * 付与時: 保存済み pointType を現在 config で検証。
 * chip / disabled / 許可外 → REWARD_POINT_TYPE_INACTIVE
 */
export function assertRewardPointTypeForGrant(
  savedPointType: unknown,
  config: ValidatedPointConfig,
): CurrencyPointId {
  return assertRewardPointTypeForTemplate(savedPointType, config);
}

/**
 * 取消時: 保存済み実績の pointType を通貨型として受理。
 * 現在 config の enabled / 許可一覧は見ない。chip のみ拒否。
 */
export function assertRewardPointTypeForReversal(
  savedPointType: unknown,
): CurrencyPointId {
  if (savedPointType === SIDE_GAME_CHIP_ID) {
    throw new FunctionCustomError({
      errorKey: 'REWARD_POINT_TYPE_INACTIVE',
      message: 'sideGameChip の報酬取消は不正です',
      context: { pointType: savedPointType },
    });
  }
  if (!isCurrencyPointId(savedPointType)) {
    throw new FunctionCustomError({
      errorKey: 'INVALID_ARGUMENT',
      message: `取消対象の pointType が不正です: ${String(savedPointType)}`,
      context: { pointType: savedPointType },
    });
  }
  return savedPointType;
}
