/**
 * Analytics Aggregator エントリポイント
 * 
 * Settlement Trigger / Event Differential Trigger から呼び出される。
 * 
 * 注意: net.balanceDueIncl は nightly 再計算の結果が"正"。逐次更新しない。
 */

import { BillDoc, EventDoc } from './types';
import { buildSettlementDelta, buildEventDelta } from './delta';
import { applyMonthlyDailyDelta, appendEventLog } from './writer';
import { checkAndSetBillMarker, checkAndSetEventMarker } from './markers';

/**
 * Settlement 集計をキューに追加（実際には即座に実行）
 */
export async function enqueueSettlement(bill: BillDoc): Promise<void> {
  const businessDate = bill.businessDate;
  const monthKey = businessDate.substring(0, 7);

  // 冪等性チェック
  const alreadyProcessed = await checkAndSetBillMarker(monthKey, bill.billId);
  if (alreadyProcessed) {
    console.log(`Settlement already processed: ${bill.billId}`);
    return;
  }

  // Delta 計算
  const delta = buildSettlementDelta(bill);

  // 書き込み
  await applyMonthlyDailyDelta(monthKey, businessDate, delta, {
    monthKey,
    businessDate,
    billId: bill.billId,
  });

  console.log(`Settlement aggregated: ${bill.billId}, month: ${monthKey}`);
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
