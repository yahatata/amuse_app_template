/**
 * createStaffAccount / reactivateStaffAccount の atomic 実行
 *
 * 正本（transaction）:
 * - staffs/{uid}
 * - staffs/{uid}/mutationRequests/{clientNonce}
 *
 * transaction 外（正本外・best-effort）:
 * - QR Storage 生成
 * - リッチメニュー連携
 * - operationLog
 *
 * fullNameKana 一意性は既存どおり query（別 collection 新設なし）。
 * query を tx 内で完全保証できないため、かな race は現行と同程度の残課題。
 */

import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { normalizeStaffStatus } from './staffStatus';
import { throwStaffHttpsError } from './staffHttpsError';
import {
  CREATE_STAFF_ACCOUNT_OPERATION,
  REACTIVATE_STAFF_ACCOUNT_OPERATION,
  type StaffMutationOperation,
  type StaffRegistrationPii,
  buildStaffMutationFingerprint,
} from './staffClientNonce';

export interface StaffMutationSuccessData {
  clientNonce: string;
  reused: boolean;
  alreadyRegistered: boolean;
  staffStatus: 'active';
  qrCode?: string;
  qrCodeUrl?: string;
  expiresAt?: number;
  expiresAtMs?: number;
}

type StaffDocClass = 'missing' | 'active' | 'retired' | 'invalid';

function classifyStaffDoc(data: FirebaseFirestore.DocumentData | undefined): StaffDocClass {
  if (!data) return 'missing';
  const status = data.status;
  if (status === 'retired') return 'retired';
  if (status === undefined || status === null || status === 'active') return 'active';
  return 'invalid';
}

function db() {
  return admin.firestore();
}

function mutationRequestRef(uid: string, clientNonce: string) {
  return db().collection('staffs').doc(uid).collection('mutationRequests').doc(clientNonce);
}

function rebuildSuccessFromRequestDoc(params: {
  clientNonce: string;
  requestData: FirebaseFirestore.DocumentData;
}): StaffMutationSuccessData {
  const response = (params.requestData.response || {}) as Record<string, unknown>;
  const alreadyRegistered = response.alreadyRegistered === true;
  const qrCodeUrl =
    typeof response.qrCodeUrl === 'string' && response.qrCodeUrl ? response.qrCodeUrl : undefined;
  const qrCode =
    typeof response.qrCode === 'string' && response.qrCode ? response.qrCode : undefined;
  const expiresAtMs =
    typeof response.expiresAtMs === 'number' && Number.isFinite(response.expiresAtMs)
      ? response.expiresAtMs
      : typeof response.expiresAt === 'number' && Number.isFinite(response.expiresAt)
        ? response.expiresAt
        : undefined;

  return {
    clientNonce: params.clientNonce,
    reused: true,
    alreadyRegistered,
    staffStatus: 'active',
    qrCode,
    qrCodeUrl,
    expiresAt: expiresAtMs,
    expiresAtMs,
  };
}

async function assertFullNameKanaAvailable(params: {
  fullNameKana: string;
  uid: string;
}): Promise<void> {
  const existing = await db()
    .collection('staffs')
    .where('fullNameKana', '==', params.fullNameKana)
    .limit(2)
    .get();

  const duplicate = existing.docs.find((doc) => doc.id !== params.uid);
  if (duplicate) {
    throwStaffHttpsError(
      'already-exists',
      'STAFF_NAME_KANA_ALREADY_EXISTS',
      'fullNameKana already exists',
    );
  }
}

async function prepareStaffQr(params: {
  uid: string;
  loginId: string;
}): Promise<{ qrCodeImage: string; qrCodeUrl: string; expiresAtMs: number }> {
  const { generateQRData, generateQRImage, saveQRCodeToStorage } = await import(
    '../../user/services/qrCodeUtils'
  );
  const qrData = await generateQRData(params.uid, params.loginId, 'staff');
  const qrCodeImage = await generateQRImage(qrData);
  const expiresAtMs = qrData.timestamp + 10 * 60 * 1000;
  const qrCodeUrl = await saveQRCodeToStorage(params.uid, qrCodeImage, 'staff');
  return { qrCodeImage, qrCodeUrl, expiresAtMs };
}

