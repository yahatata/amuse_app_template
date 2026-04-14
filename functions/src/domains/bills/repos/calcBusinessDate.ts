/**
 * 営業日計算ユーティリティ
 * 
 * Phase2: businessHoursMonthlyMap導入により、Firestoreから営業時間を取得して営業日を計算
 * 
 * schema_plan.md に準拠: businessDate は Functions が calcBusinessDate で確定
 * クライアントからの businessDate は完全無視・受理しない
 */

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logOpsError } from '../../../shared/logging/logOpsError';
import type { BusinessDateResult } from './types';
import {
  convertToJst,
  formatMonthKey,
  getPrevMonthKey,
  getNextMonthKey,
  findBusinessDateCandidates,
} from './calcBusinessDateHelpers';

const db = getFirestore();

/**
 * 営業日を計算する（Functions 専用、サーバ専任）
 * 
 * @param nowUtc 基準時刻（UTC、デフォルト: 現在時刻）
 * @returns 営業日計算結果（OK/NONE/AMBIGUOUS）
 * 
 * 注意: 
 * - クライアントからの businessDate は完全無視・受理しない
 * - businessHoursMonthlyMap から営業時間を取得
 * - 営業時間の前後±バッファ（デフォルト: 30分）を拡張ウィンドウとして扱う
 * - 戻り値: OK（単一営業日）、NONE（該当なし）、AMBIGUOUS（複数候補）
 */
export async function calcBusinessDate(nowUtc?: Date): Promise<BusinessDateResult> {
  try {
    const now = nowUtc || new Date();
    
    // 1. 入力日時をJSTに変換
    const jstDate = convertToJst(now);
    
    // 2. 該当月のドキュメントIDを生成（YYYY-MM形式）
    const currentMonthKey = formatMonthKey(jstDate);
    
    // 3. 月跨ぎ対応: 前月/次月のドキュメントIDも生成
    const prevMonthKey = getPrevMonthKey(currentMonthKey);
    const nextMonthKey = getNextMonthKey(currentMonthKey);
    
    // 4. Firestoreから該当月のbusinessHoursMonthlyMapを取得
    const currentMonthDoc = await db.collection('businessHoursMonthlyMap').doc(currentMonthKey).get();
    
    // 5. 月跨ぎ対応: 前月/次月のドキュメントも取得（必要に応じて）
    const prevMonthDoc = (jstDate.getUTCDate() === 1)
      ? await db.collection('businessHoursMonthlyMap').doc(prevMonthKey).get()
      : null;
    const nextMonthDoc = (jstDate.getUTCDate() >= 28)
      ? await db.collection('businessHoursMonthlyMap').doc(nextMonthKey).get()
      : null;
    
    // 6. 入力日時がどの営業日に属するかを判定（バッファ適用済みウィンドウで全営業日をチェック）
    // findBusinessDateCandidates内で各営業日のバッファを適用して候補を列挙
    const candidates = await findBusinessDateCandidates(
      jstDate,
      jstDate, // bufferedOpenTime（未使用、findBusinessDateCandidates内で再計算）
      jstDate, // bufferedCloseTime（未使用、findBusinessDateCandidates内で再計算）
      currentMonthDoc,
      prevMonthDoc,
      nextMonthDoc
    );
    
    // 11. 候補数に応じて戻り値を決定
    if (candidates.length === 0) {
      return { status: 'NONE' };
    } else if (candidates.length === 1) {
      return { status: 'OK', businessDateKey: candidates[0] };
    } else {
      return { status: 'AMBIGUOUS', candidates };
    }
  } catch (error) {
    logOpsError({
      message: 'calcBusinessDate failed',
      functionEntry: 'calcBusinessDate',
      cause: error,
      context: {
        nowUtc: nowUtc?.toISOString(),
      },
    });
    
    // エラー時はNONEを返す（既存の動作を維持）
    throw new HttpsError(
      'internal',
      `Failed to calculate business date: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
