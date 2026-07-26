/**
 * A-7: 手動支払いの事前検証
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
import { ALL_BALANCE_IDS, SIDE_GAME_CHIP_ID } from '../../user/types/pointIds';
import { readBalanceOrZeroIfMissing } from '../../user/helpers/userBalances';
import { validateAndNormalizeCustomPayment } from '../services/customPaymentValidator';
import { loadBillCategoryAmounts } from '../services/billCategoryAmounts';

const PaymentMethodEnum = z.enum([
  'cash',
  'credit_card',
  'electronic_money',
  'pointA',
  'pointB',
  'pointC',
  'pointD',
  'pointE',
  'sideGameChip',
]);

const CategoryPaymentSplitSchema = z.object({
  method: PaymentMethodEnum,
  amount: z.number().nonnegative(),
});

const VerifyCustomPaymentSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
  paymentMethodsByCategory: z.record(
    z.union([PaymentMethodEnum, z.array(CategoryPaymentSplitSchema)]),
  ),
  paymentMethodsByAmount: z.record(z.number().nonnegative()).optional(),
});

export const verifyCustomPayment = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  try {
    const db = getFirestore();
    const validatedData = VerifyCustomPaymentSchema.parse(request.data);
    const { billId, paymentMethodsByCategory, paymentMethodsByAmount } =
      validatedData;

    const config = await getStoreConfig();
    const validatedPointConfig = validatePointConfigFromStoreConfig(config);

    const billDoc = await db.collection('bills').doc(billId).get();
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

    const balanceEnabled: Record<string, boolean> = {};
    for (const id of ALL_BALANCE_IDS) {
      if (id === SIDE_GAME_CHIP_ID) {
        balanceEnabled[id] = validatedPointConfig.sideGameChipSettings.enabled;
      } else {
        balanceEnabled[id] = validatedPointConfig.pointSettings[id].enabled;
      }
    }

    const categoryAmounts = await loadBillCategoryAmounts(db, billId);

    const validated = validateAndNormalizeCustomPayment({
      categoryAmounts,
      paymentMethodsByCategory,
      categoryPaymentMethods: validatedPointConfig.categoryPaymentMethods,
      balances,
      balancePaymentSettings: validatedPointConfig.balancePaymentSettings,
      balanceEnabled,
      clientPaymentMethodsByAmount: paymentMethodsByAmount,
    });

    logOpsSuccess({
      message: 'verifyCustomPayment 成功',
      functionEntry: 'verifyCustomPayment',
      operation: 'verifyCustomPaymentCallable',
      context: { billId },
    });

    return {
      success: true,
      paymentMethodsByAmount: validated.paymentMethodsByAmount,
      paymentMethodsByCategory: validated.paymentMethodsByCategory,
      categoryAmounts,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'verifyCustomPayment 業務エラー',
        functionEntry: 'verifyCustomPayment',
        operation: 'verifyCustomPaymentCustom',
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
      message: 'verifyCustomPayment 予期しないエラー',
      functionEntry: 'verifyCustomPayment',
      operation: 'verifyCustomPaymentGenericCatch',
      cause: error,
    });
    throw new HttpsError('internal', 'カスタム支払いの検証に失敗しました');
  }
});
