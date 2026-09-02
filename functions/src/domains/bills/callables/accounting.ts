import * as admin from 'firebase-admin';
import { z } from 'zod';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { buildDraftAccountingInputUpdate, startAccounting as startAccountingHelper } from '../repos/startAccounting';
import {
  attachCompensationContextToError,
  rollbackAccountingStartIfOwned,
  shouldRollbackAccountingStartAfterCommitFailure,
} from '../repos/rollbackAccountingStartIfOwned';
import { ACCOUNTING_START_REQUEST_CANCELLED } from '../repos/accountingStartIdempotency';
import * as crypto from 'crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { validatePointConfigFromStoreConfig } from '../../../shared/config/validatePointConfig';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import { assertUserNotMigrated } from '../../user/helpers/assertUserNotMigrated';
import { ALL_BALANCE_IDS } from '../../user/types/pointIds';
import { readBalanceOrZeroIfMissing } from '../../user/helpers/userBalances';
import { loadBillCategoryAmounts, assertPaymentTotalMatchesCategoryTotal } from '../services/billCategoryAmounts';
import { resolveA7AccountingPayment } from '../services/resolveA7AccountingPayment';
import { commitA7AccountingPayment } from '../services/commitA7AccountingPayment';
import type { PaymentMethodValue } from '../services/paymentMethodsInference';
import { isCarryoverUnsettledBillFromCloseSummary } from '../services/carryoverUnsettled';

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

