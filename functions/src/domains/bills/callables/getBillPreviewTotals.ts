/**
 * getBillPreviewTotals callable
 * 
 * 会計開始前のプレビュー情報（カテゴリ別金額など）を取得する
 * 
 * 注意: この関数は UI補助用途のプレビューであり、
 * 金額の正は amounts.* (確定済み伝票) および verifyPaymentSplit (サーバー側再計算) にあります。
 */

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE } from '../../../shared/config/defaults';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';

const GetBillPreviewTotalsSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
});

export interface GetBillPreviewTotalsRequest {
  billId: string;
}

export interface GetBillPreviewTotalsResponse {
  billId: string;
  businessDate: string | null;
  grandTotal: number;
  categories: {
    extraCost: {
      display: number;
      monetary: number;
    };
    items: {
      display: number;
      monetary: number;
    };
    sideGameChip: {
      displayChips: number;
      monetary: number;
    };
    tournaments: {
      display: number;
      monetary: number;
    };
  };
}

/**
 * 会計開始前のプレビュー情報を取得
 */
export const getBillPreviewTotals = onCall(async (request) => {
  const config = await getStoreConfig();
  const chipRate = config.billing?.sideGameChipRate ?? DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE;
  // 認証チェック（任意 - 必要に応じて有効化）
  // if (!request.auth) {
  //   throw new HttpsError('unauthenticated', '認証が必要です');
  // }

  const db = getFirestore();

  try {
    // 入力データの検証
    const validatedData = GetBillPreviewTotalsSchema.parse(request.data);
    const { billId } = validatedData;

    // 親ドキュメントを取得
    const billRef = db.collection('bills').doc(billId);
    const billDoc = await billRef.get();

    if (!billDoc.exists) {
      throw new HttpsError('not-found', `請求書 ${billId} が見つかりません`);
    }

    const billData = billDoc.data()!;
    const businessDate = billData.businessDate as string | null | undefined;

    // サブコレクションからカテゴリ別金額を計算

    // 1. /bills/{billId}/extras
    const extrasSnapshot = await billRef.collection('extras').get();
    let extraCostMonetary = 0;
    for (const doc of extrasSnapshot.docs) {
      const data = doc.data();
      const amountIncl = (data.amountIncl as number | undefined) ?? 0;
      extraCostMonetary += amountIncl;
    }

    // 2. /bills/{billId}/items
    const itemsSnapshot = await billRef.collection('items').get();
    let itemsMonetary = 0;
    for (const doc of itemsSnapshot.docs) {
      const data = doc.data();
      // voided: true のアイテムは算出対象外
      if (data.voided === true) {
        continue;
      }
      // totalPriceIncl があればそれを使い、なければ price * quantity で計算
      if (data.totalPriceIncl !== undefined) {
        itemsMonetary += (data.totalPriceIncl as number) ?? 0;
      } else {
        const price = (data.unitPriceIncl as number | undefined) ?? 0;
        const quantity = (data.quantity as number | undefined) ?? 0;
        itemsMonetary += price * quantity;
      }
    }

    // 3. /bills/{billId}/sideGameChips (action == 'purchase' のみ)
    const sideGameChipsSnapshot = await billRef
      .collection('sideGameChips')
      .where('action', '==', 'purchase')
      .get();
    let sideGameChipMonetary = 0;
    let sideGameChipDisplayChips = 0;
    for (const doc of sideGameChipsSnapshot.docs) {
      const data = doc.data();
      const amountIncl = (data.amountIncl as number | undefined) ?? 0;
      sideGameChipMonetary += amountIncl;

      if (data.chipCount !== undefined) {
        sideGameChipDisplayChips += (data.chipCount as number) ?? 0;
      } else {
        sideGameChipDisplayChips += Math.round(amountIncl / chipRate);
      }
    }

    // 4. /bills/{billId}/tournaments
    const tournamentsSnapshot = await billRef.collection('tournaments').get();
    let tournamentsMonetary = 0;
    for (const doc of tournamentsSnapshot.docs) {
      const data = doc.data();
      const entryFeeIncl = (data.entryFeeIncl as number | undefined) ?? 0;
      const entryCount = (data.entryCount as number | undefined) ?? 0;
      const reentryFeeIncl = (data.reentryFeeIncl as number | undefined) ?? 0;
      const reentryCount = (data.reentryCount as number | undefined) ?? 0;
      const addonFeeIncl = (data.addonFeeIncl as number | undefined) ?? 0;
      const addonCount = (data.addonCount as number | undefined) ?? 0;

      tournamentsMonetary +=
        entryFeeIncl * entryCount +
        reentryFeeIncl * reentryCount +
        addonFeeIncl * addonCount;
    }

    // grandTotal は各カテゴリの monetary の合計
    const grandTotal =
      extraCostMonetary + itemsMonetary + sideGameChipMonetary + tournamentsMonetary;

    const response: GetBillPreviewTotalsResponse = {
      billId,
      businessDate: businessDate ?? null,
      grandTotal,
      categories: {
        extraCost: {
          display: extraCostMonetary,
          monetary: extraCostMonetary,
        },
        items: {
          display: itemsMonetary,
          monetary: itemsMonetary,
        },
        sideGameChip: {
          displayChips: sideGameChipDisplayChips,
          monetary: sideGameChipMonetary,
        },
        tournaments: {
          display: tournamentsMonetary,
          monetary: tournamentsMonetary,
        },
      },
    };

    logOpsSuccess({
      message: "getBillPreviewTotals 成功",
      functionEntry: "getBillPreviewTotals",
      context: { billId, businessDate },
    });

    return response;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', `入力データが不正です: ${error.message}`);
    }
    const billHint = GetBillPreviewTotalsSchema.safeParse(request.data);
    logOpsError({
      message: 'getBillPreviewTotals failed',
      functionEntry: 'getBillPreviewTotals',
      operation: 'previewTotalsCatch',
      cause: error,
      sourceProductHint: 'firestore',
      context: {
        billId: billHint.success ? billHint.data.billId : undefined,
      },
    });
    throw new HttpsError('internal', `プレビュー情報の取得に失敗しました: ${error}`);
  }
});

