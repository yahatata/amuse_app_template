/**
 * placeOrderByUser
 *
 * LIFF ユーザーの一括注文（atomic）
 *
 * - request.auth.uid 固定
 * - clientNonce 必須（注文単位）
 * - 全商品成功 or 全失敗（部分成功なし）
 * - 価格・名称・カテゴリは server 確定
 * - isArchive / isSoldOut を拒否
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import { getErrorKeyFromUnknown, throwOrderHttpsError } from '../helpers/orderHttpsError';
import {
  normalizePlaceOrderByUserItems,
  validateClientNonce,
} from '../helpers/normalizePlaceOrderByUserItems';
import { executePlaceOrderByUserAtomic } from '../helpers/placeOrderByUserAtomic';

export const placeOrderByUser = onCall(async (request) => {
  try {
    if (!request.auth) {
      throwOrderHttpsError('unauthenticated', 'ORDER_UNAUTHENTICATED', 'Authentication required');
    }

    const userId = request.auth.uid;
    const clientNonce = validateClientNonce(request.data?.clientNonce);

    // items[] または legacy の item 単一
    let rawItems: unknown = request.data?.items;
    if ((!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) && request.data?.item) {
      rawItems = [request.data.item];
    }
    const items = normalizePlaceOrderByUserItems(rawItems);

    const data = await executePlaceOrderByUserAtomic({
      userId,
      clientNonce,
      items,
    });

    logOpsSuccess({
      message: 'placeOrderByUser 成功',
      functionEntry: 'placeOrderByUser',
      operation: 'placeOrderByUserCallable',
      context: {
        billId: data.billId,
        itemsCount: data.itemsCount,
        totalAmount: data.totalAmount,
        reused: data.reused,
        // UID はログに出さない
      },
    });

    return {
      success: true,
      data,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      const errorKey = getErrorKeyFromUnknown(error);
      // 想定内の業務エラーは top-level catch で二重計上しない（検証系）
      if (
        errorKey &&
        errorKey !== 'ORDER_INTERNAL_ERROR' &&
        error.code !== 'internal'
      ) {
        throw error;
      }
      logOpsError({
        message: 'placeOrderByUser failed',
        functionEntry: 'placeOrderByUser',
        operation: 'placeOrderHttpsError',
        cause: error,
        context: { errorKey: errorKey || null, code: error.code },
      });
      throw error;
    }

    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'placeOrderByUser failed',
        functionEntry: 'placeOrderByUser',
        operation: 'placeOrderCatch',
        cause: error,
        sourceProductHint: 'firestore',
        context: { errorKey: error.errorKey },
      });
      throw new HttpsError(
        mapFunctionCustomErrorToHttpsCode(error.errorKey),
        'Order failed',
        { errorKey: error.errorKey },
      );
    }

    logOpsError({
      message: 'placeOrderByUser failed',
      functionEntry: 'placeOrderByUser',
      operation: 'placeOrderGenericCatch',
      cause: error,
      sourceProductHint: 'firestore',
    });
    throw new HttpsError('internal', 'Order failed', {
      errorKey: 'ORDER_INTERNAL_ERROR',
    });
  }
});
