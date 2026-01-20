/**
 * bills.onSettle トリガ
 * 
 * trigger_plan.md §2 に準拠
 * 
 * /bills/{billId} が更新され、status が 'settled' に遷移したときに発火し、
 * 親スナップショットを生成する
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { defineString } from 'firebase-functions/params';
import { cleanupIdempotencyOnSettle } from './onSettleCleanupIdempotency';
import {
  calculateAmounts,
  calculateCategoryBreakdown,
  buildItemsSnapshot,
  buildSideGameChipsSummary,
  buildTournamentsSnapshot,
  calculatePaymentTotals,
  calculatePaymentsSummary,
  calculateContentHash,
} from '../helpers/billsApi/snapshots';
import { enqueueSettlement } from '../analytics/aggregator';

// 環境変数定義（Firebase Functions v2の推奨方法）
const enableSettlementAggregator = defineString('ENABLE_SETTLEMENT_AGGREGATOR', {
  default: 'false',
});

/**
 * Settlement トリガ
 * 
 * /bills/{billId} が更新され、status が 'settled' に遷移したときに発火
 */
export const billsOnSettle = onDocumentUpdated(
  'bills/{billId}',
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) {
      logger.warn('billsOnSettle: before or after data is missing');
      return;
    }

    const billId = event.params.billId;
    const beforeStatus = beforeData.status;
    const afterStatus = afterData.status;

    // 発火条件: before.status !== 'settled' && after.status === 'settled'
    if (beforeStatus === 'settled' || afterStatus !== 'settled') {
      return;
    }

    // 追加ガード: ops.accountingStartedAt または ops.accountingCompletedAt が存在することを確認
    const ops = afterData.ops || {};
    if (!ops.accountingStartedAt && !ops.accountingCompletedAt) {
      logger.warn('billsOnSettle: ops.accountingStartedAt and ops.accountingCompletedAt are both missing', { billId });
      return;
    }

    logger.info('billsOnSettle triggered', {
      billId,
      beforeStatus,
      afterStatus,
    });

    const db = getFirestore();
    const billRef = db.collection('bills').doc(billId);

    try {
      // 親doc after を基準に処理
      // サブコレクションを読み取り
      const [itemsSnapshot, extrasSnapshot, sideGameChipsSnapshot, tournamentsSnapshot, paymentsSnapshot] = await Promise.all([
        billRef.collection('items').get(),
        billRef.collection('extras').get(),
        billRef.collection('sideGameChips').get(),
        billRef.collection('tournaments').get(),
        billRef.collection('payments').limit(1).get(), // 存在判定用
      ]);

      // /payments の存在確認（limit(1) で件数確認）
      const paymentsExists = paymentsSnapshot.docs.length > 0;
      const paymentsDocsSnapshot = paymentsExists
        ? await billRef.collection('payments').get()
        : null;

      // スナップショットを計算
      const amounts = calculateAmounts({
        items: itemsSnapshot.docs,
        extras: extrasSnapshot.docs,
        sideGameChips: sideGameChipsSnapshot.docs,
        tournaments: tournamentsSnapshot.docs,
      });

      const categoryBreakdown = calculateCategoryBreakdown({
        items: itemsSnapshot.docs,
        extras: extrasSnapshot.docs,
        sideGameChips: sideGameChipsSnapshot.docs,
        tournaments: tournamentsSnapshot.docs,
      });

      const itemsSnapshotData = buildItemsSnapshot(itemsSnapshot.docs);
      const sideGameChipsSummary = buildSideGameChipsSummary(sideGameChipsSnapshot.docs);
      const tournamentsSnapshotData = buildTournamentsSnapshot(tournamentsSnapshot.docs);

      const paymentTotals = calculatePaymentTotals({
        paymentsDocs: paymentsDocsSnapshot?.docs || [],
        metaPaymentMethodsByCategory: afterData.meta?.paymentMethodsByCategory,
        metaPaymentMethodsByAmount: afterData.meta?.paymentMethodsByAmount,
        categoryBreakdown,
      });

      const paymentsSummary = calculatePaymentsSummary({
        paymentTotals,
        grandTotalRounded: amounts.grandTotalRounded,
      });

      // contentHash を計算
      const contentHash = calculateContentHash({
        amounts,
        categoryBreakdown,
        itemsSnapshot: itemsSnapshotData,
        tournamentsSnapshot: tournamentsSnapshotData,
        paymentTotals,
      });

      // 既存の contentHash と比較（冪等性チェック）
      const existingContentHash = afterData.meta?.contentHash;
      if (existingContentHash && existingContentHash === contentHash) {
        // 完全 no-op（updatedAt/closedAt も不変）
        logger.info('billsOnSettle: contentHash matches, skipping update', {
          billId,
          contentHash: contentHash.substring(0, 8),
        });
        return;
      }

      // 親ドキュメントを更新（transaction 推奨）
      const now = admin.firestore.Timestamp.now();
      const updateData: Record<string, any> = {
        'amounts.subTotalIncl': amounts.subTotalIncl,
        'amounts.discountTotalIncl': amounts.discountTotalIncl,
        'amounts.serviceChargeIncl': amounts.serviceChargeIncl,
        'amounts.grandTotalIncl': amounts.grandTotalIncl,
        'amounts.roundingDelta': amounts.roundingDelta,
        'amounts.grandTotalRounded': amounts.grandTotalRounded,
        categoryBreakdown,
        itemsSnapshot: itemsSnapshotData,
        sideGameChipsSummary,
        tournamentsSnapshot: tournamentsSnapshotData,
        paymentTotals,
        'paymentsSummary.paidTotalIncl': paymentsSummary.paidTotalIncl,
        'paymentsSummary.balanceDueIncl': paymentsSummary.balanceDueIncl,
        'paymentsSummary.byMethod': paymentsSummary.byMethod,
        'postEvents.totalRefundedIncl': 0,
        'postEvents.totalAdjustmentsIncl': 0,
        'postEvents.netSalesIncl': amounts.grandTotalRounded,
        closedAt: now,
        'meta.contentHash': contentHash,
        updatedAt: now, // 初回生成時は updatedAt を更新（既存ポリシーに従う）
      };

      // 重要: status は絶対に書き換えない（ループ事故防止）
      await billRef.update(updateData);

      logger.info('billsOnSettle: snapshot updated', {
        billId,
        contentHash: contentHash.substring(0, 8),
      });

      // cleanupIdempotencyOnSettle を呼ぶ
      await cleanupIdempotencyOnSettle(billId);

      // enqueueSettlement を環境変数で制御
      if (enableSettlementAggregator.value() === 'true') {
        // snapshot 更新後の内容を再読み込みして enqueueSettlement に渡す
        const updatedBillDoc = await billRef.get();
        if (updatedBillDoc.exists) {
          const updatedBillData = updatedBillDoc.data()!;
          // BillDoc 型に合わせて変換
          const billDoc: any = {
            billId,
            businessDate: updatedBillData.businessDate,
            status: updatedBillData.status,
            amounts: updatedBillData.amounts,
            categoryBreakdown: updatedBillData.categoryBreakdown,
            itemsSnapshot: updatedBillData.itemsSnapshot,
            tournamentsSnapshot: updatedBillData.tournamentsSnapshot,
            paymentTotals: updatedBillData.paymentTotals,
            paymentsSummary: updatedBillData.paymentsSummary,
            postEvents: updatedBillData.postEvents,
            party: updatedBillData.party,
          };
          // 静的 import を使用（動的 import を避ける）
          await enqueueSettlement(billDoc);
        }
      }
    } catch (error) {
      logger.error('billsOnSettle failed', {
        billId,
        code: error instanceof Error ? error.message : String(error),
      });

      // トリガのエラーは再スローしない（Firestore の仕様）
      // エラーはログに記録し、必要に応じて手動で再処理する
    }
  }
);

