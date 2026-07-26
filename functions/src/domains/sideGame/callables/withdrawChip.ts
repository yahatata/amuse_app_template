/**
 * withdrawChip
 *
 * A-7: sideGameChipSettings.enabled ゲート + 残高健全性 + before/after ログ
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
  withdrawSideGameChipLogId,
  writeSideGameChipBalanceLogInTxWithSnap,
} from '../../user/services/pointLog';

export const withdrawChip = onCall(async (request) => {
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

    if (amount > currentChip) {
      throw new HttpsError('failed-precondition', 'Insufficient chip balance');
    }

    const active = await getActiveBillByUser(userId);
    billId = active.billId;

    const op = 'withdrawChip';
    const idempotencyKey = `${billId}:${op}:${clientNonce}`;
    const appendResult = await appendSideGameChip({
      billId,
      action: 'withdraw',
      chipQty: amount,
      amountIncl: null,
      menuItemId: null,
      name: null,
      idempotencyKey,
    });

    const isReplay = appendResult.diagnostics?.reused === true;
    const chipId = appendResult.chipId;

    // append と残高更新は別段階。残高ログ未作成なら（append reused でも）残高を適用する。
    const logRef = userRef
      .collection('sideGameChipLogs')
      .doc(withdrawSideGameChipLogId(chipId));
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
        if (amount > balanceBefore) {
          throw new HttpsError('failed-precondition', 'Insufficient chip balance');
        }
        const balanceAfter = balanceBefore - amount;

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
          changeAmount: -amount,
          balanceAfter,
          reasonType: 'withdraw',
        });
      });
    }

    const userDocFinal = await userRef.get();
    const finalBalance = readBalanceOrZeroIfMissing(
      userDocFinal.data() as Record<string, unknown>,
      SIDE_GAME_CHIP_ID,
    );

    logOpsSuccess({
      message: 'withdrawChip 成功',
      functionEntry: 'withdrawChip',
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
      message: `chipの引き出し処理が完了しました`,
      data: {
        userId,
        withdrawAmount: amount,
        previousBalance: currentChip,
        newBalance: finalBalance,
        chipId,
        reused: isReplay || false,
      },
    };
  } catch (error) {
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'withdrawChip failed',
        functionEntry: 'withdrawChip',
        operation: 'withdrawChipTransaction',
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
      message: 'withdrawChipエラー:',
      functionEntry: 'withdrawChip',
      operation: 'withdrawChipMainCatch',
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
    throw new HttpsError('internal', `chipの引き出しに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
  }
});
