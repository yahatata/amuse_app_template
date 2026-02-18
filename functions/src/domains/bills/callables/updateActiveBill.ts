/**
 * 会計前の請求書内容を修正するCloud Function
 * 
 * P1-06: 会計前の明細編集APIとして再設計
 * - /bills/{billId} の items/extras/sideGameChips/tournaments サブコレクションの編集のみ
 * - 親フィールド（businessDate, amounts.*, categoryBreakdown, postEvents.*, paymentsSummary.*）は一切触らない
 * - 実行条件: status in {'open','in_progress'} かつ ops.accountingStartedAt == null
 * - 既存のリクエストスキーマ（extraCost, tournaments, items, sideGameChip の配列/オブジェクト）は維持
 */

import * as admin from 'firebase-admin';
import { z } from 'zod';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { getFirestore } from 'firebase-admin/firestore';
import { shouldDualWrite } from '../repos/dualWrite';
import { resolveMenuItem } from '../repos/resolveMenuItem';
import { logger } from 'firebase-functions';

// 入店料のスキーマ
const ExtraCostSchema = z.object({
  name: z.string().min(1, '項目名は必須です'),
  price: z.number().min(0, '価格は0以上である必要があります'),
});

// トーナメント参加費のスキーマ
const TournamentEntrySchema = z.object({
  entryFee: z.number().min(0, '参加費は0以上である必要があります'),
  tournamentName: z.string().optional(),
});

// フード・ドリンクのスキーマ
const ItemSchema = z.object({
  name: z.string().min(1, '商品名は必須です'),
  price: z.number().min(0, '価格は0以上である必要があります'),
  quantity: z.number().int().min(1, '数量は1以上である必要があります'),
  menuItemId: z.string().optional(), // 任意（提供されない場合は name/price から推測）
});

// サイドゲームチップのスキーマ
const SideGameChipSchema = z.object({
  name: z.string().min(1, 'チップ名は必須です'),
  price: z.number().min(0, '価格は0以上である必要があります'),
});

// 会計前修正のスキーマ
const UpdateActiveBillSchema = z.object({
  billId: z.string().min(1, '請求書IDは必須です'),
  extraCost: z.array(ExtraCostSchema).optional(),
  tournaments: z.record(z.string(), TournamentEntrySchema).optional(),
  items: z.array(ItemSchema).optional(),
  sideGameChip: z.array(SideGameChipSchema).optional(),
});

/**
 * 会計前の請求書内容を修正するCloud Function
 * accountingStartedAtがnull（会計開始前）の場合のみ修正可能
 * 管理者権限を持つユーザーのみが実行可能
 */
