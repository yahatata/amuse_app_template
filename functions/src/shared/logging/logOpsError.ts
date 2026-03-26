import { logger } from 'firebase-functions';

/**
 * 保守運用向けエラーログの粗い分類（第1段階 A）。
 * 細かいドメイン区分は functionEntry / operation に寄せる。
 */
export type OpsFailureType =
  | 'config'
  | 'datastore'
  | 'external_api'
  | 'business'
  | 'scheduled'
  | 'webhook'
  | 'internal';

export type LogOpsErrorArgs = {
  /** Cloud Logging 上で見やすい運用者向け短文（従来 logger.error の第1引数） */
  message: string;
  failureType: OpsFailureType;
  /**
   * Cloud Functions のエクスポート名を原則とする。
   * repo / helper 等は呼び出し元エントリに紐づく既存の処理名で揃える。
   */
  functionEntry: string;
  /** 同一エントリ内の区別（任意） */
  operation?: string;
  /** 未指定時は GCLOUD_PROJECT 等から解決 */
  projectId?: string;
  /** 正規化して errorMessage / errorName に反映 */
  cause?: unknown;
  /** cause より優先（設定不備など cause が無い場合） */
  errorMessage?: string;
  errorName?: string;
  /**
   * 既存ログの安全な補助フィールドのみ（機微・全文 payload は載せない）
   */
  context?: Record<string, unknown>;
};

function resolveProjectId(): string {
  return (
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    process.env.PROJECT_ID ||
    'unknown'
  );
}

function normalizeCause(cause: unknown): { errorMessage?: string; errorName?: string } {
  if (cause === undefined || cause === null) {
    return {};
  }
  if (cause instanceof Error) {
    return { errorMessage: cause.message, errorName: cause.name };
  }
  return { errorMessage: String(cause) };
}

/**
 * 既存 logger.error を共通形式へ寄せる（1 呼び出し = 1 ログ行）。
 */
export function logOpsError(args: LogOpsErrorArgs): void {
  const projectId = args.projectId ?? resolveProjectId();
  const fromCause = args.cause !== undefined ? normalizeCause(args.cause) : {};
  const errorMessage = args.errorMessage ?? fromCause.errorMessage;
  const errorName = args.errorName ?? fromCause.errorName;

  const payload: Record<string, unknown> = {
    failureType: args.failureType,
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

  if (args.context) {
    for (const [key, value] of Object.entries(args.context)) {
      if (value !== undefined) {
        payload[key] = value;
      }
    }
  }

  logger.error(args.message, payload);
}

/** postback 等、全文を載せず先頭だけ残す */
export function truncateForLog(value: string, maxLen = 64): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen)}…`;
}
