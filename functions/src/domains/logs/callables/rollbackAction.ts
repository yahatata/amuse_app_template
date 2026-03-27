import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { markOperationLogRolledBack } from "../lib/operationLog";
import { logOpsError } from "../../../shared/logging/logOpsError";
import {
  undoAddon,
  undoBulkAddon,
  undoBustAndExit,
  undoBustAndReentry,
  undoEndTournament,
  undoAssignSeatToPlayer,
  undoReseatAllPlayers,
  undoRegisterForTournament,
  undoRegisterParticipants,
  undoSetRankingData,
} from "../services";

// 入力スキーマの定義（操作履歴は operationLogs のみ。取り消しは operationId で指定）
const rollbackActionSchema = z.object({
  tournamentId: z.string().min(1, "トーナメントIDは必須です"),
  /** operationLogs のドキュメントID。操作履歴の id を渡す */
  operationId: z.string().min(1, "operationId は必須です"),
  action: z.enum([
    'addon',
    'bulk_addon',
    'bust_and_exit',
    'bust_and_reentry',
    'end_tournament',
    'register_participants',
    'register_for_tournament',
    'assign_seat_to_player',
    'reseat_all_players',
    'set_ranking_data',
  ], { errorMap: () => ({ message: "有効な操作タイプを指定してください" }) }),
  rollBackBy: z.string().min(1, "ロールバック実行者のデバイスIDは必須です"),
  rollBackByDeviceName: z.string().optional(),
  // 操作固有のパラメータ
  playerUid: z.string().optional(),
  playerName: z.string().optional(),
  tableId: z.string().optional(),
  seatNumber: z.number().optional(),
  playerUids: z.array(z.string()).optional(),
  playerNames: z.array(z.string()).optional(),
  details: z.array(z.record(z.any())).optional(),
  previousSeatingData: z.record(z.any()).optional(),
});

