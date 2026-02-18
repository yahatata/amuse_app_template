/**
 * 特定日の営業時間を手動設定（スタイル選択）
 * - businessHoursMonthly/{yearMonth}/days/{DD} を source="manual" で upsert
 * - businessHoursMonthlyMap を更新（該当日のみ差分更新）
 * - shifts に営業時間を同期
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { assertAdminDevice } from "../../../domains/shift/services/helpers";
import { syncBusinessHoursToShifts } from "../services/businessHoursCore";
import { getBusinessHoursByStyleId } from "../services/styles";

const db = admin.firestore();

interface SetBusinessHoursManualForDayRequest {
  dateKey: string; // YYYY-MM-DD
  installationId: string;
  payload: {
    styleId: string;
    openMinute?: number; // オプション: styleIdから取得した値を上書き
    closeMinute?: number; // オプション: styleIdから取得した値を上書き
    isClosed?: boolean; // オプション: styleIdから取得した値を上書き
  };
}

/**
 * 特定日の営業時間を手動設定（スタイル選択）
 * - payload.styleId から営業時間を取得（openMinute/closeMinute/isClosed が指定されていれば上書き）
 * - businessHoursMonthly/{yearMonth}/days/{DD} を source="manual" で upsert
 * - businessHoursMonthlyMap を更新（該当日のフィールドだけ更新）
 * - shifts に営業時間を同期
 */
export const setBusinessHoursManualForDay = onCall(
  async (request): Promise<{ success: boolean; message: string }> => {
    // 認証チェック
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const { dateKey, installationId, payload } = request.data as SetBusinessHoursManualForDayRequest;

    // バリデーション
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new HttpsError("invalid-argument", "dateKey must be in YYYY-MM-DD format");
    }

    if (!installationId) {
      throw new HttpsError("invalid-argument", "installationId is required");
    }

    if (!payload.styleId) {
      throw new HttpsError("invalid-argument", "payload.styleId is required");
    }

    // 管理者デバイス権限確認
    await assertAdminDevice(installationId, request.auth.uid);

    // dateKeyから年月と日を抽出
    const [yearStr, monthStr, dayStr] = dateKey.split("-");
    const day = parseInt(dayStr, 10);
    const yearMonth = `${yearStr}-${monthStr}`;

    // バリデーション
    if (day < 1 || day > 31) {
      throw new HttpsError("invalid-argument", `Invalid day: ${day}. Must be 1-31`);
    }

    // スタイルから営業時間を取得
    const style = getBusinessHoursByStyleId(payload.styleId);

    // payloadで指定された値があれば上書き
    const openMinute = payload.openMinute ?? style.openMinute;
    const closeMinute = payload.closeMinute ?? style.closeMinute;
    const isClosed = payload.isClosed ?? style.isClosed;

    // 60分刻みの検証
    if (openMinute % 60 !== 0 || closeMinute % 60 !== 0) {
      throw new HttpsError("invalid-argument", "openMinute and closeMinute must be multiples of 60");
    }

    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();

    // 1. businessHoursMonthly/{yearMonth}/days/{DD} を該当日のみ更新（merge: true）
    const dayDocRef = db
      .collection("businessHoursMonthly")
      .doc(yearMonth)
      .collection("days")
      .doc(dayStr);
    
    // createdAt保護のため、既存ドキュメントを確認
    const existingDayDoc = await dayDocRef.get();
    const dayData: any = {
      dateKey,
      openMinute,
      closeMinute,
      isClosed,
      styleId: payload.styleId,
      source: "manual",
      updatedAt: now,
    };

    if (!existingDayDoc.exists) {
      dayData.createdAt = now;
    }

    batch.set(dayDocRef, dayData, { merge: true });

    // 2. businessHoursMonthlyMap/{yearMonth} を該当日のみ差分更新（days.{DD}のみmerge）
    const mapDocRef = db.collection("businessHoursMonthlyMap").doc(yearMonth);
    
    // createdAt保護のため、既存ドキュメントを確認
    const existingMapDoc = await mapDocRef.get();
    
    // ネストフィールドの更新（days.{DD}のみ更新）
    const mapUpdate: any = {
      [`days.${dayStr}`]: {
        openMinute,
        closeMinute,
        isClosed,
        styleId: payload.styleId,
        source: "manual",
      },
      updatedAt: now,
    };

    if (!existingMapDoc.exists) {
      mapUpdate.createdAt = now;
    }

    batch.set(mapDocRef, mapUpdate, { merge: true });

    await batch.commit();

    // 3. shifts に営業時間を同期（syncBusinessHoursToShiftsで全月同期されるが、該当日のみbusinessHoursが変更される）
    const syncBatch = await syncBusinessHoursToShifts(db, yearMonth);
    await syncBatch.commit();

    return {
      success: true,
      message: `Business hours set manually for ${dateKey} (styleId: ${payload.styleId})`,
    };
  }
);
