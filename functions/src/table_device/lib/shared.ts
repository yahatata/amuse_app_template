import * as admin from 'firebase-admin';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import {
  getCallerDeviceByUid,
  isActive,
  type DeviceDoc,
} from '../../shared/devices';
import { getStoreConfig } from '../../shared/config/configLoader';

const TABLE_DEVICE_OPTION_KEY = 'table_device_table';

export type TableDeviceCaller = {
  device: DeviceDoc;
  requestedTableId: string;
};

type TableDeviceHistoryPermission = {
  viewEnabled: boolean;
  rollbackEnabled: boolean;
};

export function extractBoundTableId(device: DeviceDoc): string | null {
  const raw = device.optionParams?.[TABLE_DEVICE_OPTION_KEY];
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const tableId = (raw as Record<string, unknown>).tableId;
  if (typeof tableId !== 'string') {
    return null;
  }
  const normalized = tableId.trim();
  return normalized.length > 0 ? normalized : null;
}

export function assertTableDeviceCanAccessTable(params: {
  device: DeviceDoc;
  requestedTableId: string;
}): void {
  const { device, requestedTableId } = params;
  if (device.role !== 'table') {
    return;
  }

  const boundTableId = extractBoundTableId(device);
  if (boundTableId == null) {
    throw new HttpsError(
      'failed-precondition',
      '卓の紐付けが未設定です。管理者に連絡してください。',
    );
  }
  if (boundTableId !== requestedTableId) {
    throw new HttpsError('permission-denied', 'この卓を操作する権限がありません');
  }
}

export async function requireTableDeviceCaller(params: {
  callerUid: string;
  requestedTableId: string;
}): Promise<TableDeviceCaller> {
  const { callerUid, requestedTableId } = params;
  const device = await getCallerDeviceByUid(callerUid);
  if (!device || !isActive(device.status)) {
    throw new HttpsError(
      'permission-denied',
      'デバイスが見つからないか、アクティブではありません',
    );
  }

  if (device.role !== 'table' && device.role !== 'admin') {
    throw new HttpsError('permission-denied', '卓専用端末の権限がありません');
  }

  assertTableDeviceCanAccessTable({ device, requestedTableId });

  return {
    device,
    requestedTableId,
  };
}

export async function assertTableDeviceRegistrationEnabled(
  db: Firestore,
  device: DeviceDoc,
): Promise<void> {
  if (device.role !== 'table') {
    return;
  }
  const configDoc = await db.collection('storeMeta').doc('config').get();
  const raw = configDoc.data()?.features?.tableDeviceRegistrationEnabled;
  if (raw === false) {
    throw new HttpsError(
      'failed-precondition',
      '卓端末からの登録操作は現在無効です',
    );
  }
  const config = await getStoreConfig(db);
  if (config.features?.tableDeviceRegistrationEnabled === false) {
    throw new HttpsError(
      'failed-precondition',
      '卓端末からの登録操作は現在無効です',
    );
  }
}

export async function resolveForceClearPasscode(db: Firestore): Promise<string> {
  const configDoc = await db.collection('storeMeta').doc('config').get();
  const raw = configDoc.data()?.tableDevice?.forceClearPasscode;
  if (typeof raw === 'string' && /^[0-9]{4}$/.test(raw)) {
    return raw;
  }
  const config = await getStoreConfig(db);
  return config.tableDevice?.forceClearPasscode ?? '0000';
}

export async function assertTableDeviceTournamentSeatAssignmentEnabled(
  db: Firestore,
  device: DeviceDoc,
): Promise<void> {
  if (device.role !== 'table') {
    return;
  }

  const configDoc = await db.collection('storeMeta').doc('config').get();
  const raw = configDoc.data()?.tableDevice?.tournamentSeatAssignmentEnabled;
  if (raw === true) {
    return;
  }
  if (raw === false) {
    throw new HttpsError(
      'permission-denied',
      '卓端末からのトーナメント着席操作は現在無効です',
    );
  }

  const config = await getStoreConfig(db);
  if (config.tableDevice?.tournamentSeatAssignmentEnabled !== true) {
    throw new HttpsError(
      'permission-denied',
      '卓端末からのトーナメント着席操作は現在無効です',
    );
  }
}

async function resolveTableDeviceHistoryPermission(
  db: Firestore,
): Promise<TableDeviceHistoryPermission> {
  const configDoc = await db.collection('storeMeta').doc('config').get();
  const rawTableDevice = configDoc.data()?.tableDevice as
    | Record<string, unknown>
    | undefined;

  let viewEnabled: boolean | null = null;
  if (typeof rawTableDevice?.actionHistoryViewEnabled === 'boolean') {
    viewEnabled = rawTableDevice.actionHistoryViewEnabled;
  }

  let rollbackEnabled: boolean | null = null;
  if (typeof rawTableDevice?.actionHistoryRollbackEnabled === 'boolean') {
    rollbackEnabled = rawTableDevice.actionHistoryRollbackEnabled;
  }

  if (viewEnabled != null && rollbackEnabled != null) {
    return {
      viewEnabled,
      rollbackEnabled: viewEnabled && rollbackEnabled,
    };
  }

  const config = await getStoreConfig(db);
  const resolvedView =
    viewEnabled ?? config.tableDevice?.actionHistoryViewEnabled ?? true;
  const resolvedRollback =
    rollbackEnabled ?? config.tableDevice?.actionHistoryRollbackEnabled ?? false;

  return {
    viewEnabled: resolvedView,
    rollbackEnabled: resolvedView && resolvedRollback,
  };
}

