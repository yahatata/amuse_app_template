/**
 * createAttendanceCorrectionRequest の atomic 実行
 *
 * 正本（1 transaction）:
 * - staffs/{uid}/attendanceCorrectionMutationRequests/{clientNonce}
 * - attendanceCorrectionRequests/{uid}_{date}（deterministic）
 * - 既存 auto-ID 同日分は query で検出して拒否
 */

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { assertActiveStaff } from '../../staff/helpers/staffStatus';
import {
  rejectClientIdentityFields,
  throwAttendanceHttpsError,
  getAttendanceErrorKeyFromUnknown,
} from './attendanceHttpsError';
import { formatTimestampToJstHhMm } from './attendanceBusinessDate';
import {
  SUBMIT_ATTENDANCE_CORRECTION_OPERATION,
  buildAttendanceCorrectionFingerprint,
  attendanceCorrectionDeterministicId,
  normalizeCorrectionPayload,
  shortAttendanceNonceTrace,
  validateAttendanceCorrectionClientNonce,
  type NormalizedCorrectionPayload,
} from './attendanceCorrectionNonce';

const db = () => admin.firestore();

export type CreateAttendanceCorrectionSuccessData = {
  clientNonce: string;
  reused: boolean;
  requestId: string;
  date: string;
  status: 'pending';
};

function mutationRequestRef(uid: string, clientNonce: string) {
  return db()
    .collection('staffs')
    .doc(uid)
    .collection('attendanceCorrectionMutationRequests')
    .doc(clientNonce);
}

function rebuildSuccessFromMutationDoc(params: {
  clientNonce: string;
  requestData: FirebaseFirestore.DocumentData;
}): CreateAttendanceCorrectionSuccessData {
  const response = (params.requestData.response || {}) as Record<string, unknown>;
  const requestId = typeof response.requestId === 'string' ? response.requestId : '';
  const date = typeof response.date === 'string' ? response.date : '';
  if (!requestId || !date) {
    throwAttendanceHttpsError(
      'internal',
      'ATTENDANCE_CORRECTION_INTERNAL_ERROR',
      'Invalid mutation request snapshot',
    );
  }
  return {
    clientNonce: params.clientNonce,
    reused: true,
    requestId,
    date,
    status: 'pending',
  };
}

async function lookupAttendanceSnapshot(uid: string, date: string): Promise<{
  attendanceId: string | null;
  currentClockIn: string | null;
  currentClockOut: string | null;
}> {
  const snap = await db()
    .collection('attendances')
    .where('staffId', '==', uid)
    .where('date', '==', date)
    .limit(5)
    .get();

  const live = snap.docs.find((d) => d.data().isDeleted !== true);
  if (!live) {
    return { attendanceId: null, currentClockIn: null, currentClockOut: null };
  }
  const data = live.data();
  return {
    attendanceId: live.id,
    currentClockIn: formatTimestampToJstHhMm(data.clockIn),
    currentClockOut: formatTimestampToJstHhMm(data.clockOut),
  };
}

