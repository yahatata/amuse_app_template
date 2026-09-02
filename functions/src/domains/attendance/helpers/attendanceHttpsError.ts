/**
 * attendance Callable 向け HttpsError（details.errorKey 付き）
 * message はログ／開発者向け。利用者向け文言には使わない。
 * details に UID / PII / stack / path を載せない。
 */

import { HttpsError } from 'firebase-functions/v2/https';

export type AttendanceHttpsCode =
  | 'unauthenticated'
  | 'invalid-argument'
  | 'failed-precondition'
  | 'not-found'
  | 'already-exists'
  | 'internal'
  | 'permission-denied';

export function throwAttendanceHttpsError(
  code: AttendanceHttpsCode,
  errorKey: string,
  message: string,
): never {
  throw new HttpsError(code, message, { errorKey });
}

export function getAttendanceErrorKeyFromUnknown(error: unknown): string | undefined {
  if (error instanceof HttpsError) {
    const details = error.details as { errorKey?: unknown } | undefined;
    if (details && typeof details.errorKey === 'string') {
      return details.errorKey;
    }
  }
  return undefined;
}

/** client が本人性を偽装しうるフィールドを拒否 */
export function rejectClientIdentityFields(
  data: Record<string, unknown> | null | undefined,
  extraKeys: string[] = [],
): void {
  if (data == null || typeof data !== 'object') return;
  const forbidden = ['staffId', 'uid', 'userId', ...extraKeys];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined) {
      throwAttendanceHttpsError(
        'invalid-argument',
        'ATTENDANCE_INVALID_ARGUMENT',
        `Client must not send ${key}`,
      );
    }
  }
}
