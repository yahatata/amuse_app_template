/**
 * payroll Callable 向け HttpsError（details.errorKey 付き）
 * message はログ／開発者向け。利用者向け文言には使わない。
 */

import { HttpsError } from 'firebase-functions/v2/https';

export type PayrollHttpsCode =
  | 'unauthenticated'
  | 'invalid-argument'
  | 'failed-precondition'
  | 'not-found'
  | 'internal'
  | 'permission-denied';

export function throwPayrollHttpsError(
  code: PayrollHttpsCode,
  errorKey: string,
  message: string,
  context?: Record<string, unknown>,
): never {
  const details: Record<string, unknown> = { errorKey };
  if (context && Object.keys(context).length > 0) {
    details.context = context;
  }
  throw new HttpsError(code, message, details);
}

export function getPayrollErrorKeyFromUnknown(error: unknown): string | undefined {
  if (error instanceof HttpsError) {
    const details = error.details as { errorKey?: unknown } | undefined;
    if (details && typeof details.errorKey === 'string') {
      return details.errorKey;
    }
  }
  return undefined;
}
