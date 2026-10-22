/**
 * appendExtra Cloud Function
 * 
 * bills/{billId}/extras サブコレクションに追加料金を追加する
 */

import { onCall } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { appendExtra, AppendExtraRequest } from '../repos/appendExtra';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';

export const appendExtraCallable = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const uid = request.auth.uid;

  // デバイス権限チェック
  const device = await getCallerDeviceByUid(uid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError('permission-denied', 'Device not registered or not active');
  }

  // 権限チェック: admin または canEditBills オプションが必要
  const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'canEditBills');
  if (!hasPermission) {
    throw new HttpsError('permission-denied', 'Device does not have canEditBills permission');
  }

  // リクエストデータの取得
  const data = request.data as AppendExtraRequest;

  // バリデーション
  if (!data.billId || !data.name || data.amountIncl === undefined) {
    throw new HttpsError('invalid-argument', 'billId, name, amountIncl are required');
  }

  if (data.amountIncl < 0) {
    throw new HttpsError('invalid-argument', 'amountIncl must be 0 or greater');
  }

  try {
    const result = await appendExtra(data);
    logOpsSuccess({
  message: "appendExtraCallable 成功",
  functionEntry: "appendExtraCallable",
  context: {
    uid,
    billId: data.billId,
  },
});

    return result;
  } catch (error) {
    logOpsError({
      message: 'appendExtra callable error',
      functionEntry: 'appendExtraCallable',
      cause: error,
      context: {
        uid,
        billId: data.billId,
      },
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Failed to append extra');
  }
});

