/**
 * Analytics Monthly 更新用共通関数
 *
 * 1つの bill に対する analyticsMonthly 更新を原子的に実行する。
 * トランザクション内で marker チェック・作成、事前読み取り、更新を実施する。
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { addToMonthlyIndex } from './addToMonthlyIndex';
import { addToDailySummary } from './addToDailySummary';
import { addToByCategory } from './addToByCategory';
import { addToByTemplateTournaments } from './addToByTemplateTournaments';
import { addToByUser } from './addToByUser';
import {
  calculateCategoryAmounts,
  distributePaymentMethodsWithIssues,
  type PaymentDistributionIssue,
} from './helpers';
import { logOpsError } from '../../../shared/logging/logOpsError';

/** analytics 集計ログの functionEntry は export 名（トリガ／Callable）に合わせる */
export type AnalyticsLogInvocation = {
  functionEntry: 'billsOnSettle' | 'migrateSettledBillsForBusinessDay';
};

const ANALYTICS_VALID_PAYMENT_METHODS = [
  'cash',
  'credit_card',
  'electronic_money',
  'pointA',
  'pointB',
  'sideGameChip',
];

type AnalyticsTxnOutcome =
  | { applied: false }
  | {
      applied: true;
      issues: PaymentDistributionIssue[];
      logBase: {
        functionEntry: AnalyticsLogInvocation['functionEntry'];
        billId: string;
        month: string;
        businessDate: string;
        grossSales: number;
        grandTotalRounded: number | null;
        partyUserId: string | null;
      };
    };

function logPaymentDistributionIssuesOnce(
  issues: PaymentDistributionIssue[],
  base: {
    functionEntry: AnalyticsLogInvocation['functionEntry'];
    billId: string;
    month: string;
    businessDate: string;
    grossSales: number;
    grandTotalRounded: number | null;
    partyUserId: string | null;
  }
): void {
  const analyticsStep = 'processBillAnalyticsAtomically';
  for (const issue of issues) {
    const commonCtx = {
      functionEntry: base.functionEntry,
      analyticsStep,
      billId: base.billId,
      month: base.month,
      businessDate: base.businessDate,
      grossSales: base.grossSales,
      grandTotalRounded: base.grandTotalRounded,
      partyUserId: base.partyUserId,
    };
    switch (issue.kind) {
      case 'PAYMENT_TOTALS_EMPTY_WITH_FALLBACK':
        logger.warn(
          'analytics: paymentTotals が空のためフォールバック金額で支払い方法別配賦を継続しました',
          {
            ...commonCtx,
            operation: 'analyticsPaymentTotalsEmptyWithFallback',
            fallbackCashAmount: issue.fallbackCashAmount,
          }
        );
        break;
      case 'PAYMENT_TOTALS_EMPTY_NO_FALLBACK':
        logOpsError({
          message:
            'analytics: paymentTotals が空でフォールバックもなく、支払い方法別集計が欠落する可能性があります（売上カテゴリは別経路で計上）',
          functionEntry: base.functionEntry,
          operation: 'analyticsPaymentTotalsEmptyNoFallback',
          errorKey: 'ANALYTICS_PAYMENT_TOTALS_EMPTY_NO_FALLBACK',
          context: commonCtx,
          cause: new Error('payment_totals_empty_no_fallback'),
        });
        break;
      case 'PAYMENT_TOTALS_INVALID_METHODS_NORMALIZED':
        logger.warn('analytics: 無効な支払い方法キーを cash に正規化しました', {
          ...commonCtx,
          operation: 'analyticsPaymentTotalsInvalidMethodsNormalized',
          invalidMethodCount: issue.invalidMethodCount,
        });
        break;
    }
  }
}

