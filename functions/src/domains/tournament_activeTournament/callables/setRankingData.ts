import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { getCallerDeviceByUid, hasRequiredOption, isActive } from '../../../shared/devices';
import { writeSingleOperationLog } from '../../logs/lib/operationLog';
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";
import { FunctionCustomError, mapFunctionCustomErrorToHttpsCode } from '../../../shared/logging/functionCustomError';
import { assertTournamentAllowsMutation } from '../lib/assertTournamentAllowsMutation';
import { assertUserNotMigrated } from '../../user/helpers/assertUserNotMigrated';
import { getStoreConfig } from '../../../shared/config/configLoader';
import { validatePointConfigFromStoreConfig } from '../../../shared/config/validatePointConfig';
import { assertRewardPointTypeForGrant } from '../helpers/rewardPointType';
import {
  convertPrizeReferenceToBalance,
  parseSavedPrizeConversion,
  type PrizeConversion,
} from '../helpers/prizeConversion';
import { readBalanceOrZeroIfMissing } from '../../user/helpers/userBalances';
import type { CurrencyPointId } from '../../user/types/pointIds';
import {
  rewardPointLogId,
  writeTournamentRewardPointLogInTxWithSnap,
} from '../../user/services/pointLog';

export interface RankingEntryForRollback {
  playerUid: string;
  /** 表示用（操作履歴でランキングと名前を表示するため） */
  playerName?: string;
  rank: string;
  /** プライズ基準値量（views/main の NstPrize） */
  prizeReferenceAmount: number;
  /** 実際に加算した残高量 */
  awardedBalanceAmount: number;
  conversion: PrizeConversion;
  entryId: string;
  pointType: CurrencyPointId;
  /** legacy: 旧 pointALogs/pointBLogs 日付。A-7 では未使用だが操作ログ互換のため残す */
  logDate: string;
}

export const setRankingData = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const callerUid = request.auth.uid;

  try {
    const device = await getCallerDeviceByUid(callerUid);
    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    const hasPermission = device.role === 'admin' || hasRequiredOption(device.options, 'tournament');
    if (!hasPermission) {
      throw new HttpsError('permission-denied', 'トーナメント運営の権限がありません');
    }

    const { tournamentId, rankingData, grantIdempotencyKey } = request.data as {
      tournamentId?: string;
      rankingData?: unknown;
      grantIdempotencyKey?: string;
    };

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
    const tournamentDoc = await db.collection('scheduledTournaments').doc(tournamentId).get();
    if (!tournamentDoc.exists) {
      throw new HttpsError('not-found', 'Tournament not found');
    }
    assertTournamentAllowsMutation({
      tournamentId,
      status: tournamentDoc.data()?.status as string | undefined,
    });

    const mainViewRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('views')
      .doc('main');

    const mainViewDocBefore = await mainViewRef.get();
    const beforeMainView = mainViewDocBefore.exists ? mainViewDocBefore.data() ?? {} : {};

    const cleanRankingData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rankingData as Record<string, unknown>)) {
      if (value !== null && value !== undefined) {
        cleanRankingData[key] = value;
      }
    }

    const prizePlayerUids = [
      ...new Set(
        Object.entries(cleanRankingData)
          .filter(([key, value]) => key.endsWith('stPlayerUid') && typeof value === 'string' && value.trim())
          .map(([, value]) => (value as string).trim())
      ),
    ];
    for (const playerUid of prizePlayerUids) {
      const userSnap = await db.collection('users').doc(playerUid).get();
      if (userSnap.exists) {
        assertUserNotMigrated(userSnap.data()!);
      }
    }

    await mainViewRef.update({
      ...cleanRankingData,
      updatedAt: new Date(),
    });

    const tournamentSnap = await db.collection('scheduledTournaments').doc(tournamentId).get();
    const alreadySet = tournamentSnap.data()?.SetedRanking === true;
    let rankingEntries: RankingEntryForRollback[] = [];
    if (!alreadySet) {
      const awardResult = await _awardPrizes(
        db,
        tournamentId,
        cleanRankingData,
        grantIdempotencyKey.trim(),
        tournamentSnap.data(),
        mainViewDocBefore.data(),
      );
      rankingEntries = awardResult.rankingEntries ?? [];
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
        await db.collection('scheduledTournaments').doc(tournamentId).update({
          SetedRanking: true,
          updatedAt: new Date(),
        });
      }
    }

    let operationId: string | undefined;
    if (!alreadySet) {
      const savedPointType = (mainViewDocBefore.data()?.pointType ||
        tournamentSnap.data()?.snapshot?.pointType ||
        'pointA') as string;
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
          pointType: savedPointType,
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
    if (error instanceof FunctionCustomError) {
      logOpsError({
        message: 'setRankingData failed',
        functionEntry: 'setRankingData',
        operation: 'setRankingDataRankings',
        cause: error,
        context: {
          callerUid,
          tournamentId: (request.data as { tournamentId?: string })?.tournamentId,
          errorKey: error.errorKey,
        },
      });
      throw new HttpsError(mapFunctionCustomErrorToHttpsCode(error.errorKey), error.message);
    }

    logOpsError({
      message: 'setRankingData failed',
      functionEntry: 'setRankingData',
      operation: 'setRankingDataMainCatch',
      cause: error,
      context: {
        callerUid,
        tournamentId: (request.data as { tournamentId?: string })?.tournamentId,
      },
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Internal server error');
  }
});

/**
 * 同一 grantIdempotencyKey では付与を1回だけ行う（冪等）。
 * 保存済み pointType / prizeConversion を正本とし、現在 config で付与可否のみ検証する。
 */
