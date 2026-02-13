/**
 * Phase6 Step8: 営業継続 Callable。
 * 強警告表示時に「営業継続」を選択した場合、manualOverride（close_skip）の設定・
 * closeAssessment の needs_manual_close_suppressed への更新・指定時間後の closeAssessmentTask の enqueue を 1 操作で実行する。
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { CloudTasksClient } from '@google-cloud/tasks';
import { requireAdmin } from '../close_process/requireAdmin';
import { getEnv } from '../lib/env';

const PROJECT_ID =
  process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.PROJECT_ID || 'amuse-app-template';

export const continueBusinessTerminal = onCall(
  { region: 'us-central1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }

    const adminId = request.auth.uid;
    const db = getFirestore();
    await requireAdmin(db, adminId);

    const data = request.data as { intendedBusinessDateKey?: string; hours?: number } | undefined;
    const intendedBusinessDateKey =
      data?.intendedBusinessDateKey != null && typeof data.intendedBusinessDateKey === 'string'
        ? data.intendedBusinessDateKey.trim()
        : null;
    const hours = data?.hours != null && typeof data.hours === 'number' ? data.hours : null;

    if (intendedBusinessDateKey == null || intendedBusinessDateKey === '') {
      throw new HttpsError('invalid-argument', 'intendedBusinessDateKey は必須です。');
    }
    const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateKeyPattern.test(intendedBusinessDateKey)) {
      throw new HttpsError('invalid-argument', 'intendedBusinessDateKey は YYYY-MM-DD 形式である必要があります。');
    }
    if (hours == null || !Number.isInteger(hours) || hours < 1 || hours > 8) {
      throw new HttpsError('invalid-argument', 'hours は 1 以上 8 以下の整数である必要があります。');
    }

    const stateRef = db.collection('storeMeta').doc('currentBusinessDay');
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists) {
      throw new HttpsError('failed-precondition', 'storeMeta/currentBusinessDay が存在しません。');
    }

    const stateData = stateSnap.data()!;
    const status = stateData.status as string | undefined;
    if (status !== 'running') {
      throw new HttpsError(
        'failed-precondition',
        `営業継続は status が running のときのみ実行できます。現在: ${status}`
      );
    }

    const now = new Date();
    const scheduleAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const scheduledAtIso = scheduleAt.toISOString();
    const idempotencyKey = `close_assessment_${intendedBusinessDateKey}_${scheduledAtIso}`;

    const closeAssessmentUrl = getEnv('CLOSE_ASSESSMENT_URL');
    const tasksQueue = getEnv('WEEKLYPLANNER_TASKS_QUEUE');
    const tasksLocation = getEnv('WEEKLYPLANNER_TASKS_LOCATION');
    const tasksInvokerSa = getEnv('TASKS_INVOKER_SA');

    await db.runTransaction(async (transaction) => {
      const stateDoc = await transaction.get(stateRef);
      if (!stateDoc.exists) {
        throw new HttpsError('failed-precondition', 'storeMeta/currentBusinessDay が存在しません。');
      }

      const blockers: string[] = [];
      const activeStaysSnapshot = await db
        .collection('activeStays')
        .where('isActive', '==', true)
        .limit(1)
        .get();
      if (!activeStaysSnapshot.empty) {
        blockers.push('activeStaysNotEmpty');
      }

      const overrideUntil = Timestamp.fromMillis(scheduleAt.getTime());

      transaction.update(stateRef, {
        manualOverride: {
          type: 'close_skip',
          intendedBusinessDateKey,
          overrideUntil,
        },
        closeAssessment: {
          idempotencyKey,
          intendedBusinessDateKey,
          decidedAt: Timestamp.now(),
          result: 'needs_manual_close_suppressed',
          blockers,
          source: 'terminal',
          scheduledAt: scheduledAtIso,
          lastSuppressedAt: Timestamp.now(),
          suppressedByOverride: true,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    const tasksClient = new CloudTasksClient();
    const queuePath = tasksClient.queuePath(PROJECT_ID, tasksLocation, tasksQueue);
    const scheduleTimeEpochSeconds = Math.floor(scheduleAt.getTime() / 1000);
    const taskId = `close_assessment_reminder_${intendedBusinessDateKey}_${scheduleTimeEpochSeconds}`;
    const taskName = tasksClient.taskPath(PROJECT_ID, tasksLocation, tasksQueue, taskId);
    const taskPayload = {
      action: 'close_assessment',
      intendedBusinessDateKey,
      scheduledAt: scheduledAtIso,
    };

    try {
      await tasksClient.createTask({
        parent: queuePath,
        task: {
          name: taskName,
          httpRequest: {
            httpMethod: 'POST',
            url: closeAssessmentUrl,
            headers: {
              'Content-Type': 'application/json',
            },
            body: Buffer.from(JSON.stringify(taskPayload)).toString('base64'),
            oidcToken: {
              serviceAccountEmail: tasksInvokerSa,
            },
          },
          scheduleTime: {
            seconds: scheduleTimeEpochSeconds,
          },
        },
      });
    } catch (error: unknown) {
      const err = error as { code?: number };
      if (err?.code === 6) {
        // ALREADY_EXISTS: 同一タスクが既に存在する場合は成功扱い
      } else {
        throw new HttpsError(
          'internal',
          `営業継続のリマインド予約に失敗しました。${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return {
      success: true,
      intendedBusinessDateKey,
      hours,
      scheduledAt: scheduledAtIso,
      message: `${hours} 時間後に閉店確認のリマインドを予約しました。`,
    };
  }
);