export const rollbackAction = onCall(async (request) => {
  try {
    // 入力検証
    const validatedData = rollbackActionSchema.parse(request.data);
    const { tournamentId, operationId, action, rollBackBy, rollBackByDeviceName } = validatedData;

    const db = getFirestore();

    // operationLogs 経由の巻き戻し（操作履歴は operationLogs のみのため、常にこの経路）
    const opLogRef = db.collection('operationLogs').doc(operationId);
    const opLogDoc = await opLogRef.get();
    if (!opLogDoc.exists) {
      throw new HttpsError('not-found', '指定された操作記録が見つかりません');
    }
    const opData = opLogDoc.data()!;
    if (opData.status !== 'succeeded') {
      throw new HttpsError('failed-precondition', '失敗した操作は巻き戻せません');
    }
    if (opData.rolledBack === true) {
      throw new HttpsError('failed-precondition', 'この操作は既にロールバック済みです');
    }

    const operationName = String(opData.operationName ?? '');
    const payload = (opData.payload || {}) as Record<string, unknown>;
    const tId = (opData.tournamentId as string) || (payload.tournamentId as string) || tournamentId;
    const rollBackByDeviceId = rollBackBy;

    if (operationName === '一括アドオン') {
      const allPlayerUids = (payload.playerUids as string[] | undefined) ?? [];
      const allPlayerNames = (payload.playerNames as string[] | undefined) ?? [];
      const allDetails = payload.details as Array<{ playerUid: string; playerName: string; billId: string; templateId: string }> | undefined;
      const tableIdForUndo = (opData.tableId as string) ?? (payload.tableId as string) ?? '';
      const selectedUids = (validatedData.playerUids ?? allPlayerUids) as string[];
      const selectedNames = (validatedData.playerNames ?? allPlayerNames) as string[];
      const selectedDetails = (validatedData.details ?? allDetails) as Array<{ playerUid: string; playerName: string; billId: string; templateId: string }> | undefined;
      if (selectedUids.length === 0) {
        throw new HttpsError('invalid-argument', '取り消し対象を1人以上選択してください');
      }
      await undoBulkAddon({
        tournamentId: tId,
        playerUids: selectedUids,
        playerNames: selectedNames.length >= selectedUids.length ? selectedNames : selectedUids.map((uid) => `User_${uid}`),
        tableId: tableIdForUndo,
        rollBackBy: rollBackByDeviceId,
        details: selectedDetails,
      });
      const rolledBackSet = new Set(selectedUids);
      const remainingDetails = (allDetails ?? []).filter((d) => !rolledBackSet.has(d.playerUid));
      if (remainingDetails.length === 0) {
        await markOperationLogRolledBack(operationId, rollBackBy, rollBackByDeviceName ?? undefined);
      } else {
        await opLogRef.update({
          payload: {
            playerUids: remainingDetails.map((d) => d.playerUid),
            playerNames: remainingDetails.map((d) => d.playerName),
            details: remainingDetails,
            ...(tableIdForUndo ? { tableId: tableIdForUndo } : {}),
          },
          rolledBackPlayerUids: FieldValue.arrayUnion(...selectedUids),
          rolledBackPlayerNames: FieldValue.arrayUnion(...selectedNames),
        });
      }
      return { success: true, message: '操作のロールバックが完了しました', operationId, action };
    } else if (operationName === 'アドオン購入') {
      const plUid = payload.playerUid as string;
      const plName = payload.playerName as string;
      if (!plUid || !plName) {
        throw new HttpsError('invalid-argument', '操作記録にプレイヤー情報がありません');
      }
      const tableIdForUndo = (opData.tableId as string) ?? (payload.tableId as string) ?? '';
      await undoAddon({
        tournamentId: tId,
        playerUid: plUid,
        playerName: plName,
        tableId: tableIdForUndo,
        seatNumber: typeof payload.seatNumber === 'number' ? payload.seatNumber : 0,
        addonAmount: 0,
        rollBackBy: rollBackByDeviceId,
        billId: payload.billId as string | undefined,
        templateId: payload.templateId as string | undefined,
      });
    } else if (operationName === 'バスト＆退店') {
      const plUid = payload.playerUid as string;
      const plName = payload.playerName as string;
      const tableIdForUndo = (opData.tableId as string) ?? (payload.tableId as string) ?? '';
      if (!plUid || !plName) {
        throw new HttpsError('invalid-argument', '操作記録にプレイヤー情報がありません');
      }
      await undoBustAndExit({
        tournamentId: tId,
        playerUid: plUid,
        playerName: plName,
        tableId: tableIdForUndo,
        seatNumber: typeof payload.seatNumber === 'number' ? payload.seatNumber : 0,
        rollBackBy: rollBackByDeviceId,
        billId: payload.billId as string | undefined,
      });
    } else if (operationName === 'バスト＆再入場') {
      const plUid = payload.playerUid as string;
      const plName = payload.playerName as string;
      const tableIdForUndo = (opData.tableId as string) ?? (payload.tableId as string) ?? '';
      if (!plUid || !plName) {
        throw new HttpsError('invalid-argument', '操作記録にプレイヤー情報がありません');
      }
      await undoBustAndReentry({
        tournamentId: tId,
        playerUid: plUid,
        playerName: plName,
        tableId: tableIdForUndo,
        seatNumber: typeof payload.seatNumber === 'number' ? payload.seatNumber : 0,
        rollBackBy: rollBackByDeviceId,
        billId: payload.billId as string | undefined,
        templateId: payload.templateId as string | undefined,
      });
    } else if (operationName === '座席割当') {
      const plUid = payload.playerUid as string;
      const plName = payload.playerName as string;
      const tableIdForUndo = (opData.tableId as string) ?? (payload.tableId as string) ?? '';
      if (!plUid || !plName) {
        throw new HttpsError('invalid-argument', '操作記録にプレイヤー情報がありません');
      }
      await undoAssignSeatToPlayer({
        tournamentId: tId,
        playerUid: plUid,
        playerName: plName,
        tableId: tableIdForUndo,
        seatNumber: typeof payload.seatNumber === 'number' ? payload.seatNumber : 0,
        rollBackBy: rollBackByDeviceId,
      });
    } else if (operationName === '全員着席替え') {
      const previousSeatingData = payload.previousSeatingData as Record<string, unknown> | undefined;
      if (!previousSeatingData || typeof previousSeatingData !== 'object') {
        throw new HttpsError('invalid-argument', '操作記録に前の座席配置データがありません');
      }
      await undoReseatAllPlayers({
        tournamentId: tId,
        previousSeatingData: previousSeatingData as Record<string, any>,
        rollBackBy: rollBackByDeviceId,
      });
    } else if (operationName === 'トーナメント登録') {
      const plUid = payload.playerUid as string;
      const plName = payload.playerName as string;
      if (!plUid || !plName) {
        throw new HttpsError('invalid-argument', '操作記録にプレイヤー情報がありません');
      }
      await undoRegisterForTournament({
        tournamentId: tId,
        playerUid: plUid,
        playerName: plName,
        rollBackBy: rollBackByDeviceId,
        billId: payload.billId as string | undefined,
        templateId: payload.templateId as string | undefined,
      });
    } else if (operationName === '参加者一括登録') {
      const allPlayerUids = (payload.playerUids as string[] | undefined) ?? [];
      const allPlayerNames = (payload.playerNames as string[] | undefined) ?? [];
      const allDetails = payload.details as Array<{ playerUid: string; playerName: string; billId?: string; templateId?: string; isReentry?: boolean }> | undefined;
      const selectedUids = (validatedData.playerUids ?? allPlayerUids) as string[];
      const selectedNames = (validatedData.playerNames ?? allPlayerNames) as string[];
      const selectedDetails = (validatedData.details ?? allDetails) as Array<{ playerUid: string; playerName: string; billId?: string; templateId?: string; isReentry?: boolean }> | undefined;
      if (selectedUids.length === 0) {
        throw new HttpsError('invalid-argument', '取り消し対象を1人以上選択してください');
      }
      await undoRegisterParticipants({
        tournamentId: tId,
        playerUids: selectedUids,
        playerNames: selectedNames.length >= selectedUids.length ? selectedNames : selectedUids.map((uid) => `User_${uid}`),
        rollBackBy: rollBackByDeviceId,
        rollBackByDeviceName: rollBackByDeviceName ?? undefined,
        details: selectedDetails,
      });
      const rolledBackSet = new Set(selectedUids);
      const remainingDetails = (allDetails ?? []).filter((d) => !rolledBackSet.has(d.playerUid));
      if (remainingDetails.length === 0) {
        await markOperationLogRolledBack(operationId, rollBackBy, rollBackByDeviceName ?? undefined);
      } else {
        await opLogRef.update({
          payload: {
            playerUids: remainingDetails.map((d) => d.playerUid),
            playerNames: remainingDetails.map((d) => d.playerName),
            details: remainingDetails,
          },
          rolledBackPlayerUids: FieldValue.arrayUnion(...selectedUids),
          rolledBackPlayerNames: FieldValue.arrayUnion(...selectedNames),
        });
      }
      return { success: true, message: '操作のロールバックが完了しました', operationId, action };
    } else if (operationName === 'トーナメント終了' || operationName === 'トーナメント強制終了') {
      const tournamentId = (payload.tournamentId as string) ?? tId;
      const beforeStatus = (payload.beforeStatus as string) ?? 'registered';
      const beforeEndedAt = payload.beforeEndedAt ?? null;
      const tableNames = (payload.tableNames as string[]) ?? [];
      const beforeTableStatuses = (payload.beforeTableStatuses as Record<string, string>) ?? {};
      await undoEndTournament({
        tournamentId,
        beforeStatus,
        beforeEndedAt: beforeEndedAt as FirebaseFirestore.Timestamp | null,
        tableNames,
        beforeTableStatuses,
      });
      await markOperationLogRolledBack(operationId, rollBackBy, rollBackByDeviceName ?? undefined);
      return { success: true, message: '操作のロールバックが完了しました', operationId, action };
    } else if (operationName === 'ランキングデータ設定') {
      const tournamentId = (payload.tournamentId as string) ?? tId;
      const grantIdempotencyKey = payload.grantIdempotencyKey as string;
      const beforeMainView = (payload.beforeMainView as Record<string, unknown>) ?? {};
      const rawEntries = (payload.rankingEntries as Array<Record<string, unknown>>) ?? [];
      const rankingEntries = rawEntries.map((e) => ({
        playerUid: String(e.playerUid ?? ''),
        prizeAmount: Number(e.prizeAmount ?? 0),
        entryId: String(e.entryId ?? ''),
        pointType: (e.pointType as 'pointA' | 'pointB') ?? 'pointA',
        logDate: String(e.logDate ?? ''),
      }));
      if (!grantIdempotencyKey) {
        throw new HttpsError('invalid-argument', '操作記録に grantIdempotencyKey がありません');
      }
      await undoSetRankingData({
        tournamentId,
        grantIdempotencyKey,
        beforeMainView,
        rankingEntries,
      });
      await markOperationLogRolledBack(operationId, rollBackBy, rollBackByDeviceName ?? undefined);
      return { success: true, message: '操作のロールバックが完了しました', operationId, action };
    } else {
      throw new HttpsError(
        'failed-precondition',
        `この操作タイプ（${operationName}）は operationLogs 経由の取り消しに対応していません`
      );
    }

    await markOperationLogRolledBack(operationId, rollBackBy, rollBackByDeviceName ?? undefined);
    return {
      success: true,
      message: '操作のロールバックが完了しました',
      operationId,
      action,
    };

  } catch (error) {
    logOpsError({
      message: 'ロールバック操作エラー:',
      failureType: 'business',
      functionEntry: 'rollbackAction',
      cause: error,
    });
    
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', `入力検証エラー: ${error.errors.map(e => e.message).join(', ')}`);
    }
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', '操作のロールバックに失敗しました');
  }
});
