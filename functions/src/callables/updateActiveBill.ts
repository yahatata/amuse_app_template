import * as admin from 'firebase-admin';
import { z } from 'zod';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../lib/devicePermissions';

const db = admin.firestore();

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

    const billRef = db.collection('todaysBills').doc(billId);

    // 請求書の存在確認
    const billDoc = await billRef.get();
    if (!billDoc.exists) {
      throw new HttpsError('not-found', '指定された請求書が見つかりません');
    }

    const billData = billDoc.data()!;
    
    // 会計前（accountingStartedAt === null）の場合のみ修正可能
    if (billData.accountingStartedAt) {
      throw new HttpsError('failed-precondition', '会計開始前の請求書のみ修正可能です');
    }

    // 修正前のデータを保存（ログ用）
    const oldData = {
      extraCost: billData.extraCost || [],
      tournaments: billData.tournaments || {},
      items: billData.items || [],
      sideGameChip: billData.sideGameChip || [],
      totalPrice: billData.totalPrice || 0,
    };

    // 新しいデータを準備
    const newData: any = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // 各フィールドの更新
    if (extraCost !== undefined) {
      newData.extraCost = extraCost;
    }
    if (tournaments !== undefined) {
      newData.tournaments = tournaments;
    }
    if (items !== undefined) {
      newData.items = items;
    }
    if (sideGameChip !== undefined) {
      newData.sideGameChip = sideGameChip;
    }

    // 新しい合計金額を計算
    let newTotalPrice = 0;

    // 入店料の合計
    const finalExtraCost = extraCost !== undefined ? extraCost : oldData.extraCost;
    for (const cost of finalExtraCost) {
      newTotalPrice += cost.price;
    }

    // トーナメント参加費の合計
    const finalTournaments = tournaments !== undefined ? tournaments : oldData.tournaments;
    for (const tournamentEntry of Object.values(finalTournaments)) {
      newTotalPrice += (tournamentEntry as any).entryFee;
    }

    // フード・ドリンクの合計
    const finalItems = items !== undefined ? items : oldData.items;
    for (const item of finalItems) {
      newTotalPrice += item.price * item.quantity;
    }

    // サイドゲームチップの合計
    const finalSideGameChip = sideGameChip !== undefined ? sideGameChip : oldData.sideGameChip;
    for (const chip of finalSideGameChip) {
      newTotalPrice += chip.price;
    }

    newData.totalPrice = newTotalPrice;

    // todaysBillsを更新
    await billRef.update(newData);

    console.log('会計前修正成功 - billId:', billId);
    return {
      success: true,
      message: '請求書内容を修正しました',
      billId: billId,
      oldTotalPrice: oldData.totalPrice,
      newTotalPrice: newTotalPrice,
      priceDifference: newTotalPrice - oldData.totalPrice,
    };

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', '入力データが無効です', error.errors);
    }
    if (error instanceof HttpsError) {
      throw error;
    }
    console.error('会計前修正エラー:', error);
    throw new HttpsError('internal', '請求書修正に失敗しました', error.message);
  }
});

