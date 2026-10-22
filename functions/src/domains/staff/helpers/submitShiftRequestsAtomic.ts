/**
 * submitShiftRequests の atomic 実行
 *
 * 正本（1 transaction）:
 * - staffs/{uid}/shiftMutationRequests/{clientNonce}
 * - shiftRequests/{uid}_{dateKey}（create / pending update）
 * - shifts/{ym}/days/{dateKey}.pendingRequestCount（新規のみ +1）
 *
 * 事前検証（tx 外）:
 * - Business Hours / 次月 / 期間② / insufficient / finalized
 * tx 内で day / request / nonce を再確認し all-or-none。
 */

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { DEFAULT_SHIFT_SCHEDULING_START_DAY } from '../../../shared/config/defaults';
import {
  isInShiftSchedulingPeriod,
  isInsufficientDaysNotificationSent,
  isInsufficientDayOrTimeSlot,
} from '../../shift/services/helpers';
import { assertActiveStaff } from './staffStatus';
import { throwShiftHttpsError } from './shiftHttpsError';
import {
  SUBMIT_SHIFT_REQUESTS_OPERATION,
  type NormalizedShiftItem,
  assertAllDatesAreNextMonth,
  buildShiftSubmitFingerprint,
  normalizeShiftSubmitItems,
  validateShiftSubmitClientNonce,
} from './shiftSubmitNonce';

const db = () => admin.firestore();

export interface SubmitShiftRequestItemResult {
  requestId: string;
  dateKey: string;
  status: 'pending';
  startMinute: number;
  endMinute: number;
}

export interface SubmitShiftRequestsSuccessData {
  clientNonce: string;
  reused: boolean;
  yearMonth: string;
  submittedCount: number;
  createdCount: number;
  updatedCount: number;
  requests: SubmitShiftRequestItemResult[];
  /** response snapshot 復元用（dateKeys のみ・raw payload 非保存） */
  dateKeys?: string[];
}

function shiftMutationRequestRef(uid: string, clientNonce: string) {
  return db().collection('staffs').doc(uid).collection('shiftMutationRequests').doc(clientNonce);
}

function rebuildSuccessFromRequestDoc(params: {
  clientNonce: string;
  requestData: FirebaseFirestore.DocumentData;
}): SubmitShiftRequestsSuccessData {
  const response = (params.requestData.response || {}) as Record<string, unknown>;
  const requestsRaw = Array.isArray(response.requests) ? response.requests : [];
  const requests: SubmitShiftRequestItemResult[] = requestsRaw
    .filter((r): r is Record<string, unknown> => r != null && typeof r === 'object')
    .map((r) => ({
      requestId: String(r.requestId ?? ''),
      dateKey: String(r.dateKey ?? ''),
      status: 'pending' as const,
      startMinute: Number(r.startMinute),
      endMinute: Number(r.endMinute),
    }))
    .filter((r) => r.requestId && r.dateKey && Number.isFinite(r.startMinute) && Number.isFinite(r.endMinute))
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));

  const yearMonth =
    typeof response.yearMonth === 'string' && response.yearMonth
      ? response.yearMonth
      : requests[0]?.dateKey?.substring(0, 7) ?? '';

  return {
    clientNonce: params.clientNonce,
    reused: true,
    yearMonth,
    submittedCount:
      typeof response.submittedCount === 'number'
        ? response.submittedCount
        : requests.length,
    createdCount: typeof response.createdCount === 'number' ? response.createdCount : 0,
    updatedCount: typeof response.updatedCount === 'number' ? response.updatedCount : 0,
    requests,
  };
}

