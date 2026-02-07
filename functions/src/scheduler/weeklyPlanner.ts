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
import { CloudTasksClient } from '@google-cloud/tasks';
import { getFirestore } from 'firebase-admin/firestore';
import { getEnv } from '../lib/env';

const tasksClient = new CloudTasksClient();
const PROJECT_ID =
  process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.PROJECT_ID;

if (!PROJECT_ID) throw new Error('PROJECT_ID is not set');

export const weeklyPlanner = onSchedule(
  {
    schedule: '0 11 * * 0',  // UTC 11:00 = JST 20:00（日曜）
    timeZone: 'UTC',
  },
  async (event) => {
    // ENABLE_AUTO_OPEN_CLOSEの確認（環境変数から取得）
    const enableAutoOpenClose = process.env.ENABLE_AUTO_OPEN_CLOSE === 'true';
    if (!enableAutoOpenClose) {
      console.log('自動開閉店が無効化されています。スキップします。');
      return;
    }

    // 環境変数から取得
    const closeAssessmentUrl = getEnv('CLOSE_ASSESSMENT_URL');
    const openAssessmentUrl = getEnv('OPEN_ASSESSMENT_URL');
    const tasksQueue = getEnv('TASKS_QUEUE');
    const tasksLocation = getEnv('TASKS_LOCATION');
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
      const dayKey = String(targetDate.getDate());

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
      const openScheduleTime = new Date(targetDate);
      openScheduleTime.setHours(Math.floor(openMinute / 60), openMinute % 60, 0, 0);
      openScheduleTime.setMinutes(openScheduleTime.getMinutes() + taskOpenOffsetMinutes);

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
        console.log(`開店認定タスク投入完了: ${dateKey}, taskName: ${openTaskResponse.name}`);
      } catch (error: any) {
        if (error.code === 6) {  // ALREADY_EXISTS
          console.log(`開店認定タスク ${dateKey} は既に存在します。スキップします。`);
        } else {
          throw error;
        }
      }

      // 閉店認定タスクの投入
      // closeMinute > 1440 の時は翌日へ繰り越すルールを維持
      // closeScheduleTimeは intendedBusinessDateKey の営業日の closeMinute から計算する（JST基準）
      // closeMinute > 1440 の場合は、intendedBusinessDateKey の翌日の暦日として計算する
      const closeScheduleTime = new Date(targetDate);
      if (closeMinute > 1440) {
        // 翌日に伸びる場合
        closeScheduleTime.setDate(closeScheduleTime.getDate() + 1);
        closeScheduleTime.setHours(Math.floor((closeMinute - 1440) / 60), (closeMinute - 1440) % 60, 0, 0);
      } else {
        closeScheduleTime.setHours(Math.floor(closeMinute / 60), closeMinute % 60, 0, 0);
      }
      closeScheduleTime.setMinutes(closeScheduleTime.getMinutes() + taskCloseOffsetMinutes);

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
        console.log(`閉店認定タスク投入完了: ${dateKey}, taskName: ${closeTaskResponse.name}`);
      } catch (error: any) {
        if (error.code === 6) {  // ALREADY_EXISTS
          console.log(`閉店認定タスク ${dateKey} は既に存在します。スキップします。`);
        } else {
          throw error;
        }
      }
    }
  }
);
