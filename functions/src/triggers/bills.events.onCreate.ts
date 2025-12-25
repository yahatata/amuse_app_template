/**
 * bills.events.onCreate トリガ
 * 
 * trigger_plan.md §2 に準拠
 * 
 * /bills/{billId}/events/{eventId} が作成されると発火し、
 * postEvents.* と paymentsSummary.* を更新する
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

/**
 * イベント差分トリガ
 * 
 * /bills/{billId}/events/{eventId} が作成されると発火
 */
export const billsEventsOnCreate = onDocumentCreated(
  'bills/{billId}/events/{eventId}',
  async (event) => {
    const eventData = event.data;
    if (!eventData) {
      logger.warn('billsEventsOnCreate: event data is missing');
      return;
    }

    const billId = event.params.billId;
    const eventId = event.params.eventId;
    const eventDoc = eventData.data();
    const eventRef = eventData.ref;

    logger.info('billsEventsOnCreate triggered', {
      billId,
      eventId,
      type: eventDoc.type,
    });

    const db = getFirestore();
    const billRef = db.collection('bills').doc(billId);

    try {
      await db.runTransaction(async (tx) => {
        // 1) 親docを取得
        const billSnap = await tx.get(billRef);
        if (!billSnap.exists) {
          throw new HttpsError('not-found', `Bill ${billId} not found`);
        }

        const billData = billSnap.data()!;
        const currentStatus = billData.status || 'open';

        // 2) appliedAt フラグを確認（既に適用済みの場合は no-op）
        if (eventDoc.appliedAt) {
          logger.info('billsEventsOnCreate: event already applied', {
            billId,
            eventId,
            appliedAt: eventDoc.appliedAt,
          });
          return; // no-op
        }

        // 3) トリガ適用対象の status を確認
        const eventType = eventDoc.type;
        let allowedStatuses: string[] = [];

        if (eventType === 'refund' || eventType === 'adjustment') {
          // refund / adjustment イベント: settled, partially_refunded, refunded のみ
          allowedStatuses = ['settled', 'partially_refunded', 'refunded'];
        } else if (eventType === 'cancel' || eventType === 'reopen') {
          // cancel / reopen イベント: settled のみ
          allowedStatuses = ['settled'];
        }

        // voided に対してはどのイベントも適用しない（no-op）
        if (currentStatus === 'voided') {
          logger.info('billsEventsOnCreate: status is voided, skipping', {
            billId,
            eventId,
            status: currentStatus,
          });
          return; // no-op
        }

        // pre-settlement status に対して生成された /events は適用しない（no-op）
        const preSettlementStatuses = ['open', 'in_progress', 'settling'];
        if (preSettlementStatuses.includes(currentStatus)) {
          logger.info('billsEventsOnCreate: pre-settlement status, skipping', {
            billId,
            eventId,
            status: currentStatus,
          });
          return; // no-op
        }

        // 許可された status でない場合はエラー
        if (!allowedStatuses.includes(currentStatus)) {
          throw new HttpsError(
            'failed-precondition',
            `Event type '${eventType}' cannot be applied to status '${currentStatus}'. Allowed statuses: ${allowedStatuses.join(', ')}`
          );
        }

        // 4) イベント種別ごとの差分計算
        const postEvents = billData.postEvents || {};
        const paymentsSummary = billData.paymentsSummary || {};
        const grandTotalRounded = billData.amounts?.grandTotalRounded || 0;
        const paidTotalIncl = paymentsSummary.paidTotalIncl || 0;

        let newTotalRefundedIncl = postEvents.totalRefundedIncl || 0;
        let newTotalAdjustmentsIncl = postEvents.totalAdjustmentsIncl || 0;
        let newStatus = currentStatus;
        const updateData: Record<string, any> = {};

        if (eventType === 'refund') {
          const refundAmount = eventDoc.refund?.amountIncl || 0;
          newTotalRefundedIncl += refundAmount;

          // 返金が総額一致 → status = 'refunded'
          // 0 < 返金 < 合計 → status = 'partially_refunded'
          if (newTotalRefundedIncl >= grandTotalRounded) {
            newStatus = 'refunded';
          } else if (newTotalRefundedIncl > 0) {
            newStatus = 'partially_refunded';
          }

          // paymentsSummary.balanceDueIncl を更新
          const balanceDueIncl = Math.max(0, grandTotalRounded - paidTotalIncl - newTotalRefundedIncl + newTotalAdjustmentsIncl);
          updateData['paymentsSummary.balanceDueIncl'] = balanceDueIncl;

        } else if (eventType === 'adjustment') {
          const adjustment = eventDoc.adjustment;
          if (!adjustment) {
            throw new HttpsError('invalid-argument', 'adjustment data is missing');
          }

          const sign = adjustment.sign;
          const amountIncl = adjustment.amountIncl;
          newTotalAdjustmentsIncl += sign * amountIncl;

          // paymentsSummary.balanceDueIncl を更新
          const balanceDueIncl = Math.max(0, grandTotalRounded - paidTotalIncl - newTotalRefundedIncl + newTotalAdjustmentsIncl);
          updateData['paymentsSummary.balanceDueIncl'] = balanceDueIncl;

        } else if (eventType === 'cancel') {
          // status = 'voided'（サマリは不変）
          newStatus = 'voided';

        } else if (eventType === 'reopen') {
          // status = 'in_progress'（再確定を待つ）
          newStatus = 'in_progress';
        }

        // 5) postEvents.netSalesIncl を計算
        const netSalesIncl = grandTotalRounded - newTotalRefundedIncl + newTotalAdjustmentsIncl;

        // バリデーション: netSalesIncl が負にならないことを確認
        if (netSalesIncl < 0) {
          throw new HttpsError(
            'failed-precondition',
            `Event would result in negative netSalesIncl: ${netSalesIncl}`
          );
        }

        // バリデーション: balanceDueIncl が負にならないことを確認
        const finalBalanceDueIncl = updateData['paymentsSummary.balanceDueIncl'] || paymentsSummary.balanceDueIncl || 0;
        if (finalBalanceDueIncl < 0) {
          throw new HttpsError(
            'failed-precondition',
            `Event would result in negative balanceDueIncl: ${finalBalanceDueIncl}`
          );
        }

        // 6) 親docを更新
        updateData['postEvents.totalRefundedIncl'] = newTotalRefundedIncl;
        updateData['postEvents.totalAdjustmentsIncl'] = newTotalAdjustmentsIncl;
        updateData['postEvents.netSalesIncl'] = netSalesIncl;
        updateData['status'] = newStatus;
        updateData['updatedAt'] = admin.firestore.FieldValue.serverTimestamp();

        tx.update(billRef, updateData);

        // 7) /events/{eventId} に appliedAt を設定
        tx.update(eventRef, {
          appliedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      logger.info('billsEventsOnCreate success', {
        billId,
        eventId,
        type: eventDoc.type,
      });

      // 8) トランザクション外で Analytics 差分処理をトリガ（非同期）
      // TODO: Analytics 差分処理の実装（analytics_plan.md を参照）

    } catch (error) {
      logger.error('billsEventsOnCreate failed', {
        billId,
        eventId,
        type: eventDoc.type,
        code: error instanceof HttpsError ? error.code : 'internal',
        reason: error instanceof Error ? error.message : String(error),
      });

      // トリガのエラーは再スローしない（Firestore の仕様）
      // エラーはログに記録し、必要に応じて手動で再処理する
    }
  }
);