export const updateActiveBill = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  try {
    // デバイス権限の確認（role: admin または options.accounting: true）
    const db = getFirestore();
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'accounting');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', '会計管理の権限がありません');
    }

    // 入力データの検証
    const validatedData = UpdateActiveBillSchema.parse(request.data);
    const { billId, extraCost, tournaments, items, sideGameChip } = validatedData;

    const billRef = db.collection('bills').doc(billId);

    // 請求書の存在確認と status/ops.accountingStartedAt チェック
    const billDoc = await billRef.get();
    if (!billDoc.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billDoc.data()!;
    const currentStatus = billData.status || 'open';
    const accountingStartedAt = billData.ops?.accountingStartedAt;

    // 実行条件: status in {'open','in_progress'} かつ ops.accountingStartedAt == null
    if (currentStatus !== 'open' && currentStatus !== 'in_progress') {
      throw new HttpsError(
        'failed-precondition',
        `会計開始前の請求書のみ修正可能です。現在のステータス: ${currentStatus}`
      );
    }

    if (accountingStartedAt) {
      throw new HttpsError('failed-precondition', '会計開始前の請求書のみ修正可能です');
    }

    // items の resolveMenuItem を事前に実行（トランザクション外）
    const resolvedItems: Array<{
      item: { name: string; price: number; quantity: number; menuItemId?: string };
      resolved: { name: string; category: string; unitPriceIncl: number; menuItemId: string | null };
    }> = [];

    if (items !== undefined) {
      for (const item of items) {
        let resolved: { name: string; category: string; unitPriceIncl: number; menuItemId: string | null };
        
        // menuItemId が提供されている場合は resolveMenuItem を使用
        if (item.menuItemId) {
          try {
            const resolvedMenuItem = await resolveMenuItem(item.menuItemId);
            resolved = {
              name: resolvedMenuItem.name,
              category: resolvedMenuItem.category,
              unitPriceIncl: resolvedMenuItem.unitPriceIncl,
              menuItemId: resolvedMenuItem.menuItemId,
            };
          } catch (error) {
            // resolveMenuItem が失敗した場合は、クライアント提供の name/price を使用（警告ログ）
            logger.warn('resolveMenuItem failed, using client-provided data', {
              billId,
              menuItemId: item.menuItemId,
              error: error instanceof Error ? error.message : String(error),
            });
            resolved = {
              name: item.name,
              category: 'Other', // デフォルトカテゴリ
              unitPriceIncl: item.price,
              menuItemId: item.menuItemId,
            };
          }
        } else {
          // menuItemId が提供されていない場合は、クライアント提供の name/price を使用
          resolved = {
            name: item.name,
            category: 'Other', // デフォルトカテゴリ
            unitPriceIncl: item.price,
            menuItemId: null,
          };
        }
        
        resolvedItems.push({ item, resolved });
      }
    }

    // トランザクション内でサブコレクションを編集
    await db.runTransaction(async (tx) => {
      // 既存のサブコレクションドキュメントを削除
      if (extraCost !== undefined) {
        const extrasSnapshot = await tx.get(billRef.collection('extras'));
        extrasSnapshot.docs.forEach(doc => tx.delete(doc.ref));
      }

      if (tournaments !== undefined) {
        const tournamentsSnapshot = await tx.get(billRef.collection('tournaments'));
        tournamentsSnapshot.docs.forEach(doc => tx.delete(doc.ref));
      }

      if (items !== undefined) {
        const itemsSnapshot = await tx.get(billRef.collection('items'));
        itemsSnapshot.docs.forEach(doc => tx.delete(doc.ref));
      }

      if (sideGameChip !== undefined) {
        const sideGameChipsSnapshot = await tx.get(billRef.collection('sideGameChips'));
        sideGameChipsSnapshot.docs.forEach(doc => tx.delete(doc.ref));
      }

      const now = admin.firestore.FieldValue.serverTimestamp();

      // 新しいサブコレクションドキュメントを作成
      if (extraCost !== undefined) {
        for (const cost of extraCost) {
          const extraRef = billRef.collection('extras').doc();
          tx.set(extraRef, {
            name: cost.name,
            amountIncl: cost.price,
            createdAt: now,
          });
        }
      }

      if (tournaments !== undefined) {
        for (const [templateId, tournamentEntry] of Object.entries(tournaments)) {
          const tournamentRef = billRef.collection('tournaments').doc(templateId);
          tx.set(tournamentRef, {
            templateId,
            templateName: tournamentEntry.tournamentName || null,
            entryFeeIncl: tournamentEntry.entryFee,
            reentryFeeIncl: null,
            addonFeeIncl: null,
            entryCount: 1,
            reentryCount: 0,
            addonCount: 0,
            registeredAt: now,
            lastReentryAt: null,
            lastAddonAt: null,
            startAt: null,
            createdAt: now,
          });
        }
      }

      if (items !== undefined) {
        for (const { item, resolved } of resolvedItems) {
          const itemRef = billRef.collection('items').doc();
          tx.set(itemRef, {
            menuItemId: resolved.menuItemId,
            category: resolved.category,
            name: resolved.name,
            unitPriceIncl: resolved.unitPriceIncl,
            quantity: item.quantity,
            totalPriceIncl: resolved.unitPriceIncl * item.quantity,
            orderedAt: now,
            voided: false,
            createdAt: now,
          });
        }
      }

      if (sideGameChip !== undefined) {
        for (const chip of sideGameChip) {
          const chipRef = billRef.collection('sideGameChips').doc();
          tx.set(chipRef, {
            action: 'purchase', // updateActiveBill では purchase のみ
            chipQty: Math.floor(chip.price / 10), // 仮の換算（1枚=10円相当）
            amountIncl: chip.price,
            menuItemId: null,
            name: chip.name,
            orderedAt: now,
            createdAt: now,
          });
        }
      }

      // 親 /bills/{billId}.updatedAt を更新
      tx.update(billRef, {
        updatedAt: now,
      });
    });

    // DualWrite: todaysBills の items, extraCost, tournaments, sideGameChip 配列/オブジェクトを更新（totalPrice は更新しない）
    let dualWriteResult: 'success' | 'failed' | 'skipped' = 'skipped';
    
    if (shouldDualWrite()) {
      try {
        const legacyRef = db.collection('todaysBills').doc(billId);
        const legacySnap = await legacyRef.get();
        
        if (legacySnap.exists) {
          const legacyUpdates: Record<string, any> = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          if (extraCost !== undefined) {
            legacyUpdates.extraCost = extraCost.map(cost => ({
              name: cost.name,
              price: cost.price,
            }));
          }

          if (tournaments !== undefined) {
            legacyUpdates.tournaments = tournaments;
          }

          if (items !== undefined) {
            legacyUpdates.items = items.map(item => ({
              name: item.name,
              price: item.price,
              quantity: item.quantity,
            }));
          }

          if (sideGameChip !== undefined) {
            legacyUpdates.sideGameChip = sideGameChip.map(chip => ({
              name: chip.name,
              price: chip.price,
              action: 'purchase',
            }));
          }

          await legacyRef.update(legacyUpdates);
          dualWriteResult = 'success';
        } else {
          dualWriteResult = 'skipped';
        }
      } catch (error: any) {
        // 失敗時は警告ログのみ（bills を正とする）
        dualWriteResult = 'failed';
        logger.warn('dualWrite updateActiveBill failed', {
          op: 'updateActiveBill',
          billId,
          dualWriteResult: 'failed',
          reason: error?.message || String(error),
        });
      }
    }

    logger.info('updateActiveBill success', {
      op: 'updateActiveBill',
      billId,
      result: 'ok',
      dualWriteResult,
    });

    return {
      success: true,
      message: '請求書内容を修正しました',
      billId: billId,
    };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    logger.error('updateActiveBill failed', {
      op: 'updateActiveBill',
      billId: request.data?.billId,
      result: 'fail',
      code: 'internal',
      reason: error instanceof Error ? error.message : String(error),
    });
    throw new HttpsError('internal', '請求書修正に失敗しました', error.message);
  }
});
