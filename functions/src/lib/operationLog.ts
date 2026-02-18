/**
 * operationLogs コレクションへの書き込みヘルパー
 * docs/operation_log_callable_target_list.md の設計に準拠
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export type OperationLogStatus = 'succeeded' | 'failed';

/** 単一操作ログ作成パラメータ */
export interface WriteSingleOperationLogParams {
  operationId: string;
  operationName: string;
  deviceId: string;
  deviceName?: string | null;
  status: OperationLogStatus;
  errorSummary?: string | null;
  startedAt?: FirebaseFirestore.FieldValue | null;
  payload: Record<string, unknown>;
}

const ERROR_SUMMARY_MAX_LENGTH = 200;

/**
 * 失敗時のエラーメッセージから errorSummary 用の短い文字列を生成する
 */
export function toErrorSummary(error: unknown): string {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error);
  return msg.slice(0, ERROR_SUMMARY_MAX_LENGTH);
}

/**
 * 単一操作の operationLog を 1 件作成する。
 * 成功・失敗どちらでも呼び、status で区別する。
 * createdAt は必ず Functions 側で serverTimestamp() を設定する。
 */
export async function writeSingleOperationLog(
  params: WriteSingleOperationLogParams
): Promise<void> {
  const db = getFirestore();
  const ref = db.collection('operationLogs').doc(params.operationId);

  const data: Record<string, unknown> = {
    operationId: params.operationId,
    operationName: params.operationName,
    deviceId: params.deviceId,
    status: params.status,
    payload: params.payload,
    createdAt: FieldValue.serverTimestamp(),
  };

  if (params.deviceName != null && params.deviceName !== '') {
    data.deviceName = params.deviceName;
  }
  if (params.status === 'failed' && params.errorSummary != null) {
    data.errorSummary = params.errorSummary;
  }
  if (params.startedAt != null) {
    data.startedAt = params.startedAt;
  }

  await ref.set(data);
}

/** 方式 A' 用: 1 チャンクあたりの最大エントリ数 */
export const BULK_OPERATION_LOG_CHUNK_SIZE = 30;

/** 方式 A' の 1 チャンク分のフィールド */
export interface BulkChunkFields {
  bulkOperationId: string;
  chunkIndex: number;
  totalChunks: number;
  operationName: string;
  deviceId: string;
  deviceName?: string | null;
  status: OperationLogStatus;
  errorSummary?: string | null;
  startedAt?: FirebaseFirestore.FieldValue | null;
  tournamentId: string;
  actionLogId: string;
  tableId?: string | null; // op-102 のみ
  entries: Record<string, Record<string, unknown>>;
}

/**
 * 方式 A': 1 チャンク分の operationLog ドキュメントを 1 件作成する。
 * ドキュメント ID は {bulkOperationId}-{chunkIndex}。
 * createdAt は Functions 側で serverTimestamp() を設定する。
 */
export async function writeBulkOperationLogChunk(
  params: BulkChunkFields
): Promise<void> {
  const db = getFirestore();
  const docId = `${params.bulkOperationId}-${params.chunkIndex}`;
  const ref = db.collection('operationLogs').doc(docId);

  const data: Record<string, unknown> = {
    bulkOperationId: params.bulkOperationId,
    chunkIndex: params.chunkIndex,
    totalChunks: params.totalChunks,
    operationName: params.operationName,
    deviceId: params.deviceId,
    status: params.status,
    tournamentId: params.tournamentId,
    actionLogId: params.actionLogId,
    entries: params.entries,
    createdAt: FieldValue.serverTimestamp(),
  };

  if (params.deviceName != null && params.deviceName !== '') {
    data.deviceName = params.deviceName;
  }
  if (params.status === 'failed' && params.errorSummary != null) {
    data.errorSummary = params.errorSummary;
  }
  if (params.startedAt != null) {
    data.startedAt = params.startedAt;
  }
  if (params.tableId != null) {
    data.tableId = params.tableId;
  }

  await ref.set(data);
}

/**
 * 方式 A': entries を CHUNK_SIZE ずつに分割し、複数チャンクを書き込む。
 * 1 チャンクあたり最大 BULK_OPERATION_LOG_CHUNK_SIZE 件。
 */
export async function writeBulkOperationLogChunked(
  bulkOperationId: string,
  operationName: string,
  deviceId: string,
  deviceName: string | null | undefined,
  tournamentId: string,
  actionLogId: string,
  entries: Record<string, Record<string, unknown>>,
  status: OperationLogStatus,
  options?: {
    errorSummary?: string | null;
    startedAt?: FirebaseFirestore.FieldValue | null;
    tableId?: string | null;
  }
): Promise<void> {
  const entryIds = Object.keys(entries);
  const totalChunks = Math.ceil(entryIds.length / BULK_OPERATION_LOG_CHUNK_SIZE);

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * BULK_OPERATION_LOG_CHUNK_SIZE;
    const end = Math.min(start + BULK_OPERATION_LOG_CHUNK_SIZE, entryIds.length);
    const chunkEntryIds = entryIds.slice(start, end);
    const chunkEntries: Record<string, Record<string, unknown>> = {};
    for (const id of chunkEntryIds) {
      chunkEntries[id] = entries[id];
    }

    await writeBulkOperationLogChunk({
      bulkOperationId,
      chunkIndex,
      totalChunks,
      operationName,
      deviceId,
      deviceName: deviceName ?? undefined,
      tournamentId,
      actionLogId,
      tableId: options?.tableId,
      entries: chunkEntries,
      status,
      errorSummary: options?.errorSummary ?? undefined,
      startedAt: options?.startedAt ?? undefined,
    });
  }
}
