import * as admin from 'firebase-admin';
import { z } from 'zod';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { buildDraftAccountingInputUpdate, startAccounting as startAccountingHelper } from '../repos/startAccounting';
import * as crypto from 'crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE } from '../../../shared/config/defaults';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';

// 支払い方法の表示名を取得するヘルパー関数
function _getPaymentMethodDisplayName(paymentMethod: string): string {
  switch (paymentMethod) {
    case 'pointA':
      return 'ポイントA';
    case 'pointB':
      return 'ポイントB';
    case 'sideGameChip':
      return 'サイドゲームチップ';
    default:
      return paymentMethod;
  }
}

function normalizePaymentMethods(options: {
  paymentMethodsByAmount?: Record<string, number>;
  paymentMethodsByCategory?: Record<string, any>;
  categoryAmounts: Record<string, number>;
  sideGameChipExchangeRate?: number;
}): Record<string, number> {
  const { paymentMethodsByAmount, paymentMethodsByCategory, categoryAmounts, sideGameChipExchangeRate = DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE } = options;

  if (paymentMethodsByAmount && Object.keys(paymentMethodsByAmount).length > 0) {
    const normalized: Record<string, number> = {};
    for (const [method, amount] of Object.entries(paymentMethodsByAmount)) {
      if (amount > 0) {
        normalized[method] = Math.floor(amount);
      }
    }
    return normalized;
  }

  if (paymentMethodsByCategory && Object.keys(paymentMethodsByCategory).length > 0) {
    const normalized: Record<string, number> = {};

    for (const [category, paymentValue] of Object.entries(paymentMethodsByCategory)) {
      const categoryAmount = categoryAmounts[category] || 0;
      if (categoryAmount <= 0) continue;

      if (typeof paymentValue === 'string') {
        if (paymentValue === 'pointA' || paymentValue === 'pointB') {
          normalized[paymentValue] = (normalized[paymentValue] || 0) + categoryAmount;
        } else if (paymentValue === 'sideGameChip') {
          // categoryAmountは既に円換算値なので、そのまま使用（チップ枚数に変換しない）
          normalized[paymentValue] = (normalized[paymentValue] || 0) + categoryAmount;
        }
      } else if (Array.isArray(paymentValue)) {
        for (const split of paymentValue) {
          if (!split || typeof split !== 'object') continue;
          const method = split.method;
          const amount = Number(split.amount) || 0;
          if (amount <= 0) continue;

          if (method === 'pointA' || method === 'pointB') {
            normalized[method] = (normalized[method] || 0) + amount;
          } else if (method === 'sideGameChip') {
            // split.amountはチップ枚数なので、円換算値に変換して格納
            const yenAmount = Math.floor(amount * sideGameChipExchangeRate);
            normalized[method] = (normalized[method] || 0) + yenAmount;
          }
        }
      }
    }

    return normalized;
  }

  return {};
}

// Zodスキーマで入力データを検証
const StartAccountingSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
  idempotencyKey: z.string().min(1, 'idempotencyKeyは必須です').optional(), // 任意（提供されない場合は自動生成）
  clientNonce: z.string().min(1, 'clientNonceは必須です').optional(), // 任意（idempotencyKey生成用）
  paymentMethodsByAmount: z.record(z.number().nonnegative()).optional(),
  paymentMethodsByCategory: z.record(
    z.union([
      z.enum(['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip']),
      z.array(z.object({
        method: z.enum(['cash', 'credit_card', 'electronic_money', 'pointA', 'pointB', 'sideGameChip']),
        amount: z.number().nonnegative(),
      })),
    ])
  ).optional(),
});

const CompleteAccountingSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
});

/**
 * 会計開始処理
 * 管理者権限またはaccountingオプションを持つデバイスのみが実行可能
 */
