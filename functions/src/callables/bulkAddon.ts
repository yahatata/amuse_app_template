import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../lib/devicePermissions';
import { recordTournamentAction } from '../helpers/billsApi/recordTournamentAction';
import * as crypto from 'crypto';

const bulkAddonSchema = z.object({
  tournamentId: z.string(),
  users: z.array(z.object({
    userId: z.string(),
    pokerName: z.string(),
  })),
});

export const bulkAddon = onCall(async (request) => {
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

    console.log('=== まとめてAddon処理開始 ===');
    // 循環参照を避けるため、必要なデータのみをログ出力
    const { data } = request;
    console.log('受信データ:', {
      tournamentId: data === null || data === undefined ? undefined : data.tournamentId,
      userCount: data === null || data === undefined ? undefined : data.users?.length,
    });

    // dataがundefinedまたは無効な場合の処理
    if (!data || typeof data !== 'object') {
      console.log('dataが無効です:', data);
      throw new Error('無効なデータが送信されました');
    }

    console.log('処理対象データ:', {
      tournamentId: data.tournamentId,
      userCount: data.users === null || data.users === undefined ? undefined : data.users.length,
    });

    // 入力検証
    const validatedData = bulkAddonSchema.parse(data);
    const { tournamentId, users } = validatedData;

    console.log('tournamentId:', tournamentId);
    console.log('対象ユーザー数:', users.length);

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

    // 各ユーザーのactiveStaysドキュメントを取得
    const activeStayRefs = users.map(user => admin.firestore().collection('activeStays').doc(user.userId));
    const activeStayDocs = await Promise.all(activeStayRefs.map(ref => ref.get()));

    // 存在しないユーザーと既にAddon済みのユーザーをチェック
    const missingUsers: string[] = [];
    const alreadyAddonUsers: Array<{ userId: string; pokerName: string; billId: string }> = [];
    const availableUsers: Array<{ userId: string; pokerName: string; billId: string }> = [];

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const activeStayDoc = activeStayDocs[i];

      if (!activeStayDoc.exists) {
        missingUsers.push(user.pokerName);
      } else {
        const activeStayData = activeStayDoc.data()!;
        const billId = activeStayData.billId as string;

        if (!billId) {
          missingUsers.push(user.pokerName);
        } else {
          // 既にAddon済みかチェック（/bills/{billId}/tournaments/{templateId} を確認）
          const tournamentRef = admin.firestore().collection('bills').doc(billId).collection('tournaments').doc(templateId);
          const existingTournamentDoc = await tournamentRef.get();
          
          if (existingTournamentDoc.exists) {
            const tournamentInfo = existingTournamentDoc.data()!;
            const addonCount = tournamentInfo.addonCount || 0;
            if (addonCount >= 1) {
              alreadyAddonUsers.push({ ...user, billId });
            } else {
              availableUsers.push({ ...user, billId });
            }
          } else {
            availableUsers.push({ ...user, billId });
          }
        }
      }
    }

    if (missingUsers.length > 0) {
      throw new Error(`以下のユーザーのactiveStaysドキュメントが見つからないか、billIdが設定されていません: ${missingUsers.join(', ')}`);
    }

    if (availableUsers.length === 0) {
      throw new Error('処理可能なユーザーがいません（全員既にAddon済みです）');
    }

    // トランザクションで処理を実行
    const result = await admin.firestore().runTransaction(async (transaction) => {
      // scheduledTournaments/views/mainを更新
      transaction.update(viewsMainRef, {
        addons: currentAddons + availableUsers.length,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // todaysBillsのtournamentsフィールドへの直接更新は削除（recordTournamentAction内のDualWriteに集約）

      return {
        success: true,
        processedCount: availableUsers.length,
        alreadyAddonCount: alreadyAddonUsers.length,
        addonFee,
        addonStack,
        availableUsers: availableUsers.map(u => ({ 
          userId: u.userId, 
          billId: u.billId,
        })),
      };
    });

    // トランザクション完了後、各ユーザーに対してrecordTournamentActionを呼び出す（トランザクション外で実行）
    const recordPromises = result.availableUsers.map(async (user) => {
      const clientNonce = crypto.randomUUID();
      const idempotencyKey = `${user.billId}:recordTournamentAction:addon:${clientNonce}`;

      try {
        await recordTournamentAction({
          billId: user.billId,
          templateId,
          action: 'addon',
          templateName: templateName,
          entryFeeIncl: null, // 既存の値を保持（recordTournamentAction内で処理）
          reentryFeeIncl: null, // 既存の値を保持（recordTournamentAction内で処理）
          addonFeeIncl: addonFee,
          startAt: startAt ? (startAt as admin.firestore.Timestamp) : null,
          idempotencyKey,
        });
      } catch (error) {
        console.error(`Failed to record tournament action for user ${user.userId}:`, error);
        // エラーを再スローせず、メインのcallableは成功とみなす（ベストエフォート）
        // scheduledTournamentsの更新は成功しているため
      }
    });

    await Promise.all(recordPromises);

    console.log('=== まとめてAddon処理完了 ===');
    console.log('処理完了ユーザー数:', result.processedCount);

    return {
      success: true,
      message: 'まとめてAddon処理が完了しました',
      processedCount: result.processedCount,
      addonFee: result.addonFee,
      addonStack: result.addonStack,
    };
  } catch (error) {
    console.error('=== まとめてAddon処理エラー ===');
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
