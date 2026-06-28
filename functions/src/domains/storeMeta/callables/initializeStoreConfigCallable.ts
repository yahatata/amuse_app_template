/**
 * storeMeta/config、storeMeta/businessStyles、storeMeta/schedulerConfig 初期セットアップ Callable
 *
 * - storeMeta/config: 未存在時は buildFromDefaults() をそのまま作成。既存時は defaults のフィールドのうち
 *   存在しないもののみデフォルトで追加（既存値は上書きしない）。
 *   ※ businessHoursStyles は storeMeta/businessStyles が正本のため config には含めない。
 * - storeMeta/businessStyles: 未存在時のみ DEFAULT_BUSINESS_STYLES_V2 で作成。
 * - storeMeta/schedulerConfig / payrollConfig: 従来どおり。
 * 認可: admin デバイスのみ。
 *
 * 参照: docs/config_migration/phase1/PHASE1_UPDATE_PATH_DESIGN.md
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  buildConfigForInitialization,
  mergeConfigForUpsert,
} from '../../../shared/config/configLoader';
import {
  buildSchedulerConfigFromDefaults,
  mergeSchedulerConfigForUpsert,
} from '../../../shared/config/schedulerConfigLoader';
import { buildPayrollConfigFromDefaults, mergePayrollConfigForUpsert } from '../../../shared/config/payrollConfigLoader';
import { buildDefaultBusinessStyles } from '../../../shared/config/businessStyles';
import { getCallerDeviceByUid, isActive } from '../../../shared/devices';
import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';

const db = getFirestore();

export const initializeStoreConfigCallable = onCall(
  {
    region: 'asia-northeast1',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }

    const callerUid = request.auth.uid;
    const device = await getCallerDeviceByUid(callerUid);

    if (!device || !isActive(device.status)) {
      throw new HttpsError('permission-denied', 'デバイスが見つからないか、アクティブではありません');
    }

    if (device.role !== 'admin') {
      throw new HttpsError('permission-denied', '管理者権限が必要です');
    }

    const logContext: Record<string, unknown> = { callerUid, deviceId: device.id };

    try {
      const configRef = db.collection('storeMeta').doc('config');
      const businessStylesRef = db.collection('storeMeta').doc('businessStyles');
      const schedulerConfigRef = db.collection('storeMeta').doc('schedulerConfig');
      const payrollConfigRef = db.collection('storeMeta').doc('payrollConfig');

      const [configDoc, businessStylesDoc, schedulerConfigDoc, payrollConfigDoc] =
        await Promise.all([
          configRef.get(),
          businessStylesRef.get(),
          schedulerConfigRef.get(),
          payrollConfigRef.get(),
        ]);

      const created: string[] = [];
      const updated: string[] = [];

      const initializationDefaults = buildConfigForInitialization();

      if (!configDoc.exists) {
        const config = initializationDefaults;
        await configRef.set({
          ...config,
          updatedAt: FieldValue.serverTimestamp(),
        });
        created.push('storeMeta/config');
      } else {
        const merged = mergeConfigForUpsert(
          configDoc.data() as Record<string, unknown>,
          initializationDefaults
        );
        await configRef.set(
          { ...merged, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
        updated.push('storeMeta/config');
      }

      if (!businessStylesDoc.exists) {
        const businessStyles = buildDefaultBusinessStyles();
        await businessStylesRef.set({
          version: businessStyles.version,
          styles: businessStyles.styles,
          updatedAt: FieldValue.serverTimestamp(),
        });
        created.push('storeMeta/businessStyles');
      }

      if (!schedulerConfigDoc.exists) {
        const schedulerConfig = buildSchedulerConfigFromDefaults();
        await schedulerConfigRef.set({
          ...schedulerConfig,
          updatedAt: FieldValue.serverTimestamp(),
        });
        created.push('storeMeta/schedulerConfig');
      } else {
        const merged = mergeSchedulerConfigForUpsert(
          schedulerConfigDoc.data() as Record<string, unknown>
        );
        await schedulerConfigRef.set(
          { ...merged, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
        updated.push('storeMeta/schedulerConfig');
      }

      if (!payrollConfigDoc.exists) {
        const payrollConfig = buildPayrollConfigFromDefaults();
        await payrollConfigRef.set({
          ...payrollConfig,
          updatedAt: FieldValue.serverTimestamp(),
        });
        created.push('storeMeta/payrollConfig');
      } else {
        const payrollDefaults = buildPayrollConfigFromDefaults();
        const mergedPayroll = mergePayrollConfigForUpsert(
          payrollConfigDoc.data() as Record<string, unknown>,
          payrollDefaults
        );
        await payrollConfigRef.set(
          { ...mergedPayroll, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
        updated.push('storeMeta/payrollConfig');
      }

      const parts: string[] = [];
      if (created.length > 0) parts.push(`${created.join(' と ')} を作成しました`);
      if (updated.length > 0) parts.push(`${updated.join(' と ')} の不足フィールドを補完しました`);
      const message =
        parts.length > 0
          ? parts.join('。')
          : 'storeMeta/config、storeMeta/businessStyles、storeMeta/schedulerConfig、storeMeta/payrollConfig は既に存在し、不足フィールドもありません';

      logOpsSuccess({
        message: 'initializeStoreConfigCallable 成功',
        functionEntry: 'initializeStoreConfigCallable',
        operation: 'initStoreMetaConfig',
        context: {
          createdCount: created.length,
          updatedCount: updated.length,
        },
      });

      return {
        success: true,
        message,
        created,
        updated: updated.length > 0 ? updated : undefined,
      };
    } catch (error) {
      logOpsError({
        message: 'initializeStoreConfigCallable failed',
        functionEntry: 'initializeStoreConfigCallable',
        operation: 'initStoreMetaConfig',
        cause: error,
        sourceProductHint: 'firestore',
        context: logContext,
      });
      throw new HttpsError(
        'internal',
        `storeMeta の初期化に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
);
