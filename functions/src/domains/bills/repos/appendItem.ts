/**
 * appendItem ヘルパAPI
 * 
 * api_contract.md §2.2 に準拠
 * helper_api_plan.md §10 に準拠
 * 
 * 強い冪等（時間窓なし、expiresAt廃止）を採用
 * サーバ側でメニュー情報を正規化（クライアントのname/category/priceは信用しない）
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { logOpsError } from '../../../shared/logging/logOpsError';
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import * as crypto from 'crypto';
import { resolveMenuItem } from './resolveMenuItem';
import { shouldDualWrite, legacyAppendItemUpdate } from './dualWrite';

/**
 * リクエストペイロードの正規化ハッシュを生成
 */
function stableHash(input: unknown): string {
  const json = JSON.stringify(input, Object.keys((input as any) ?? {}).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

export interface AppendItemRequest {
  billId: string;
  item: {
    menuItemId: string;
    quantity: number;
    clientNonce: string;
  };
  idempotencyKey: string;
}

export interface AppendItemResponse {
  success: boolean;
  billId: string;
  itemId: string;
  orderedAt: string; // ISO8601形式
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}

/**
 * appendItemCore: トランザクション内で items を作成するコアロジック
 * 
 * @param tx トランザクション
 * @param db Firestore インスタンス
 * @param params パラメータ
 * @returns トランザクション内で取得可能な情報（orderedAt は空文字、後で設定）
 */
export interface AppendItemCoreParams {
  billId: string;
  menuItemId: string;
  quantity: number;
  idempotencyKey: string;
  requestHash: string;
  resolved: {
    menuItemId: string;
    name: string;
    category: string;
    unitPriceIncl: number;
  }; // トランザクション外で解決済みのメニュー情報
}

export interface AppendItemCoreResult {
  success: boolean;
  billId: string;
  itemId: string;
  orderedAt: string; // ISO8601形式（トランザクション内では空文字、後で設定）
  reused: boolean;
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
  dualWriteResult?: 'success' | 'failed' | 'skipped';
  dualWriteError?: any;
}

export async function appendItemCore(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  params: AppendItemCoreParams
): Promise<AppendItemCoreResult> {
  const { billId, quantity, idempotencyKey, requestHash, resolved } = params;
  // menuItemId は resolved.menuItemId から取得するため、ここでは使用しない
  
  const billRef = db.collection('bills').doc(billId);
  const idempotencyRef = billRef.collection('idempotency').doc(idempotencyKey);

  // 1) 強い冪等チェック
  const idemSnap = await tx.get(idempotencyRef);
  if (idemSnap.exists) {
    const prevHash = idemSnap.data()?.requestHash;
    if (prevHash && prevHash !== requestHash) {
      throw new FunctionCustomError({
        errorKey: 'ACCOUNTING_IDEMPOTENCY_MISMATCH',
        message: 'idempotency requestHash mismatch',
        context: { billId, op: 'appendItemCore' },
      });
    }
    // ハッシュ一致 → 既存docを返却（親updatedAtは更新しない）
    
    // idempotency ドキュメントから itemId を取得
    const savedItemId = idemSnap.data()?.itemId as string;
    if (!savedItemId) {
      throw new HttpsError('internal', 'idempotency exists but itemId missing');
    }
    
    // 既存の item ドキュメントを取得して orderedAt を返す
    const itemRef = billRef.collection('items').doc(savedItemId);
    const itemSnap = await tx.get(itemRef);
    if (!itemSnap.exists) {
      throw new HttpsError('internal', 'idempotency exists but item missing');
    }
    
    const itemData = itemSnap.data()!;
    const orderedAt = itemData.orderedAt;
    const orderedAtIso = orderedAt && orderedAt.toDate ? orderedAt.toDate().toISOString() : new Date().toISOString();
    
    // 既存レスポンスを返却（親updatedAtは更新しない）
    return {
      success: true,
      billId,
      itemId: savedItemId, // idempotencyKey と同じ値
      orderedAt: orderedAtIso,
      reused: true,
      diagnostics: {
        reason: 'idempotent replay',
        reused: true,
      },
    };
  }

  // 2) bills/{billId} を読み込み、status チェック
  const billSnap = await tx.get(billRef);
  if (!billSnap.exists) {
    throw new HttpsError('not-found', `Bill not found: ${billId}`);
  }

  const billData = billSnap.data()!;
  const status = billData.status as string;
  
  // 許可: open/in_progress、拒否: settling/settled/voided
  const allowed = status === 'open' || status === 'in_progress';
  if (!allowed) {
    throw new FunctionCustomError({
      errorKey: 'ACCOUNTING_INVALID_STATE',
      message: `Cannot append item to bill with status: ${status}`,
      context: { billId, billStatus: status, op: 'appendItem' },
    });
  }

  // 3) メニューアイテムは既に解決済み（params.resolved を使用）

  // 4) /bills/{billId}/items/{itemId} を作成（itemId = idempotencyKey）
  const itemId = idempotencyKey; // itemId と idempotencyKey を同一化
  const itemRef = billRef.collection('items').doc(itemId);
  const now = admin.firestore.FieldValue.serverTimestamp();

  // 5) デュアルライト: todaysBills の読み取りを書き込みの前に実行（トランザクションの制約）
  let legacyRef: admin.firestore.DocumentReference | null = null;
  let legacySnap: admin.firestore.DocumentSnapshot | null = null;
  if (await shouldDualWrite()) {
    legacyRef = db.collection('todaysBills').doc(billId);
    legacySnap = await tx.get(legacyRef);
  }
  
  // 6) 書き込み操作（すべての読み取りの後に実行）
  tx.set(itemRef, {
    menuItemId: resolved.menuItemId,
    category: resolved.category,
    name: resolved.name,
    unitPriceIncl: resolved.unitPriceIncl,
    quantity,
    totalPriceIncl: resolved.unitPriceIncl * quantity,
    orderedAt: now,
    voided: false,
    // createdAt/updatedAt は持たせない（親 updatedAt のみ更新）
  });

  // 7) 親 /bills/{billId}.updatedAt を更新
  tx.update(billRef, {
    updatedAt: now,
  });

  // 8) /bills/{billId}/idempotency/{idempotencyKey} を作成（expiresAtは保存しない、itemIdを保存）
  tx.set(idempotencyRef, {
    requestHash,
    createdAt: now,
    itemId, // itemId を保存（replay 時に使用）
    // expiresAt は保存しない（会計確定時に一括削除）
  });

  // 9) デュアルライト: todaysBills.items 配列に行追加（金額は更新しない、arrayUnion使用）
  let dualWriteResult: 'success' | 'failed' | 'skipped' = 'skipped';
  let dualWriteError: any = null;
  
  if ((await shouldDualWrite()) && legacyRef && legacySnap && legacySnap.exists) {
    try {
      // 旧スキーマに合わせた形式で追加（orderId = itemId 必須、金額フィールドは入れない）
      // arrayUnion は完全一致で重複検出するため、最小限 & 安定キーのみにする
      const legacyItem = {
        orderId: itemId, // itemId を必須フィールドとして保持（重複抑止）
        menuItemId: resolved.menuItemId,
        category: resolved.category,
        name: resolved.name,
        quantity,
        // orderedAt は入れない（serverTimestamp() は毎回異なり得るため、arrayUnion の重複検出に不向き）
        // 金額フィールドは入れない（SSoTは bills）
      };
      
      // 分離した関数経由で更新（テストでモック可能）
      await legacyAppendItemUpdate(tx, db, {
        billId,
        legacyItem,
      });
      dualWriteResult = 'success';
    } catch (error: any) {
      // 失敗時は警告ログのみ（bills を正とする）
      dualWriteResult = 'failed';
      dualWriteError = error;
    }
  }

  // 10) トランザクション内では orderedAt の実値を取得できないため、
  // トランザクション外で取得する（戻り値は後で設定）
  return {
    success: true,
    billId,
    itemId,
    orderedAt: '', // トランザクション外で設定
    reused: false,
    dualWriteResult,
    dualWriteError,
  };
}

/**
 * 伝票にアイテムを追加
 * 
 * @param request リクエスト
 * @returns レスポンス
 */
export async function appendItem(request: AppendItemRequest): Promise<AppendItemResponse> {
  const { billId, item, idempotencyKey } = request;
  const { menuItemId, quantity, clientNonce } = item;

  // バリデーション
  if (!billId || !menuItemId || !idempotencyKey || !clientNonce) {
    throw new HttpsError('invalid-argument', 'billId, menuItemId, idempotencyKey, clientNonce are required');
  }

  if (quantity <= 0 || !Number.isInteger(quantity)) {
    throw new HttpsError('invalid-argument', 'quantity must be a positive integer');
  }

  const db = getFirestore();
  const billRef = db.collection('bills').doc(billId);

  // requestHash を生成（billId, menuItemId, quantity を正規化）
  const requestHash = stableHash({
    billId,
    menuItemId,
    quantity,
  });

  // トランザクション前にメニュー情報を解決（トランザクション内で外部呼び出しを避ける）
  const resolved = await resolveMenuItem(menuItemId);

  let reused = false;

  try {
    const result: AppendItemCoreResult = await db.runTransaction(async (tx) => {
      return await appendItemCore(tx, db, {
        billId,
        menuItemId,
        quantity,
        idempotencyKey,
        requestHash,
        resolved, // トランザクション外で解決済みのメニュー情報
      });
    });
    
    reused = result.reused;

    // 11) トランザクション後に item ドキュメントを読み直して orderedAt の実値を取得
    // （serverTimestamp の実際の値を返すため）
    const itemRef = billRef.collection('items').doc(result.itemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) {
      throw new HttpsError('internal', 'Item document not found after transaction');
    }
    const itemData = itemSnap.data()!;
    const orderedAt = itemData.orderedAt;
    const orderedAtIso = orderedAt && orderedAt.toDate ? orderedAt.toDate().toISOString() : new Date().toISOString();

    // orderedAt を設定
    result.orderedAt = orderedAtIso;

    // DualWriteログを出力（三分岐）
    if (result.dualWriteResult === 'success') {
      logger.info('dualWrite appendItem ok', {
        op: 'appendItem',
        billId,
        itemId: result.itemId,
        dualWriteResult: 'success',
      });
    } else if (result.dualWriteResult === 'failed') {
      logger.warn('dualWrite appendItem failed', {
        op: 'appendItem',
        billId,
        itemId: result.itemId,
        dualWriteResult: 'failed',
        reason: result.dualWriteError?.message || String(result.dualWriteError),
      });
    } else if (result.dualWriteResult === 'skipped') {
      logger.info('dualWrite appendItem skipped', {
        op: 'appendItem',
        billId,
        itemId: result.itemId,
        dualWriteResult: 'skipped',
      });
    }

    logger.info('appendItem', {
      op: 'appendItem',
      billId,
      itemId: result.itemId,
      idempKey: idempotencyKey,
      result: reused ? 'reused' : 'ok',
      requestHash8: requestHash.substring(0, 8),
    });

    // dualWriteResult と dualWriteError を戻り値から削除（内部情報のみ）
    const { dualWriteResult: _, dualWriteError: __, ...response } = result;
    return response as AppendItemResponse;
  } catch (error) {
    logOpsError({
      message: 'appendItem: failed',
      failureType: 'business',
      functionEntry: 'appendItem',
      cause: error,
      context: {
        op: 'appendItem',
        billId,
        idempKey: idempotencyKey,
        result: 'fail',
        code: error instanceof HttpsError ? error.code : 'internal',
        requestHash8: requestHash.substring(0, 8),
      },
    });

    if (error instanceof FunctionCustomError) {
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Failed to append item');
  }
}

/**
 * appendItemWithOrderProjection: items と orders を同一トランザクションで作成
 */
export interface AppendItemWithOrderProjectionRequest {
  billId: string;
  item: {
    menuItemId: string;
    quantity: number;
    clientNonce: string;
  };
  idempotencyKey: string;
  businessDate: string; // billData.businessDate から取得
  userId: string; // billData.party.userId から取得
  userName: string; // billData.party.pokerName から取得
  currentTable?: string | null; // billData.place?.table から取得
  currentSeat?: number | null; // billData.place?.seat から取得
}

export interface AppendItemWithOrderProjectionResponse {
  success: boolean;
  billId: string;
  itemId: string;
  orderedAt: string; // ISO8601形式
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}

/**
 * items と orders を同一トランザクションで作成
 * 
 * @param request リクエスト
 * @returns レスポンス
 */
export async function appendItemWithOrderProjection(
  request: AppendItemWithOrderProjectionRequest
): Promise<AppendItemWithOrderProjectionResponse> {
  const { billId, item, idempotencyKey, businessDate, userId, userName, currentTable, currentSeat } = request;
  const { menuItemId, quantity, clientNonce } = item;

  // バリデーション
  if (!billId || !menuItemId || !idempotencyKey || !clientNonce) {
    throw new HttpsError('invalid-argument', 'billId, menuItemId, idempotencyKey, clientNonce are required');
  }

  if (quantity <= 0 || !Number.isInteger(quantity)) {
    throw new HttpsError('invalid-argument', 'quantity must be a positive integer');
  }

  if (!businessDate || !userId || !userName) {
    throw new HttpsError('invalid-argument', 'businessDate, userId, userName are required');
  }

  const db = getFirestore();
  const billRef = db.collection('bills').doc(billId);

  // requestHash を生成（billId, menuItemId, quantity を正規化）
  const requestHash = stableHash({
    billId,
    menuItemId,
    quantity,
  });

  // itemId = orderId = idempotencyKey に固定
  const itemId = idempotencyKey;
  const orderId = itemId;

  // orders 関連の参照
  const orderDocId = businessDate.replace(/-/g, ''); // "2025-11-15" -> "20251115"
  const ordersRef = db.collection('orders').doc(orderDocId);
  const todaysOrderRef = ordersRef.collection('_TodaysOrders').doc(orderId);

  // トランザクション前にメニュー情報を解決（トランザクション内で外部呼び出しを避ける）
  const resolved = await resolveMenuItem(menuItemId);
  const now = new Date();

  let reused = false;

  try {
    const result = await db.runTransaction(async (tx) => {
      // 0) すべての読み取りを先に実行（Firestore トランザクションの制約）
      // orders 関連の読み取り
      const ordersSnap = await tx.get(ordersRef);
      const todaysOrderSnap = await tx.get(todaysOrderRef);
      const isNewOrder = !todaysOrderSnap.exists;

      // 1) appendItemCore を呼び出して items を作成（内部で読み取りと書き込みを実行）
      const itemResult = await appendItemCore(tx, db, {
        billId,
        menuItemId,
        quantity,
        idempotencyKey,
        requestHash,
        resolved, // トランザクション外で解決済みのメニュー情報
      });

      reused = itemResult.reused;

      // 2) 既存の場合は orders の存在確認と不整合チェック
      if (reused) {
        // items が既に存在する場合、orders も存在することを確認
        if (!todaysOrderSnap.exists) {
          // 不整合: items は存在するが orders が存在しない
          // 可能なら補完、補完不能ならエラー
          logger.warn('appendItemWithOrderProjection: items exists but orders missing, attempting to fix', {
            billId,
            itemId,
            orderId,
          });
          
          // 補完: orders を作成（resolved は既に取得済み）
          // orders 親ドキュメントが存在しない場合は作成
          if (!ordersSnap.exists) {
            tx.set(ordersRef, {
              date: businessDate,
              onedayOrderQuantity: 0,
              onedayTotalPrice: 0,
              createdAt: now,
              updatedAt: now,
            });
          }
          
          // _TodaysOrders を作成
          tx.set(todaysOrderRef, {
            orderDocId,
            billId,
            userId,
            userName,
            menuItemId: resolved.menuItemId,
            name: resolved.name,
            category: resolved.category,
            quantity,
            status: 'preparing',
            orderedAt: FieldValue.serverTimestamp(),
            currentTable: currentTable || null,
            currentSeat: currentSeat || null,
          }, { merge: true });
          
          // 親集計は既存のためインクリメントしない（初回作成時のみインクリメント）
        }
        
        // 既存レスポンスを返却
        return {
          success: true,
          billId,
          itemId: itemResult.itemId,
          orderedAt: itemResult.orderedAt,
          reused: true,
        };
      }

      // 3) 新規作成の場合: orders も作成（resolved は既に取得済み）
      // orders 親ドキュメントの存在確認（既に読み取り済み）

      // orders 親ドキュメントが存在しない場合は作成
      if (!ordersSnap.exists) {
        tx.set(ordersRef, {
          date: businessDate,
          onedayOrderQuantity: 0,
          onedayTotalPrice: 0,
          createdAt: now,
          updatedAt: now,
        });
      }

      // _TodaysOrders を作成（注文履歴で金額表示するため unitPriceIncl を保存）
      tx.set(todaysOrderRef, {
        orderDocId,
        billId,
        userId,
        userName,
        menuItemId: resolved.menuItemId,
        name: resolved.name,
        category: resolved.category,
        quantity,
        unitPriceIncl: resolved.unitPriceIncl,
        status: 'preparing',
        orderedAt: FieldValue.serverTimestamp(),
        currentTable: currentTable || null,
        currentSeat: currentSeat || null,
      }, { merge: true });

      // 親 orders の集計は初回のみインクリメント
      if (isNewOrder) {
        tx.update(ordersRef, {
          onedayOrderQuantity: FieldValue.increment(1),
          onedayTotalPrice: FieldValue.increment(resolved.unitPriceIncl * quantity),
          date: businessDate,
          updatedAt: now,
        });
      }

      // トランザクション内では orderedAt の実値を取得できないため、後で設定
      return {
        success: true,
        billId,
        itemId: itemResult.itemId,
        orderedAt: '', // トランザクション外で設定
        reused: false,
      };
    });

    // 4) トランザクション後に item ドキュメントを読み直して orderedAt の実値を取得
    const itemRef = billRef.collection('items').doc(result.itemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) {
      throw new HttpsError('internal', 'Item document not found after transaction');
    }
    const itemData = itemSnap.data()!;
    const orderedAt = itemData.orderedAt;
    const orderedAtIso = orderedAt && orderedAt.toDate ? orderedAt.toDate().toISOString() : new Date().toISOString();

    // orderedAt を設定
    result.orderedAt = orderedAtIso;

    logger.info('appendItemWithOrderProjection', {
      op: 'appendItemWithOrderProjection',
      billId,
      itemId: result.itemId,
      orderId: result.itemId,
      idempKey: idempotencyKey,
      result: reused ? 'reused' : 'ok',
      requestHash8: requestHash.substring(0, 8),
    });

    return {
      success: true,
      billId: result.billId,
      itemId: result.itemId,
      orderedAt: result.orderedAt,
      diagnostics: reused ? {
        reason: 'idempotent replay',
        reused: true,
      } : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logOpsError({
      message: 'appendItemWithOrderProjection: failed',
      failureType: 'business',
      functionEntry: 'appendItem',
      operation: 'appendItemWithOrderProjection',
      cause: error,
      context: {
        op: 'appendItemWithOrderProjection',
        billId,
        idempKey: idempotencyKey,
        result: 'fail',
        code: error instanceof HttpsError ? error.code : 'internal',
        requestHash8: requestHash.substring(0, 8),
        stackPreview: errorStack ? errorStack.slice(0, 500) : undefined,
      },
    });

    if (error instanceof FunctionCustomError) {
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `Failed to append item with order projection: ${errorMessage}`);
  }
}

