/**
 * depositChip
 *
 * A-7: sideGameChipSettings.enabled ゲート + 残高健全性 + before/after ログ
 * 既存: appendSideGameChip idempotency で replay 時の二重残高更新を防止
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { assertSideGameOperationPermission } from '../lib/sideGameOperationPermission';
import { getActiveBillByUser } from '../../bills/repos/getActiveBillByUser';
import { appendSideGameChip } from '../../bills/repos/appendSideGameChip';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import { assertUserNotMigrated } from '../../user/helpers/assertUserNotMigrated';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { validatePointConfigFromStoreConfig } from '../../../shared/config/validatePointConfig';
import { readBalanceOrZeroIfMissing } from '../../user/helpers/userBalances';
import { SIDE_GAME_CHIP_ID } from '../../user/types/pointIds';
import {
  depositSideGameChipLogId,
  writeSideGameChipBalanceLogInTxWithSnap,
} from '../../user/services/pointLog';

export const depositChip = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;
  const db = getFirestore();
  const { userId, amount, clientNonce } = request.data;
  let billId: string | undefined;

  try {
    await assertSideGameOperationPermission({ callerUid });

    if (!userId || amount === undefined || amount === null || !clientNonce) {
      throw new HttpsError('invalid-argument', 'userId, amount, clientNonce are required');
    }

    if (typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
      throw new HttpsError('invalid-argument', 'amount must be a positive integer (chip quantity)');
    }

    const storeConfig = await getStoreConfig(db);
    const validatedConfig = validatePointConfigFromStoreConfig(storeConfig);
    if (!validatedConfig.sideGameChipSettings.enabled) {
      throw new FunctionCustomError({
        errorKey: 'SIDE_GAME_CHIP_DISABLED',
        message: 'サイドゲームチップ機能は現在無効です',
      });
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new HttpsError('not-found', `User not found: ${userId}`);
    }

    const userData = userDoc.data() as Record<string, unknown>;
    assertUserNotMigrated(userData);
    const currentChip = readBalanceOrZeroIfMissing(userData, SIDE_GAME_CHIP_ID);

    const active = await getActiveBillByUser(userId);
    billId = active.billId;

    const op = 'depositChip';
    const idempotencyKey = `${billId}:${op}:${clientNonce}`;
    const appendResult = await appendSideGameChip({
      billId,
      action: 'deposit',
      chipQty: amount,
      amountIncl: null,
      menuItemId: null,
      name: null,
      idempotencyKey,
    });

    const isReplay = appendResult.diagnostics?.reused === true;
    const chipId = appendResult.chipId;

    // append と残高更新は別段階。append だけ成功して残高 tx が失敗した場合、
    // 同一 clientNonce 再実行で append は reused になるが、残高ログ未作成なら残高を適用する。
    const logRef = userRef
      .collection('sideGameChipLogs')
      .doc(depositSideGameChipLogId(chipId));
    const existingBalanceLog = await logRef.get();
    const balanceAlreadyApplied = existingBalanceLog.exists;

    if (!balanceAlreadyApplied) {
      await db.runTransaction(async (tx) => {
        const freshUser = await tx.get(userRef);
        if (!freshUser.exists) {
          throw new HttpsError('not-found', `User not found: ${userId}`);
        }
        const freshData = freshUser.data() as Record<string, unknown>;
        const balanceBefore = readBalanceOrZeroIfMissing(freshData, SIDE_GAME_CHIP_ID);
        const balanceAfter = balanceBefore + amount;

        const logSnap = await tx.get(logRef);
        if (logSnap.exists) {
          return;
        }

        tx.update(userRef, {
          sideGameChip: balanceAfter,
          updatedAt: FieldValue.serverTimestamp(),
        });

        writeSideGameChipBalanceLogInTxWithSnap({
          tx,
          existingSnap: logSnap,
          ref: logRef,
          relatedId: chipId,
          balanceBefore,
          changeAmount: amount,
          balanceAfter,
          reasonType: 'deposit',
        });
      });
    }

    const userDocFinal = await userRef.get();
    const finalBalance = readBalanceOrZeroIfMissing(
      userDocFinal.data() as Record<string, unknown>,
      SIDE_GAME_CHIP_ID,
    );

    logOpsSuccess({
      message: 'depositChip 成功',
      functionEntry: 'depositChip',
      context: {
        userId,
        billId,
        amount,
        reused: isReplay,
        chipId,
        finalBalance,
        previousBalance: currentChip,
      },
    });

    return {
      success: true,
      message: `chipの預入処理が完了しました`,
      data: {
        userId,
        depositAmount: amount,
        previousBalance: currentChip,
        newBalance: finalBalance,
        chipId,
        reused: isReplay || false,
      },
    };
  } catch (error) {
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'depositChip failed',
        functionEntry: 'depositChip',
        operation: 'depositChipTransaction',
        cause: error,
        context: {
          callerUid,
          userId,
          billId,
          errorKey: error.errorKey,
        },
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }

    logOpsError({
      message: 'depositChipエラー:',
      functionEntry: 'depositChip',
      operation: 'depositChipMainCatch',
      cause: error,
      context: {
        callerUid,
        userId,
        amount,
        clientNonce,
        billId,
      },
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `chipの預入に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
});