function assertBusinessHoursForItem(
  item: NormalizedShiftItem,
  dayData: FirebaseFirestore.DocumentData,
): void {
  const businessHours = dayData.businessHours as
    | {
        openMinute?: unknown;
        closeMinute?: unknown;
        isClosed?: unknown;
      }
    | undefined;

  if (
    !businessHours ||
    typeof businessHours.openMinute !== 'number' ||
    typeof businessHours.closeMinute !== 'number' ||
    !Number.isFinite(businessHours.openMinute) ||
    !Number.isFinite(businessHours.closeMinute)
  ) {
    throwShiftHttpsError(
      'failed-precondition',
      'SHIFT_BUSINESS_HOURS_UNAVAILABLE',
      `Business hours unavailable for ${item.dateKey}`,
    );
  }

  if (businessHours.isClosed === true) {
    throwShiftHttpsError(
      'failed-precondition',
      'SHIFT_BUSINESS_DAY_CLOSED',
      `Day is closed: ${item.dateKey}`,
    );
  }

  const openMinute = businessHours.openMinute;
  const closeMinute = businessHours.closeMinute;
  const { startMinute, endMinute, dateKey } = item;

  if (startMinute < openMinute) {
    throwShiftHttpsError(
      'failed-precondition',
      'SHIFT_TIME_OUTSIDE_BUSINESS_HOURS',
      `Start outside business hours: ${dateKey}`,
    );
  }

  const isEndTime24 = endMinute === 1440;
  const isCloseTime24 = closeMinute >= 1440;

  if (isEndTime24 && !isCloseTime24) {
    throwShiftHttpsError(
      'failed-precondition',
      'SHIFT_TIME_OUTSIDE_BUSINESS_HOURS',
      `End 24:00 outside business hours: ${dateKey}`,
    );
  }

  if (!isEndTime24 && endMinute > closeMinute) {
    throwShiftHttpsError(
      'failed-precondition',
      'SHIFT_TIME_OUTSIDE_BUSINESS_HOURS',
      `End outside business hours: ${dateKey}`,
    );
  }
}

function assertEditableExistingStatus(status: unknown, dateKey: string): void {
  if (status === 'pending') {
    return;
  }
  if (status === 'interim_confirmed' || status === 'final_confirmed' || status === 'confirmed') {
    throwShiftHttpsError(
      'failed-precondition',
      'SHIFT_REQUEST_ALREADY_CONFIRMED',
      `Shift request not editable (${String(status)}): ${dateKey}`,
    );
  }
  throwShiftHttpsError(
    'failed-precondition',
    'SHIFT_REQUEST_NOT_EDITABLE',
    `Shift request not editable (${String(status)}): ${dateKey}`,
  );
}

async function validateItemsAgainstStore(params: {
  items: NormalizedShiftItem[];
  schedulingStartDay: number;
}): Promise<void> {
  const { items, schedulingStartDay } = params;
  assertAllDatesAreNextMonth(items);

  const yearMonths = [...new Set(items.map((i) => i.yearMonth))];
  for (const ym of yearMonths) {
    const monthSnap = await db().collection('shifts').doc(ym).get();
    if (monthSnap.exists && monthSnap.data()?.allDaysFinalized === true) {
      throwShiftHttpsError(
        'failed-precondition',
        'SHIFT_MONTH_FINALIZED',
        `Month already finalized: ${ym}`,
      );
    }
  }

  for (const item of items) {
    const isInSchedulingPeriod = isInShiftSchedulingPeriod(
      item.dateKey,
      schedulingStartDay,
    );

    if (isInSchedulingPeriod) {
      let notificationSent: boolean;
      try {
        notificationSent = await isInsufficientDaysNotificationSent(item.yearMonth);
      } catch {
        throwShiftHttpsError(
          'internal',
          'SHIFT_INTERNAL_ERROR',
          'Failed to read insufficient-days notification flag',
        );
      }

      if (!notificationSent) {
        throwShiftHttpsError(
          'failed-precondition',
          'SHIFT_SCHEDULING_PERIOD_RESTRICTED',
          `Scheduling period restricted: ${item.dateKey}`,
        );
      }

      let isInsufficient: boolean;
      try {
        isInsufficient = await isInsufficientDayOrTimeSlot(item.dateKey);
      } catch {
        throwShiftHttpsError(
          'internal',
          'SHIFT_INTERNAL_ERROR',
          'Failed to evaluate insufficient day/slot',
        );
      }

      if (!isInsufficient) {
        throwShiftHttpsError(
          'failed-precondition',
          'SHIFT_DATE_NOT_INSUFFICIENT',
          `Date is not insufficient: ${item.dateKey}`,
        );
      }
    }

    const daySnap = await db()
      .collection('shifts')
      .doc(item.yearMonth)
      .collection('days')
      .doc(item.dateKey)
      .get();

    if (!daySnap.exists) {
      throwShiftHttpsError(
        'failed-precondition',
        'SHIFT_BUSINESS_HOURS_UNAVAILABLE',
        `Shift day not initialized: ${item.dateKey}`,
      );
    }

    assertBusinessHoursForItem(item, daySnap.data()!);
  }
}

