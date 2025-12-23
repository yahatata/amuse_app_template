import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { sendLinePushMessage, formatDateToJapanese, getEndOfMonthDeadline } from "../utils/lineMessaging";

interface ShiftDecision {
  shiftId: string;
  decision: 'approve' | 'reject';
}

interface ProcessShiftsByStaffRequest {
  shifts: ShiftDecision[];
}

interface ProcessShiftsByStaffResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * スタッフの複数シフトを一括処理する関数（管理者用）
 * 
 * リクエスト:
 * - shifts: [{ shiftId: string, decision: 'approve' | 'reject' }]
 * 
 * レスポンス:
 * - success: 成功フラグ
 * - message: 成功メッセージ
 * - error: エラーメッセージ
 */
export const processShiftsByStaff = onCall(
  async (request): Promise<ProcessShiftsByStaffResponse> => {
    // 認証チェック（一時的に無効化）
    // if (!request.auth) {
    //   throw new Error("Authentication required.");
    // }

    const { shifts } = request.data as ProcessShiftsByStaffRequest;

    if (!shifts || !Array.isArray(shifts) || shifts.length === 0) {
      throw new Error("シフト情報が必要です。");
    }

    try {
      // 管理者権限の確認（簡易版 - 後で適切な管理者チェックに変更）
      // TODO: 管理者権限の適切な確認を実装

      const db = admin.firestore();

      // シフト情報を取得してスタッフごとにグループ化
      const shiftDocs = await Promise.all(
        shifts.map((s) => db.collection("shifts").doc(s.shiftId).get())
      );

      // 存在しないシフトをチェック
      const notFoundShifts = shifts.filter((s, index) => !shiftDocs[index].exists);
      if (notFoundShifts.length > 0) {
        throw new Error(`以下のシフトが見つかりません: ${notFoundShifts.map(s => s.shiftId).join(", ")}`);
      }

      // 既に処理済みのシフトをチェック
      const processedShifts: string[] = [];
      shiftDocs.forEach((doc, index) => {
        const data = doc.data();
        if (data?.confirmed !== null) {
          processedShifts.push(shifts[index].shiftId);
        }
      });
      if (processedShifts.length > 0) {
        throw new Error(`以下のシフトは既に処理済みです: ${processedShifts.join(", ")}`);
      }

      // スタッフごとにグループ化
      const shiftsByStaff: Map<string, { userId: string; staffName: string; shifts: Array<{ shiftId: string; shiftData: any; decision: 'approve' | 'reject' }> }> = new Map();

      for (let i = 0; i < shifts.length; i++) {
        const shiftDecision = shifts[i];
        const shiftDoc = shiftDocs[i];
        const shiftData = shiftDoc.data()!;
        const userId = shiftData.userId;
        const staffName = shiftData.staffsFullName || "不明";

        if (!shiftsByStaff.has(userId)) {
          shiftsByStaff.set(userId, {
            userId,
            staffName,
            shifts: []
          });
        }

        shiftsByStaff.get(userId)!.shifts.push({
          shiftId: shiftDecision.shiftId,
          shiftData,
          decision: shiftDecision.decision
        });
      }

      // 各スタッフのシフトを一括更新
      const batch = db.batch();
      const notificationPromises: Promise<boolean>[] = [];

      for (const [userId, staffData] of shiftsByStaff.entries()) {
        const approvedShifts: Array<{ date: string; start: string; end: string }> = [];
        const rejectedShifts: Array<{ date: string; start: string; end: string }> = [];

        for (const shiftInfo of staffData.shifts) {
          const shiftRef = db.collection("shifts").doc(shiftInfo.shiftId);
          const isApproved = shiftInfo.decision === 'approve';

          if (isApproved) {
            batch.update(shiftRef, {
              confirmed: true,
              approvedBy: 'admin',
              approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            approvedShifts.push({
              date: shiftInfo.shiftData.date,
              start: shiftInfo.shiftData.start,
              end: shiftInfo.shiftData.end
            });
          } else {
            batch.update(shiftRef, {
              confirmed: false,
              rejectedBy: 'admin',
              rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            rejectedShifts.push({
              date: shiftInfo.shiftData.date,
              start: shiftInfo.shiftData.start,
              end: shiftInfo.shiftData.end
            });
          }
        }

        // 通知メッセージを作成
        if (approvedShifts.length === 0 && rejectedShifts.length === 0) {
          continue; // 処理するシフトがない場合はスキップ
        }

        const messageParts: string[] = [];
        
        // 承認セクション
        if (approvedShifts.length > 0) {
          messageParts.push("（承認）");
          for (const shift of approvedShifts) {
            const formattedDate = formatDateToJapanese(shift.date);
            messageParts.push(`・${formattedDate}　${shift.start}~${shift.end}`);
          }
        }

        // 却下セクション
        if (rejectedShifts.length > 0) {
          messageParts.push("（却下）");
          for (const shift of rejectedShifts) {
            const formattedDate = formatDateToJapanese(shift.date);
            messageParts.push(`・${formattedDate}　${shift.start}~${shift.end}`);
          }
        }

        // 最後のメッセージを追加
        const footerMessages: string[] = [];
        
        if (approvedShifts.length > 0) {
          footerMessages.push("ミニアプリの確定シフトページから確認可能です。");
        }
        
        if (rejectedShifts.length > 0) {
          const deadline = getEndOfMonthDeadline();
          footerMessages.push(`追加のシフト申請がある場合は、${deadline}までに申請を済ませてください。`);
        }

        if (footerMessages.length > 0) {
          messageParts.push(...footerMessages);
        }

        // メッセージを1つにまとめて送信
        const fullMessage = messageParts.join("\n");
        notificationPromises.push(sendLinePushMessage(userId, fullMessage));
      }

      // バッチ処理を実行
      await batch.commit();

      // 通知送信（非同期、エラー時も処理は続行）
      Promise.all(notificationPromises).catch((error) => {
        console.error("通知送信エラー（処理は完了）:", error);
      });

      const totalProcessed = shifts.length;
      const staffCount = shiftsByStaff.size;

      return {
        success: true,
        message: `${totalProcessed}件のシフトを${staffCount}名のスタッフに処理しました。`
      };

    } catch (error) {
      console.error("シフト一括処理エラー:", error);

      if (error instanceof Error) {
        throw new Error(`シフトの処理に失敗しました: ${error.message}`);
      } else {
        throw new Error("シフトの処理に失敗しました。");
      }
    }
  }
);

