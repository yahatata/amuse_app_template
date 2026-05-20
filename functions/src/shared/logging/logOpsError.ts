import { logger } from 'firebase-functions';
import { getRequiredProjectId } from '../runtime/projectId';
import { FunctionCustomError } from './functionCustomError';
import { extractExternalFromCause, type SourceProductId } from './externalFromCause';
import { resolveServiceForFunctionEntry } from './serviceByFunctionEntry';

export type ErrorSource = 'external_api' | 'function_common' | 'function_custom';

export type LogOpsErrorArgs = {
  /** Cloud Logging 上で見やすい運用者向け短文 */
  message: string;
  functionEntry: string;
  operation?: string;
  projectId?: string;
  cause?: unknown;
  errorMessage?: string;
  errorName?: string;
  context?: Record<string, unknown>;
  /** 明示時は最優先（差分仕様 §7） */
  errorSource?: ErrorSource;
  errorKey?: string;
  sourceProduct?: SourceProductId;
  sdkCode?: string;
  httpStatus?: number | string;
  detailReason?: string;
  /**
   * shape だけでは sourceProduct が決まらない単一 API 専用 catch での補助（差分仕様 §15.3）
   */
  sourceProductHint?: SourceProductId;
};

function resolveProjectId(): string {
  return getRequiredProjectId();
}

function normalizeCause(cause: unknown): { errorMessage?: string; errorName?: string } {
  if (cause === undefined || cause === null) {
    return {};
  }
  if (cause instanceof FunctionCustomError) {
    return { errorMessage: cause.message, errorName: cause.name };
  }
  if (cause instanceof Error) {
    return { errorMessage: cause.message, errorName: cause.name };
  }
  return { errorMessage: String(cause) };
}

function resolveErrorSource(args: LogOpsErrorArgs, cause: unknown): ErrorSource {
  if (args.errorSource) {
    return args.errorSource;
  }
  if (args.errorKey) {
    return 'function_custom';
  }
  if (cause instanceof FunctionCustomError) {
    return 'function_custom';
  }
  const ext = extractExternalFromCause(cause, args.sourceProductHint);
  if (ext && ext.sourceProduct) {
    return 'external_api';
  }
  return 'function_common';
}

function resolveService(args: { functionEntry: string }): string {
  return resolveServiceForFunctionEntry(args.functionEntry);
}

/**
 * 既存 logger.error を共通形式へ寄せる（1 呼び出し = 1 ログ行）。
 * context はネストのまま payload.context に載せる（差分仕様 §14.3）。
 */
export function logOpsError(args: LogOpsErrorArgs): void {
  const projectId = args.projectId ?? resolveProjectId();
  const cause = args.cause;

  let errorMessage = args.errorMessage;
  let errorName = args.errorName;
  let errorKey: string | undefined = args.errorKey;
  let mergedContext: Record<string, unknown> | undefined = args.context ? { ...args.context } : undefined;

  if (cause instanceof FunctionCustomError) {
    const fromC = normalizeCause(cause);
    errorMessage = args.errorMessage ?? fromC.errorMessage;
    errorName = args.errorName ?? fromC.errorName;
    errorKey = args.errorKey ?? cause.errorKey;
    if (cause.context && Object.keys(cause.context).length > 0) {
      mergedContext = { ...cause.context, ...mergedContext };
    }
  } else {
    const fromCause = cause !== undefined ? normalizeCause(cause) : {};
    errorMessage = args.errorMessage ?? fromCause.errorMessage;
    errorName = args.errorName ?? fromCause.errorName;
  }

  const errorSource = resolveErrorSource(args, cause);
  const service = resolveService(args);

  let sourceProduct = args.sourceProduct;
  let sdkCode = args.sdkCode;
  let httpStatus = args.httpStatus;
  let detailReason = args.detailReason;

  // `errorKey` / FC により function_custom でも、cause が SDK/API 形なら外部4項目を補完（差分仕様: custom と external 材料の併記）
  if (errorSource === 'external_api' || errorSource === 'function_custom') {
    const ext = extractExternalFromCause(cause, args.sourceProductHint);
    if (ext) {
      sourceProduct = sourceProduct ?? ext.sourceProduct;
      sdkCode = sdkCode ?? ext.sdkCode;
      httpStatus = httpStatus ?? ext.httpStatus;
      detailReason = detailReason ?? ext.detailReason;
    }
  }

  const payload: Record<string, unknown> = {
    errorSource,
    service,
    functionEntry: args.functionEntry,
    projectId,
  };

  if (args.operation !== undefined) {
    payload.operation = args.operation;
  }
  if (errorMessage !== undefined) {
    payload.errorMessage = errorMessage;
  }
  if (errorName !== undefined) {
    payload.errorName = errorName;
  }

  if (mergedContext !== undefined && Object.keys(mergedContext).length > 0) {
    payload.context = mergedContext;
  }

  if (errorSource === 'function_custom' && errorKey !== undefined) {
    payload.errorKey = errorKey;
  }

  if (errorSource === 'external_api' || errorSource === 'function_custom') {
    if (sourceProduct !== undefined) {
      payload.sourceProduct = sourceProduct;
    }
    if (sdkCode !== undefined) {
      payload.sdkCode = sdkCode;
    }
    if (httpStatus !== undefined) {
      payload.httpStatus = httpStatus;
    }
    if (detailReason !== undefined) {
      payload.detailReason = detailReason;
    }
  }

  logger.error(args.message, payload);
}

export type LogOpsSuccessArgs = {
  message: string;
  functionEntry: string;
  operation?: string;
  projectId?: string;
  context?: Record<string, unknown>;
};

/**
 * 失敗の logOpsError と同じ相関用 context キーで 1 行に載せる（`outcome: success`）。
 */
export function logOpsSuccess(args: LogOpsSuccessArgs): void {
  const projectId = args.projectId ?? resolveProjectId();
  const service = resolveService(args);
  const payload: Record<string, unknown> = {
    outcome: "success" as const,
    service,
    functionEntry: args.functionEntry,
    projectId,
  };
  if (args.operation !== undefined) {
    payload.operation = args.operation;
  }
  if (args.context !== undefined && Object.keys(args.context).length > 0) {
    payload.context = args.context;
  }
  logger.info(args.message, payload);
}

export type LogOpsInfoArgs = {
  message: string;
  functionEntry: string;
  operation?: string;
  projectId?: string;
  context?: Record<string, unknown>;
};

/**
 * handler 到達などの情報ログ（未実行検知用）。`outcome: info` / `eventType: start`。
 */
export function logOpsInfo(args: LogOpsInfoArgs): void {
  const projectId = args.projectId ?? resolveProjectId();
  const service = resolveService(args);
  const payload: Record<string, unknown> = {
    outcome: "info" as const,
    eventType: "start" as const,
    service,
    functionEntry: args.functionEntry,
    projectId,
    operation: args.operation ?? "start",
  };
  if (args.context !== undefined && Object.keys(args.context).length > 0) {
    payload.context = args.context;
  }
  logger.info(args.message, payload);
}

/** postback 等、全文を載せず先頭だけ残す */
export function truncateForLog(value: string, maxLen = 64): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen)}…`;
}
