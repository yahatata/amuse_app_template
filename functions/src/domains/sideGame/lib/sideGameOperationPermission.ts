import { HttpsError } from 'firebase-functions/v2/https';

import {
  getCallerDeviceByUid,
  hasRequiredOption,
  isActive,
  type DeviceDoc,
} from '../../../shared/devices';
import { extractBoundTableId } from '../../../table_device/lib/shared';

type AssertSideGameOperationPermissionParams = {
  callerUid: string;
  /** 席操作系でリクエストに含まれる卓 ID。卓端末の場合は紐付け卓と一致必須。 */
  tableId?: string;
};

/**
 * サイドゲームの席・チップ操作を許可するデバイスか判定する。
 * - admin
 * - options.side_game
 * - role: table かつ卓紐付けあり（tableId 指定時は一致必須）
 */
export async function assertSideGameOperationPermission(
  params: AssertSideGameOperationPermissionParams,
): Promise<DeviceDoc> {
  const { callerUid, tableId } = params;
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError(
      'permission-denied',
      'デバイスが見つからないか、アクティブではありません',
    );
  }

  if (device.role === 'admin' || hasRequiredOption(device.options, 'side_game')) {
    return device;
  }

  if (device.role === 'table') {
    const boundTableId = extractBoundTableId(device);
    if (boundTableId == null) {
      throw new HttpsError(
        'failed-precondition',
        '卓の紐付けが未設定です。管理者に連絡してください。',
      );
    }

    const normalizedTableId =
      typeof tableId === 'string' ? tableId.trim() : '';
    if (normalizedTableId.length > 0 && normalizedTableId !== boundTableId) {
      throw new HttpsError('permission-denied', 'この卓を操作する権限がありません');
    }

    return device;
  }

  throw new HttpsError('permission-denied', 'サイドゲーム操作の権限がありません');
}
