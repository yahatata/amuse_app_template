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
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { cleanupIdempotencyOnSettle } from '../services/onSettleCleanupIdempotency';
import { getStoreConfig } from '../../../shared/config/configLoader';
import {
  calculateAmounts,
  calculateCategoryBreakdown,
  buildBaselineExtras,
  buildBaselineItems,
  buildBaselineSideGameChips,
  buildBaselineTournaments,
  buildItemsSnapshot,
  buildSideGameChipsSummary,
  buildTournamentsSnapshot,
  calculatePaymentTotals,
  calculatePaymentsSummary,
  calculateContentHash,
} from '../services/snapshots';
import { enqueueSettlement } from '../../analytics/services/aggregator';
import {
  buildCurrentSummaryFromSettlement,
  buildDraftAccountingInput,
  buildInitialPostSettlementState,
  buildSettlementSnapshot,
} from '../services/parentSummary';
import {
  BASELINE_SNAPSHOT_DOC_ID,
  buildBaselineSnapshot,
  buildBaselineSummary,
  buildInitialCycleDoc,
  buildSettledCycleDocPatch,
} from '../services/settlementCycles';


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
      logOpsError({
        message:
          'billsOnSettle で before / after data が取得できませんでした（後続のスナップショット処理をスキップ）',
        functionEntry: 'billsOnSettle',
        operation: 'validateEventSnapshot',
        cause: new Error('billsOnSettle_before_or_after_data_missing'),
        context: {
          billId: event.params.billId,
          hasBeforeData: !!beforeData,
          hasAfterData: !!afterData,
        },
      });
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
    const hasAccountingStartedAt = Boolean(ops.accountingStartedAt);
    const hasAccountingCompletedAt = Boolean(ops.accountingCompletedAt);
    if (!hasAccountingStartedAt && !hasAccountingCompletedAt) {
      logOpsError({
        message:
          'billsOnSettle: settled に至ったが ops に accountingStartedAt / accountingCompletedAt がいずれも無いため後続スナップショット・enqueue をスキップ',
        functionEntry: 'billsOnSettle',
        operation: 'validateAccountingOpsForSettlement',
        context: {
          billId,
          businessDate: afterData.businessDate ?? null,
          status: afterStatus,
          hasAccountingStartedAt,
          hasAccountingCompletedAt,
        },
      });
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
      // 再処理導線（未確定）: storeMeta/config 復旧後も settled への同一遷移では再発火しないため、
      // amounts/categoryBreakdown 等が未生成のまま残りうる。バックフィル用の別 Callable・バッチの要否は運用設計とする。
      const storeConfig = await getStoreConfig();
      const chipRate = storeConfig.billing?.sideGameChipRate;

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
      const baselineItems = buildBaselineItems(itemsSnapshot.docs);
      const baselineExtras = buildBaselineExtras(extrasSnapshot.docs);
      const baselineSideGameChips = buildBaselineSideGameChips(sideGameChipsSnapshot.docs);
      const baselineTournaments = buildBaselineTournaments(tournamentsSnapshot.docs);

      const paymentTotals = calculatePaymentTotals({
        paymentsDocs: paymentsDocsSnapshot?.docs || [],
        metaPaymentMethodsByCategory: afterData.meta?.paymentMethodsByCategory,
        metaPaymentMethodsByAmount: afterData.meta?.paymentMethodsByAmount,
        categoryBreakdown,
        sideGameChipExchangeRate: chipRate,
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
        logger.info('billsOnSettle: contentHash matches, skipping update', {
          billId,
          contentHash: contentHash.substring(0, 8),
        });
        logOpsSuccess({
          message: 'billsOnSettle 成功（contentHash 一致スキップ）',
          functionEntry: 'billsOnSettle',
          context: {
            billId,
            contentHashPrefix: contentHash.substring(0, 8),
            outcome: 'hash_match_skip',
          },
        });

        return;
      }

      // 親ドキュメントを更新（transaction 推奨）
      const now = admin.firestore.Timestamp.now();
      const currentSettlementCycle = afterData.reopenSummary?.currentSettlementCycle || 1;
      const settlementSnapshot = buildSettlementSnapshot({
        amounts,
        categoryBreakdown,
        paymentTotals,
        paymentsSummary,
        closedAt: now,
        contentHash,
      });
      const baselineSummary = buildBaselineSummary({
        amounts,
        categoryBreakdown,
        paymentTotals,
        paymentsSummary,
        contentHash,
      });
      const baselineSnapshot = buildBaselineSnapshot({
        items: baselineItems,
        extras: baselineExtras,
        tournaments: baselineTournaments,
        sideGameChips: baselineSideGameChips,
        amounts,
        categoryBreakdown,
        paymentTotals,
        paymentsSummary,
        contentHash,
      });
      const currentSummary = buildCurrentSummaryFromSettlement({
        claimTotalIncl: amounts.grandTotalRounded,
        receivedTotalIncl: paymentsSummary.paidTotalIncl,
        refundedTotalIncl: 0,
        netSalesIncl: amounts.grandTotalRounded,
      });
      const postSettlementState = buildInitialPostSettlementState();
      const draftAccountingInput = buildDraftAccountingInput({
        paymentMethodsByCategory:
          afterData.draftAccountingInput?.paymentMethodsByCategory ??
          afterData.meta?.paymentMethodsByCategory ??
          null,
        paymentMethodsByAmount:
          afterData.draftAccountingInput?.paymentMethodsByAmount ??
          afterData.meta?.paymentMethodsByAmount ??
          null,
      });
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
        settlementSnapshot,
        currentSummary,
        postSettlementState,
        'reopenSummary.latestSettledCycle': currentSettlementCycle,
        'reopenSummary.lastResettledAt': now,
        draftAccountingInput,
        'meta.contentHash': contentHash,
        updatedAt: now, // 初回生成時は updatedAt を更新（既存ポリシーに従う）
      };

      const cycleRef = billRef.collection('settlementCycles').doc(String(currentSettlementCycle));
      const baselineSnapshotRef = cycleRef
        .collection('baselineSnapshot')
        .doc(BASELINE_SNAPSHOT_DOC_ID);
      const cycleSnap = await cycleRef.get();
      const existingCycleData = cycleSnap.exists ? cycleSnap.data() : null;
      const cycleBase =
        existingCycleData ??
        buildInitialCycleDoc({
          cycleNo: currentSettlementCycle,
          openedAt: afterData.createdAt ?? now,
          openedBy: null,
          openedReason: currentSettlementCycle === 1 ? 'initial' : 'reopen',
          openedFromCycleNo: currentSettlementCycle > 1 ? currentSettlementCycle - 1 : null,
        });

      const batch = db.batch();

      // 重要: status は絶対に書き換えない（ループ事故防止）
      batch.update(billRef, updateData);
      batch.set(
        cycleRef,
        {
          ...cycleBase,
          ...buildSettledCycleDocPatch({
            settledAt: now,
            settledBy:
              afterData.ops?.accountingCompletedBy ??
              afterData.ops?.accountingStartedBy ??
              null,
            baselineSummary,
          }),
        },
        { merge: true },
      );
      batch.set(baselineSnapshotRef, baselineSnapshot, { merge: false });
      await batch.commit();

      logger.info('billsOnSettle: snapshot updated', {
        billId,
        contentHash: contentHash.substring(0, 8),
      });

      // cleanupIdempotencyOnSettle を呼ぶ
      await cleanupIdempotencyOnSettle(billId);

      let settlementEnqueued = false;
      if (storeConfig.features?.settlementAggregatorEnabled) {
        const updatedBillDoc = await billRef.get();
        if (updatedBillDoc.exists) {
          const updatedBillData = updatedBillDoc.data()!;
          const billDoc: any = {
            billId,
            businessDate: updatedBillData.businessDate,
            status: updatedBillData.status,
            // Step07 changeSpec §4.2 / §5.3.5: settle marker docId 構成に使う cycle 番号
            cycleNo:
              typeof updatedBillData.reopenSummary?.currentSettlementCycle === 'number'
                ? updatedBillData.reopenSummary.currentSettlementCycle
                : 1,
            amounts: updatedBillData.amounts,
            categoryBreakdown: updatedBillData.categoryBreakdown,
            itemsSnapshot: updatedBillData.itemsSnapshot,
            tournamentsSnapshot: updatedBillData.tournamentsSnapshot,
            paymentTotals: updatedBillData.paymentTotals,
            paymentsSummary: updatedBillData.paymentsSummary,
            postEvents: updatedBillData.postEvents,
            party: updatedBillData.party,
          };
          await enqueueSettlement(billDoc);
          settlementEnqueued = true;
        }
      }

      logOpsSuccess({
        message: 'billsOnSettle 成功',
        functionEntry: 'billsOnSettle',
        context: {
          billId,
          contentHashPrefix: contentHash.substring(0, 8),
          outcome: 'snapshot_updated',
          settlementEnqueued,
        },
      });
    } catch (error) {
      logOpsError({
        message: 'billsOnSettle failed',
        functionEntry: 'billsOnSettle',
        operation: 'billsOnSettleMainCatch',
        cause: error,
        context: { billId },
      });

      // トリガのエラーは再スローしない（Firestore の仕様）
      // エラーはログに記録し、必要に応じて手動で再処理する
    }
  }
);
