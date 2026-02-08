/**
 * 週次Planner: 週1回（日曜20:00 JST）に起動し、翌週（月〜日）分の「閉店認定」「開店認定」タスクをCloud Tasksに投入
 * 
 * 処理内容:
 * - businessHoursMonthlyMapから翌週（月〜日）分の営業時間を取得（月跨ぎの場合は複数のドキュメントを取得）
 * - 各日の「閉店認定」「開店認定」タスクをCloud Tasksに投入
 *   - 閉店認定: 閉店時間 + TASK_CLOSE_OFFSET_MINUTES（デフォルト: 120分）
 *   - 開店認定: 開店時間 + TASK_OPEN_OFFSET_MINUTES（デフォルト: -30分）
 * - taskId固定で冪等を担保（task.nameをtasksClient.taskPath(...)で固定）
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { CloudTasksClient } from '@google-cloud/tasks';
import { getFirestore } from 'firebase-admin/firestore';
import { getEnv } from '../lib/env';

const tasksClient = new CloudTasksClient();

export const weeklyPlanner = onSchedule(
  {
    schedule: '0 11 * * 0',  // UTC 11:00 = JST 20:00（日曜）
    timeZone: 'UTC',
  },
  async (event) => {
    try {
      // PROJECT_IDを関数内で取得（デフォルト値を使用）
      const PROJECT_ID =
        process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.PROJECT_ID || 'amuse-app-template';

      // ENABLE_AUTO_OPEN_CLOSEの確認（環境変数から取得）
      const enableAutoOpenClose = process.env.ENABLE_AUTO_OPEN_CLOSE === 'true';
      if (!enableAutoOpenClose) {
        logger.info('自動開閉店が無効化されています。スキップします。');
        return;
      }

      // 環境変数から取得
      const closeAssessmentUrl = getEnv('CLOSE_ASSESSMENT_URL');
      const openAssessmentUrl = getEnv('OPEN_ASSESSMENT_URL');
      const tasksQueue = getEnv('WEEKLYPLANNER_TASKS_QUEUE');
      const tasksLocation = getEnv('WEEKLYPLANNER_TASKS_LOCATION');
      const tasksInvokerSa = getEnv('TASKS_INVOKER_SA');
      const taskCloseOffsetMinutes = parseInt(process.env.TASK_CLOSE_OFFSET_MINUTES || '120');
      const taskOpenOffsetMinutes = parseInt(process.env.TASK_OPEN_OFFSET_MINUTES || '-30');

      const db = getFirestore();
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);  // UTC+9
      const nextWeekStart = new Date(jstNow);
      nextWeekStart.setDate(nextWeekStart.getDate() + (1 - nextWeekStart.getDay()));  // 次の月曜日
      nextWeekStart.setHours(0, 0, 0, 0);

      // businessHoursMonthlyMapから翌週（月〜日）分の営業時間を取得
      // 月跨ぎの場合は複数のドキュメントを取得する必要がある
      const monthDocs = new Map<string, any>();  // yearMonth -> businessHoursData のキャッシュ

      const queuePath = tasksClient.queuePath(PROJECT_ID, tasksLocation, tasksQueue);

    // 各日の「閉店認定」「開店認定」タスクをCloud Tasksに投入
    for (let day = 0; day < 7; day++) {
      const targetDate = new Date(nextWeekStart);
      targetDate.setDate(targetDate.getDate() + day);
      const dateKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
      const yearMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;

      // 月ドキュメントを取得（キャッシュがあれば使用）
      let businessHoursData = monthDocs.get(yearMonth);
      if (!businessHoursData) {
        const businessHoursDoc = await db
          .collection('businessHoursMonthlyMap')
          .doc(yearMonth)
          .get();

        if (!businessHoursDoc.exists) {
          throw new Error(`businessHoursMonthlyMap/${yearMonth} が見つかりません`);
        }

        businessHoursData = businessHoursDoc.data();
        monthDocs.set(yearMonth, businessHoursData);
      }

      const days = businessHoursData?.days || {};
      const k1 = String(targetDate.getDate());
      const k2 = String(targetDate.getDate()).padStart(2, '0');
      const dayData = days[k1] ?? days[k2];  // "1" / "01" の揺れに対応
      if (!dayData || dayData.isClosed) {
        continue;  // 休業日の場合はスキップ
      }

      const openMinute = dayData.openMinute;
      const closeMinute = dayData.closeMinute;

      // 開店認定タスクの投入
      // openMinute/closeMinuteは intendedBusinessDateKey（営業日）に紐づく時刻定義
      // intendedBusinessDateKeyは営業日キー（YYYY-MM-DD）であり、openMinute/closeMinuteはその営業日の開店/閉店時刻を分単位で表す
      // openScheduleTimeは intendedBusinessDateKey の営業日の openMinute から計算する（JST基準）
      // JST時刻を計算してからUTCに変換する必要がある（Cloud FunctionsはUTCで実行されるため）
      const openScheduleTime = new Date(targetDate);
      // JST時刻を計算（openMinuteはJST基準の分数）
      const jstOpenHour = Math.floor(openMinute / 60);
      const jstOpenMinute = openMinute % 60;
      const jstOpenTotalMinutes = jstOpenHour * 60 + jstOpenMinute + taskOpenOffsetMinutes;
      // JST時刻をUTCに変換（9時間引く）
      const utcOpenTotalMinutes = jstOpenTotalMinutes - 9 * 60;
      // UTC時刻を設定
      openScheduleTime.setUTCHours(Math.floor(utcOpenTotalMinutes / 60), utcOpenTotalMinutes % 60, 0, 0);

      const openTaskId = `open_assessment_${dateKey}`;
      const openTaskName = tasksClient.taskPath(PROJECT_ID, tasksLocation, tasksQueue, openTaskId);
      const openTaskPayload = {
        action: 'open_assessment',
        intendedBusinessDateKey: dateKey,
        scheduledAt: openScheduleTime.toISOString(),
      };

      try {
        const [openTaskResponse] = await tasksClient.createTask({
          parent: queuePath,
          task: {
            name: openTaskName,
            httpRequest: {
              httpMethod: 'POST',
              url: openAssessmentUrl,
              headers: {
                'Content-Type': 'application/json',
              },
              body: Buffer.from(JSON.stringify(openTaskPayload)).toString('base64'),
              oidcToken: {
                serviceAccountEmail: tasksInvokerSa,
              },
            },
            scheduleTime: {
              seconds: Math.floor(openScheduleTime.getTime() / 1000),  // UTC epoch秒へ変換
            },
          },
        });
        logger.info(`開店認定タスク投入完了: ${dateKey}`, { taskName: openTaskResponse.name });
      } catch (error: any) {
        if (error.code === 6) {  // ALREADY_EXISTS
          logger.info(`開店認定タスク ${dateKey} は既に存在します。スキップします。`);
        } else {
          throw error;
        }
      }

      // 閉店認定タスクの投入
      // closeMinute > 1440 の時は翌日へ繰り越すルールを維持
      // closeScheduleTimeは intendedBusinessDateKey の営業日の closeMinute から計算する（JST基準）
      // closeMinute > 1440 の場合は、intendedBusinessDateKey の翌日の暦日として計算する
      // JST時刻を計算してからUTCに変換する必要がある（Cloud FunctionsはUTCで実行されるため）
      const closeScheduleTime = new Date(targetDate);
      let jstCloseHour: number;
      let jstCloseMinute: number;
      
      if (closeMinute > 1440) {
        // 翌日に伸びる場合
        closeScheduleTime.setUTCDate(closeScheduleTime.getUTCDate() + 1);
        jstCloseHour = Math.floor((closeMinute - 1440) / 60);
        jstCloseMinute = (closeMinute - 1440) % 60;
      } else {
        jstCloseHour = Math.floor(closeMinute / 60);
        jstCloseMinute = closeMinute % 60;
      }
      
      // JST時刻を計算
      const jstCloseTotalMinutes = jstCloseHour * 60 + jstCloseMinute + taskCloseOffsetMinutes;
      // JST時刻をUTCに変換（9時間引く）
      const utcCloseTotalMinutes = jstCloseTotalMinutes - 9 * 60;
      // UTC時刻を設定
      closeScheduleTime.setUTCHours(Math.floor(utcCloseTotalMinutes / 60), utcCloseTotalMinutes % 60, 0, 0);

      const closeTaskId = `close_assessment_${dateKey}`;
      const closeTaskName = tasksClient.taskPath(PROJECT_ID, tasksLocation, tasksQueue, closeTaskId);
      const closeTaskPayload = {
        action: 'close_assessment',
        intendedBusinessDateKey: dateKey,
        scheduledAt: closeScheduleTime.toISOString(),
      };

      try {
        const [closeTaskResponse] = await tasksClient.createTask({
          parent: queuePath,
          task: {
            name: closeTaskName,
            httpRequest: {
              httpMethod: 'POST',
              url: closeAssessmentUrl,
              headers: {
                'Content-Type': 'application/json',
              },
              body: Buffer.from(JSON.stringify(closeTaskPayload)).toString('base64'),
              oidcToken: {
                serviceAccountEmail: tasksInvokerSa,
              },
            },
            scheduleTime: {
              seconds: Math.floor(closeScheduleTime.getTime() / 1000),  // UTC epoch秒へ変換
            },
          },
        });
        logger.info(`閉店認定タスク投入完了: ${dateKey}`, { taskName: closeTaskResponse.name });
      } catch (error: any) {
        if (error.code === 6) {  // ALREADY_EXISTS
          logger.info(`閉店認定タスク ${dateKey} は既に存在します。スキップします。`);
        } else {
          throw error;
        }
      }
    }
    } catch (error) {
      logger.error('weeklyPlannerでエラーが発生しました:', error);
      throw error;
    }
  }
);