export async function assertTableDeviceActionHistoryViewEnabled(
  db: Firestore,
  device: DeviceDoc,
): Promise<void> {
  if (device.role !== 'table') {
    return;
  }

  const permission = await resolveTableDeviceHistoryPermission(db);
  if (!permission.viewEnabled) {
    throw new HttpsError(
      'permission-denied',
      '卓端末からの操作履歴参照は現在無効です',
    );
  }
}

export async function assertTableDeviceActionHistoryRollbackEnabled(
  db: Firestore,
  device: DeviceDoc,
): Promise<void> {
  if (device.role !== 'table') {
    return;
  }

  const permission = await resolveTableDeviceHistoryPermission(db);
  if (!permission.rollbackEnabled) {
    throw new HttpsError(
      'permission-denied',
      '卓端末からの操作履歴取り消しは現在無効です',
    );
  }
}

export async function resolveSideGameTypes(db: Firestore): Promise<string[]> {
  const config = await getStoreConfig(db);
  return config.sideGameTypes ?? [];
}

export async function resolveCurrentBusinessDateKey(db: Firestore): Promise<string> {
  const currentBusinessDay = await db
    .collection('storeMeta')
    .doc('currentBusinessDay')
    .get();
  const data = currentBusinessDay.data();
  const status = data?.status as string | undefined;
  const key = data?.currentBusinessDateKey as string | undefined;
  if (status === 'running' && typeof key === 'string' && key.trim().length > 0) {
    return key;
  }
  return new Date().toISOString().slice(0, 10);
}

export function buildEmptySeats(maxSeats: number): Record<string, null> {
  const seats: Record<string, null> = {};
  for (var i = 1; i <= maxSeats; i += 1) {
    const seatNumber = i.toString().padStart(2, '0');
    seats[`seat${seatNumber}UserId`] = null;
    seats[`seat${seatNumber}PokerName`] = null;
  }
  return seats;
}

export function countOccupiedSeatIds(
  seats: Record<string, unknown> | undefined,
): number {
  if (!seats) return 0;
  return Object.entries(seats).filter(([key, value]) => {
    if (!key.endsWith('UserId') && !key.endsWith('OkibakeEntryId')) {
      return false;
    }
    if (typeof value !== 'string') {
      return false;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed !== 'null' && trimmed !== 'undefined';
  }).length;
}

export function buildSeatClearUpdateFromSeats(
  seats: Record<string, unknown> | undefined,
  maxSeats: number,
): Record<string, null> {
  const update: Record<string, null> = {};

  if (seats != null && Object.keys(seats).length > 0) {
    for (const key of Object.keys(seats)) {
      if (key.endsWith('UserId') || key.endsWith('PokerName')) {
        update[`seats.${key}`] = null;
      }
    }
  }

  if (Object.keys(update).length > 0) {
    return update;
  }

  for (var i = 1; i <= maxSeats; i += 1) {
    const seatNumber = i.toString().padStart(2, '0');
    update[`seats.seat${seatNumber}UserId`] = null;
    update[`seats.seat${seatNumber}PokerName`] = null;
  }

  return update;
}

export function validateForceClear(params: {
  occupiedCount: number;
  force: boolean;
  passcode?: string;
  correctPasscode: string;
}): void {
  const { occupiedCount, force, passcode, correctPasscode } = params;
  if (occupiedCount <= 0) {
    return;
  }
  if (!force) {
    throw new HttpsError(
      'failed-precondition',
      `着席者が ${occupiedCount} 名いるため、そのままでは解除できません`,
    );
  }
  if (passcode !== correctPasscode) {
    throw new HttpsError(
      'failed-precondition',
      'パスコードが違います',
    );
  }
}

export function deleteTournamentDetail() {
  return admin.firestore.FieldValue.delete();
}

export function serverTimestamp() {
  return admin.firestore.FieldValue.serverTimestamp();
}

export async function getTournamentTableSeatDoc(params: {
  transaction: Transaction;
  db: Firestore;
  tournamentId: string;
  tableId: string;
}) {
  const ref = params.db
    .collection('scheduledTournaments')
    .doc(params.tournamentId)
    .collection('tablesSeat')
    .doc(params.tableId);
  const doc = await params.transaction.get(ref);
  return { ref, doc };
}
