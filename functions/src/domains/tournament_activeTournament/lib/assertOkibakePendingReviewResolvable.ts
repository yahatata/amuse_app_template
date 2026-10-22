import { HttpsError } from 'firebase-functions/v2/https';

/**
 * 来店なし入金（pending_review 解消）向け: トーナメントの存在のみ確認する。
 * ended / force_ended でも拒否しない（終了後の要対応精算を許容するため）。
 */
export function assertTournamentExistsForPendingReviewResolution(params: {
  tournamentId: string;
  exists: boolean;
}): void {
  if (!params.exists) {
    throw new HttpsError('not-found', 'トーナメントが存在しません', {
      errorKey: 'TOURNAMENT_NOT_FOUND',
      tournamentId: params.tournamentId,
    });
  }
}

export type OkibakePendingReviewResolvable = {
  linkedUserId: string;
  linkedUserPokerName: string;
  entryStatus: string;
};

/**
 * 来店なし入金向け: 対象エントリが解消可能かを検証する。
 * - エントリが対象 tournament 配下に存在すること（呼び出し側で path を固定）
 * - billLinkStatus == pending_review（linked 済みはここで拒否）
 * - linkedUserId があること
 * - entryStatus が registered / seated / busted
 */
export function assertOkibakePendingReviewResolvable(params: {
  exists: boolean;
  entryData: FirebaseFirestore.DocumentData | undefined;
}): OkibakePendingReviewResolvable {
  if (!params.exists) {
    throw new HttpsError('not-found', '置きバケが見つかりません', {
      errorKey: 'OKIBAKE_ENTRY_NOT_FOUND',
    });
  }

  const e = (params.entryData ?? {}) as Record<string, unknown>;
  const billLinkStatus = typeof e.billLinkStatus === 'string' ? e.billLinkStatus : '';
  if (billLinkStatus === 'linked') {
    throw new HttpsError('failed-precondition', 'すでに伝票へ紐付け済みです', {
      errorKey: 'OKIBAKE_ALREADY_LINKED',
    });
  }
  if (billLinkStatus !== 'pending_review') {
    throw new HttpsError('failed-precondition', 'pending_review のみ処理できます', {
      errorKey: 'OKIBAKE_NOT_PENDING_REVIEW',
      billLinkStatus,
    });
  }

  const entryStatus = typeof e.entryStatus === 'string' ? e.entryStatus : '';
  if (!['registered', 'seated', 'busted'].includes(entryStatus)) {
    throw new HttpsError('failed-precondition', 'entryStatus が不正です', {
      errorKey: 'OKIBAKE_INVALID_ENTRY_STATUS',
      entryStatus,
    });
  }

  const linkedUserId =
    typeof e.linkedUserId === 'string' && e.linkedUserId.trim().length > 0
      ? e.linkedUserId.trim()
      : null;
  const linkedUserPokerName =
    typeof e.linkedUserPokerName === 'string' && e.linkedUserPokerName.trim().length > 0
      ? e.linkedUserPokerName.trim()
      : linkedUserId;
  if (!linkedUserId || !linkedUserPokerName) {
    throw new HttpsError('failed-precondition', 'linkedUserId が未設定です', {
      errorKey: 'OKIBAKE_LINKED_USER_REQUIRED',
    });
  }

  return {linkedUserId, linkedUserPokerName, entryStatus};
}