export async function createAttendanceCorrectionAtomic(params: {
  uid: string;
  rawData: Record<string, unknown>;
}): Promise<CreateAttendanceCorrectionSuccessData> {
  const { uid, rawData } = params;

  rejectClientIdentityFields(rawData, [
    'staffName',
    'status',
    'createdAt',
    'updatedAt',
    'approvedAt',
    'rejectedAt',
    'approvedBy',
    'rejectedBy',
    'rejectionReason',
    'attendanceId',
  ]);

  const clientNonce = validateAttendanceCorrectionClientNonce(rawData.clientNonce);
  const payload = normalizeCorrectionPayload(rawData);
  const fingerprint = buildAttendanceCorrectionFingerprint({ uid, payload });

  const staffSnap = await assertActiveStaff(uid);
  const staffName =
    (staffSnap.data()?.fullName as string | undefined)?.trim() || 'Unknown';

  // attendance は申請必須ではない。存在すれば current* / attendanceId を server が埋める。
  const attendanceSnap = await lookupAttendanceSnapshot(uid, payload.date);

  const mutationRef = mutationRequestRef(uid, clientNonce);
  const correctionId = attendanceCorrectionDeterministicId(uid, payload.date);
  const correctionRef = db().collection('attendanceCorrectionRequests').doc(correctionId);

  try {
    return await db().runTransaction(async (tx) => {
      const mutationSnap = await tx.get(mutationRef);
      if (mutationSnap.exists) {
        const existing = mutationSnap.data() || {};
        if (existing.fingerprint === fingerprint && existing.operation === SUBMIT_ATTENDANCE_CORRECTION_OPERATION) {
          return rebuildSuccessFromMutationDoc({
            clientNonce,
            requestData: existing,
          });
        }
        throwAttendanceHttpsError(
          'already-exists',
          'ATTENDANCE_CORRECTION_NONCE_CONFLICT',
          'clientNonce conflict',
        );
      }

      const detSnap = await tx.get(correctionRef);
      if (detSnap.exists) {
        throwAttendanceHttpsError(
          'failed-precondition',
          'ATTENDANCE_CORRECTION_ALREADY_EXISTS',
          'Correction already exists for this date',
        );
      }

      const existingQuery = await tx.get(
        db()
          .collection('attendanceCorrectionRequests')
          .where('staffId', '==', uid)
          .where('date', '==', payload.date)
          .limit(1),
      );
      if (!existingQuery.empty) {
        throwAttendanceHttpsError(
          'failed-precondition',
          'ATTENDANCE_CORRECTION_ALREADY_EXISTS',
          'Correction already exists for this date',
        );
      }

      const correctionDoc = buildCorrectionDoc({
        uid,
        staffName,
        payload,
        attendanceSnap,
      });

      const successData: CreateAttendanceCorrectionSuccessData = {
        clientNonce,
        reused: false,
        requestId: correctionId,
        date: payload.date,
        status: 'pending',
      };

      tx.set(correctionRef, correctionDoc);
      tx.set(mutationRef, {
        operation: SUBMIT_ATTENDANCE_CORRECTION_OPERATION,
        clientNonce,
        fingerprint,
        date: payload.date,
        requestId: correctionId,
        response: {
          requestId: correctionId,
          date: payload.date,
          status: 'pending',
        },
        createdAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
      });

      return successData;
    });
  } catch (error) {
    const key = getAttendanceErrorKeyFromUnknown(error);
    if (key) throw error;
    throwAttendanceHttpsError(
      'internal',
      'ATTENDANCE_CORRECTION_INTERNAL_ERROR',
      'Failed to create attendance correction',
    );
  }
}

function buildCorrectionDoc(params: {
  uid: string;
  staffName: string;
  payload: NormalizedCorrectionPayload;
  attendanceSnap: {
    attendanceId: string | null;
    currentClockIn: string | null;
    currentClockOut: string | null;
  };
}): Record<string, unknown> {
  const { uid, staffName, payload, attendanceSnap } = params;
  const doc: Record<string, unknown> = {
    date: payload.date,
    type: payload.type,
    currentClockIn: attendanceSnap.currentClockIn,
    currentClockOut: attendanceSnap.currentClockOut,
    newClockIn: payload.newClockIn,
    newClockOut: payload.newClockOut,
    reason: payload.reason,
    staffId: uid,
    staffName,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    approvedAt: null,
    rejectedAt: null,
    approvedBy: null,
    rejectedBy: null,
    rejectionReason: null,
  };
  if (attendanceSnap.attendanceId) {
    doc.attendanceId = attendanceSnap.attendanceId;
  }
  return doc;
}

export function buildCorrectionLogContext(params: {
  uid: string;
  clientNonce: string;
  date?: string;
  requestId?: string;
  reused?: boolean;
}): Record<string, unknown> {
  return {
    staffIdPresent: true,
    nonceTrace: shortAttendanceNonceTrace(params.clientNonce),
    date: params.date ?? null,
    requestId: params.requestId ?? null,
    reused: params.reused ?? null,
  };
}
