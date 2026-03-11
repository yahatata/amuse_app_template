/**
 * デュアルライト処理ユーティリティ
 * 
 * helper_api_plan.md §3 に準拠:
 * - 正（真実源）は bills
 * - todaysBills への複写は最小限・ベストエフォート
 * - 再試行は行わず、失敗は Cloud Logging のみ記録
 * - docID は必ず billId
 */

import { Transaction } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';

/**
 * WRITE_TODAYS_BILLS_IN_PARALLEL フラグを取得
 * storeMeta/config から features.dualWriteEnabled を参照する。
 */
export async function shouldDualWrite(): Promise<boolean> {
  const { getStoreConfig } = await import('../../../shared/config/configLoader');
  const config = await getStoreConfig();
  return config.features?.dualWriteEnabled ?? false;
}

/**
 * createBillWithActiveStay のデュアルライト処理（トランザクション内）
 * 
 * @param tx トランザクション
 * @param db Firestore インスタンス
 * @param params パラメータ
 * @returns デュアルライト結果
 */
export function dualWriteTodaysBillsSkeleton(
  tx: Transaction,
  db: admin.firestore.Firestore,
  params: {
    enabled: boolean;
    billId: string;
    userId: string;
    pokerName?: string | null;
    businessDate: string;
  }
): { enabled: boolean; result: 'success' | 'failed' | 'skipped' } {
  if (!params.enabled) {
    return { enabled: false, result: 'skipped' };
  }

  const legacyRef = db.collection('todaysBills').doc(params.billId); // ★ docIDは必ず billId
  
  try {
    // スケルトン最小限のみ（金額フィールドは書かない）
    tx.set(legacyRef, {
      status: 'open',
      pokerName: params.pokerName ?? '',
      items: [],
      sideGameChip: [], // 旧コレでは単数名を使用
      place: {
        table: null,
        seat: null,
      },
      date: params.businessDate,
      userId: params.userId,
      // totalPrice 等の金額フィールドは書かない（新 bills がSSoT）
    }, { merge: false });
    
    return { enabled: true, result: 'success' };
  } catch (error: any) {
    // 失敗時は throw せず warning ログに留める（bills を正とする）
    logger.warn('dualWriteTodaysBillsSkeleton failed', {
      billId: params.billId,
      userId: params.userId,
      reason: error?.message || String(error),
    });
    
    return { enabled: true, result: 'failed' };
  }
}

// ===== appendItem 用のデュアルライト更新ユーティリティ =====

/**
 * appendItem の DualWrite 更新
 * - docID は必ず billId
 * - items 配列に legacyItem を arrayUnion で追加
 * - ここは薄いラッパー：テストで jest.mock して throw させる
 */
export async function legacyAppendItemUpdate(
  tx: Transaction,
  db: admin.firestore.Firestore,
  params: {
    billId: string;
    legacyItem: any;
  }
): Promise<void> {
  const legacyRef = db.collection('todaysBills').doc(params.billId);
  tx.update(legacyRef, {
    items: admin.firestore.FieldValue.arrayUnion(params.legacyItem),
  });
}

// ===== appendSideGameChip 用のデュアルライト更新ユーティリティ =====

/**
 * appendSideGameChip の DualWrite 更新
 * - docID は必ず billId
 * - sideGameChip 配列に legacyChip を arrayUnion で追加
 * - トランザクション外でベストエフォート実行（bills のトランザクション完了後）
 * - ここは薄いラッパー：テストで jest.mock して throw させる
 */
export async function legacyAppendSideGameChipUpdate(
  db: admin.firestore.Firestore,
  params: {
    billId: string;
    legacyChip: any;
  }
): Promise<void> {
  const legacyRef = db.collection('todaysBills').doc(params.billId);
  await legacyRef.update({
    sideGameChip: admin.firestore.FieldValue.arrayUnion(params.legacyChip),
  });
}

// ===== updatePlace 用のデュアルライト更新ユーティリティ =====

/**
 * updatePlace の DualWrite 更新
 * - docID は必ず billId
 * - currentTable, currentSeat を更新
 * - トランザクション外でベストエフォート実行（bills のトランザクション完了後）
 * - ここは薄いラッパー：テストで jest.mock して throw させる
 */