// Zodスキーマで入力データを検証
const StartAccountingSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
  idempotencyKey: z.string().min(1, 'idempotencyKeyは必須です').optional(),
  clientNonce: z.string().min(1, 'clientNonceは必須です').optional(),
  accountingMode: z.enum(['auto', 'custom']).optional(),
  selectedBaseMethod: z
    .enum(['cash', 'credit_card', 'electronic_money'])
    .optional(),
  paymentMethodsByAmount: z.record(z.number().nonnegative()).optional(),
  paymentMethodsByCategory: z
    .record(
      z.union([
        PaymentMethodEnum,
        z.array(
          z.object({
            method: PaymentMethodEnum,
            amount: z.number().nonnegative(),
          }),
        ),
      ]),
    )
    .optional(),
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
      accountingMode: inputAccountingMode,
      selectedBaseMethod,
    } = validatedData;

    // idempotencyKey を生成（提供されない場合は自動生成）
    const idempotencyKey = providedIdempotencyKey || 
      `${billId}:startAccounting:${clientNonce || crypto.randomUUID()}`;

    const storeConfig = await getStoreConfig();

    // 会計開始前に bill と party.userId を確認し、移行済みユーザーを拒否
    const billRef = db.collection('bills').doc(billId);
    const billDoc = await billRef.get();
    if (!billDoc.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billDoc.data()!;
    const userId = billData.party?.userId as string | undefined;
    if (userId) {
      const userSnap = await db.collection('users').doc(userId).get();
      if (userSnap.exists) {
        assertUserNotMigrated(userSnap.data()!);
      }
    }

    const categoryAmounts = await loadBillCategoryAmounts(db, billId);
    const totalExpected = Object.values(categoryAmounts).reduce((sum, value) => sum + value, 0);

    // 0円会計の場合は支払い方法チェックをスキップし、検証済みとして settling へ遷移
    if (totalExpected === 0) {
      const startAccountingResult = await startAccountingHelper({
        billId,
        idempotencyKey,
        accountingStartedBy: adminId,
      });

      const metaUpdate: Record<string, unknown> = {
        'meta.paymentMethodsByAmount': {},
        'meta.paymentMethodsByCategory': {},
        'meta.paymentMethodDetails': {},
      };
      await billRef.update({
        ...metaUpdate,
        ...buildDraftAccountingInputUpdate({
          paymentMethodsByAmount: {},
          paymentMethodsByCategory: {},
        }),
        'draftAccountingInput.paymentMethodDetails': {},
      });

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

    // A-7: 支払確定済み（meta/draft に ByAmount あり）の再送は、残高再計算・再減算しない
    // ※ settling への遷移前に判定し、支払検証失敗で settling が残らないようにする
    const existingByAmount =
      ((billData.meta as Record<string, unknown> | undefined)
        ?.paymentMethodsByAmount as Record<string, number> | undefined) ??
      ((billData.draftAccountingInput as Record<string, unknown> | undefined)
        ?.paymentMethodsByAmount as Record<string, number> | undefined);
    if (existingByAmount && Object.keys(existingByAmount).length > 0) {
      // 支払済み再送: helper の冪等経路で status/ops を確定（settling 済みなら reuse）
      const startAccountingResult = await startAccountingHelper({
        billId,
        idempotencyKey,
        accountingStartedBy: adminId,
      });
      logOpsSuccess({
        message: "startAccounting 成功（支払済み・冪等）",
        functionEntry: "startAccounting",
        operation: "startAccountingCallable",
        context: {
          billId,
          adminId,
          zeroYen: false,
          status: startAccountingResult.status,
          paymentReused: true,
        },
      });
      return {
        success: true,
        message: '会計を開始しました',
        billId,
        status: startAccountingResult.status,
        ops: startAccountingResult.ops,
        diagnostics: {
          ...(startAccountingResult.diagnostics ?? {}),
          reused: true,
        },
      };
    }

    const validatedPointConfig = validatePointConfigFromStoreConfig(storeConfig);

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

    const accountingMode =
      inputAccountingMode ??
      (paymentMethodsByCategory && Object.keys(paymentMethodsByCategory).length > 0
        ? 'custom'
        : 'auto');

    // 支払条件を先に検証し、成功時のみ settling へ遷移する（補償ロールバック方式は使わない）
    const resolved = resolveA7AccountingPayment({
      mode: accountingMode,
      categoryAmounts,
      balances,
      validatedConfig: validatedPointConfig,
      clientPaymentMethodsByCategory:
        paymentMethodsByCategory as Record<string, PaymentMethodValue> | undefined,
      clientPaymentMethodsByAmount: inputPaymentMethodsByAmount,
      selectedBaseMethod,
    });

    assertPaymentTotalMatchesCategoryTotal({
      categoryAmounts,
      paymentMethodsByAmount: resolved.paymentMethodsByAmount,
      billId,
    });

    const startAccountingResult = await startAccountingHelper({
      billId,
      idempotencyKey,
      accountingStartedBy: adminId,
    });

    try {
      await commitA7AccountingPayment({
        billId,
        userId,
        resolved,
      });
    } catch (commitError: unknown) {
      // 状態ベース: commit が throw したら常に補償を試みる（成功後はここへ来ない）
      if (shouldRollbackAccountingStartAfterCommitFailure(commitError)) {
        let compensationSucceeded = false;
        let compensationOutcome = 'failed';
        let compensationReason: string | undefined;
        let restoredStatus: string | undefined;
        let currentStatus: string | null | undefined;
        let compensationErrorMessage: string | undefined;
        let paymentCommitted: boolean | undefined;
        let orphanPointLogDetected: boolean | undefined;
        let activeKeyMatched: boolean | undefined;
        let idempotencyStatus: string | null | undefined;

        try {
          const compensation = await rollbackAccountingStartIfOwned({
            billId,
            idempotencyKey,
            accountingStartedBy: adminId,
            accountingStartedAtIso: startAccountingResult.ops.accountingStartedAt,
            previousStatus: startAccountingResult.previousStatus,
            userId,
          });
          compensationOutcome = compensation.outcome;
          compensationReason = compensation.reason;
          restoredStatus = compensation.restoredStatus;
          currentStatus = compensation.currentStatus ?? null;
          paymentCommitted = compensation.paymentCommitted;
          orphanPointLogDetected = compensation.orphanPointLogDetected;
          activeKeyMatched = compensation.activeKeyMatched;
          idempotencyStatus = compensation.idempotencyStatus ?? null;
          compensationSucceeded =
            compensation.outcome === 'rolled_back' ||
            compensation.reason === 'already_pre_start';

          if (compensation.outcome === 'rolled_back') {
            logOpsSuccess({
              message: 'startAccounting commit失敗後の settling 補償成功',
              functionEntry: 'startAccounting',
              operation: 'rollbackAccountingStartAfterCommitFail',
              context: {
                billId,
                idempotencyKey,
                previousStatus: startAccountingResult.previousStatus,
                restoredStatus: compensation.restoredStatus,
                accountingStartedAt: startAccountingResult.ops.accountingStartedAt,
                paymentCommitted: compensation.paymentCommitted ?? false,
                orphanPointLogDetected: compensation.orphanPointLogDetected ?? false,
                activeKeyMatched: compensation.activeKeyMatched ?? false,
                idempotencyStatus: compensation.idempotencyStatus ?? null,
                phase: 'commitA7AccountingPayment',
              },
            });
          }
        } catch (compensationError: unknown) {
          compensationSucceeded = false;
          compensationOutcome = 'failed';
          compensationErrorMessage =
            compensationError instanceof Error
              ? compensationError.message
              : String(compensationError);
        }

        throw attachCompensationContextToError(commitError, {
          attempted: true,
          succeeded: compensationSucceeded,
          outcome: compensationOutcome,
          reason: compensationReason,
          restoredStatus,
          currentStatus,
          compensationError: compensationErrorMessage,
          paymentCommitted,
          orphanPointLogDetected,
          activeKeyMatched,
          idempotencyStatus,
        });
      }
      throw commitError;
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
      const fromError =
        error.context && typeof error.context === 'object' && !Array.isArray(error.context)
          ? (error.context as Record<string, unknown>)
          : {};
      // request 由来の billId を優先し、外部 context で上書きさせない
      const billIdForLog =
        (request.data as { billId?: string } | undefined)?.billId ?? fromError.billId;
      // cancelled 同一 key 再送は業務上想定可能な拒否。過剰な logOpsError を避ける。
      if (error.errorKey !== ACCOUNTING_START_REQUEST_CANCELLED) {
        logOpsError({
          message: 'startAccounting 業務エラー',
          functionEntry: 'startAccounting',
          operation: 'startAccountingCallableCustom',
          cause: error,
          context: {
            ...fromError,
            billId: billIdForLog,
            errorKey: error.errorKey,
          },
        });
      }
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

    // activeStays / visitLogs の事後更新
    // C1-B（閉店持ち越し）: 過去来店は閉店済み。現在再来店中の visit/activeStay を壊さない。
    const userId = billData.party?.userId;
    const isCarryoverSettle = isCarryoverUnsettledBillFromCloseSummary(
      billData.closeSummary,
    );
    if (userId) {
      try {
        const activeStayRef = db.collection('activeStays').doc(userId);
        const activeStayDoc = await activeStayRef.get();

        if (isCarryoverSettle) {
          // この carryover bill を指す stale activeStay だけ閉じる。
          // 現在来店中 bill の activeStay / 未完了 visitLog は触らない。
          if (activeStayDoc.exists) {
            const activeStayData = activeStayDoc.data()!;
            if (activeStayData.billId === billId) {
              await activeStayRef.update({
                isActive: false,
              });
            }
          }
        } else {
          if (activeStayDoc.exists) {
            // billId が一致することを確認（念のため）
            const activeStayData = activeStayDoc.data()!;
            if (activeStayData.billId === billId) {
              await activeStayRef.update({
                isActive: false,
              });
            } else {
              logOpsError({
                message:
                  'completeAccountingV2: activeStays の billId が伝票と一致しません（isActive は変更していません）',
                functionEntry: 'completeAccountingV2',
                operation: 'completeAccountingV2ActiveStayBillIdMismatch',
                cause: new Error('active_stays_bill_id_mismatch'),
                context: {
                  billId,
                  userId,
                  actualBillIdOnActiveStay: activeStayData.billId ?? null,
                },
              });
            }
          } else {
            logOpsError({
              message:
                'completeAccountingV2: activeStays ドキュメントが存在しません（会計は settled 済み）',
              functionEntry: 'completeAccountingV2',
              operation: 'completeAccountingV2ActiveStayNotFound',
              cause: new Error('active_stays_not_found_for_party_user'),
              context: { billId, userId },
            });
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
        }
      } catch (activeStayError: unknown) {
        const err = activeStayError as { message?: string; code?: string };
        logOpsError({
          message:
            'completeAccountingV2: 会計は settled 済みですが activeStays / visitLogs の事後更新に失敗しました',
          functionEntry: 'completeAccountingV2',
          operation: 'completeAccountingV2PostSettleStayVisitLogFailed',
          errorKey: 'ACCOUNTING_POST_SETTLE_STAY_VISIT_LOG_UPDATE_FAILED',
          cause: activeStayError,
          context: {
            billId,
            userId,
            adminId,
            isCarryoverSettle,
            firestoreCode: typeof err.code === 'string' ? err.code : undefined,
            errorMessage: typeof err.message === 'string' ? err.message : undefined,
          },
        });
      }
    } else {
      logOpsError({
        message:
          'completeAccountingV2: settled 済みですが bill に party.userId がなく、activeStay / visitLog 更新をスキップしました',
        functionEntry: 'completeAccountingV2',
        operation: 'completeAccountingV2PartyUserIdMissingAtSettle',
        errorKey: 'ACCOUNTING_SETTLE_PARTY_USER_ID_MISSING',
        context: { billId, adminId },
        cause: new Error('party_user_id_missing'),
      });
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
      message: '会計完了エラー:',
      functionEntry: 'completeAccountingV2',
      operation: 'completeAccountingV2GenericCatch',
      cause: error,
    });
    throw new HttpsError('internal', '会計完了に失敗しました', error.message);
  }
});