async function _awardPrizes(
  db: ReturnType<typeof getFirestore>,
  tournamentId: string,
  rankingData: Record<string, unknown>,
  grantIdempotencyKey: string,
  tournamentData: FirebaseFirestore.DocumentData | undefined,
  mainViewBefore: FirebaseFirestore.DocumentData | undefined,
): Promise<{ skipped: boolean; rankingEntries: RankingEntryForRollback[] }> {
  const mainViewRef = db
    .collection('scheduledTournaments')
    .doc(tournamentId)
    .collection('views')
    .doc('main');

  const mainViewDoc = await mainViewRef.get();
  const mainViewData = mainViewDoc.data();

  const savedPointTypeRaw =
    mainViewData?.pointType ||
    mainViewBefore?.pointType ||
    tournamentData?.snapshot?.pointType ||
    'pointA';

  const storeConfig = await getStoreConfig(db);
  const validatedConfig = validatePointConfigFromStoreConfig(storeConfig);
  const pointType = assertRewardPointTypeForGrant(savedPointTypeRaw, validatedConfig);

  const prizeConversion = parseSavedPrizeConversion(
    mainViewData?.prizeConversion ?? mainViewBefore?.prizeConversion,
    { tournamentId, pointType },
  );

  const prizeAwards: {
    playerUid: string;
    rank: string;
    prizeReferenceAmount: number;
    awardedBalanceAmount: number;
  }[] = [];
  for (const [key, value] of Object.entries(rankingData)) {
    if (typeof key === 'string' && key.endsWith('stPlayerUid') && value) {
      const rank = key.replace('stPlayerUid', '');
      const prizeKey = `${rank}stPrize`;
      const prizeReferenceRaw = mainViewData?.[prizeKey];
      if (
        typeof prizeReferenceRaw === 'number' &&
        Number.isInteger(prizeReferenceRaw) &&
        prizeReferenceRaw > 0
      ) {
        const awardedBalanceAmount = convertPrizeReferenceToBalance(
          prizeReferenceRaw,
          prizeConversion,
          { tournamentId, pointType, rankKey: prizeKey },
        );
        prizeAwards.push({
          playerUid: value as string,
          rank,
          prizeReferenceAmount: prizeReferenceRaw,
          awardedBalanceAmount,
        });
      }
    }
  }

  if (prizeAwards.length === 0) {
    return { skipped: false, rankingEntries: [] };
  }

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
        return { skipped: true, rankingEntries: [] as RankingEntryForRollback[] };
      }

      const userSnaps = await Promise.all(
        prizeAwards.map((a) => tx.get(db.collection('users').doc(a.playerUid)))
      );
      const pointLogRefs = prizeAwards.map((a) =>
        db
          .collection('users')
          .doc(a.playerUid)
          .collection('pointLogs')
          .doc(rewardPointLogId(grantIdempotencyKey, pointType))
      );
      const pointLogSnaps = await Promise.all(pointLogRefs.map((ref) => tx.get(ref)));

      const rankingEntries: RankingEntryForRollback[] = [];

      for (let i = 0; i < prizeAwards.length; i++) {
        const award = prizeAwards[i];
        const userSnap = userSnaps[i];
        const logRef = pointLogRefs[i];
        const logSnap = pointLogSnaps[i];

        if (!userSnap.exists) {
          throw new FunctionCustomError({
            errorKey: 'TOURNAMENT_RANKING_GRANT_USER_NOT_FOUND',
            message: '賞品付与対象ユーザーが見つかりません',
            context: {
              tournamentId,
              playerUid: award.playerUid,
              rank: award.rank,
              grantIdempotencyKey,
              pointType,
            },
          });
        }

        const userData = userSnap.data() as Record<string, unknown>;
        const balanceBefore = readBalanceOrZeroIfMissing(userData, pointType);
        const balanceAfter = balanceBefore + award.awardedBalanceAmount;

        tx.update(db.collection('users').doc(award.playerUid), {
          [pointType]: balanceAfter,
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
          prizeReferenceAmount: award.prizeReferenceAmount,
          awardedBalanceAmount: award.awardedBalanceAmount,
          conversion: prizeConversion,
          entryId,
          pointType,
          logDate: today,
        });

        writeTournamentRewardPointLogInTxWithSnap({
          tx,
          existingSnap: logSnap,
          ref: logRef,
          tournamentId,
          pointType,
          balanceBefore,
          changeAmount: award.awardedBalanceAmount,
          balanceAfter,
          reasonType: 'tournament_reward',
        });
      }

      tx.set(grantRecordRef, {
        tournamentId,
        pointType,
        conversion: prizeConversion,
        grantIdempotencyKey,
        appliedAt: FieldValue.serverTimestamp(),
        awards: rankingEntries.map((e) => ({
          playerUid: e.playerUid,
          rank: e.rank,
          prizeReferenceAmount: e.prizeReferenceAmount,
          awardedBalanceAmount: e.awardedBalanceAmount,
          conversion: e.conversion,
          entryId: e.entryId,
        })),
      });

      return { skipped: false, rankingEntries };
    });

    return result;
  } catch (error) {
    if (error instanceof FunctionCustomError) {
      throw error;
    }
    logOpsError({
      message: 'setRankingData prize grant failed',
      functionEntry: 'setRankingData',
      operation: 'setRankingDataPrizeGrant',
      cause: error,
      context: { tournamentId, grantIdempotencyKey, pointType },
    });
    throw error;
  }
}
