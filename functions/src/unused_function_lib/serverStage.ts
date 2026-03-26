import { logger } from 'firebase-functions';
import { logOpsError } from '../shared/logging/logOpsError';

/**
 * ブラインドテンプレートからステージ配列を導出し、
 * レイトレジ締切時刻を計算するライブラリ
 * 
 * Phase2-2 で詳細実装予定
 */

/**
 * ブラインドレベル情報
 */
export interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  duration: number; // 秒
  hasBreakAfter?: boolean;
  breakDuration?: number; // 秒
}

/**
 * ステージ情報（Level + Break）
 */
export interface Stage {
  type: 'level' | 'break';
  level?: number;
  smallBlind?: number;
  bigBlind?: number;
  duration: number; // 秒
  startTime?: Date;
  endTime?: Date;
}

/**
 * ブラインドテンプレートからステージ配列を導出
 * @param blindTemplate ブラインドテンプレートデータ
 * @param startTime トーナメント開始時刻
 * @returns ステージ配列
 */
export function buildStagesFromTemplate(
  blindTemplate: any,
  startTime: Date
): Stage[] {
  try {
    logger.info('buildStagesFromTemplate: Building stages', {
      templateId: blindTemplate.id,
      startTime: startTime.toISOString()
    });

    // TODO: Phase2-2 で実装
    // - blindTemplate.levels から BlindLevel[] を構築
    // - hasBreakAfter と breakDuration を考慮
    // - 各ステージの startTime/endTime を計算
    
    // 現在は雛形のレスポンス
    const stages: Stage[] = [
      {
        type: 'level',
        level: 1,
        smallBlind: 25,
        bigBlind: 50,
        duration: 1800, // 30分
        startTime,
        endTime: new Date(startTime.getTime() + 1800 * 1000)
      }
    ];

    logger.info('buildStagesFromTemplate: Stages built successfully', {
      stageCount: stages.length
    });

    return stages;

  } catch (error) {
    logOpsError({
      message: 'buildStagesFromTemplate: Error building stages',
      failureType: 'internal',
      functionEntry: 'buildStagesFromTemplate',
      cause: error,
    });
    throw error;
  }
}

/**
 * レイトレジ締切時刻を計算
 * @param stages ステージ配列
 * @param lateRegUntilLev レイトレジ可能な最後のレベル
 * @param startTime トーナメント開始時刻
 * @returns レイトレジ締切時刻
 */
export function calculateLateRegCloseTime(
  stages: Stage[],
  lateRegUntilLev: number,
  startTime: Date
): Date {
  try {
    logger.info('calculateLateRegCloseTime: Calculating close time', {
      lateRegUntilLev,
      startTime: startTime.toISOString(),
      stageCount: stages.length
    });

    // TODO: Phase2-2 で実装
    // - lateRegUntilLev までの累積時間を計算
    // - ブレイク時間を除外
    // - 締切時刻を返す
    
    // 現在は雛形のレスポンス（30分後）
    const closeTime = new Date(startTime.getTime() + 30 * 60 * 1000);

    logger.info('calculateLateRegCloseTime: Close time calculated', {
      closeTime: closeTime.toISOString()
    });

    return closeTime;

  } catch (error) {
    logOpsError({
      message: 'calculateLateRegCloseTime: Error calculating close time',
      failureType: 'internal',
      functionEntry: 'calculateLateRegCloseTime',
      cause: error,
    });
    throw error;
  }
}

/**
 * 現在のステージを判定
 * @param stages ステージ配列
 * @param currentTime 現在時刻
 * @param startedAt トーナメント開始時刻
 * @param shiftSec 累積ポーズ秒
 * @returns 現在のステージ情報
 */
export function getCurrentStage(
  stages: Stage[],
  currentTime: Date,
  startedAt: Date,
  shiftSec: number = 0
): Stage | null {
  try {
    logger.info('getCurrentStage: Getting current stage', {
      currentTime: currentTime.toISOString(),
      startedAt: startedAt.toISOString(),
      shiftSec,
      stageCount: stages.length
    });

    // TODO: Phase2-2 で実装
    // - shiftSec を考慮した実効経過時間を計算
    // - 現在時刻に対応するステージを特定
    // - ステージ情報を返す
    
    // 現在は雛形のレスポンス
    return stages[0] || null;

  } catch (error) {
    logOpsError({
      message: 'getCurrentStage: Error getting current stage',
      failureType: 'internal',
      functionEntry: 'getCurrentStage',
      cause: error,
    });
    throw error;
  }
}
