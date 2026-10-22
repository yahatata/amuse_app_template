/**
 * storeMeta/businessStyles の Firestore 読み取り（Phase 2 正本）
 *
 * 旧 config.businessHoursStyles / requiredStaffByTimeSlot への fallback は行わない。
 */

import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { validateBusinessStyles } from './businessStyles';
import type {
  BusinessHoursStyle,
  BusinessStylesConfigV2,
  RequiredStaffByTimeSlotV2,
} from './types';
import { REQUIRED_STAFF_STYLE_IDS } from './types';
import { logOpsError, logOpsSuccess } from '../logging/logOpsError';

const db = admin.firestore();
const MAX_RETRIES = 2;

const CONFIG_DOC = 'storeMeta/businessStyles';

/**
 * storeMeta/businessStyles を読み取り、v2 として返す。未存在・不正時は null。
 */
export async function getBusinessStyles(
  firestore?: Firestore
): Promise<BusinessStylesConfigV2 | null> {
  const firestoreInstance = firestore ?? db;
  const docRef = firestoreInstance.collection('storeMeta').doc('businessStyles');

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const doc = await docRef.get();
      if (!doc.exists) {
        return null;
      }

      const validated = validateBusinessStyles(doc.data());
      logOpsSuccess({
        message: `${CONFIG_DOC} 読み取り成功`,
        functionEntry: 'getBusinessStyles',
        operation: 'config_read',
        context: { configDoc: CONFIG_DOC },
      });
      return validated;
    } catch (err) {
      lastError = err;
      if (err instanceof HttpsError) {
        logOpsError({
          message: `${CONFIG_DOC} の形式が不正`,
          functionEntry: 'getBusinessStyles',
          operation: 'config_read',
          cause: err,
          context: { configDoc: CONFIG_DOC },
        });
        return null;
      }
      if (attempt < MAX_RETRIES) continue;
      logOpsError({
        message: `${CONFIG_DOC} の読み取りに失敗`,
        functionEntry: 'getBusinessStyles',
        operation: 'config_read',
        cause: lastError,
        context: { configDoc: CONFIG_DOC },
      });
      return null;
    }
  }

  return null;
}

/**
 * storeMeta/businessStyles を読み取る。未存在・不正時は failed-precondition。
 */
export async function getBusinessStylesOrThrow(
  firestore?: Firestore
): Promise<BusinessStylesConfigV2> {
  const config = await getBusinessStyles(firestore);
  if (!config) {
    throw new HttpsError(
      'failed-precondition',
      `${CONFIG_DOC} が未設定または不正です。管理者画面から storeMeta 初期セットアップを実行してください。`
    );
  }
  return config;
}

export function businessStylesToBusinessHoursStyles(
  config: BusinessStylesConfigV2
): Record<string, BusinessHoursStyle> {
  const result: Record<string, BusinessHoursStyle> = {};
  for (const styleId of REQUIRED_STAFF_STYLE_IDS) {
    const style = config.styles[styleId];
    result[styleId] = {
      styleId: style.styleId,
      openMinute: style.openMinute,
      closeMinute: style.closeMinute,
      isClosed: style.isClosed,
    };
  }
  return result;
}

export function businessStylesToRequiredStaffV2(
  config: BusinessStylesConfigV2
): RequiredStaffByTimeSlotV2 {
  const byStyle: Record<string, BusinessStylesConfigV2['styles'][keyof BusinessStylesConfigV2['styles']]['requiredStaffByTimeSlot']> =
    {};
  for (const styleId of REQUIRED_STAFF_STYLE_IDS) {
    byStyle[styleId] = config.styles[styleId].requiredStaffByTimeSlot;
  }
  return { version: 2, byStyle };
}
