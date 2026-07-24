/**
 * A-7: 自動充当の事前照合
 *
 * クライアント結果とサーバ再計算が不一致なら PAYMENT_SPLIT_MISMATCH で拒否する。
 * サーバ結果を黙って採用して success 返却しない。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { getFirestore } from 'firebase-admin/firestore';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { validatePointConfigFromStoreConfig } from '../../../shared/config/validatePointConfig';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import {
  FunctionCustomError,
  mapFunctionCustomErrorToHttpsCode,
} from '../../../shared/logging/functionCustomError';
import { ALL_BALANCE_IDS } from '../../user/types/pointIds';
import { readBalanceOrZeroIfMissing } from '../../user/helpers/userBalances';
import { calculateA7PaymentSplit } from '../services/a7PaymentSplit';
import { loadBillCategoryAmounts } from '../services/billCategoryAmounts';
import { throwPaymentSplitMismatch } from '../services/paymentMethodAggregation';

const VerifyPaymentSplitSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
  clientResult: z.object({
    usedPoints: z.record(z.number()),
    cashLikeAmount: z.number(),
    categoryBreakdown: z.record(
      z.object({
        pointsUsed: z.number(),
        baseMethodAmount: z.number(),
      }),
    ),
  }),
  selectedBaseMethod: z.enum(['cash', 'credit_card', 'electronic_money']),
  /** 互換のため受け付けるが、照合の正本は config.pointPriority */
  pointPriority: z.array(z.string()).optional(),
});

export const verifyPaymentSplit = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  try {
    const db = getFirestore();
    const validatedData = VerifyPaymentSplitSchema.parse(request.data);
    const { billId, clientResult, selectedBaseMethod } = validatedData;

    const config = await getStoreConfig();
    const validatedPointConfig = validatePointConfigFromStoreConfig(config);

    const billRef = db.collection('bills').doc(billId);
    const billDoc = await billRef.get();
    if (!billDoc.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billDoc.data()!;
    const userId = billData.party?.userId;
    if (!userId) {
      throw new HttpsError('invalid-argument', 'ユーザーIDが見つかりません');
    }

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new HttpsError('not-found', 'ユーザー情報が見つかりません');
    }
    const userData = userDoc.data() as Record<string, unknown>;
    const balances: Record<string, number> = {};
    for (const id of ALL_BALANCE_IDS) {
      balances[id] = readBalanceOrZeroIfMissing(userData, id);
    }

    const categoryAmounts = await loadBillCategoryAmounts(db, billId);

    const serverResult = calculateA7PaymentSplit({
      selectedBaseMethod,
      bill: categoryAmounts,
      balances,
      pointPriority: validatedPointConfig.pointPriority,
      categoryPaymentMethods: validatedPointConfig.categoryPaymentMethods,
      categoryOrder: validatedPointConfig.categoryOrder,
      balancePaymentSettings: validatedPointConfig.balancePaymentSettings,
    });

    if (!compareA7SplitResults(clientResult, serverResult)) {
      throwPaymentSplitMismatch({
        billId,
        side: 'verifyPaymentSplit',
        clientCashLikeAmount: clientResult.cashLikeAmount,
        serverCashLikeAmount: serverResult.cashLikeAmount,
      });
    }

    logOpsSuccess({
      message: 'verifyPaymentSplit 成功',
      functionEntry: 'verifyPaymentSplit',
      operation: 'verifyPaymentSplitCallable',
      context: { billId, verified: true, selectedBaseMethod, callerUid },
    });

    return {
      success: true,
      verified: true,
      result: {
        usedPoints: serverResult.usedPointsReference,
        cashLikeAmount: serverResult.cashLikeAmount,
        categoryBreakdown: serverResult.categoryBreakdown,
      },
      message: '計算結果が一致しました',
    };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: '支払い分割照合 業務エラー',
        functionEntry: 'verifyPaymentSplit',
        operation: 'verifyPaymentSplitCustom',
        cause: error,
        context: {
          billId: (request.data as { billId?: string } | undefined)?.billId,
          errorKey: error.errorKey,
        },
      });
      throw new HttpsError(
        mapFunctionCustomErrorToHttpsCode(error.errorKey),
        error.message,
        { errorKey: error.errorKey, context: error.context },
      );
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    logOpsError({
      message: '支払い分割照合エラー:',
      functionEntry: 'verifyPaymentSplit',
      operation: 'verifyPaymentSplitGenericCatch',
      cause: error,
    });
    throw new HttpsError(
      'internal',
      '支払い分割照合に失敗しました',
      error instanceof Error ? error.message : String(error),
    );
  }
});

function compareA7SplitResults(
  client: z.infer<typeof VerifyPaymentSplitSchema>['clientResult'],
  server: ReturnType<typeof calculateA7PaymentSplit>,
): boolean {
  const clientPoints = client.usedPoints;
  const serverPoints = server.usedPointsReference;

  const keys = new Set([
    ...Object.keys(clientPoints),
    ...Object.keys(serverPoints),
  ]);
  for (const key of keys) {
    if ((clientPoints[key] || 0) !== (serverPoints[key] || 0)) {
      return false;
    }
  }

  if (client.cashLikeAmount !== server.cashLikeAmount) {
    return false;
  }

  const clientBreakdown = client.categoryBreakdown;
  const serverBreakdown = server.categoryBreakdown;
  const categories = new Set([
    ...Object.keys(clientBreakdown),
    ...Object.keys(serverBreakdown),
  ]);
  for (const category of categories) {
    const c = clientBreakdown[category] ?? { pointsUsed: 0, baseMethodAmount: 0 };
    const s = serverBreakdown[category] ?? { pointsUsed: 0, baseMethodAmount: 0 };
    if (c.pointsUsed !== s.pointsUsed || c.baseMethodAmount !== s.baseMethodAmount) {
      return false;
    }
  }

  return true;
}