function buildCreateResponseSnapshot(params: {
  clientNonce: string;
  alreadyRegistered: boolean;
  reused: boolean;
  qrCode?: string;
  qrCodeUrl?: string;
  expiresAtMs?: number;
}): StaffMutationSuccessData {
  return {
    clientNonce: params.clientNonce,
    reused: params.reused,
    alreadyRegistered: params.alreadyRegistered,
    staffStatus: 'active',
    qrCode: params.qrCode,
    qrCodeUrl: params.qrCodeUrl,
    expiresAt: params.expiresAtMs,
    expiresAtMs: params.expiresAtMs,
  };
}

export async function executeCreateStaffAccountAtomic(params: {
  uid: string;
  clientNonce: string;
  pii: StaffRegistrationPii;
}): Promise<StaffMutationSuccessData> {
  const { uid, clientNonce, pii } = params;
  const operation: StaffMutationOperation = CREATE_STAFF_ACCOUNT_OPERATION;
  const fingerprint = buildStaffMutationFingerprint({ operation, uid, pii });
  const staffRef = db().collection('staffs').doc(uid);
  const requestRef = mutationRequestRef(uid, clientNonce);

  // 1) nonce / status 先確認（QR生成前）
  type Early =
    | { kind: 'reused'; data: StaffMutationSuccessData }
    | { kind: 'already_registered' }
    | { kind: 'need_create' };

  const early = await db().runTransaction(async (tx): Promise<Early> => {
    const requestSnap = await tx.get(requestRef);
    const staffSnap = await tx.get(staffRef);

    if (requestSnap.exists) {
      const requestData = requestSnap.data()!;
      if (requestData.operation !== operation) {
        throwStaffHttpsError(
          'failed-precondition',
          'STAFF_REGISTRATION_NONCE_CONFLICT',
          'clientNonce used for another operation',
        );
      }
      if (requestData.fingerprint !== fingerprint) {
        throwStaffHttpsError(
          'failed-precondition',
          'STAFF_REGISTRATION_NONCE_CONFLICT',
          'clientNonce fingerprint mismatch',
        );
      }
      if (requestData.status === 'succeeded') {
        return {
          kind: 'reused',
          data: rebuildSuccessFromRequestDoc({ clientNonce, requestData }),
        };
      }
      throwStaffHttpsError(
        'internal',
        'STAFF_INTERNAL_ERROR',
        'Incomplete registration request state',
      );
    }

    if (staffSnap.exists) {
      const classified = classifyStaffDoc(staffSnap.data());
      if (classified === 'retired') {
        throwStaffHttpsError(
          'failed-precondition',
          'STAFF_REACTIVATION_REQUIRED',
          'Staff is retired; use reactivation',
        );
      }
      if (classified === 'invalid') {
        throwStaffHttpsError(
          'failed-precondition',
          'STAFF_INVALID_ARGUMENT',
          'Staff status is not supported',
        );
      }
      return { kind: 'already_registered' };
    }

    return { kind: 'need_create' };
  });

  if (early.kind === 'reused') {
    return early.data;
  }
  if (early.kind === 'already_registered') {
    return buildCreateResponseSnapshot({
      clientNonce,
      alreadyRegistered: true,
      reused: false,
    });
  }

  await assertFullNameKanaAvailable({ fullNameKana: pii.fullNameKana, uid });

  const loginId = pii.fullNameKana + pii.birthMonthDay;
  const qr = await prepareStaffQr({ uid, loginId });

  // 2) staff + nonce を同一 transaction で確定
  const created = await db().runTransaction(async (tx) => {
    const requestSnap = await tx.get(requestRef);
    const staffSnap = await tx.get(staffRef);

    if (requestSnap.exists) {
      const requestData = requestSnap.data()!;
      if (requestData.operation !== operation || requestData.fingerprint !== fingerprint) {
        throwStaffHttpsError(
          'failed-precondition',
          'STAFF_REGISTRATION_NONCE_CONFLICT',
          'clientNonce conflict',
        );
      }
      if (requestData.status === 'succeeded') {
        return rebuildSuccessFromRequestDoc({ clientNonce, requestData });
      }
    }

    if (staffSnap.exists) {
      const classified = classifyStaffDoc(staffSnap.data());
      if (classified === 'retired') {
        throwStaffHttpsError(
          'failed-precondition',
          'STAFF_REACTIVATION_REQUIRED',
          'Staff is retired; use reactivation',
        );
      }
      if (classified === 'invalid') {
        throwStaffHttpsError(
          'failed-precondition',
          'STAFF_INVALID_ARGUMENT',
          'Staff status is not supported',
        );
      }
      // 並行で作成済み → alreadyRegistered（この nonce は成功扱いで残さない＝writeしない）
      return buildCreateResponseSnapshot({
        clientNonce,
        alreadyRegistered: true,
        reused: false,
      });
    }

    const successData = buildCreateResponseSnapshot({
      clientNonce,
      alreadyRegistered: false,
      reused: false,
      qrCode: qr.qrCodeImage,
      qrCodeUrl: qr.qrCodeUrl,
      expiresAtMs: qr.expiresAtMs,
    });

    tx.set(staffRef, {
      uid,
      fullName: pii.fullName,
      fullNameKana: pii.fullNameKana,
      email: pii.email,
      phoneNumber: pii.phoneNumber,
      birthMonthDay: pii.birthMonthDay,
      loginId,
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      qrCodeUrl: qr.qrCodeUrl,
      qrExpiresAt: admin.firestore.Timestamp.fromMillis(qr.expiresAtMs),
      qrExpiresAtMs: qr.expiresAtMs,
    });

    // response に Base64 QR 全文を二重保存しない（URL + expiry で再構築）
    tx.set(requestRef, {
      operation,
      fingerprint,
      status: 'succeeded',
      staffStatus: 'active',
      alreadyRegistered: false,
      createdAt: FieldValue.serverTimestamp(),
      response: {
        alreadyRegistered: false,
        staffStatus: 'active',
        qrCodeUrl: qr.qrCodeUrl,
        expiresAtMs: qr.expiresAtMs,
        expiresAt: qr.expiresAtMs,
      },
    });

    return successData;
  });

  return created;
}

