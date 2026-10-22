/**
 * staff create / reactivate の clientNonce / fingerprint
 */

import * as crypto from 'crypto';
import { throwStaffHttpsError } from './staffHttpsError';

export const MAX_STAFF_CLIENT_NONCE_LENGTH = 128;

export const CREATE_STAFF_ACCOUNT_OPERATION = 'create_staff_account';
export const REACTIVATE_STAFF_ACCOUNT_OPERATION = 'reactivate_staff_account';

export type StaffMutationOperation =
  | typeof CREATE_STAFF_ACCOUNT_OPERATION
  | typeof REACTIVATE_STAFF_ACCOUNT_OPERATION;

export function validateStaffClientNonce(
  raw: unknown,
  errorKeyRequired: string,
): string {
  if (typeof raw !== 'string') {
    throwStaffHttpsError('invalid-argument', errorKeyRequired, 'clientNonce must be a string');
  }
  const clientNonce = raw.trim();
  if (!clientNonce) {
    throwStaffHttpsError('invalid-argument', errorKeyRequired, 'clientNonce is required');
  }
  if (clientNonce.length > MAX_STAFF_CLIENT_NONCE_LENGTH) {
    throwStaffHttpsError('invalid-argument', errorKeyRequired, 'clientNonce is too long');
  }
  if (!/^[A-Za-z0-9_.:-]+$/.test(clientNonce)) {
    throwStaffHttpsError(
      'invalid-argument',
      errorKeyRequired,
      'clientNonce has invalid characters',
    );
  }
  return clientNonce;
}

export interface StaffRegistrationPii {
  fullName: string;
  fullNameKana: string;
  email: string;
  phoneNumber: string;
  birthMonthDay: string;
}

export function validateStaffRegistrationPii(raw: {
  fullName?: unknown;
  fullNameKana?: unknown;
  email?: unknown;
  phoneNumber?: unknown;
  birthMonthDay?: unknown;
}): StaffRegistrationPii {
  const fullName = typeof raw.fullName === 'string' ? raw.fullName.trim() : '';
  const fullNameKana = typeof raw.fullNameKana === 'string' ? raw.fullNameKana.trim() : '';
  const email = typeof raw.email === 'string' ? raw.email.trim() : '';
  const phoneNumber = typeof raw.phoneNumber === 'string' ? raw.phoneNumber.trim() : '';
  const birthMonthDay =
    typeof raw.birthMonthDay === 'string' ? raw.birthMonthDay.trim() : '';

  if (!fullName || !fullNameKana || !email || !phoneNumber || !birthMonthDay) {
    throwStaffHttpsError(
      'invalid-argument',
      'STAFF_INVALID_ARGUMENT',
      'Required registration fields are missing',
    );
  }

  if (!/^\d{4}$/.test(birthMonthDay)) {
    throwStaffHttpsError(
      'invalid-argument',
      'STAFF_INVALID_ARGUMENT',
      'birthMonthDay must be 4 digits',
    );
  }

  const phoneRegExp = /^(0[5789]0\d{8}|0[1-9]\d{8,9})$/;
  if (!phoneRegExp.test(phoneNumber)) {
    throwStaffHttpsError(
      'invalid-argument',
      'STAFF_INVALID_ARGUMENT',
      'Invalid phone number format',
    );
  }

  const kanaRegExp = /^[ぁ-んァ-ヶー]+$/;
  if (!kanaRegExp.test(fullNameKana)) {
    throwStaffHttpsError(
      'invalid-argument',
      'STAFF_INVALID_ARGUMENT',
      'fullNameKana must be hiragana or katakana',
    );
  }

  return { fullName, fullNameKana, email, phoneNumber, birthMonthDay };
}

export function buildStaffMutationFingerprint(params: {
  operation: StaffMutationOperation;
  uid: string;
  pii: StaffRegistrationPii;
}): string {
  const payload = {
    birthMonthDay: params.pii.birthMonthDay,
    email: params.pii.email,
    fullName: params.pii.fullName,
    fullNameKana: params.pii.fullNameKana,
    operation: params.operation,
    phoneNumber: params.pii.phoneNumber,
    uid: params.uid,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** ログ用。clientNonce 全文は出さない */
export function shortNonceTrace(clientNonce: string): string {
  return crypto.createHash('sha256').update(clientNonce).digest('hex').slice(0, 12);
}
