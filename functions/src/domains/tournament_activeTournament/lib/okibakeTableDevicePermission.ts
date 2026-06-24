import { HttpsError } from 'firebase-functions/v2/https';
import type { DeviceDoc } from '../../../shared/devices';
import { hasRequiredOption } from '../../../shared/devices';
import { assertTableDeviceCanAccessTable } from '../../../table_device/lib/shared';

export function assertOkibakeTournamentOperationPermission(device: DeviceDoc): void {
  const hasPermission =
    device.role === 'admin' ||
    device.role === 'table' ||
    hasRequiredOption(device.options, 'tournament');
  if (!hasPermission) {
    throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
  }
}

export function resolveOkibakeAssignedTableId(
  entry: Record<string, unknown> | undefined,
): string | null {
  const tableRaw = entry?.assignedTableId;
  if (typeof tableRaw === 'string' && tableRaw.trim().length > 0) {
    return tableRaw.trim();
  }
  return null;
}

/** 卓端末から置きバケ操作する場合、エントリが自卓に着席している必要がある。 */
export function assertTableDeviceCanAccessOkibakeEntry(params: {
  device: DeviceDoc;
  entry: Record<string, unknown> | undefined;
}): void {
  const { device, entry } = params;
  if (device.role !== 'table') {
    return;
  }

  const assignedTableId = resolveOkibakeAssignedTableId(entry);
  if (assignedTableId == null) {
    throw new HttpsError(
      'permission-denied',
      '着席していない置きバケは卓端末から操作できません',
    );
  }

  assertTableDeviceCanAccessTable({ device, requestedTableId: assignedTableId });
}
