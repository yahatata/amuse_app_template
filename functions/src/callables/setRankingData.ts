import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../lib/devicePermissions';

export const setRankingData = onCall(async (request) => {
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

    const { tournamentId, rankingData, grantIdempotencyKey } = request.data;
    
    console.log('=== setRankingData 開始 ===');
    console.log('tournamentId:', tournamentId);
    console.log('rankingData:', JSON.stringify(rankingData, null, 2));
    
    if (!tournamentId) {
      throw new HttpsError('invalid-argument', 'tournamentId is required');
    }
    
    if (!rankingData || typeof rankingData !== 'object') {
      throw new HttpsError('invalid-argument', 'rankingData is required');
    }

    if (!grantIdempotencyKey || typeof grantIdempotencyKey !== 'string' || grantIdempotencyKey.trim() === '') {
      throw new HttpsError('invalid-argument', 'grantIdempotencyKey is required (e.g. tournamentId:rankingVersion)');
    }
    
    const db = getFirestore();
    
    // メインビューデータを更新
    const mainViewRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main');
    
    // nullやundefinedの値を除外してクリーンなデータを作成
    const cleanRankingData: Record<string, any> = {};
    for (const [key, value] of Object.entries(rankingData)) {
      if (value !== null && value !== undefined) {
        cleanRankingData[key] = value;
      }
    }
    
    console.log('cleanRankingData:', JSON.stringify(cleanRankingData, null, 2));
    
    const updateData = {
      ...cleanRankingData,
      updatedAt: new Date(),
    };
    
    console.log('updateData:', JSON.stringify(updateData, null, 2));
    
    await mainViewRef.update(updateData);
    
    // 既に順位確定済みのトーナメントでは付与しない（画面を閉じて再度開いて再送した場合の二重付与を防ぐ）
    const tournamentSnap = await db.collection('scheduledTournaments').doc(tournamentId).get();
    const alreadySet = tournamentSnap.data()?.SetedRanking === true;
    if (!alreadySet) {
      // プライズ付与処理（同一 grantIdempotencyKey では二重付与しない）
      await _awardPrizes(db, tournamentId, cleanRankingData, grantIdempotencyKey.trim());
    } else {
      console.log('SetedRanking が既に true のためプライズ付与をスキップ', { tournamentId });
    }
    
    // 全ての順位が確定しているかチェック
    const mainViewDoc = await mainViewRef.get();
    const mainViewData = mainViewDoc.data();
    const prizeReceiverCount = mainViewData?.prizeReceiverCount || 0;
    
    if (prizeReceiverCount > 0) {
      let allRanksFilled = true;
      for (let i = 1; i <= prizeReceiverCount; i++) {
        const uidKey = `${i}stPlayerUid`;
        const playerUid = mainViewData?.[uidKey];
        if (!playerUid) {
          allRanksFilled = false;
          break;
        }
      }
      
      // 全ての順位が確定している場合のみSetedRanking: trueを格納
      if (allRanksFilled) {
        const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
        await tournamentRef.update({
          SetedRanking: true,
          updatedAt: new Date(),
        });
        console.log('全ての順位が確定しました。SetedRanking: trueを格納しました。');
      }
    }
    
    console.log('=== setRankingData 成功 ===');
    
    return {
      success: true,
      message: 'Ranking data saved successfully',
      prizeGrantSkipped: alreadySet,
    };
    
  } catch (error) {
    console.error('=== setRankingData エラー ===');
    console.error('setRankingData error:', error);
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', 'Internal server error');
  }
});

/**
 * 同一 grantIdempotencyKey では付与を1回だけ行う（冪等）。
 * scheduledTournaments/{tournamentId}/grantRecords/{grantIdempotencyKey} の存在で判定する。
 */
async function _awardPrizes(
  db: ReturnType<typeof getFirestore>,
  tournamentId: string,
  rankingData: Record<string, any>,
  grantIdempotencyKey: string
) {
  try {
    console.log('=== プライズ付与処理開始 ===', { grantIdempotencyKey });

    const mainViewRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main');

    const mainViewDoc = await mainViewRef.get();
    const mainViewData = mainViewDoc.data();
    const pointType = mainViewData?.pointType || 'pointA';

    const prizeAwards: { playerUid: string; rank: string; prizeAmount: number }[] = [];
    for (const [key, value] of Object.entries(rankingData)) {
      if (typeof key === 'string' && key.endsWith('stPlayerUid') && value) {
        const rank = key.replace('stPlayerUid', '');
        const prizeKey = `${rank}stPrize`;
        const prizeAmount = mainViewData?.[prizeKey];
        if (prizeAmount && prizeAmount > 0) {
          prizeAwards.push({
            playerUid: value as string,
            rank,
            prizeAmount: Number(prizeAmount),
          });
        }
      }
    }

    if (prizeAwards.length === 0) {
      console.log('付与対象なし');
      return;
    }

    const logType = pointType === 'pointA' ? 'pointALogs' : 'pointBLogs';
    const today = new Date().toISOString().split('T')[0];

    const result = await db.runTransaction(async (tx) => {
      const grantRecordRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('grantRecords')
        .doc(grantIdempotencyKey);

      const grantRecordSnap = await tx.get(grantRecordRef);
      if (grantRecordSnap.exists) {
        console.log('同一 grantIdempotencyKey で既に付与済みのためスキップ', { grantIdempotencyKey });
        return { skipped: true };
      }

      // 全読み取りを先に実行
      const userSnaps = await Promise.all(
        prizeAwards.map((a) => tx.get(db.collection('users').doc(a.playerUid)))
      );
      const pointLogRefs = prizeAwards.map((a) =>
        db.collection('users').doc(a.playerUid).collection(logType).doc(today)
      );
      const pointLogSnaps = await Promise.all(pointLogRefs.map((ref) => tx.get(ref)));

      // 付与とログ書き込み
      for (let i = 0; i < prizeAwards.length; i++) {
        const award = prizeAwards[i];
        const userSnap = userSnaps[i];
        const logRef = pointLogRefs[i];
        const logSnap = pointLogSnaps[i];

        if (!userSnap.exists) {
          console.warn(`ユーザー ${award.playerUid} が見つかりません（スキップ）`);
          continue;
        }

        const userData = userSnap.data();
        const currentPoints = (userData as any)?.[pointType] ?? 0;
        const newPoints = currentPoints + award.prizeAmount;

        tx.update(db.collection('users').doc(award.playerUid), {
          [pointType]: newPoints,
          updatedAt: FieldValue.serverTimestamp(),
        });

        const entryId = crypto
          .createHash('sha256')
          .update(`${grantIdempotencyKey}:${award.playerUid}`)
          .digest('hex')
          .substring(0, 8);
        const logEntry = {
          entryId,
          appliedAt: new Date(),
          category: 'income',
          amountDelta: award.prizeAmount,
          reasonType: 'tournamentId' as const,
          actor: 'tablet_front',
          grantIdempotencyKey,
        };

        if (!logSnap.exists) {
          tx.set(logRef, {
            logs: { [entryId]: logEntry },
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          tx.update(logRef, {
            [`logs.${entryId}`]: logEntry,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      tx.set(grantRecordRef, {
        tournamentId,
        appliedAt: FieldValue.serverTimestamp(),
      });

      return { skipped: false };
    });

    if (result.skipped) {
      console.log('=== プライズ付与処理スキップ（冪等） ===');
    } else {
      console.log('=== プライズ付与処理完了 ===');
    }
  } catch (error) {
    console.error('=== プライズ付与処理エラー ===', error);
    throw error;
  }
}
