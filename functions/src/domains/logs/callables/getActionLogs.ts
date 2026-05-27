import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, Query } from "firebase-admin/firestore";
import { z } from "zod";
import { logger } from "firebase-functions";
import { logOpsError, logOpsSuccess } from "../../../shared/logging/logOpsError";

const getActionLogsSchema = z.object({
  tournamentId: z.string().min(1, "トーナメントIDは必須です"),
  deviceId: z.string().optional(),
  tableId: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  startAfter: z.string().optional(),
});

/** operationName → 履歴用 action コード（rollbackAction の action と揃える） */
const OPERATION_NAME_TO_ACTION: Record<string, string> = {
  "アドオン購入": "addon",
  "置きバケ Addon": "okibake_addon",
  "置きバケ着席": "okibake_assign_seat",
  "置きバケ Bust": "okibake_bust",
  "一括アドオン": "bulk_addon",
  "バスト＆退店": "bust_and_exit",
  "バスト＆再入場": "bust_and_reentry",
  "座席割当": "assign_seat_to_player",
  "全員着席替え": "reseat_all_players",
  "トーナメント終了": "end_tournament",
  "トーナメント強制終了": "end_tournament",
  "トーナメント登録": "register_for_tournament",
  "参加者一括登録": "register_participants",
  "ランキングデータ設定": "set_ranking_data",
};

