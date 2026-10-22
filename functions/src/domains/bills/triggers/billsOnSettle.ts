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
  calculateContentHash,
} from '../services/snapshots';
import { enqueueSettlement } from '../../analytics/services/aggregator';
import { loadTaxReportingBehavior } from '../../reporting/config/taxReportingBehaviorLoader';
import { buildSettleEntry } from '../../reporting/services/entryBuilder';
import { writeReportingEntry } from '../../reporting/services/entryWriter';
import { applyEntryToReportingMonthly } from '../../reporting/services/monthlyUpdater';
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
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import type { PaymentMethodValue } from '../services/paymentMethodsInference';

/**
 * A-7 Phase 2: settle 時の ByCategory 推論は廃止。
 * 新規会計は startAccounting で ByCategory を保存済みであること。
 * 旧 inferPaymentMethodsByCategory（paymentSplitCalculator 依存）は削除済み。削除時期: Phase 2。
 */

// ---------------------------------------------------------------------------

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
        closedAt: now,
        contentHash,
      });
      const baselineSummary = buildBaselineSummary({
        amounts,
        categoryBreakdown,
        paymentTotals,
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
        contentHash,
      });
      const receivedTotalIncl = Object.values(paymentTotals).reduce((s, v) => s + v, 0);
      const currentSummary = buildCurrentSummaryFromSettlement({
        claimTotalIncl: amounts.grandTotalRounded,
        receivedTotalIncl,
        refundedTotalIncl: 0,
        netSalesIncl: amounts.grandTotalRounded,
      });
      const postSettlementState = buildInitialPostSettlementState();

      // A-7: ByCategory は会計開始時に保存済みであること（settle 推論は正本にしない）
      const existingPmByCategory =
        (afterData.draftAccountingInput?.paymentMethodsByCategory ??
          afterData.meta?.paymentMethodsByCategory) as
          | Record<string, PaymentMethodValue>
          | null
          | undefined;
      const hasByCategory =
        existingPmByCategory != null &&
        Object.keys(existingPmByCategory).length > 0;
      const isZeroYen = amounts.grandTotalRounded === 0;

      if (!isZeroYen && !hasByCategory) {
        throw new FunctionCustomError({
          errorKey: 'PAYMENT_CATEGORY_REQUIRED',
          message:
            'paymentMethodsByCategory が欠落しているため settle できません（推論による補完は行いません）',
          context: { billId },
        });
      }

      const resolvedPmByCategory = hasByCategory ? existingPmByCategory : {};

      const draftAccountingInput = buildDraftAccountingInput({
        paymentMethodsByCategory: resolvedPmByCategory,
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
        closedAt: now,
        settlementSnapshot,
        currentSummary,
        postSettlementState,
        'reopenSummary.latestSettledCycle': currentSettlementCycle,
        // 初回会計（cycle=1）では null のまま。reopen 後の再会計時のみ更新。
        ...(currentSettlementCycle > 1 && {
          'reopenSummary.lastResettledAt': now,
        }),
        draftAccountingInput,
        'meta.contentHash': contentHash,
        updatedAt: now,
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

      // Re-read bill for analytics and reporting
      const updatedBillDoc = await billRef.get();
      const updatedBillData = updatedBillDoc.exists ? updatedBillDoc.data()! : null;

      let settlementEnqueued = false;
      if (storeConfig.features?.settlementAggregatorEnabled && updatedBillData) {
        const billDoc: any = {
          billId,
          businessDate: updatedBillData.businessDate,
          status: updatedBillData.status,
          cycleNo:
            typeof updatedBillData.reopenSummary?.currentSettlementCycle === 'number'
              ? updatedBillData.reopenSummary.currentSettlementCycle
              : 1,
          amounts: updatedBillData.amounts,
          categoryBreakdown: updatedBillData.categoryBreakdown,
          itemsSnapshot: updatedBillData.itemsSnapshot,
          tournamentsSnapshot: updatedBillData.tournamentsSnapshot,
          paymentTotals: updatedBillData.paymentTotals,
          party: updatedBillData.party,
          // paymentsSummary / postEvents は廃止済み（B-4）
        };
        await enqueueSettlement(billDoc);
        settlementEnqueued = true;
      }

      let reportingApplied = false;
      logger.info('billsOnSettle: reporting check', {
        billId,
        reportingAggregatorEnabled: storeConfig.features?.reportingAggregatorEnabled,
        hasUpdatedBillData: updatedBillData !== null,
      });
      if (storeConfig.features?.reportingAggregatorEnabled === true && updatedBillData) {
        logger.info('billsOnSettle: reporting block entered', { billId });
        try {
          const taxBehavior = await loadTaxReportingBehavior();

          const billCategoryBreakdown = updatedBillData.categoryBreakdown as Record<string, number> | undefined;
          const reportingCategoryBreakdown: Record<string, { amountIncl: number }> = {};
          if (billCategoryBreakdown) {
            for (const [key, val] of Object.entries(billCategoryBreakdown)) {
              const reportKey = key === 'sideGameChips' ? 'sideGameChip' : key;
              reportingCategoryBreakdown[reportKey] = { amountIncl: typeof val === 'number' ? val : 0 };
            }
          }

          const billPaymentTotals = (updatedBillData.paymentTotals ?? {}) as Record<string, number>;
          const pmByCategory =
            updatedBillData.draftAccountingInput?.paymentMethodsByCategory ??
            updatedBillData.meta?.paymentMethodsByCategory ??
            {};

          const isResettle = currentSettlementCycle > 1;

          const entry = buildSettleEntry({
            billId,
            cycleNo: currentSettlementCycle,
            settledAt: now,
            businessDate: updatedBillData.businessDate ?? '',
            categoryBreakdown: reportingCategoryBreakdown,
            paymentTotals: billPaymentTotals,
            paymentMethodsByCategory: pmByCategory,
            dateRule: taxBehavior.dateRule,
            entryType: isResettle ? 'resettle' : 'settle',
          });

          const { written } = await writeReportingEntry(db, entry);
          if (written) {
            await applyEntryToReportingMonthly(db, entry);
          }
          reportingApplied = true;
        } catch (reportingError) {
          logOpsError({
            message: 'billsOnSettle reporting write failed',
            functionEntry: 'billsOnSettle',
            operation: 'writeReportingEntry',
            cause: reportingError,
            context: { billId },
          });
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
          reportingApplied,
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
