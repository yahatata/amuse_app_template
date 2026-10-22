/**
 * 注文 Callable 向け HttpsError（details.errorKey 付き）
 *
 * message はログ／開発者向け。利用者向け文言には使わない。
 */

import { HttpsError } from 'firebase-functions/v2/https';

export type OrderHttpsCode =
  | 'unauthenticated'
  | 'invalid-argument'
  | 'failed-precondition'
  | 'not-found'
  | 'internal'
  | 'permission-denied';

export function throwOrderHttpsError(
  code: OrderHttpsCode,
  errorKey: string,
  message: string,
): never {
  throw new HttpsError(code, message, { errorKey });
}

export function getErrorKeyFromUnknown(error: unknown): string | undefined {
  if (error instanceof HttpsError) {
    const details = error.details as { errorKey?: unknown } | undefined;
    if (details && typeof details.errorKey === 'string') {
      return details.errorKey;
    }
  }
  return undefined;
}
