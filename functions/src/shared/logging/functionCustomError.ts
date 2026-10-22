/**
 * function_custom の入口。差分仕様 §12.3 / changeSpec §8。
 * service / functionEntry はログ側で付与し、本型には持たせない。
 */
export class FunctionCustomError extends Error {
  readonly errorKey: string;
  readonly context?: Record<string, unknown>;

  constructor(opts: {
    errorKey: string;
    message: string;
    context?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = 'FunctionCustomError';
    this.errorKey = opts.errorKey;
    this.context = opts.context;
    if (opts.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }
}

/** クライアント向け HttpsError へのマッピング（境界 catch 用のデフォルト） */
export function mapFunctionCustomErrorToHttpsCode(
  errorKey: string
): 'failed-precondition' | 'invalid-argument' | 'already-exists' | 'not-found' {
  if (
    errorKey.includes('NOT_FOUND') ||
    errorKey === 'STORE_STATE_DOC_MISSING'
  ) {
    return 'failed-precondition';
  }
  if (errorKey.includes('MISMATCH') || errorKey.includes('IDEMPOTENCY')) {
    return 'failed-precondition';
  }
  if (errorKey.includes('INVALID') || errorKey.includes('UNAVAILABLE')) {
    return 'failed-precondition';
  }
  if (
    errorKey.includes('ALREADY_STARTED') ||
    errorKey.includes('ALREADY_REGISTERED') ||
    errorKey.includes('ALREADY_DONE') ||
    errorKey.includes('ALREADY_SETTLED') ||
    errorKey.includes('ALREADY_CLOSED') ||
    errorKey.includes('ALREADY_OPEN')
  ) {
    return 'failed-precondition';
  }
  if (errorKey.includes('NOT_STARTED')) {
    return 'failed-precondition';
  }
  if (errorKey.includes('CONFLICT') || errorKey.includes('LEASE')) {
    return 'failed-precondition';
  }
  if (errorKey.includes('ALREADY_PAUSED')) {
    return 'failed-precondition';
  }
  if (errorKey.includes('NOT_PAUSED')) {
    return 'failed-precondition';
  }
  if (errorKey.includes('PRIZE_NOT_CONFIRMED')) {
    return 'failed-precondition';
  }
  if (errorKey.startsWith('TOURNAMENT_')) {
    return 'failed-precondition';
  }
  return 'failed-precondition';
}