/**
 * 1つの bill に対する analyticsMonthly 更新を原子的に実行
 *
 * 処理内容:
 * 1. トランザクション内で marker をチェック（存在するなら no-op return）
 * 2. analyticsMonthly の必要参照を tx.get で事前読み取り
 * 3. 旧スキーマ更新: addToMonthlyIndex/addToDailySummary/addToByCategory/addToByTemplateTournaments/addToByUser を呼ぶ
 * 4. marker を作成（トランザクション内で必ず実施、tx.create を使用）
 * 
 * Step07 changeSpec §4.2 / §5.3.4: marker docId は次の優先順位で決定する。
 * - `cycleNo` が指定されていれば `{billId}_cycle{cycleNo}_settle` （新仕様、reopen 後 resettle で再反映可能）
 * - 未指定なら legacy `{billId}` （後方互換、既存テスト / 古い呼び出し用）
 * 
 * @param db Firestore インスタンス
 * @param params 更新パラメータ
 * @param params.month 月次キー（YYYY-MM 形式）
 * @param params.businessDate 営業日（YYYY-MM-DD 形式）
 * @param params.billId 伝票ID（bills コレクションのドキュメントID、docId）
 * @param params.cycleNo settlement cycle 番号（Step07 changeSpec §4.2、未指定は legacy 互換）
 * @param params.billData bills 親ドキュメントのデータ（categoryBreakdown, paymentTotals, itemsSnapshot, tournamentsSnapshot, party 等を含む）
 * @param params.logInvocation functionEntry は billsOnSettle / migrateSettledBillsForBusinessDay のいずれか（内部関数名は context.analyticsStep に載せない）
 * @returns Promise<void>
 */