function buildSuccessData(params: {
  clientNonce: string;
  reused: boolean;
  items: NormalizedShiftItem[];
  createdDateKeys: Set<string>;
  updatedDateKeys: Set<string>;
  uid: string;
}): SubmitShiftRequestsSuccessData {
  const requests: SubmitShiftRequestItemResult[] = params.items.map((it) => ({
    requestId: `${params.uid}_${it.dateKey}`,
    dateKey: it.dateKey,
    status: 'pending',
    startMinute: it.startMinute,
    endMinute: it.endMinute,
  }));

  return {
    clientNonce: params.clientNonce,
    reused: params.reused,
    yearMonth: params.items[0]?.yearMonth ?? '',
    submittedCount: params.items.length,
    createdCount: params.createdDateKeys.size,
    updatedCount: params.updatedDateKeys.size,
    requests,
    dateKeys: params.items.map((i) => i.dateKey),
  };
}

export async function executeSubmitShiftRequestsAtomic(params: {
  uid: string;
  clientNonce: string;
  rawShifts: unknown;
}): Promise<SubmitShiftRequestsSuccessData> {
  const { uid, clientNonce, rawShifts } = params;
  const items = normalizeShiftSubmitItems(rawShifts);
  const fingerprint = buildShiftSubmitFingerprint({ uid, items });
  const requestRef = shiftMutationRequestRef(uid, clientNonce);

  await assertActiveStaff(uid);

  const staffDoc = await db().collection('staffs').doc(uid).get();
  if (!staffDoc.exists) {
    throwShiftHttpsError('not-found', 'SHIFT_STAFF_NOT_ACTIVE', 'Staff not found');
  }
  const staffData = staffDoc.data()!;
  const staffName =
    (typeof staffData.fullName === 'string' && staffData.fullName) ||
    (typeof staffData.fullNameKana === 'string' && staffData.fullNameKana) ||
    (typeof staffData.name === 'string' && staffData.name) ||
    '不明';

  const config = await getStoreConfig();
  const schedulingStartDay =
    config.shift?.schedulingStartDay ?? DEFAULT_SHIFT_SCHEDULING_START_DAY;

  await validateItemsAgainstStore({ items, schedulingStartDay });

  const result = await db().runTransaction(async (tx) => {
    const mutationSnap = await tx.get(requestRef);

    if (mutationSnap.exists) {
      const requestData = mutationSnap.data()!;
      if (requestData.operation !== SUBMIT_SHIFT_REQUESTS_OPERATION) {
        throwShiftHttpsError(
          'failed-precondition',
          'SHIFT_SUBMIT_NONCE_CONFLICT',
          'clientNonce used for another operation',
        );
      }
      if (requestData.fingerprint !== fingerprint) {
        throwShiftHttpsError(
          'failed-precondition',
          'SHIFT_SUBMIT_NONCE_CONFLICT',
          'clientNonce fingerprint mismatch',
        );
      }
      if (requestData.status === 'succeeded') {
        return rebuildSuccessFromRequestDoc({ clientNonce, requestData });
      }
      throwShiftHttpsError(
        'internal',
        'SHIFT_INTERNAL_ERROR',
        'Incomplete shift submit request state',
      );
    }

    const createdDateKeys = new Set<string>();
    const updatedDateKeys = new Set<string>();
    const dayCountByKey = new Map<string, number>();

    // All reads first
    const requestSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    const daySnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    const monthSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();

    for (const item of items) {
      const shiftReqRef = db().collection('shiftRequests').doc(`${uid}_${item.dateKey}`);
      requestSnaps.set(item.dateKey, await tx.get(shiftReqRef));

      const dayRef = db()
        .collection('shifts')
        .doc(item.yearMonth)
        .collection('days')
        .doc(item.dateKey);
      daySnaps.set(item.dateKey, await tx.get(dayRef));

      if (!monthSnaps.has(item.yearMonth)) {
        monthSnaps.set(
          item.yearMonth,
          await tx.get(db().collection('shifts').doc(item.yearMonth)),
        );
      }
    }

    for (const item of items) {
      const monthSnap = monthSnaps.get(item.yearMonth)!;
      if (monthSnap.exists && monthSnap.data()?.allDaysFinalized === true) {
        throwShiftHttpsError(
          'failed-precondition',
          'SHIFT_MONTH_FINALIZED',
          `Month already finalized: ${item.yearMonth}`,
        );
      }

      const daySnap = daySnaps.get(item.dateKey)!;
      if (!daySnap.exists) {
        throwShiftHttpsError(
          'failed-precondition',
          'SHIFT_BUSINESS_HOURS_UNAVAILABLE',
          `Shift day missing in transaction: ${item.dateKey}`,
        );
      }
      assertBusinessHoursForItem(item, daySnap.data()!);

      // period② existing: createMultipleShifts は既存を拒否するが、正式経路は pending 更新可。
      // ただし interim/final/confirmed 等は安全側拒否。
      const existing = requestSnaps.get(item.dateKey)!;
      if (existing.exists) {
        const existingData = existing.data()!;
        if (existingData.staffId != null && String(existingData.staffId) !== uid) {
          throwShiftHttpsError(
            'permission-denied',
            'SHIFT_REQUEST_NOT_EDITABLE',
            `Request owned by another staff: ${item.dateKey}`,
          );
        }
        assertEditableExistingStatus(existingData.status, item.dateKey);
        updatedDateKeys.add(item.dateKey);
      } else {
        createdDateKeys.add(item.dateKey);
      }

      dayCountByKey.set(
        item.dateKey,
        (daySnap.data()!.pendingRequestCount as number) || 0,
      );
    }

    // Writes
    for (const item of items) {
      const requestId = `${uid}_${item.dateKey}`;
      const shiftReqRef = db().collection('shiftRequests').doc(requestId);
      const existing = requestSnaps.get(item.dateKey)!;

      if (existing.exists) {
        const existingData = existing.data()!;
        const originalStart =
          typeof existingData.originalStartMinute === 'number'
            ? existingData.originalStartMinute
            : item.startMinute;
        const originalEnd =
          typeof existingData.originalEndMinute === 'number'
            ? existingData.originalEndMinute
            : item.endMinute;

        tx.update(shiftReqRef, {
          startMinute: item.startMinute,
          endMinute: item.endMinute,
          // 既存 original があれば保持（interim 向けの初回値）
          originalStartMinute: originalStart,
          originalEndMinute: originalEnd,
          status: 'pending',
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        tx.set(shiftReqRef, {
          requestId,
          staffId: uid,
          staffName,
          yearMonth: item.yearMonth,
          dateKey: item.dateKey,
          startMinute: item.startMinute,
          endMinute: item.endMinute,
          originalStartMinute: item.startMinute,
          originalEndMinute: item.endMinute,
          status: 'pending',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    for (const dateKey of createdDateKeys) {
      const item = items.find((i) => i.dateKey === dateKey)!;
      const dayRef = db()
        .collection('shifts')
        .doc(item.yearMonth)
        .collection('days')
        .doc(dateKey);
      const current = dayCountByKey.get(dateKey) ?? 0;
      tx.update(dayRef, {
        pendingRequestCount: current + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const successData = buildSuccessData({
      clientNonce,
      reused: false,
      items,
      createdDateKeys,
      updatedDateKeys,
      uid,
    });

    const responseSnapshot = {
      clientNonce: successData.clientNonce,
      yearMonth: successData.yearMonth,
      submittedCount: successData.submittedCount,
      createdCount: successData.createdCount,
      updatedCount: successData.updatedCount,
      dateKeys: successData.dateKeys,
      requests: successData.requests,
    };

    tx.set(requestRef, {
      operation: SUBMIT_SHIFT_REQUESTS_OPERATION,
      clientNonce,
      fingerprint,
      status: 'succeeded',
      response: responseSnapshot,
      createdAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    });

    return successData;
  });

  return result;
}

export function parseSubmitShiftRequestsInput(data: unknown): {
  clientNonce: string;
  rawShifts: unknown;
} {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    throwShiftHttpsError(
      'invalid-argument',
      'SHIFT_INVALID_ARGUMENT',
      'Request body must be an object',
    );
  }
  const body = data as Record<string, unknown>;

  if (body.staffId !== undefined || body.userId !== undefined || body.uid !== undefined) {
    throwShiftHttpsError(
      'invalid-argument',
      'SHIFT_INVALID_ARGUMENT',
      'staffId/userId/uid must not be provided',
    );
  }

  const clientNonce = validateShiftSubmitClientNonce(body.clientNonce);
  return { clientNonce, rawShifts: body.shifts };
}
