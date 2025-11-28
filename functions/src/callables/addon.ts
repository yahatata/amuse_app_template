import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../lib/devicePermissions';

const addonSchema = z.object({
  tournamentId: z.string(),
  userId: z.string(),
  pokerName: z.string(),
});

export const addon = onCall(async (request) => {
  // 認証チェック
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  try {
    // デバイス権限の確認（role: admin または options.tournament: true）
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
    }

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
    const snapshot = tournamentData?.snapshot || {};
    const isAddon = snapshot.isAddon !== null && snapshot.isAddon !== undefined ? snapshot.isAddon : false;
    const addonFee = snapshot.addonFee !== null && snapshot.addonFee !== undefined ? snapshot.addonFee : 0;
    const addonStack = snapshot.addonStack !== null && snapshot.addonStack !== undefined ? snapshot.addonStack : 0;

    console.log('isAddon:', isAddon);
    console.log('addonFee:', addonFee);
    console.log('addonStack:', addonStack);

    if (!isAddon) {
      throw new Error('このトーナメントではAddonができません');
    }

    // todaysBillsからユーザーのドキュメントを取得
    const todayBillsQuery = await admin.firestore()
      .collection('todaysBills')
      .where('userId', '==', userId)
      .where('status', '==', 'open')
      .limit(1)
      .get();

    if (todayBillsQuery.empty) {
      throw new Error('ユーザーのtodaysBillsドキュメントが見つかりません');
    }

    const todayBillsDoc = todayBillsQuery.docs[0];
    const todayBillsData = todayBillsDoc.data();
    const existingTournaments = todayBillsData.tournaments || {};

    // 既にAddon済みかチェック
    const existingTournamentInfo = existingTournaments[tournamentId] || {};
    const existingAddonCount = existingTournamentInfo.addonCount || 0;

    if (existingAddonCount >= 1) {
      throw new Error('既にAddon処理済みです');
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

      // todaysBillsのtournamentsフィールドを更新
      const existingTournamentInfo = existingTournaments[tournamentId] || {};
      const updatedTournamentInfo = Object.assign(Object.assign({}, existingTournamentInfo), { 
        addonCount: (existingTournamentInfo.addonCount || 0) + 1, 
        addonFee: addonFee, 
        lastAddonAt: admin.firestore.FieldValue.serverTimestamp() 
      });

      const updatedTournaments = Object.assign(Object.assign({}, existingTournaments), { 
        [tournamentId]: updatedTournamentInfo 
      });

      // totalPriceにaddonFeeを加算
      const currentTotalPrice = todayBillsData.totalPrice || 0;
      const newTotalPrice = currentTotalPrice + addonFee;

      transaction.update(todayBillsDoc.ref, {
        tournaments: updatedTournaments,
        totalPrice: newTotalPrice,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, userId, pokerName, addonFee, addonStack };
    });

    console.log('=== Addon処理完了 ===');
    console.log('ユーザー', pokerName, 'のAddon処理が完了しました');

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