export async function legacyUpdatePlaceUpdate(
  db: admin.firestore.Firestore,
  params: {
    billId: string;
    currentTable: string | null;
    currentSeat: number | null;
  }
): Promise<void> {
  const legacyRef = db.collection('todaysBills').doc(params.billId);
  await legacyRef.update({
    currentTable: params.currentTable,
    currentSeat: params.currentSeat,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ===== recordTournamentAction 用のデュアルライト更新ユーティリティ =====

/**
 * recordTournamentAction の DualWrite 更新
 * - docID は必ず billId
 * - tournaments マップ（オブジェクト）に該当 tplId のエントリをupsert
 * - トランザクション外でベストエフォート実行（bills のトランザクション完了後）
 * - ここは薄いラッパー：テストで jest.mock して throw させる
 */
export async function legacyRecordTournamentActionUpdate(
  db: admin.firestore.Firestore,
  params: {
    billId: string;
    templateId: string;
    templateName: string;
    entryFee: number | null;
    reentryFee: number | null;
    addonFee: number | null;
    entryCount: number;
    reentryCount: number;
    addonCount: number;
    registeredAt: string | null;
    lastReentryAt: string | null;
    lastAddonAt: string | null;
    startAt: string | null;
  }
): Promise<void> {
  const legacyRef = db.collection('todaysBills').doc(params.billId);
  
  // tournaments マップ（オブジェクト）に該当 tplId のエントリをupsert
  const tournamentEntry: any = {
    templateId: params.templateId,
    templateName: params.templateName,
    entryFee: params.entryFee ?? null,
    reentryFee: params.reentryFee ?? null,
    addonFee: params.addonFee ?? null,
    entryCount: params.entryCount,
    reentryCount: params.reentryCount,
    addonCount: params.addonCount,
  };
  
  if (params.registeredAt) {
    tournamentEntry.registeredAt = admin.firestore.Timestamp.fromDate(new Date(params.registeredAt));
  }
  if (params.lastReentryAt) {
    tournamentEntry.lastReentryAt = admin.firestore.Timestamp.fromDate(new Date(params.lastReentryAt));
  }
  if (params.lastAddonAt) {
    tournamentEntry.lastAddonAt = admin.firestore.Timestamp.fromDate(new Date(params.lastAddonAt));
  }
  if (params.startAt) {
    tournamentEntry.startAt = admin.firestore.Timestamp.fromDate(new Date(params.startAt));
  }
  
  await legacyRef.update({
    [`tournaments.${params.templateId}`]: tournamentEntry,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ===== startAccounting 用のデュアルライト更新ユーティリティ =====

/**
 * startAccounting の DualWrite 更新
 * - docID は必ず billId
 * - status のみ更新（accountingStartedAt 等は更新しない）
 * - トランザクション外でベストエフォート実行（bills のトランザクション完了後）
 * - ここは薄いラッパー：テストで jest.mock して throw させる
 */
export async function legacyStartAccountingUpdate(
  db: admin.firestore.Firestore,
  params: {
    billId: string;
  }
): Promise<void> {
  const legacyRef = db.collection('todaysBills').doc(params.billId);
  await legacyRef.update({
    status: 'settling',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ===== updateBill 用のデュアルライト更新ユーティリティ =====

/**
 * updateBill の DualWrite 更新
 * - docID は必ず billId
 * - 該当フィールド（status など）を更新（金額フィールドは更新しない）
 * - トランザクション外でベストエフォート実行（bills のトランザクション完了後）
 * - ここは薄いラッパー：テストで jest.mock して throw させる
 */
export async function legacyUpdateBillUpdate(
  db: admin.firestore.Firestore,
  params: {
    billId: string;
    updates: Record<string, any>;
  }
): Promise<void> {
  const legacyRef = db.collection('todaysBills').doc(params.billId);
  
  // 安全なフィールドのみを更新（金額フィールドは除外）
  const safeUpdates: Record<string, any> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  
  // status のみ DualWrite（その他のフィールドは必要に応じて追加）
  if (params.updates.status !== undefined) {
    safeUpdates.status = params.updates.status;
  }
  
  await legacyRef.update(safeUpdates);
}
