import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { isInsufficientDaysNotificationSent } from "../../shift/services/helpers";
import { logOpsError } from "../../../shared/logging/logOpsError";

interface GetShiftsResponse {
  success: boolean;
  shifts?: any[];
  error?: string;
}

/**
 * シフト一覧取得関数
 * 
 * リクエスト:
 * - なし（認証済みユーザーのシフトを取得）
 * 
 * レスポンス:
 * - success: 成功フラグ
 * - shifts: シフト一覧
 * - error: エラーメッセージ
 */
export const getShifts = onCall(
  async (request): Promise<GetShiftsResponse> => {
    let uid: string;
    
    try {
      // 認証チェック（一時的に無効化）
      // if (!request.auth) {
      //   throw new Error("Authentication required.");
      // }

      // const uid = request.auth.uid;
      
      // request.dataがnullの場合の処理
      if (!request.data) {
        throw new Error("リクエストデータが空です。request.data: " + JSON.stringify(request.data));
      }
      
      const { userId } = request.data as { userId?: string };
      
      if (!userId) {
        throw new Error("ユーザーIDが必要です。受信データ: " + JSON.stringify(request.data));
      }
      
      uid = userId;
      
      // デバッグ: Firestore接続テスト
      const testDoc = await admin.firestore().collection("shifts").limit(1).get();
      console.log("Firestore接続テスト成功。ドキュメント数:", testDoc.size);
      
    } catch (error) {
      logOpsError({
      message: '初期化エラー:',
      failureType: 'business',
      functionEntry: 'getShifts',
      cause: error,
    });
      if (error instanceof Error) {
        throw new Error("初期化に失敗しました: " + error.message);
      } else {
        throw new Error("初期化に失敗しました。");
      }
    }
    


    try {
      // スタッフ情報の確認
      const staffDoc = await admin.firestore()
        .collection("staffs")
        .doc(uid)
        .get();

      if (!staffDoc.exists) {
        throw new Error("スタッフ情報が見つかりません。");
      }

      const db = admin.firestore();
      const shifts: any[] = [];

      // 現在の月から2ヶ月先まで取得（今月と来月）
      const now = new Date();
      const months: string[] = [];
      
      for (let i = 0; i < 3; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        months.push(yearMonth);
      }

      // 1. shifts/{yearMonth}/days/{dateKey}.assignmentsから確定シフトを取得
      console.log(`[getShifts] 対象月: ${months.join(', ')}`);
      console.log(`[getShifts] 検索対象のuid: ${uid}`);
      for (const yearMonth of months) {
        const shiftsDocRef = db.collection("shifts").doc(yearMonth);
        const daysSnapshot = await shiftsDocRef.collection("days").get();
        
        console.log(`[getShifts] ${yearMonth}: ${daysSnapshot.size}日のデータを取得`);
        
        // デバッグ: ドキュメントが存在するか確認
        if (daysSnapshot.size === 0) {
          console.log(`[getShifts] 警告: ${yearMonth}のdaysサブコレクションにドキュメントが存在しません`);
        }

        for (const dayDoc of daysSnapshot.docs) {
          const dayData = dayDoc.data();
          const assignments = dayData.assignments || [];
          const dateKey = dayDoc.id;
          
          console.log(`[getShifts] ${dateKey}: assignments数=${assignments.length}`);
          
          // 店休日チェック
          const businessHours = dayData.businessHours as { isClosed?: boolean } | undefined;
          const isClosed = businessHours?.isClosed === true;
          
          if (isClosed) {
            console.log(`[getShifts] 店休日のためスキップ: ${dateKey}`);
            continue; // 店休日の場合はその日のシフトをすべてスキップ
          }
          
          // このスタッフの割当を検索（型の違いを吸収するため文字列で比較）
          for (const assignment of assignments) {
            const staffIdStr = assignment.staffId != null ? String(assignment.staffId) : "";
            const uidStr = String(uid);
            const matches = staffIdStr === uidStr;
            console.log(`[getShifts] ${dateKey}: assignment.staffId="${staffIdStr}", uid="${uidStr}", 一致=${matches}`);
            if (matches) {
              // 分を時刻文字列に変換（例: 540 -> "09:00"）
              const startHour = Math.floor(assignment.startMinute / 60);
              const startMin = assignment.startMinute % 60;
              const endHour = Math.floor(assignment.endMinute / 60);
              const endMin = assignment.endMinute % 60;
              
              const dateKey = dayDoc.id; // YYYY-MM-DD形式
              
              console.log(`[getShifts] assignmentsから取得: ${dateKey}, ${assignment.staffId}, ${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}-${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}, sourceRequestId: ${assignment.sourceRequestId || 'N/A'}`);
              
              // assignmentsに含まれている = 中間確定または最終確定
              shifts.push({
                id: `${dateKey}_${assignment.sourceRequestId || 'assignment'}`,
                date: dateKey,
                start: `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`,
                end: `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`,
                confirmed: true, // assignmentsに含まれている = 確定済み
                staffId: assignment.staffId,
                staffName: assignment.staffName,
              });
            }
          }
        }
      }
      
      console.log(`[getShifts] assignmentsから取得したシフト数: ${shifts.length}`);

      // 2. shiftRequestsから申請中のシフトのみを取得
      // 注意: 中間確定・最終確定されたシフトは shifts/{yearMonth}/days/{dateKey}.assignments から取得されるため、
      // shiftRequestsからは status: "pending" のみを取得する
      // ただし、期間②で募集内容送信後、または期間③以降は申請中シフトを非表示にする
      const requestsSnapshot = await db
        .collection("shiftRequests")
        .where("staffId", "==", uid)
        .where("status", "==", "pending")
        .get();
      
      console.log(`[getShifts] shiftRequestsから取得: ${requestsSnapshot.size}件 (status: pending のみ)`);

      for (const requestDoc of requestsSnapshot.docs) {
        const requestData = requestDoc.data();
        const dateKey = requestData.dateKey;
        const yearMonth = dateKey.substring(0, 7); // YYYY-MM-DDからYYYY-MMを抽出
        
        // 店休日チェック: その日のshifts/{yearMonth}/days/{dateKey}を取得してisClosedを確認
        const dayDocRef = db.collection("shifts").doc(yearMonth).collection("days").doc(dateKey);
        const dayDoc = await dayDocRef.get();
        
        if (dayDoc.exists) {
          const dayData = dayDoc.data()!;
          const businessHours = dayData.businessHours as { isClosed?: boolean } | undefined;
          const isClosed = businessHours?.isClosed === true;
          
          if (isClosed) {
            console.log(`[getShifts] 店休日のためスキップ（申請中）: ${dateKey}, requestId: ${requestDoc.id}`);
            continue; // 店休日の場合は申請中シフトもスキップ
          }
        }
        
        // 期間②で募集内容送信済みの場合は申請中シフトを非表示
        const notificationSent = await isInsufficientDaysNotificationSent(yearMonth);
        if (notificationSent) {
          console.log(`[getShifts] 募集内容送信済みのため申請中シフトを非表示: ${dateKey}, requestId: ${requestDoc.id}`);
          continue;
        }
        
        // 月全体が最終確定されている場合は申請中シフトを非表示
        const monthDocRef = db.collection("shifts").doc(yearMonth);
        const monthDoc = await monthDocRef.get();
        if (monthDoc.exists) {
          const monthData = monthDoc.data();
          if (monthData?.allDaysFinalized === true) {
            console.log(`[getShifts] 月全体が最終確定済みのため申請中シフトを非表示: ${dateKey}, requestId: ${requestDoc.id}`);
            continue;
          }
        }
        
        // 分を時刻文字列に変換
        const startMinute = requestData.startMinute || requestData.start;
        const endMinute = requestData.endMinute || requestData.end;
        
        let startTime = "";
        let endTime = "";
        
        if (typeof startMinute === "number") {
          const startHour = Math.floor(startMinute / 60);
          const startMin = startMinute % 60;
          startTime = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;
        } else if (typeof startMinute === "string") {
          startTime = startMinute;
        }
        
        if (typeof endMinute === "number") {
          const endHour = Math.floor(endMinute / 60);
          const endMin = endMinute % 60;
          endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
        } else if (typeof endMinute === "string") {
          endTime = endMinute;
        }
        
        console.log(`[getShifts] shiftRequestsから取得: ${dateKey}, status: ${requestData.status}, ${startTime}-${endTime}, requestId: ${requestDoc.id}`);
        
        // assignmentsから既に取得済みの場合はスキップ（確定シフトが優先）
        const alreadyExists = shifts.some(
          s => s.date === dateKey && s.start === startTime && s.end === endTime
        );
        
        if (alreadyExists) {
          console.log(`[getShifts] スキップ: ${dateKey} ${startTime}-${endTime} は既にassignmentsから取得済み`);
        } else {
            shifts.push({
              id: requestDoc.id,
              date: dateKey,
              start: startTime,
              end: endTime,
              confirmed: null, // shiftRequestsから取得されるのは申請中（pending）のみ
              staffId: requestData.staffId,
              staffName: requestData.staffName,
            });
        }
      }
      
      console.log(`[getShifts] 最終的なシフト数: ${shifts.length}`);

      // 日付順にソート（降順：最新が先頭）
      shifts.sort((a: any, b: any) => {
        if (a.date < b.date) return 1;
        if (a.date > b.date) return -1;
        return 0;
      });

      return {
        success: true,
        shifts: shifts
      };

    } catch (error) {
      // エラーの詳細情報をログ出力（Firebase Consoleで確認可能）
      logOpsError({
      message: 'シフト取得エラー:',
      failureType: 'business',
      functionEntry: 'getShifts',
      cause: error,
    });
      
      if (error instanceof Error) {
        // エラーの詳細情報を含めて返す
        const errorMessage = `シフト一覧の取得に失敗しました: ${error.message}`;
        logOpsError({
      message: '詳細エラーメッセージ:',
      failureType: 'business',
      functionEntry: 'getShifts',
      cause: errorMessage,
    });
        throw new Error(errorMessage);
      } else {
        const errorMessage = "シフト一覧の取得に失敗しました。";
        logOpsError({
      message: '不明なエラー:',
      failureType: 'business',
      functionEntry: 'getShifts',
      cause: error,
    });
        throw new Error(errorMessage);
      }
    }
  }
);
