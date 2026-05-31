import { logger } from 'firebase-functions';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { getFirestore } from 'firebase-admin/firestore';
import { getStoreConfig } from '../../../shared/config/configLoader';
import {
  DEFAULT_CATEGORY_PAYMENT_METHODS,
  DEFAULT_POINT_AB_ROUNDING_UNIT,
  DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE,
  DEFAULT_SIDE_GAME_CHIP_ROUNDING_UNIT,
} from '../../../shared/config/defaults';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import { validateAndNormalizeCustomPayment } from '../services/customPaymentValidator';
import { loadBillCategoryAmounts } from '../services/billCategoryAmounts';

const CategoryPaymentSplitSchema = z.object({
  method: z.enum(['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip']),
  amount: z.number().nonnegative(),
});

const VerifyCustomPaymentSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
  paymentMethodsByCategory: z.record(
    z.union([
      z.enum(['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip']),
      z.array(CategoryPaymentSplitSchema),
    ]),
  ),
  paymentMethodsByAmount: z.record(z.number().nonnegative()).optional(),
});

/**
 * カスタム支払いの検証（店舗ルール・丸め単位・残高・合計一致）
 */
export const verifyCustomPayment = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  try {
    const db = getFirestore();
    const validatedData = VerifyCustomPaymentSchema.parse(request.data);
    const { billId, paymentMethodsByCategory, paymentMethodsByAmount } = validatedData;

    const config = await getStoreConfig();
    const chipRate = config.billing?.sideGameChipRate ?? DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE;
    const categoryPaymentMethods =
      config.billing?.paymentPolicy?.categoryPaymentMethods ?? DEFAULT_CATEGORY_PAYMENT_METHODS;
    const roundingUnits = {
      pointAB:
        config.billing?.paymentPolicy?.roundingUnits?.pointAB ?? DEFAULT_POINT_AB_ROUNDING_UNIT,
      sideGameChip:
        config.billing?.paymentPolicy?.roundingUnits?.sideGameChip ??
        DEFAULT_SIDE_GAME_CHIP_ROUNDING_UNIT,
    };

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
    const userData = userDoc.data()!;
    const balances: Record<string, number> = {
      pointA: userData.pointA || 0,
      pointB: userData.pointB || 0,
      sideGameChip: userData.sideGameChip || 0,
    };

    const categoryAmounts = await loadBillCategoryAmounts(db, billId);

    const { paymentMethodsByAmount: serverAmounts } = validateAndNormalizeCustomPayment({
      categoryAmounts,
      paymentMethodsByCategory,
      categoryPaymentMethods,
      balances,
      chipRate,
      roundingUnits,
      clientPaymentMethodsByAmount: paymentMethodsByAmount,
    });

    logOpsSuccess({
      message: 'verifyCustomPayment 成功',
      functionEntry: 'verifyCustomPayment',
      operation: 'verifyCustomPaymentCallable',
      context: { billId, paymentMethodsByAmount: serverAmounts },
    });

    return {
      success: true,
      paymentMethodsByAmount: serverAmounts,
      categoryAmounts,
    };
  } catch (error) {
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'verifyCustomPayment 検証エラー',
        functionEntry: 'verifyCustomPayment',
        operation: 'verifyCustomPaymentValidation',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message, {
        errorKey: error.errorKey,
        context: error.context,
      });
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error('verifyCustomPayment 予期しないエラー', error);
    logOpsError({
      message: 'verifyCustomPayment 予期しないエラー',
      functionEntry: 'verifyCustomPayment',
      operation: 'verifyCustomPaymentGenericCatch',
      cause: error,
    });
    throw new HttpsError('internal', 'カスタム支払いの検証に失敗しました');
  }
});
