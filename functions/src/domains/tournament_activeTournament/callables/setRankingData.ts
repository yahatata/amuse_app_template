import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { writeSingleOperationLog } from '../../logs/lib/operationLog';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

export interface RankingEntryForRollback {
  playerUid: string;
  /** 表示用（操作履歴でランキングと名前を表示するため） */
  playerName?: string;
  rank: string;
  prizeAmount: number;
  entryId: string;
  pointType: 'pointA' | 'pointB';
  /** pointALogs/pointBLogs のドキュメントID（YYYY-MM-DD） */
  logDate: string;
}

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

    const { tournamentId, rankingData, grantIdempotencyKey } = request.data as { tournamentId?: string; rankingData?: unknown; grantIdempotencyKey?: string };
    
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
    const mainViewRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main');

    // 更新前の main を取得（取り消し用）
    const mainViewDocBefore = await mainViewRef.get();
    const beforeMainView = mainViewDocBefore.exists ? mainViewDocBefore.data() ?? {} : {};

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

    await mainViewRef.update(updateData);

    const tournamentSnap = await db.collection('scheduledTournaments').doc(tournamentId).get();
    const alreadySet = tournamentSnap.data()?.SetedRanking === true;
    let rankingEntries: RankingEntryForRollback[] = [];
    if (!alreadySet) {
      const awardResult = await _awardPrizes(db, tournamentId, cleanRankingData, grantIdempotencyKey.trim());
      rankingEntries = awardResult.rankingEntries ?? [];
    } else {
      console.log('SetedRanking が既に true のためプライズ付与をスキップ', { tournamentId });
    }

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

      if (allRanksFilled) {
        const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
        await tournamentRef.update({
          SetedRanking: true,
          updatedAt: new Date(),
        });
        console.log('全ての順位が確定しました。SetedRanking: trueを格納しました。');
      }
    }

    // 2回目以降（SetedRanking 済みで付与スキップした場合）は操作ログを書かない
    let operationId: string | undefined;
    if (!alreadySet) {
      const pointType = (mainViewDocBefore.data()?.pointType || tournamentSnap.data()?.snapshot?.pointType || 'pointA') as 'pointA' | 'pointB';
      operationId = crypto.randomUUID();
      await writeSingleOperationLog({
        operationId,
        operationName: 'ランキングデータ設定',
        deviceId: device.id,
        deviceName: device.name ?? undefined,
        status: 'succeeded',
        payload: {
          tournamentId,
          grantIdempotencyKey: grantIdempotencyKey.trim(),
          pointType,
          beforeMainView,
          rankingEntries,
        },
        tournamentId,
      });
    }

    logOpsSuccess({
      message: 'ランキングデータの保存に成功しました',
      functionEntry: 'setRankingData',
      context: {
        tournamentId,
        grantIdempotencyKey: grantIdempotencyKey.trim(),
        callerUid,
        deviceId: device.id,
        prizeGrantSkipped: alreadySet,
        ...(operationId != null ? { operationId } : {}),
      },
    });

    return {
      success: true,
      message: 'Ranking data saved successfully',
      prizeGrantSkipped: alreadySet,
      ...(operationId != null ? { operationId } : {}),
    };
    
  } catch (error) {
    logOpsError({
      message: '=== setRankingData エラー ===',
      functionEntry: 'setRankingData',
      operation: 'setRankingDataRankings',
      cause: error,
    });

    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', 'Internal server error');
  }
});

/**
 * 同一 grantIdempotencyKey では付与を1回だけ行う（冪等）。
 * 戻り値: スキップ有無と取り消し用の rankingEntries。
 */
async function _awardPrizes(
  db: ReturnType<typeof getFirestore>,
  tournamentId: string,
  rankingData: Record<string, any>,
  grantIdempotencyKey: string
): Promise<{ skipped: boolean; rankingEntries: RankingEntryForRollback[] }> {
  const mainViewRef = db
    .collection('scheduledTournaments')
    .doc(tournamentId)
    .collection('views')
    .doc('main');

  const mainViewDoc = await mainViewRef.get();
  const mainViewData = mainViewDoc.data();
  const pointType = (mainViewData?.pointType || 'pointA') as 'pointA' | 'pointB';

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
    return { skipped: false, rankingEntries: [] };
  }

  const logType = pointType === 'pointA' ? 'pointALogs' : 'pointBLogs';
  const today = new Date().toISOString().split('T')[0];

  try {
    const result = await db.runTransaction(async (tx) => {
      const grantRecordRef = db
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('grantRecords')
        .doc(grantIdempotencyKey);

      const grantRecordSnap = await tx.get(grantRecordRef);
      if (grantRecordSnap.exists) {
        console.log('同一 grantIdempotencyKey で既に付与済みのためスキップ', { grantIdempotencyKey });
        return { skipped: true, rankingEntries: [] as RankingEntryForRollback[] };
      }

      const userSnaps = await Promise.all(
        prizeAwards.map((a) => tx.get(db.collection('users').doc(a.playerUid)))
      );
      const pointLogRefs = prizeAwards.map((a) =>
        db.collection('users').doc(a.playerUid).collection(logType).doc(today)
      );
      const pointLogSnaps = await Promise.all(pointLogRefs.map((ref) => tx.get(ref)));

      const rankingEntries: RankingEntryForRollback[] = [];

      for (let i = 0; i < prizeAwards.length; i++) {
        const award = prizeAwards[i];
        const userSnap = userSnaps[i];
        const logRef = pointLogRefs[i];
        const logSnap = pointLogSnaps[i];

        if (!userSnap.exists) {
          logOpsError({
            message:
              'setRankingData: 賞品・ポイント付与対象ユーザーが存在せず、該当ランクのみスキップしました',
            functionEntry: 'setRankingData',
            operation: 'setRankingDataGrantTargetUserNotFound',
            errorKey: 'TOURNAMENT_RANKING_GRANT_USER_NOT_FOUND',
            context: {
              tournamentId,
              playerUid: award.playerUid,
              rank: award.rank,
              prizeAmount: award.prizeAmount,
              grantIdempotencyKey,
              pointType,
            },
            cause: new Error('ranking_grant_user_not_found'),
          });
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
        const playerName = (rankingData[`${award.rank}stPlayerName`] as string) ?? '';
        rankingEntries.push({
          playerUid: award.playerUid,
          playerName: playerName || undefined,
          rank: award.rank,
          prizeAmount: award.prizeAmount,
          entryId,
          pointType,
          logDate: today,
        });

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

      return { skipped: false, rankingEntries };
    });

    if (result.skipped) {
      console.log('=== プライズ付与処理スキップ（冪等） ===');
    } else {
      console.log('=== プライズ付与処理完了 ===');
    }
    return result;
  } catch (error) {
    logOpsError({
      message: '=== プライズ付与処理エラー ===',
      functionEntry: 'setRankingData',
      operation: 'setRankingDataPrizeGrant',
      cause: error,
    });
    throw error;
  }
}