export async function processBillAnalyticsAtomically(
  db: FirebaseFirestore.Firestore,
  params: {
    month: string;
    businessDate: string;
    billId: string;
    cycleNo?: number;
    billData: any;
    logInvocation: AnalyticsLogInvocation;
  }
): Promise<void> {
  const { month, businessDate, billId, cycleNo, billData, logInvocation } = params;

  // Step07 changeSpec §4.2: cycleNo 指定時は `{billId}_cycle{cycleNo}_settle`、未指定時は legacy `{billId}`
  const markerDocId =
    typeof cycleNo === 'number' && cycleNo > 0 ? `${billId}_cycle${cycleNo}_settle` : billId;

  // 参照を準備
  const monthlyRef = db.collection('analyticsMonthly').doc(month);
  const dailyRef = monthlyRef.collection('days').doc(businessDate);
  const byCategoryRef = monthlyRef.collection('byCategory').doc('summary');
  const markerRef = monthlyRef.collection('aggregationMarkers').doc(markerDocId);

  const userId = billData.party?.userId;
  const byUserRef = userId ? monthlyRef.collection('byUser').doc(userId) : undefined;

  // トーナメントテンプレート用の参照を準備
  const tournamentsSnapshot = billData.tournamentsSnapshot || {};
  const templateKeys = Object.keys(tournamentsSnapshot).filter(key => {
    const tournamentData = tournamentsSnapshot[key];
    return tournamentData && typeof tournamentData === 'object';
  });
  const templateRefs = templateKeys.map(key =>
    monthlyRef.collection('byTemplateTournaments').doc(key)
  );

  // トランザクション開始（リトライ時に warn/Ops が二重にならないよう、ログはコミット成功後にのみ行う）
  const outcome = await db.runTransaction(async (tx): Promise<AnalyticsTxnOutcome> => {
    // --- READ phase ---

    // 1. marker チェック（存在するなら早期 return）
    const markerDoc = await tx.get(markerRef);
    if (markerDoc.exists) {
      logger.info('processBillAnalyticsAtomically: marker already exists, skipping', {
        billId,
        month,
        businessDate,
        markerPath: markerRef.path,
      });
      return { applied: false };
    }

    logger.info('processBillAnalyticsAtomically: starting analytics update', {
      billId,
      month,
      businessDate,
    });

    // 2. analytics 関連ドキュメントを事前読み取り（read→write順を守る）
    const reads = [
      tx.get(monthlyRef),
      tx.get(dailyRef),
      tx.get(byCategoryRef),
      ...(byUserRef ? [tx.get(byUserRef)] : []),
      ...templateRefs.map(ref => tx.get(ref)),
    ];
    const results = await Promise.all(reads);

    const monthlyDoc = results[0];
    const dailyDoc = results[1];
    const byCategoryDoc = results[2];
    let idx = 3;
    const byUserDoc = byUserRef ? results[idx++] : undefined;
    const templateDocs = results.slice(idx);

    // 配賦結果のログはトランザクション成功後に 1 回だけ（リトライでの二重出力を避ける）
    const categoryAmounts = calculateCategoryAmounts(billData);
    const grossSales = Array.from(categoryAmounts.values()).reduce((sum, amount) => sum + amount, 0);
    const grandTotalRoundedRaw = billData.amounts?.grandTotalRounded;
    const grandTotalRounded =
      typeof grandTotalRoundedRaw === 'number' ? grandTotalRoundedRaw : null;
    const fallbackCashAmount = billData.amounts?.grandTotalRounded || grossSales;

    const distResult = distributePaymentMethodsWithIssues(billData.paymentTotals, {
      fallbackCashAmount,
      validMethods: [...ANALYTICS_VALID_PAYMENT_METHODS],
    });

    // --- WRITE phase ---

    const monthlyIndexInfo = await addToMonthlyIndex(
      tx,
      month,
      billData,
      businessDate,
      distResult.paymentTotalsMap,
      monthlyDoc
    );
    const dailySummaryInfo = await addToDailySummary(
      tx,
      month,
      businessDate,
      billData,
      distResult.paymentTotalsMap,
      dailyDoc
    );
    const byCategoryInfo = await addToByCategory(tx, month, billData, byCategoryDoc);
    const byTemplateTournamentsInfos = await addToByTemplateTournaments(
      tx,
      month,
      businessDate,
      billData,
      templateDocs
    );
    const byUserInfo = byUserDoc
      ? await addToByUser(
          tx,
          month,
          businessDate,
          billData,
          distResult.paymentTotalsMap,
          byUserDoc
        )
      : null;

    // 4. marker 作成（トランザクション内で必ず実施、初回のみ作成を保証）
    tx.create(markerRef, {
      type: 'settle',
      billId,
      cycleNo: typeof cycleNo === 'number' ? cycleNo : null,
      businessDate,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 5. すべての更新内容を1つのログに集約
    const allUpdates: Record<string, any> = {
      [monthlyIndexInfo.collection]: {
        [monthlyIndexInfo.documentId]: {
          isNewDocument: monthlyIndexInfo.isNewDocument,
          updatedFields: monthlyIndexInfo.updatedFields,
        },
      },
      [`${dailySummaryInfo.collection}/${dailySummaryInfo.subcollection}`]: {
        [dailySummaryInfo.documentId]: {
          isNewDocument: dailySummaryInfo.isNewDocument,
          updatedFields: dailySummaryInfo.updatedFields,
        },
      },
      [`${byCategoryInfo.collection}/${byCategoryInfo.subcollection}`]: {
        [byCategoryInfo.documentId]: {
          isNewDocument: byCategoryInfo.isNewDocument,
          updatedFields: byCategoryInfo.updatedFields,
        },
      },
    };

    if (byTemplateTournamentsInfos.length > 0) {
      const tournamentsUpdates: Record<string, any> = {};
      byTemplateTournamentsInfos.forEach(info => {
        tournamentsUpdates[info.documentId] = {
          templateKey: info.templateKey,
          templateName: info.templateName,
          isNewDocument: info.isNewDocument,
          updatedFields: info.updatedFields,
        };
      });
      allUpdates[`${byTemplateTournamentsInfos[0].collection}/${byTemplateTournamentsInfos[0].subcollection}`] =
        tournamentsUpdates;
    }

    if (byUserInfo) {
      allUpdates[`${byUserInfo.collection}/${byUserInfo.subcollection}`] = {
        [byUserInfo.documentId]: {
          userId: byUserInfo.userId,
          pokerName: byUserInfo.pokerName,
          isNewDocument: byUserInfo.isNewDocument,
          updatedFields: byUserInfo.updatedFields,
        },
      };
    }

    allUpdates[`${monthlyIndexInfo.collection}/aggregationMarkers`] = {
      [markerDocId]: {
        type: 'settle',
        billId,
        cycleNo: typeof cycleNo === 'number' ? cycleNo : null,
        businessDate,
        processedAt: 'serverTimestamp()',
      },
    };

    logger.info('processBillAnalyticsAtomically: analyticsMonthly updates', {
      billId,
      month,
      businessDate,
      updates: allUpdates,
    });

    return {
      applied: true,
      issues: distResult.issues,
      logBase: {
        functionEntry: logInvocation.functionEntry,
        billId,
        month,
        businessDate,
        grossSales,
        grandTotalRounded,
        partyUserId: typeof userId === 'string' ? userId : null,
      },
    };
  });

  if (outcome.applied) {
    logPaymentDistributionIssuesOnce(outcome.issues, outcome.logBase);
  }

  logger.info('processBillAnalyticsAtomically: analytics update completed', {
    billId,
    month,
    businessDate,
  });
}