export const getActionLogs = onCall(async (request) => {
  try {
    const validatedData = getActionLogsSchema.parse(request.data);
    const { tournamentId, deviceId, tableId, limit, startAfter } = validatedData;

    // 0件原因切り分け用: リクエストの tournamentId をログ（文字ずれ・別IDの確認用）
    console.log("[getActionLogs] request", {
      tournamentId,
      tournamentIdLength: tournamentId.length,
      tableId: tableId ?? null,
      limit,
    });

    const db = getFirestore();

    const toDate = (v: unknown): Date | null => {
      if (!v) return null;
      if (v instanceof Date) return v;
      if (v && typeof (v as { toDate?: () => Date }).toDate === "function")
        return (v as { toDate: () => Date }).toDate();
      if (v && typeof v === "object" && "_seconds" in (v as object))
        return new Date((v as { _seconds: number })._seconds * 1000);
      if (v && typeof v === "object" && "seconds" in (v as object))
        return new Date((v as { seconds: number }).seconds * 1000);
      return null;
    };

    let query: Query = db
      .collection("operationLogs")
      .where("tournamentId", "==", tournamentId);

    if (tableId != null && tableId !== "") {
      query = query.where("tableId", "==", tableId);
    }
    query = query.orderBy("createdAt", "desc").limit(limit);

    if (startAfter) {
      const startAfterDoc = await db.collection("operationLogs").doc(startAfter).get();
      if (startAfterDoc.exists) {
        query = query.startAfter(startAfterDoc);
      }
    }

    const snapshot = await query.get();

    // 0件の原因切り分け用: 同じ tournamentId のドキュメントが存在するかだけ確認（orderBy なしで1件取得）
    if (snapshot.docs.length === 0) {
      const anyDoc = await db.collection("operationLogs").where("tournamentId", "==", tournamentId).limit(1).get();
      const firstDoc = anyDoc.docs[0];
      const firstDocTournamentId = firstDoc?.data()?.tournamentId;
      logger.warn("[getActionLogs] query returned 0 docs", {
        tournamentId,
        tableId: tableId ?? null,
        hasAnyDocWithTournamentId: !anyDoc.empty,
        firstDocId: firstDoc?.id ?? null,
        firstDocTournamentId: firstDocTournamentId ?? null,
        tournamentIdMatch: firstDocTournamentId != null && String(firstDocTournamentId) === String(tournamentId),
      });
    }

    const buildItem = (
      docId: string,
      d: Record<string, unknown>,
      payload: Record<string, unknown>,
      opts: { isRollBack: boolean; operationId?: string }
    ) => {
      const createdAt = toDate(d.createdAt);
      const startedAt = toDate(d.startedAt);
      const executedAt = startedAt ?? createdAt;
      let rollBackAt: Date | null = null;
      if (d.rollBackAt) rollBackAt = toDate(d.rollBackAt);
      const operationName = String(d.operationName ?? "");
      const action = OPERATION_NAME_TO_ACTION[operationName] ?? (operationName || "other");
      return {
        id: docId,
        operationId: opts.operationId ?? docId,
        action,
        deviceId: String(d.deviceId ?? ""),
        deviceName: d.deviceName != null ? String(d.deviceName) : null,
        targetUid: (payload.playerUid as string) ?? (payload.targetUid as string) ?? null,
        targetPlayerName: (payload.playerName as string) ?? (payload.targetPlayerName as string) ?? null,
        tableId: (d.tableId as string) ?? (payload.tableId as string) ?? null,
        seatNumber: typeof payload.seatNumber === "number" ? payload.seatNumber : null,
        details: payload,
        createdAt: createdAt ? createdAt.toISOString() : null,
        executedAt: executedAt ? executedAt.toISOString() : (createdAt ? createdAt.toISOString() : null),
        isRollBack: opts.isRollBack,
        rollBackBy: d.rollBackBy != null ? String(d.rollBackBy) : null,
        rollBackByDeviceName: d.rollBackByDeviceName != null ? String(d.rollBackByDeviceName) : null,
        rollBackAt: rollBackAt ? rollBackAt.toISOString() : null,
      };
    };

    const actionLogs = snapshot.docs.flatMap((doc) => {
      const d = doc.data();
      const payload = (d.payload || {}) as Record<string, unknown>;
      const operationName = String(d.operationName ?? "");
      const rolledBackUids = d.rolledBackPlayerUids as string[] | undefined;
      const rolledBackNames = d.rolledBackPlayerNames as string[] | undefined;
      const remainingUids = (payload.playerUids as string[] | undefined) ?? [];
      const isPartialBulk =
        !d.rolledBack &&
        (operationName === "一括アドオン" || operationName === "参加者一括登録") &&
        Array.isArray(rolledBackUids) &&
        rolledBackUids.length > 0 &&
        remainingUids.length > 0;

      if (isPartialBulk && rolledBackUids && rolledBackUids.length > 0) {
        const rolledPayload: Record<string, unknown> = {
          playerUids: rolledBackUids,
          playerNames: Array.isArray(rolledBackNames) && rolledBackNames.length >= rolledBackUids.length
            ? rolledBackNames
            : rolledBackUids.map((uid) => `User_${uid}`),
        };
        return [
          buildItem(doc.id + "_rolled", d, rolledPayload, { isRollBack: true, operationId: doc.id }),
          buildItem(doc.id, d, payload, { isRollBack: false, operationId: doc.id }),
        ];
      }
      // 全員取り消し済みの一括操作: 表示用に rolledBack 分と payload（最後の1批）を結合して全員分を出す
      const isFullyRolledBulk =
        Boolean(d.rolledBack) &&
        (operationName === "一括アドオン" || operationName === "参加者一括登録") &&
        Array.isArray(rolledBackUids) &&
        rolledBackUids.length > 0 &&
        remainingUids.length > 0;
      let displayPayload = payload;
      if (isFullyRolledBulk && rolledBackUids && rolledBackNames) {
        const payloadUids = (payload.playerUids as string[] | undefined) ?? [];
        const payloadNames = (payload.playerNames as string[] | undefined) ?? [];
        displayPayload = {
          ...payload,
          playerUids: [...rolledBackUids, ...payloadUids],
          playerNames: [
            ...(Array.isArray(rolledBackNames) ? rolledBackNames : rolledBackUids.map((uid) => `User_${uid}`)),
            ...(payloadNames.length >= payloadUids.length ? payloadNames : payloadUids.map((uid) => `User_${uid}`)),
          ],
        };
      }
      return [
        buildItem(doc.id, d, displayPayload, { isRollBack: Boolean(d.rolledBack), operationId: doc.id }),
      ];
    });

    const filtered = deviceId ? actionLogs.filter((p) => p.deviceId === deviceId) : actionLogs;
    const hasNextPage = snapshot.docs.length === limit;
    const lastItem = snapshot.docs[snapshot.docs.length - 1];logOpsSuccess({
  message: "getActionLogs 成功",
  functionEntry: "getActionLogs",
  context: { detailMessage: 'ok' },
});


    return {
      success: true,
      actionLogs: filtered,
      hasNextPage,
      nextCursor: hasNextPage && lastItem ? lastItem.id : null,
      totalCount: filtered.length,
    };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      throw new HttpsError(
        "invalid-argument",
        `入力検証エラー: ${error.errors.map((e) => e.message).join(", ")}`
      );
    }
    if (error instanceof HttpsError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    logOpsError({
      message: '[getActionLogs] error',
      functionEntry: 'getActionLogs',
      cause: error,
      context: { detailMessage: String(message) },
    });
    throw new HttpsError("internal", "アクションログの取得に失敗しました");
  }
});
