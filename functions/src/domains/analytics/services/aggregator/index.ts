/**
 * Analytics Aggregator エントリポイント
 * 
 * Settlement Trigger / Event Differential Trigger から呼び出される。
 * 
 * 注意: net.balanceDueIncl は nightly 再計算の結果が"正"。逐次更新しない。
 */

import { BillDoc, EventDoc } from './types';
import { buildEventDelta } from './delta';
import { applyMonthlyDailyDelta, appendEventLog } from './writer';
import { checkAndSetEventMarker } from './markers';
import { processBillAnalyticsAtomically } from '../updateAnalyticsForBill';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

/**
 * Settlement 集計をキューに追加（実際には即座に実行）
 * 
 * 【仕様】bill.billId は必ず bills コレクションのドキュメントID（docId）でなければならない
 * - docId でない billId を渡すことは仕様違反
 * - docId が取れない形で呼び出されている場合は、呼び出し元（トリガ等）で docId を渡す責務がある
 * - docId 統一が崩れると marker が効かず二重計上になる可能性がある
 */
export async function enqueueSettlement(bill: BillDoc): Promise<void> {
  const businessDate = bill.businessDate;
  const monthKey = businessDate.substring(0, 7);
  const db = getFirestore();

  logger.info('enqueueSettlement: starting analytics update', {
    billId: bill.billId,
    month: monthKey,
    businessDate,
  });

  // 共通関数で旧スキーマ更新（トランザクション内で marker チェック・作成）
  // bill.billId は bills コレクションのドキュメントID（docId）であることを前提
  await processBillAnalyticsAtomically(db, {
    month: monthKey,
    businessDate,
    billId: bill.billId, // 【必須】bill.billId は docId
    billData: bill,
    logInvocation: { functionEntry: 'billsOnSettle' },
  });

  logger.info('enqueueSettlement: analytics update completed', {
    billId: bill.billId,
    month: monthKey,
    businessDate,
  });
}

/**
 * Event 集計をキューに追加（実際には即座に実行）
 */
export async function enqueueEvent(
  bill: BillDoc,
  event: EventDoc,
  allowAttribution = false
): Promise<void> {
  const originBusinessDate = event.originBusinessDate;
  const monthKey = originBusinessDate.substring(0, 7);

  // 冪等性チェック
  const alreadyProcessed = await checkAndSetEventMarker(monthKey, event.eventId);
  if (alreadyProcessed) {
    console.log(`Event already processed: ${event.eventId}`);
    return;
  }

  // Delta 計算
  const delta = buildEventDelta(bill, event, allowAttribution);

  // 書き込み
  await applyMonthlyDailyDelta(monthKey, originBusinessDate, delta, {
    monthKey,
    businessDate: originBusinessDate,
    eventId: event.eventId,
  });

  // eventsLog に追加（cancel/reopen 以外）
  if (event.type === 'refund' || event.type === 'adjustment') {
    await appendEventLog(monthKey, event, bill.billId);
  }

  console.log(`Event aggregated: ${event.eventId}, month: ${monthKey}, type: ${event.type}`);
}
