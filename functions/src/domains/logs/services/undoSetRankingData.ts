import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { FunctionCustomError } from '../../../shared/logging/functionCustomError';
import { assertRewardPointTypeForReversal } from '../../tournament_activeTournament/helpers/rewardPointType';
import { readBalanceOrZeroIfMissing } from '../../user/helpers/userBalances';
import type { CurrencyPointId } from '../../user/types/pointIds';
import {
  rewardPointLogId,
  rewardReversalPointLogId,
  writeTournamentRewardPointLogInTxWithSnap,
} from '../../user/services/pointLog';

export interface RankingEntryForUndo {
  playerUid: string;
  prizeAmount: number;
  entryId: string;
  pointType: CurrencyPointId | 'pointA' | 'pointB';
  /** legacy 互換。A-7 では pointLogs 固定 ID を使う */
  logDate?: string;
}

export interface UndoSetRankingDataParams {
  tournamentId: string;
  grantIdempotencyKey: string;
  beforeMainView: Record<string, unknown>;
  rankingEntries: RankingEntryForUndo[];
}

/**
 * ランキングデータ設定を巻き戻す。
 * - main を beforeMainView に復元
 * - 付与したポイントを減算
 * - 元の pointLogs は削除せず、tournament_reward_reversal を追加
 * - grantRecord 削除、SetedRanking を false
 * - 現在 config の enabled に依存しない（保存済み実績が正本）
 */
export async function undoSetRankingData(params: UndoSetRankingDataParams): Promise<void> {
  const db = getFirestore();
  const now = Timestamp.now();

  await db.runTransaction(async (transaction) => {
    const mainViewRef = db
      .collection('scheduledTournaments')
      .doc(params.tournamentId)
      .collection('views')
      .doc('main');
    const tournamentRef = db.collection('scheduledTournaments').doc(params.tournamentId);
    const grantRecordRef = db
      .collection('scheduledTournaments')
      .doc(params.tournamentId)
      .collection('grantRecords')
      .doc(params.grantIdempotencyKey);

    const reads: Promise<FirebaseFirestore.DocumentSnapshot>[] = [
      transaction.get(mainViewRef),
      transaction.get(tournamentRef),
      transaction.get(grantRecordRef),
    ];

    for (const entry of params.rankingEntries) {
      const pointType = assertRewardPointTypeForReversal(entry.pointType);
      reads.push(transaction.get(db.collection('users').doc(entry.playerUid)));
      reads.push(
        transaction.get(
          db
            .collection('users')
            .doc(entry.playerUid)
            .collection('pointLogs')
            .doc(rewardReversalPointLogId(params.grantIdempotencyKey, pointType))
        )
      );
      reads.push(
        transaction.get(
          db
            .collection('users')
            .doc(entry.playerUid)
            .collection('pointLogs')
            .doc(rewardPointLogId(params.grantIdempotencyKey, pointType))
        )
      );
    }

    const results = await Promise.all(reads);
    let idx = 0;
    const mainDoc = results[idx++] as FirebaseFirestore.DocumentSnapshot;
    const tournamentDoc = results[idx++] as FirebaseFirestore.DocumentSnapshot;
    const grantRecordDoc = results[idx++] as FirebaseFirestore.DocumentSnapshot;

    type EntryRead = {
      userDoc: FirebaseFirestore.DocumentSnapshot;
      reversalLogDoc: FirebaseFirestore.DocumentSnapshot;
      rewardLogDoc: FirebaseFirestore.DocumentSnapshot;
      pointType: CurrencyPointId;
    };
    const entryReads: EntryRead[] = [];
    for (const entry of params.rankingEntries) {
      const pointType = assertRewardPointTypeForReversal(entry.pointType);
      entryReads.push({
        userDoc: results[idx++] as FirebaseFirestore.DocumentSnapshot,
        reversalLogDoc: results[idx++] as FirebaseFirestore.DocumentSnapshot,
        rewardLogDoc: results[idx++] as FirebaseFirestore.DocumentSnapshot,
        pointType,
      });
    }

    if (!mainDoc.exists) {
      throw new FunctionCustomError({
        errorKey: 'NOT_FOUND',
        message: 'Main view not found',
        context: { tournamentId: params.tournamentId },
      });
    }
    if (!tournamentDoc.exists) {
      throw new FunctionCustomError({
        errorKey: 'NOT_FOUND',
        message: 'Tournament not found',
        context: { tournamentId: params.tournamentId },
      });
    }

    // 冪等: grant が既に無く、全 reversal が揃っていれば成功扱い
    const allReversalsExist =
      params.rankingEntries.length > 0 &&
      entryReads.every((r) => r.reversalLogDoc.exists);
    if (!grantRecordDoc.exists && allReversalsExist) {
      transaction.set(mainViewRef, { ...params.beforeMainView, updatedAt: now });
      transaction.update(tournamentRef, {
        SetedRanking: false,
        updatedAt: now,
      });
      return;
    }

    transaction.set(mainViewRef, { ...params.beforeMainView, updatedAt: now });

    for (let i = 0; i < params.rankingEntries.length; i++) {
      const entry = params.rankingEntries[i];
      const { userDoc, reversalLogDoc, rewardLogDoc, pointType } = entryReads[i];

      if (!userDoc.exists) {
        throw new FunctionCustomError({
          errorKey: 'NOT_FOUND',
          message: '取消対象ユーザーが見つかりません',
          context: { playerUid: entry.playerUid, tournamentId: params.tournamentId },
        });
      }

      const userData = userDoc.data() as Record<string, unknown>;
      const balanceBefore = readBalanceOrZeroIfMissing(userData, pointType);
      if (balanceBefore < entry.prizeAmount) {
        throw new FunctionCustomError({
          errorKey: 'ACCOUNTING_INSUFFICIENT_BALANCE',
          message: '取消に必要な残高が不足しています',
          context: {
            playerUid: entry.playerUid,
            pointType,
            balanceBefore,
            prizeAmount: entry.prizeAmount,
          },
        });
      }
      const balanceAfter = balanceBefore - entry.prizeAmount;

      transaction.update(db.collection('users').doc(entry.playerUid), {
        [pointType]: balanceAfter,
        updatedAt: now,
      });

      // 元の reward ログは削除しない（存在確認のみ。無くても取消は続行可＝旧データ互換は非対象だが防御）
      void rewardLogDoc;

      const reversalRef = db
        .collection('users')
        .doc(entry.playerUid)
        .collection('pointLogs')
        .doc(rewardReversalPointLogId(params.grantIdempotencyKey, pointType));

      writeTournamentRewardPointLogInTxWithSnap({
        tx: transaction,
        existingSnap: reversalLogDoc,
        ref: reversalRef,
        tournamentId: params.tournamentId,
        pointType,
        balanceBefore,
        changeAmount: -entry.prizeAmount,
        balanceAfter,
        reasonType: 'tournament_reward_reversal',
      });
    }

    if (grantRecordDoc.exists) {
      transaction.delete(grantRecordRef);
    }

    transaction.update(tournamentRef, {
      SetedRanking: false,
      updatedAt: now,
    });
  });
}