export const startAccounting = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;
  const db = getFirestore();
  const storeConfig = await getStoreConfig();
  const chipRate = storeConfig.billing?.sideGameChipRate ?? DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE;

  try {
    // デバイス権限の確認（role: admin または options.accounting: true）
    const device = await getCallerDeviceByUid(adminId);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'accounting');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', '会計管理の権限がありません');
    }

    // 入力データの検証
    const validatedData = StartAccountingSchema.parse(request.data);
    const {
      billId,
      idempotencyKey: providedIdempotencyKey,
      clientNonce,
      paymentMethodsByAmount: inputPaymentMethodsByAmount,
      paymentMethodsByCategory,
    } = validatedData;

    // idempotencyKey を生成（提供されない場合は自動生成）
    const idempotencyKey = providedIdempotencyKey || 
      `${billId}:startAccounting:${clientNonce || crypto.randomUUID()}`;

    // startAccounting ヘルパAPIを呼び出して bills のステータスとops更新
    const startAccountingResult = await startAccountingHelper({
      billId,
      idempotencyKey,
      accountingStartedBy: adminId,
    });

    // 既存の支払方法処理とユーザー残高差し引き処理を維持（P1-06のスコープ外）
    // bills から情報を取得（todaysBills ではなく）
    const billRef = db.collection('bills').doc(billId);
    const billDoc = await billRef.get();
    if (!billDoc.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billDoc.data()!;
    const userId = billData.party?.userId;

    // カテゴリごとの金額を計算（bills のサブコレクションから取得）
    const categoryAmounts: Record<string, number> = {};

    // extraCost（入店料）- /bills/{billId}/extras から取得
    const extrasSnapshot = await billRef.collection('extras').get();
    categoryAmounts['extraCost'] = extrasSnapshot.docs.reduce((sum, doc) => {
      const data = doc.data();
      return sum + (data.amountIncl || 0);
    }, 0);

    // tournaments（トーナメント参加費）- /bills/{billId}/tournaments から取得
    const tournamentsSnapshot = await billRef.collection('tournaments').get();
    categoryAmounts['tournaments'] = tournamentsSnapshot.docs.reduce((sum, doc) => {
      const data = doc.data();
      // entryFeeIncl, reentryFeeIncl, addonFeeIncl を回数と掛け算して合計
      const entryFeeIncl = (data.entryFeeIncl as number | undefined) ?? 0;
      const entryCount = (data.entryCount as number | undefined) ?? 0;
      const reentryFeeIncl = (data.reentryFeeIncl as number | undefined) ?? 0;
      const reentryCount = (data.reentryCount as number | undefined) ?? 0;
      const addonFeeIncl = (data.addonFeeIncl as number | undefined) ?? 0;
      const addonCount = (data.addonCount as number | undefined) ?? 0;
      
      return sum + 
        entryFeeIncl * entryCount +
        reentryFeeIncl * reentryCount +
        addonFeeIncl * addonCount;
    }, 0);

    // items（フード・ドリンク）- /bills/{billId}/items から取得
    const itemsSnapshot = await billRef.collection('items').get();
    categoryAmounts['items'] = itemsSnapshot.docs
      .filter((doc) => {
        const data = doc.data();
        // voided: true のアイテムは算出対象外
        return data.voided !== true;
      })
      .reduce((sum, doc) => {
        const data = doc.data();
        return sum + ((data.unitPriceIncl || 0) * (data.quantity || 0));
      }, 0);

    // sideGameChip（サイドゲームチップ、action='purchase'のみ）- /bills/{billId}/sideGameChips から取得
    const sideGameChipsSnapshot = await billRef.collection('sideGameChips')
      .where('action', '==', 'purchase')
      .get();
    categoryAmounts['sideGameChip'] = sideGameChipsSnapshot.docs.reduce((sum, doc) => {
      const data = doc.data();
      return sum + (data.amountIncl || 0);
    }, 0);

    const totalExpected = Object.values(categoryAmounts).reduce((sum, value) => sum + value, 0);
    
    // 0円会計の場合は支払い方法チェックをスキップ
    if (totalExpected === 0) {
      // 0円会計の場合、paymentMethodsByAmount が空でも許可
      // meta.paymentMethodsByAmount は空のMapとして保存
      const metaUpdate: Record<string, any> = {};
      if (inputPaymentMethodsByAmount && Object.keys(inputPaymentMethodsByAmount).length > 0) {
        metaUpdate['meta.paymentMethodsByAmount'] = inputPaymentMethodsByAmount;
      } else {
        // 0円の場合、空のMapを保存
        metaUpdate['meta.paymentMethodsByAmount'] = {};
      }
      
      if (paymentMethodsByCategory && Object.keys(paymentMethodsByCategory).length > 0) {
        metaUpdate['meta.paymentMethodsByCategory'] = paymentMethodsByCategory;
      }
      
      if (Object.keys(metaUpdate).length > 0) {
        await billRef.update({
          ...metaUpdate,
          ...buildDraftAccountingInputUpdate({
            paymentMethodsByAmount: metaUpdate['meta.paymentMethodsByAmount'] ?? {},
            paymentMethodsByCategory: metaUpdate['meta.paymentMethodsByCategory'] ?? null,
          }),
        });
      }

      logOpsSuccess({
        message: "startAccounting 成功（0円会計）",
        functionEntry: "startAccounting",
        operation: "startAccountingCallable",
        context: { billId, adminId, zeroYen: true, status: startAccountingResult.status },
      });

      return { 
        success: true, 
        message: '会計を開始しました（0円会計）',
        billId: billId,
        status: startAccountingResult.status,
        ops: startAccountingResult.ops,
        diagnostics: startAccountingResult.diagnostics,
      };
    }

    const normalizedPaymentMethods = normalizePaymentMethods({
      paymentMethodsByAmount: inputPaymentMethodsByAmount,
      paymentMethodsByCategory,
      categoryAmounts,
      sideGameChipExchangeRate: chipRate,
    });

    if (Object.keys(normalizedPaymentMethods).length === 0) {
      throw new HttpsError('invalid-argument', '支払い方法が指定されていません');
    }

    const totalPaid = Object.entries(normalizedPaymentMethods).reduce((sum, [method, amount]) => {
      if (amount <= 0) return sum;
      // normalizedPaymentMethodsの値は全て円換算値で統一されているため、そのまま加算
      // sideGameChipも円換算値として格納されているため、特別な処理は不要
      return sum + amount;
    }, 0);

    if (Math.abs(totalPaid - totalExpected) > 1) {
      throw new FunctionCustomError({
        errorKey: 'ACCOUNTING_PAYMENT_TOTAL_MISMATCH',
        message: `支払い総額が一致しません。入力合計: ${totalPaid}円, 伝票合計: ${totalExpected}円`,
        context: { billId, totalPaid, totalExpected },
      });
    }

    // ポイント/サイドゲームチップで支払う場合の残高確認と差し引き処理
    if (userId) {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new HttpsError('not-found', 'ユーザー情報が見つかりません');
      }

      const userData = userDoc.data()!;
      const balanceDeductions: Record<string, number> = {
        pointA: Math.floor(normalizedPaymentMethods['pointA'] || 0),
        pointB: Math.floor(normalizedPaymentMethods['pointB'] || 0),
        // 円換算値からチップ枚数に変換
        sideGameChip: Math.floor((normalizedPaymentMethods['sideGameChip'] || 0) / chipRate),
      };

      for (const [fieldName, amount] of Object.entries(balanceDeductions)) {
        if (amount > 0) {
          const currentBalance = userData[fieldName] || 0;
          if (currentBalance < amount) {
            const unit = fieldName === 'sideGameChip' ? '枚' : '円';
            throw new FunctionCustomError({
              errorKey: 'ACCOUNTING_INSUFFICIENT_BALANCE',
              message: `${_getPaymentMethodDisplayName(fieldName)}の残高が不足しています。現在の残高: ${currentBalance}${unit}、必要な金額: ${amount}${unit}`,
              context: { billId, userId, fieldName, currentBalance, required: amount },
            });
          }
        }
      }

      const updates: Record<string, any> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      for (const [fieldName, amount] of Object.entries(balanceDeductions)) {
        if (amount > 0) {
          updates[fieldName] = admin.firestore.FieldValue.increment(-amount);
        }
      }
      if (Object.keys(updates).length > 1) {
        await userRef.update(updates);
      }
    }

    // 支払方法情報は bills には保存しない（P1-06のスコープ外、将来の recordPayment ヘルパに移行予定）
    // ただし、P1-10 の暫定方針として meta.paymentMethodsByCategory または meta.paymentMethodsByAmount に保存する
    // startAccounting ヘルパAPIで既に status='settling' と ops.accountingStartedAt/By が設定されている
    
    // P1-10 暫定: meta.paymentMethodsByCategory または meta.paymentMethodsByAmount に保存
    const metaUpdate: Record<string, any> = {};
    
    if (paymentMethodsByCategory && Object.keys(paymentMethodsByCategory).length > 0) {
      metaUpdate['meta.paymentMethodsByCategory'] = paymentMethodsByCategory;
    }
    
    // paymentMethodsByAmount が存在する場合は、meta.paymentMethodsByAmount として保存
    // Settlement Trigger で優先的に使用される
    if (inputPaymentMethodsByAmount && Object.keys(inputPaymentMethodsByAmount).length > 0) {
      metaUpdate['meta.paymentMethodsByAmount'] = inputPaymentMethodsByAmount;
    }
    
    if (Object.keys(metaUpdate).length > 0) {
      await billRef.update({
        ...metaUpdate,
        ...buildDraftAccountingInputUpdate({
          paymentMethodsByAmount: inputPaymentMethodsByAmount ?? null,
          paymentMethodsByCategory: paymentMethodsByCategory ?? null,
        }),
        // updatedAt は既存ポリシーに従い、冪等リプレイ時は更新しない（startAccountingHelper 側で制御）
      });
    }

    logOpsSuccess({
      message: "startAccounting 成功",
      functionEntry: "startAccounting",
      operation: "startAccountingCallable",
      context: { billId, adminId, zeroYen: false, status: startAccountingResult.status },
    });

    return { 
      success: true, 
      message: '会計を開始しました',
      billId: billId,
      status: startAccountingResult.status,
      ops: startAccountingResult.ops,
      diagnostics: startAccountingResult.diagnostics,
    };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof FunctionCustomError) {
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    logOpsError({
      message: '会計開始エラー:',
      functionEntry: 'startAccounting',
      operation: 'startAccountingCallableCatch',
      cause: error,
    });
    throw new HttpsError('internal', '会計開始に失敗しました', error.message);
  }
});

