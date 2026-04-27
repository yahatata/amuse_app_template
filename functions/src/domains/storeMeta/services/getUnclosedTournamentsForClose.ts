/**
 * Phase4 03: 閉店前未 close トーナメント取得
 *
 * 当日営業日で status が ended / cancelled 以外の scheduledTournaments を取得。
 * 閉店前確認画面で表示する。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { getCurrentBusinessDateKeyOrThrow } from '../repos/getCurrentBusinessDateKeyOrThrow';
import { requireAdmin } from '../../../shared/devices';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';

export type UnclosedTournamentItem = {
  tournamentId: string;
  status: string;
  startAt: string;
  snapshotName: string;
  displayMessage: string;
  reentries: number;
  playersBusted: number;
  entries: number;
  /** 順位の確定＝プライズの付与が完了しているか（1stPlayerName〜{prizeReceiverCount}stPlayerName の全てに値が入った時） */
  rankingConfirmed: boolean;
  /** プライズの確定が完了しているか（1stPlayerName 等のフィールドが作成された時） */
  prizeConfirmed: boolean;
  /** 残プレーヤーがいるか（reentries+entries > playersBusted） */
  hasRemainingPlayers: boolean;
};

const CLOSED_STATUSES = ['ended', 'cancelled', 'force_ended'];

function computeDisplayMessage(tournament: {
  rankingConfirmed: boolean;
  prizeConfirmed: boolean;
  reentries: number;
  entries: number;
  playersBusted: number;
}): string {
  const { rankingConfirmed, prizeConfirmed, reentries, entries, playersBusted } = tournament;

  const totalEntries = reentries + entries;
  if (totalEntries < playersBusted) {
    logger.warn('getUnclosedTournamentsForClose: reentries+entries < playersBusted', {
      reentries,
      entries,
      playersBusted,
    });
  }

  const hasRemainingPlayers = totalEntries > playersBusted;

  // ケース0: status≠ended かつ 全 XstPlayerName に値が入っている
  if (rankingConfirmed) {
    if (hasRemainingPlayers) {
      // ケース3+: burst処理がされていない + 順位・プライズは完了
      return 'burst処理がされていないplayerがいます。ただし順位の確定およびプライズの付与は完了しています。';
    }
    return '終了処理がなされていません（順位の確定、プライズの付与は完了しています。）';
  }

  // ケース1: 1stPlayerName 等が存在し、値が未確定
  if (prizeConfirmed) {
    return '順位の確定およびプライズの付与ができていません。';
  }

  // ケース2: 1stPlayerName が存在しない かつ 残りプレイヤーなし
  if (!hasRemainingPlayers) {
    return 'プライズの確定および順位の確定ができていません。';
  }

  // ケース3: 残りプレイヤーがいる
  return 'burst処理がされていないplayerがいます。';
}

/** 未 close トーナメント取得のコアロジック。getCloseIntegrityData からも利用 */
export async function getUnclosedTournamentsForCloseCore(
  db: Firestore,
  businessDate: string
): Promise<UnclosedTournamentItem[]> {
  const tournamentsSnap = await db
      .collection('scheduledTournaments')
      .where('businessDate', '==', businessDate)
      .get();

  const unclosed: UnclosedTournamentItem[] = [];

  for (const doc of tournamentsSnap.docs) {
      const d = doc.data();
      const status = (d.status as string) ?? '';

      if (CLOSED_STATUSES.includes(status)) continue;

      const startAt = d.startAt;
      const startAtIso =
        startAt && typeof (startAt as { toDate?: () => Date }).toDate === 'function'
          ? (startAt as { toDate: () => Date }).toDate().toISOString()
          : '';

      const snapshot = (d.snapshot as Record<string, unknown>) ?? {};
      const snapshotName = (snapshot.name as string) ?? '';

      const viewsMainRef = db
        .collection('scheduledTournaments')
        .doc(doc.id)
        .collection('views')
        .doc('main');
      const viewsMainSnap = await viewsMainRef.get();
      const viewsMain = viewsMainSnap.exists ? (viewsMainSnap.data() ?? {}) : {};

      const reentries = (viewsMain.reentries as number) ?? 0;
      const entries = (viewsMain.entries as number) ?? 0;
      const playersBusted = (viewsMain.playersBusted as number) ?? 0;

      const firstPlayerNameKey = '1stPlayerName';
      const prizeConfirmed = firstPlayerNameKey in viewsMain;

      const prizeReceiverCount = Math.max(1, (viewsMain.prizeReceiverCount as number) ?? 1);
      let rankingConfirmed = true;
      for (let i = 1; i <= prizeReceiverCount; i++) {
        const name = viewsMain[`${i}stPlayerName`] as string | null | undefined;
        if (name == null || name === '') {
          rankingConfirmed = false;
          break;
        }
      }

      const displayMessage = computeDisplayMessage({
        rankingConfirmed,
        prizeConfirmed,
        reentries,
        entries,
        playersBusted,
      });

      const totalEntries = reentries + entries;
      const hasRemainingPlayers = totalEntries > playersBusted;

      unclosed.push({
        tournamentId: doc.id,
        status,
        startAt: startAtIso,
        snapshotName,
        displayMessage,
        reentries,
        playersBusted,
        entries,
        rankingConfirmed,
        prizeConfirmed,
        hasRemainingPlayers,
      });
  }

  return unclosed;
}

export const getUnclosedTournamentsForClose = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }

  const adminId = request.auth.uid;
  const db = getFirestore();
  await requireAdmin(db, adminId);

  const logContext: Record<string, unknown> = { adminId };

  try {
    const businessDate = await getCurrentBusinessDateKeyOrThrow();
    Object.assign(logContext, { businessDate });
    const data = await getUnclosedTournamentsForCloseCore(db, businessDate);
    logOpsSuccess({
      message: 'getUnclosedTournamentsForClose 成功',
      functionEntry: 'getUnclosedTournamentsForClose',
      operation: 'unclosedTournamentsQuery',
      context: { businessDate, count: data.length },
    });

    return {
      success: true,
      data,
      hasNoTarget: data.length === 0,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logOpsError({
      message: 'getUnclosedTournamentsForClose failed',
      functionEntry: 'getUnclosedTournamentsForClose',
      operation: 'unclosedTournamentsQuery',
      cause: error,
      sourceProductHint: 'firestore',
      context: logContext,
    });
    throw new HttpsError(
      'internal',
      `未 close トーナメントの取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});
