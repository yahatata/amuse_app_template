import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { 
  undoAddon,
  undoBulkAddon,
  undoBustAndExit,
  undoBustAndReentry,
  undoRegisterParticipants,
  undoAssignSeatToPlayer,
  undoReseatAllPlayers
} from "../rollbackFunction/index";

// 入力スキーマの定義
const rollbackActionSchema = z.object({
  tournamentId: z.string().min(1, "トーナメントIDは必須です"),
  actionLogId: z.string().min(1, "アクションログIDは必須です"),
  action: z.enum([
    'addon',
    'bulk_addon',
    'bust_and_exit',
    'bust_and_reentry',
    'register_participants',
    'assign_seat_to_player',
    'reseat_all_players'
  ], { errorMap: () => ({ message: "有効な操作タイプを指定してください" }) }),
  rollBackBy: z.string().min(1, "ロールバック実行者のデバイスIDは必須です"),
  // 操作固有のパラメータ
  playerUid: z.string().optional(),
  playerName: z.string().optional(),
  tableId: z.string().optional(),
  seatNumber: z.number().optional(),
  playerUids: z.array(z.string()).optional(),
  playerNames: z.array(z.string()).optional(),
  previousSeatingData: z.record(z.any()).optional(),
});

export const rollbackAction = onCall(async (request) => {
  try {
    // 入力検証
    const validatedData = rollbackActionSchema.parse(request.data);
    const { 
      tournamentId, 
      actionLogId, 
      action, 
      rollBackBy,
      playerUid,
      playerName,
      tableId,
      seatNumber,
      playerUids,
      playerNames,
      previousSeatingData
    } = validatedData;

    const db = getFirestore();

    // アクションログの存在確認
    const actionLogRef = db
      .collection('scheduledTournaments')
      .doc(tournamentId)
      .collection('actionLog')
      .doc(actionLogId);
      
    const actionLogDoc = await actionLogRef.get();
    if (!actionLogDoc.exists) {
      throw new HttpsError('not-found', '指定されたアクションログが見つかりません');
    }

    const actionLogData = actionLogDoc.data()!;
    
    // 既にロールバック済みかチェック
    if (actionLogData.isRollBack) {
      throw new HttpsError('failed-precondition', 'この操作は既にロールバック済みです');
    }

    // 操作タイプに応じてロールバック関数を呼び出し
    switch (action) {
      case 'addon':
        if (!playerUid || !playerName || !tableId || seatNumber === undefined) {
          throw new HttpsError('invalid-argument', 'addon操作のロールバックに必要なパラメータが不足しています');
        }
        await undoAddon({
          tournamentId,
          actionLogId,
          playerUid,
          playerName,
          tableId,
          seatNumber,
          addonAmount: 0, // ログから取得するか、パラメータとして渡す
          rollBackBy,
        });
        break;

      case 'bulk_addon':
        if (!playerUids || !playerNames || !tableId) {
          throw new HttpsError('invalid-argument', 'bulk_addon操作のロールバックに必要なパラメータが不足しています');
        }
        await undoBulkAddon({
          tournamentId,
          actionLogId,
          playerUids,
          playerNames,
          tableId,
          rollBackBy,
        });
        break;

      case 'bust_and_exit':
        if (!playerUid || !playerName || !tableId || seatNumber === undefined) {
          throw new HttpsError('invalid-argument', 'bust_and_exit操作のロールバックに必要なパラメータが不足しています');
        }
        await undoBustAndExit({
          tournamentId,
          actionLogId,
          playerUid,
          playerName,
          tableId,
          seatNumber,
          rollBackBy,
        });
        break;

      case 'bust_and_reentry':
        if (!playerUid || !playerName || !tableId || seatNumber === undefined) {
          throw new HttpsError('invalid-argument', 'bust_and_reentry操作のロールバックに必要なパラメータが不足しています');
        }
        await undoBustAndReentry({
          tournamentId,
          actionLogId,
          playerUid,
          playerName,
          tableId,
          seatNumber,
          rollBackBy,
        });
        break;

      case 'register_participants':
        if (!playerUids || !playerNames) {
          throw new HttpsError('invalid-argument', 'register_participants操作のロールバックに必要なパラメータが不足しています');
        }
        await undoRegisterParticipants({
          tournamentId,
          actionLogId,
          playerUids,
          playerNames,
          rollBackBy,
        });
        break;

      case 'assign_seat_to_player':
        if (!playerUid || !playerName || !tableId || seatNumber === undefined) {
          throw new HttpsError('invalid-argument', 'assign_seat_to_player操作のロールバックに必要なパラメータが不足しています');
        }
        await undoAssignSeatToPlayer({
          tournamentId,
          actionLogId,
          playerUid,
          playerName,
          tableId,
          seatNumber,
          rollBackBy,
        });
        break;

      case 'reseat_all_players':
        if (!previousSeatingData) {
          throw new HttpsError('invalid-argument', 'reseat_all_players操作のロールバックに必要なパラメータが不足しています');
        }
        await undoReseatAllPlayers({
          tournamentId,
          actionLogId,
          previousSeatingData,
          rollBackBy,
        });
        break;

      default:
        throw new HttpsError('invalid-argument', 'サポートされていない操作タイプです');
    }

    return {
      success: true,
      message: '操作のロールバックが完了しました',
      actionLogId,
      action,
    };

  } catch (error) {
    console.error('ロールバック操作エラー:', error);
    
    if (error instanceof z.ZodError) {
      throw new HttpsError('invalid-argument', `入力検証エラー: ${error.errors.map(e => e.message).join(', ')}`);
    }
    
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', '操作のロールバックに失敗しました');
  }
});
