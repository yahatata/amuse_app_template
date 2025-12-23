import { onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { recordTournamentAction } from '../helpers/billsApi/recordTournamentAction';
import * as crypto from 'crypto';

const addonSchema = z.object({
  tournamentId: z.string(),
  userId: z.string(),
  pokerName: z.string(),
});

export const addon = onCall(async (request) => {
  try {
    console.log('=== Addon処理開始 ===');
    // 循環参照を避けるため、必要なデータのみをログ出力
    const { data } = request;
    console.log('受信データ:', {
      tournamentId: data === null || data === undefined ? undefined : data.tournamentId,
      userId: data === null || data === undefined ? undefined : data.userId,
      pokerName: data === null || data === undefined ? undefined : data.pokerName,
    });

    // dataがundefinedまたは無効な場合の処理
    if (!data || typeof data !== 'object') {
      console.log('dataが無効です:', data);
      throw new Error('無効なデータが送信されました');
    }

    console.log('処理対象データ:', {
      tournamentId: data.tournamentId,
      userId: data.userId,
      pokerName: data.pokerName,
    });

    // 入力検証
    const validatedData = addonSchema.parse(data);
    const { tournamentId, userId, pokerName } = validatedData;

    console.log('tournamentId:', tournamentId);
    console.log('userId:', userId);
    console.log('pokerName:', pokerName);

    // トーナメント情報を取得
    const tournamentRef = admin.firestore().collection('scheduledTournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();

    if (!tournamentDoc.exists) {
      throw new Error('トーナメントが存在しません');
    }

    const tournamentData = tournamentDoc.data();
    const templateId = tournamentData?.templateId;
    const snapshot = tournamentData?.snapshot || {};
    const isAddon = snapshot.isAddon !== null && snapshot.isAddon !== undefined ? snapshot.isAddon : false;
    const addonFee = snapshot.addonFee !== null && snapshot.addonFee !== undefined ? snapshot.addonFee : 0;
    const addonStack = snapshot.addonStack !== null && snapshot.addonStack !== undefined ? snapshot.addonStack : 0;
    const templateName = snapshot.name || '';
    const startAt = tournamentData?.startAt;

    console.log('isAddon:', isAddon);
    console.log('addonFee:', addonFee);
    console.log('addonStack:', addonStack);

    if (!isAddon) {
      throw new Error('このトーナメントではAddonができません');
    }

    if (!templateId) {
      throw new Error('トーナメントのtemplateIdが存在しません');
    }

    // activeStaysからbillIdを取得（存在チェックは本callable側の責務）
    const activeStayRef = admin.firestore().collection('activeStays').doc(userId);
    const activeStayDoc = await activeStayRef.get();

    if (!activeStayDoc.exists) {
      throw new Error(`ユーザー ${userId} のactiveStaysドキュメントが存在しません`);
    }

    const activeStayData = activeStayDoc.data()!;
    const billId = activeStayData.billId as string;

    if (!billId) {
      throw new Error(`ユーザー ${userId} のactiveStaysにbillIdが設定されていません`);
    }

    // 既にAddon済みかチェック（/bills/{billId}/tournaments/{templateId} を確認）
    const billTournamentRef = admin.firestore().collection('bills').doc(billId).collection('tournaments').doc(templateId);
    const existingTournamentDoc = await billTournamentRef.get();
    
    if (existingTournamentDoc.exists) {
      const tournamentInfo = existingTournamentDoc.data()!;
      const existingAddonCount = tournamentInfo.addonCount || 0;
      if (existingAddonCount >= 1) {
        throw new Error('既にAddon処理済みです');
      }
    }

    // scheduledTournaments/views/mainを取得
    const viewsMainRef = admin.firestore()
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main');

    const viewsMainDoc = await viewsMainRef.get();

    if (!viewsMainDoc.exists) {
      throw new Error('トーナメントのviews/mainドキュメントが存在しません');
    }

    const viewsMainData = viewsMainDoc.data();
    const currentAddons = viewsMainData?.addons || 0;

    // トランザクションで処理を実行
    const result = await admin.firestore().runTransaction(async (transaction) => {
      // scheduledTournaments/views/mainを更新
      transaction.update(viewsMainRef, {
        addons: currentAddons + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // todaysBillsのtournamentsフィールドへの直接更新は削除（recordTournamentAction内のDualWriteに集約）

      return { 
        success: true, 
        userId, 
        pokerName, 
        addonFee, 
        addonStack, 
        billId, 
        templateId, 
        templateName,
        startAt,
      };
    });

    // トランザクション完了後、recordTournamentActionを呼び出す（トランザクション外で実行）
    const clientNonce = crypto.randomUUID();
    const idempotencyKey = `${result.billId}:recordTournamentAction:addon:${clientNonce}`;

    try {
      await recordTournamentAction({
        billId: result.billId,
        templateId: result.templateId,
        action: 'addon',
        templateName: result.templateName,
        entryFeeIncl: null, // 既存の値を保持（recordTournamentAction内で処理）
        reentryFeeIncl: null, // 既存の値を保持（recordTournamentAction内で処理）
        addonFeeIncl: result.addonFee,
        startAt: result.startAt ? (result.startAt as admin.firestore.Timestamp) : null,
        idempotencyKey,
      });
    } catch (error) {
      console.error('Failed to record tournament action via recordTournamentAction helper:', error);
      // エラーを再スローせず、メインのcallableは成功とみなす（ベストエフォート）
      // scheduledTournamentsの更新は成功しているため
    }

    console.log('=== Addon処理完了 ===');
    console.log('ユーザー', result.pokerName, 'のAddon処理が完了しました');

    return {
      success: true,
      message: 'Addon処理が完了しました',
      userId: result.userId,
      pokerName: result.pokerName,
      addonFee: result.addonFee,
      addonStack: result.addonStack,
    };
  } catch (error) {
    console.error('=== Addon処理エラー ===');
    console.error(error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: '入力検証エラー',
        details: error.errors,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー',
    };
  }
});