/**
 * 会計完了処理（legacy）
 * 
 * 現時点では旧スキーマの todaysBills を前提とした実装のまま残している。
 * - startAccounting は新しいヘルパAPI（/bills ベース）の実装へ移行済み
 * - completeAccounting は P1-06 のスコープ外のため、挙動は変更しない
 * 
 * 将来のフェーズ（例: P1-0x）で、bills + accountingHistory を正とする新実装へ差し替える予定。
 * 
 * 管理者権限またはaccountingオプションを持つデバイスのみが実行可能
 */
export const completeAccounting = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;
  const db = getFirestore();

  try {
    // デバイス権限の確認（role: admin または options.accounting: true）
    const device = await getCallerDeviceByUid(adminId);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'accounting');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', '会計管理の権限がありません');
    }

    // 入力データの検証
    const validatedData = CompleteAccountingSchema.parse(request.data);
    const { billId } = validatedData;

    const billRef = db.collection('todaysBills').doc(billId);

    // 請求書が存在するか確認
    const billDoc = await billRef.get();
    if (!billDoc.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billDoc.data()!;
    const currentStatus = billData.status || 'open';

    // 会計開始していない場合はエラー
    if (!billData.accountingStartedAt) {
      throw new FunctionCustomError({
        errorKey: 'ACCOUNTING_NOT_STARTED',
        message: 'この請求書はまだ会計開始されていません',
        context: { billId, legacy: true },
      });
    }

    // 既に会計済みの場合はエラー
    if (currentStatus === 'settled') {
      throw new FunctionCustomError({
        errorKey: 'ACCOUNTING_ALREADY_SETTLED',
        message: 'この請求書は既に会計済みです',
        context: { billId, legacy: true, currentStatus },
      });
    }

    // 会計履歴を作成
    const accountingHistoryRef = db.collection('accountingHistory').doc();
    await accountingHistoryRef.set({
      billId: billId,
      pokerName: billData.pokerName,
      totalPrice: billData.totalPrice,
      accountingStartedAt: billData.accountingStartedAt,
      accountingCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
      accountingStartedBy: billData.accountingStartedBy,
      accountingCompletedBy: adminId,
      paymentMethodsByAmount: billData.paymentMethodsByAmount || {},
      // カテゴリ別の詳細データも保存
      extraCost: billData.extraCost || [],
      tournaments: billData.tournaments || {},
      items: billData.items || [],
      sideGameChip: billData.sideGameChip || [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 会計完了
    await billRef.update({
      status: 'settled',
      settledAt: admin.firestore.FieldValue.serverTimestamp(),
      accountingCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
      accountingCompletedBy: adminId,
      accountingHistoryId: accountingHistoryRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 退店処理（users.isStaying は廃止、activeStays のみ更新）
    const userId = billData.userId;
    if (userId) {
      // activeStays の isActive を false に更新
      const activeStayRef = db.collection('activeStays').doc(userId);
      const activeStayDoc = await activeStayRef.get();
      if (activeStayDoc.exists) {
        const activeStayData = activeStayDoc.data()!;
        if (activeStayData.billId === billId) {
          await activeStayRef.update({
            isActive: false,
          });
        }
      }

      // visitLogsの最新の未完了ログを更新
      const userRef = db.collection('users').doc(userId);
      const visitLogsSnapshot = await userRef.collection('visitLogs')
        .where('checkOutAt', '==', null)
        .orderBy('checkInAt', 'desc')
        .limit(1)
        .get();

      if (!visitLogsSnapshot.empty) {
        const visitLogDoc = visitLogsSnapshot.docs[0];
        const checkInAt = visitLogDoc.data().checkInAt;
        const checkOutAt = admin.firestore.Timestamp.now();
        const stayMinutes = checkInAt 
          ? Math.floor((checkOutAt.toMillis() - checkInAt.toMillis()) / 60000)
          : null;

        await visitLogDoc.ref.update({
          checkOutAt: admin.firestore.FieldValue.serverTimestamp(),
          stayMinutes: stayMinutes,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    logOpsSuccess({
      message: "completeAccounting 成功",
      functionEntry: "completeAccounting",
      operation: "completeAccountingCallable",
      context: { billId, adminId, accountingHistoryId: accountingHistoryRef.id },
    });

    return { 
      success: true, 
      message: '会計を完了しました',
      billId: billId,
      status: 'settled',
      accountingHistoryId: accountingHistoryRef.id
    };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: '会計完了エラー:',
        functionEntry: 'completeAccounting',
        operation: 'completeAccountingCatch',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    logOpsError({
      message: '会計完了エラー:',
      functionEntry: 'completeAccounting',
      operation: 'completeAccountingGenericCatch',
      cause: error,
    });
    throw new HttpsError('internal', '会計完了に失敗しました', error.message);
  }
});

/**
 * 会計完了処理（新世界版）
 * 
 * bills コレクションを参照し、status を 'settled' に更新して Settlement Trigger を起動する
 * legacy completeAccounting（todaysBills参照）は残置
 * 
 * 管理者権限を持つユーザーのみが実行可能
 */
export const completeAccountingV2 = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;
  const db = getFirestore();

  try {
    // デバイス権限の確認（role: adminのみ）
    const deviceQuery = await db.collection('devices')
      .where('uid', '==', adminId)
      .where('role', '==', 'admin')
      .limit(1)
      .get();

    if (deviceQuery.empty) {
      throw new HttpsError('permission-denied', '管理者権限がありません');
    }

    // 入力データの検証
    const validatedData = CompleteAccountingSchema.parse(request.data);
    const { billId } = validatedData;

    const billRef = db.collection('bills').doc(billId);

    // 請求書が存在するか確認
    const billDoc = await billRef.get();
    if (!billDoc.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billDoc.data()!;
    const currentStatus = billData.status || 'open';

    // ガード: ops.accountingStartedAt が無いなら failed-precondition
    if (!billData.ops?.accountingStartedAt) {
      throw new FunctionCustomError({
        errorKey: 'ACCOUNTING_NOT_STARTED',
        message: 'この請求書はまだ会計開始されていません',
        context: { billId },
      });
    }

    // 既に会計済みの場合はエラー
    if (currentStatus === 'settled') {
      throw new FunctionCustomError({
        errorKey: 'ACCOUNTING_ALREADY_SETTLED',
        message: 'この請求書は既に会計済みです',
        context: { billId, currentStatus },
      });
    }

    // status を 'settled' に更新（Settlement Trigger を起動）
    // closedAt は trigger 側で設定するため、callable 側では設定しない（重複/競合回避）
    await billRef.update({
      status: 'settled',
      'ops.accountingCompletedAt': admin.firestore.FieldValue.serverTimestamp(),
      'ops.accountingCompletedBy': adminId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // activeStays の isActive を false に更新
    const userId = billData.party?.userId;
    if (userId) {
      try {
        const activeStayRef = db.collection('activeStays').doc(userId);
        const activeStayDoc = await activeStayRef.get();
        
        if (activeStayDoc.exists) {
          // billId が一致することを確認（念のため）
          const activeStayData = activeStayDoc.data()!;
          if (activeStayData.billId === billId) {
            await activeStayRef.update({
              isActive: false,
            });
          } else {
            console.warn(`activeStays billId mismatch: userId=${userId}, expected=${billId}, actual=${activeStayData.billId}`);
          }
        } else {
          console.warn(`activeStays not found: userId=${userId}, billId=${billId}`);
        }

        // visitLogsの最新の未完了ログを更新（legacy completeAccountingと同様の処理）
        const userRef = db.collection('users').doc(userId);
        const visitLogsSnapshot = await userRef.collection('visitLogs')
          .where('checkOutAt', '==', null)
          .orderBy('checkInAt', 'desc')
          .limit(1)
          .get();

        if (!visitLogsSnapshot.empty) {
          const visitLogDoc = visitLogsSnapshot.docs[0];
          const checkInAt = visitLogDoc.data().checkInAt;
          const checkOutAt = admin.firestore.Timestamp.now();
          const stayMinutes = checkInAt 
            ? Math.floor((checkOutAt.toMillis() - checkInAt.toMillis()) / 60000)
            : null;

          await visitLogDoc.ref.update({
            checkOutAt: admin.firestore.FieldValue.serverTimestamp(),
            stayMinutes: stayMinutes,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      } catch (activeStayError: any) {
        // activeStays の更新失敗は警告ログのみ（会計完了処理自体は成功とする）
        console.warn('activeStays/visitLogs update failed:', {
          userId,
          billId,
          error: activeStayError.message,
        });
      }
    } else {
      console.warn(`party.userId not found in bill: billId=${billId}`);
    }

    logOpsSuccess({
      message: "completeAccountingV2 成功",
      functionEntry: "completeAccountingV2",
      operation: "completeAccountingV2Callable",
      context: { billId, adminId, userId: userId ?? null },
    });

    return { success: true, message: '会計を完了しました', billId };
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: '会計完了エラー:',
        functionEntry: 'completeAccountingV2',
        operation: 'completeAccountingV2Catch',
        cause: error,
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    logOpsError({
      message: '会計完了エラー:',
      functionEntry: 'completeAccountingV2',
      operation: 'completeAccountingV2GenericCatch',
      cause: error,
    });
    throw new HttpsError('internal', '会計完了に失敗しました', error.message);
  }
});