export async function executeReactivateStaffAccountAtomic(params: {
  uid: string;
  clientNonce: string;
  pii: StaffRegistrationPii;
}): Promise<StaffMutationSuccessData> {
  const { uid, clientNonce, pii } = params;
  const operation: StaffMutationOperation = REACTIVATE_STAFF_ACCOUNT_OPERATION;
  const fingerprint = buildStaffMutationFingerprint({ operation, uid, pii });
  const staffRef = db().collection('staffs').doc(uid);
  const requestRef = mutationRequestRef(uid, clientNonce);

  type Early =
    | { kind: 'reused'; data: StaffMutationSuccessData }
    | { kind: 'need_reactivate' };

  const early = await db().runTransaction(async (tx): Promise<Early> => {
    const requestSnap = await tx.get(requestRef);
    const staffSnap = await tx.get(staffRef);

    if (requestSnap.exists) {
      const requestData = requestSnap.data()!;
      if (requestData.operation !== operation) {
        throwStaffHttpsError(
          'failed-precondition',
          'STAFF_REACTIVATION_NONCE_CONFLICT',
          'clientNonce used for another operation',
        );
      }
      if (requestData.fingerprint !== fingerprint) {
        throwStaffHttpsError(
          'failed-precondition',
          'STAFF_REACTIVATION_NONCE_CONFLICT',
          'clientNonce fingerprint mismatch',
        );
      }
      if (requestData.status === 'succeeded') {
        return {
          kind: 'reused',
          data: rebuildSuccessFromRequestDoc({ clientNonce, requestData }),
        };
      }
      throwStaffHttpsError(
        'internal',
        'STAFF_INTERNAL_ERROR',
        'Incomplete reactivation request state',
      );
    }

    if (!staffSnap.exists) {
      throwStaffHttpsError('not-found', 'STAFF_NOT_FOUND', 'Staff not found');
    }

    const classified = classifyStaffDoc(staffSnap.data());
    if (classified === 'active') {
      throwStaffHttpsError(
        'failed-precondition',
        'STAFF_NOT_RETIRED',
        'Only retired staff can reactivate',
      );
    }
    if (classified === 'invalid') {
      throwStaffHttpsError(
        'failed-precondition',
        'STAFF_INVALID_ARGUMENT',
        'Staff status is not supported',
      );
    }
    if (classified !== 'retired') {
      throwStaffHttpsError(
        'failed-precondition',
        'STAFF_NOT_RETIRED',
        'Only retired staff can reactivate',
      );
    }

    return { kind: 'need_reactivate' };
  });

  if (early.kind === 'reused') {
    return early.data;
  }

  await assertFullNameKanaAvailable({ fullNameKana: pii.fullNameKana, uid });

  const loginId = pii.fullNameKana + pii.birthMonthDay;
  const qr = await prepareStaffQr({ uid, loginId });

  return db().runTransaction(async (tx) => {
    const requestSnap = await tx.get(requestRef);
    const staffSnap = await tx.get(staffRef);

    if (requestSnap.exists) {
      const requestData = requestSnap.data()!;
      if (requestData.operation !== operation || requestData.fingerprint !== fingerprint) {
        throwStaffHttpsError(
          'failed-precondition',
          'STAFF_REACTIVATION_NONCE_CONFLICT',
          'clientNonce conflict',
        );
      }
      if (requestData.status === 'succeeded') {
        return rebuildSuccessFromRequestDoc({ clientNonce, requestData });
      }
    }

    if (!staffSnap.exists) {
      throwStaffHttpsError('not-found', 'STAFF_NOT_FOUND', 'Staff not found');
    }

    // 最新 status を再確認（正本）
    if (normalizeStaffStatus(staffSnap.data()) !== 'retired') {
      throwStaffHttpsError(
        'failed-precondition',
        'STAFF_NOT_RETIRED',
        'Only retired staff can reactivate',
      );
    }

    const successData = buildCreateResponseSnapshot({
      clientNonce,
      alreadyRegistered: false,
      reused: false,
      qrCode: qr.qrCodeImage,
      qrCodeUrl: qr.qrCodeUrl,
      expiresAtMs: qr.expiresAtMs,
    });

    tx.update(staffRef, {
      status: 'active',
      fullName: pii.fullName,
      fullNameKana: pii.fullNameKana,
      email: pii.email,
      phoneNumber: pii.phoneNumber,
      birthMonthDay: pii.birthMonthDay,
      loginId,
      qrCodeUrl: qr.qrCodeUrl,
      qrExpiresAt: admin.firestore.Timestamp.fromMillis(qr.expiresAtMs),
      qrExpiresAtMs: qr.expiresAtMs,
      retiredAt: FieldValue.delete(),
      retiredDate: FieldValue.delete(),
      retiredReason: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(requestRef, {
      operation,
      fingerprint,
      status: 'succeeded',
      staffStatus: 'active',
      alreadyRegistered: false,
      createdAt: FieldValue.serverTimestamp(),
      response: {
        alreadyRegistered: false,
        staffStatus: 'active',
        qrCodeUrl: qr.qrCodeUrl,
        expiresAtMs: qr.expiresAtMs,
        expiresAt: qr.expiresAtMs,
      },
    });

    return successData;
  });
}

export function toCallableStaffMutationResponse(data: StaffMutationSuccessData): Record<string, unknown> {
  // top-level 互換フィールド + data（L5-B strict）
  const body: Record<string, unknown> = {
    success: true,
    data,
    clientNonce: data.clientNonce,
    reused: data.reused,
    alreadyRegistered: data.alreadyRegistered,
    staffStatus: data.staffStatus,
  };
  if (data.qrCode) body.qrCode = data.qrCode;
  if (data.qrCodeUrl) body.qrCodeUrl = data.qrCodeUrl;
  if (typeof data.expiresAtMs === 'number') {
    body.expiresAt = data.expiresAtMs;
    body.expiresAtMs = data.expiresAtMs;
  }
  return body;
}
