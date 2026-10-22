/**
 * devices.status の正規化・判定（active / blocked / archived）
 * 既存 DB の retired は読み取り時に archived 相当として扱う。
 */

export const DEVICE_STATUS_ACTIVE = "active" as const;
export const DEVICE_STATUS_BLOCKED = "blocked" as const;
export const DEVICE_STATUS_ARCHIVED = "archived" as const;

export type OperationalDeviceStatus =
  | typeof DEVICE_STATUS_ACTIVE
  | typeof DEVICE_STATUS_BLOCKED;

/** 読み取り用: retired → archived に正規化 */
export function normalizeDeviceStatus(status?: string): string {
  if (!status || status === DEVICE_STATUS_ACTIVE) {
    return DEVICE_STATUS_ACTIVE;
  }
  if (status === "retired") {
    return DEVICE_STATUS_ARCHIVED;
  }
  return status;
}

export function isArchivedStatus(status?: string): boolean {
  return normalizeDeviceStatus(status) === DEVICE_STATUS_ARCHIVED;
}

export function isOperationalStatus(status?: string): boolean {
  const normalized = normalizeDeviceStatus(status);
  return (
    normalized === DEVICE_STATUS_ACTIVE || normalized === DEVICE_STATUS_BLOCKED
  );
}

export function isActive(status?: string): boolean {
  return normalizeDeviceStatus(status) === DEVICE_STATUS_ACTIVE;
}
