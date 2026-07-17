import { Firestore, getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { isTournamentEndedStatus } from "../../tournament_activeTournament/lib/assertTournamentAllowsMutation";
import { isTournamentStatusCancelled } from "../../../shared/tournament/mapScheduledTournamentForLiff";
import { getBusinessDateForAttendance } from "../../storeMeta/repos/getCurrentBusinessDateKeyOrThrow";

const UNSETTLED_BILL_STATUSES = ["open", "in_progress", "settling"] as const;
const SEAT_USER_ID_KEY = /^seat\d+UserId$/;

export type MigrationGuardUserSnapshot = {
  currentTable?: unknown;
  currentSeat?: unknown;
};

export type AssertUserFreeForMigrationOptions = {
  db?: Firestore;
  /** tx 前のフル検査。省略時 true */
  includeRemoteScans?: boolean;
  /** tx 内再検査用に渡す users スナップショット（無い場合は users/{uid} を読む） */
  userSnapshot?: MigrationGuardUserSnapshot | null;
  /** tx 内再検査用。渡された場合 activeStays の追加 get をしない */
  activeStaySnapshot?: {exists: boolean; data: () => FirebaseFirestore.DocumentData | undefined};
};

function isOccupiedSeatOrTableValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function hasActiveTableOrSeat(userData: MigrationGuardUserSnapshot | undefined): boolean {
  if (!userData) return false;
  return (
    isOccupiedSeatOrTableValue(userData.currentTable) ||
    isOccupiedSeatOrTableValue(userData.currentSeat)
  );
}

function isClosedTournamentStatus(status: string | undefined): boolean {
  return isTournamentEndedStatus(status) || isTournamentStatusCancelled(status);
}

function seatsContainUserId(seats: unknown, uid: string): boolean {
  if (!seats || typeof seats !== "object") return false;
  for (const [key, value] of Object.entries(seats as Record<string, unknown>)) {
    if (SEAT_USER_ID_KEY.test(key) && value === uid) {
      return true;
    }
  }
  return false;
}

async function assertNoActiveStay(
  db: Firestore,
  uid: string,
  activeStaySnapshot?: AssertUserFreeForMigrationOptions["activeStaySnapshot"]
): Promise<void> {
  const snap =
    activeStaySnapshot ??
    (await db.collection("activeStays").doc(uid).get());
  if (snap.exists && snap.data()?.isActive === true) {
    throw new HttpsError("failed-precondition", "入店中のため移行できません", {
      errorKey: "USER_HAS_ACTIVE_STAY",
      uid,
    });
  }
}

async function assertNoActiveTableSeat(
  db: Firestore,
  uid: string,
  userSnapshot?: MigrationGuardUserSnapshot | null
): Promise<void> {
  let data = userSnapshot ?? undefined;
  if (data === undefined) {
    const userSnap = await db.collection("users").doc(uid).get();
    data = userSnap.exists ? (userSnap.data() as MigrationGuardUserSnapshot) : undefined;
  }
  if (hasActiveTableOrSeat(data)) {
    throw new HttpsError(
      "failed-precondition",
      "卓または席に紐付いているため移行できません",
      {errorKey: "USER_HAS_ACTIVE_TABLE_SEAT", uid},
    );
  }
}

async function assertNoUnsettledBill(db: Firestore, uid: string): Promise<void> {
  const snap = await db
    .collection("bills")
    .where("party.userId", "==", uid)
    .where("status", "in", [...UNSETTLED_BILL_STATUSES])
    .limit(1)
    .get();
  if (!snap.empty) {
    throw new HttpsError(
      "failed-precondition",
      "未精算または会計処理中の伝票があるため移行できません",
      {errorKey: "USER_HAS_UNSETTLED_BILL", uid},
    );
  }
}

async function assertNoPostSettlementPending(db: Firestore, uid: string): Promise<void> {
  const snap = await db
    .collection("bills")
    .where("party.userId", "==", uid)
    .where("status", "==", "post_settlement_pending")
    .limit(1)
    .get();
  if (!snap.empty) {
    throw new HttpsError(
      "failed-precondition",
      "会計後の未完了手続きがあるため移行できません",
      {errorKey: "USER_HAS_POST_SETTLEMENT_PENDING", uid},
    );
  }
}

async function assertNoActiveTournament(db: Firestore, uid: string): Promise<void> {
  // 当日営業日の未終了トーナメントのみ（過去営業日の残留は対象外）。
  // 閉店中でも移行できるよう、running 必須の getCurrentBusinessDateKeyOrThrow は使わない。
  const businessDate = await getBusinessDateForAttendance(db);
  const tournamentsSnap = await db
    .collection("scheduledTournaments")
    .where("status", "not-in", ["ended", "cancelled", "force_ended", "canceled"])
    .get();

  for (const tournamentDoc of tournamentsSnap.docs) {
    const data = tournamentDoc.data() ?? {};
    const status = data.status as string | undefined;
    if (isClosedTournamentStatus(status)) continue;
    if (data.businessDate !== businessDate) continue;

    const tablesSeatSnap = await tournamentDoc.ref.collection("tablesSeat").get();
    for (const seatDoc of tablesSeatSnap.docs) {
      if (seatDoc.id === "waiting") {
        const waiting = (seatDoc.data()?.waiting ?? {}) as Record<string, unknown>;
        if (Object.prototype.hasOwnProperty.call(waiting, uid)) {
          throw new HttpsError(
            "failed-precondition",
            "未完了のトーナメントに参加中のため移行できません",
            {errorKey: "USER_HAS_ACTIVE_TOURNAMENT", uid, tournamentId: tournamentDoc.id},
          );
        }
        continue;
      }
      if (seatsContainUserId(seatDoc.data()?.seats, uid)) {
        throw new HttpsError(
          "failed-precondition",
          "未完了のトーナメントに参加中のため移行できません",
          {errorKey: "USER_HAS_ACTIVE_TOURNAMENT", uid, tournamentId: tournamentDoc.id},
        );
      }
    }
  }
}

async function assertNoSideGameSeat(db: Firestore, uid: string): Promise<void> {
  // sideGame は当日卓の現在 seats 正本（営業日フィールドなし）。残留席は「いま着席中」として扱う。
  const sideGamesSnap = await db.collection("sideGame").get();
  for (const doc of sideGamesSnap.docs) {
    if (seatsContainUserId(doc.data()?.seats, uid)) {
      throw new HttpsError(
        "failed-precondition",
        "サイドゲームに着席中のため移行できません",
        {errorKey: "USER_HAS_SIDE_GAME_SEAT", uid, tableId: doc.id},
      );
    }
  }
}

/**
 * 未解消の置きバケリンク:
 * collectionGroup(okibakeTemporaryEntries) で linkedUserId 一致、
 * billLinkStatus が unlinked | pending_review、entryStatus !== voided。
 * 過去営業日の pending_review も未完了義務として拒否する（日付に依存させない）。
 */
async function assertNoPendingOkibakeLink(db: Firestore, uid: string): Promise<void> {
  const snap = await db
    .collectionGroup("okibakeTemporaryEntries")
    .where("linkedUserId", "==", uid)
    .where("billLinkStatus", "in", ["unlinked", "pending_review"])
    .get();

  for (const doc of snap.docs) {
    const entryStatus = doc.data()?.entryStatus;
    if (entryStatus === "voided") continue;
    throw new HttpsError(
      "failed-precondition",
      "置きバケの進行中リンクがあるため移行できません",
      {errorKey: "USER_HAS_PENDING_OKIBAKE_LINK", uid},
    );
  }
}

/**
 * 後日 LINE 化の進行中／未完了業務検査。
 * includeRemoteScans=false のときは tx 内再検査用（activeStay + currentTable/Seat のみ）。
 */
export async function assertUserFreeForMigration(
  uid: string,
  options: AssertUserFreeForMigrationOptions = {}
): Promise<void> {
  if (!uid?.trim()) {
    throw new HttpsError("invalid-argument", "uid が必要です", {
      errorKey: "INVALID_ARGUMENT",
    });
  }

  const db = options.db ?? getFirestore();
  const includeRemoteScans = options.includeRemoteScans !== false;

  await assertNoActiveStay(db, uid, options.activeStaySnapshot);
  await assertNoActiveTableSeat(db, uid, options.userSnapshot);

  if (!includeRemoteScans) {
    return;
  }

  await assertNoUnsettledBill(db, uid);
  await assertNoPostSettlementPending(db, uid);
  await assertNoActiveTournament(db, uid);
  await assertNoSideGameSeat(db, uid);
  await assertNoPendingOkibakeLink(db, uid);
}
