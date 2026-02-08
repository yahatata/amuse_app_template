# Phase5: 自動開閉店（補助機能） - 認定処理 実装詳細仕様書

## 概要

Phase5では、自動開閉店の補助機能として、週次Plannerによる閉店認定・開店認定タスクの投入と、認定処理のHTTP Functionsを実装する。破壊的操作は一切行わず、認定結果のみをstate docに記録する。

**重要**: 詳細仕様は[自動開閉店（補助）機能 仕様書](../automatic_store_assessment_spec.md)を参照してください。

## 実装タスク

### 0. Phase5の対象範囲

**Phase5の対象**:
- **週次Planner**（Cloud Scheduler）
  - `functions/src/scheduler/weeklyPlanner.ts`（新規作成）
  - 週1回（日曜20:00 JST）に起動
  - 翌週（月〜日）分の「閉店認定」「開店認定」タスクをCloud Tasksに投入
- **閉店認定処理**（HTTP Functions）
  - `functions/src/tasks/closeAssessmentTask.ts`（新規作成）
  - 閉店時間超過の確認、ブロッカーの検出、認定結果のstate docへの記録
- **開店認定処理**（HTTP Functions）
  - `functions/src/tasks/openAssessmentTask.ts`（新規作成）
  - 前回の閉店処理が正常に完了しているか確認（storeMetaのみで判定）、認定結果のstate docへの記録
- **State Docの初期化更新**
  - `functions/src/storeManagement/createInitialStateDocCallable.ts`（既存、更新）
  - 新規フィールド（`closeAssessment`, `openAssessment`, `manualOverride`）の初期化

**Phase5の対象外**（Phase6で対応、4ステップに分割）:
- **Phase6 Step1**: UIでstoreMetaをsnapshot購読する仕様の実装（複数ページ、共通実装、AppBar内に日付表示）
- **Phase6 Step2 (Phase7)**: 閉店処理の具体処理の作成（未会計billsの処理、ユーザー判断を挟む場所の検討、UI表示）
- **Phase6 Step3 (Phase8)**: 閉店処理の一括操作の実装（日付ボタンからの開閉店操作、ターミナル関数経由、エラーハンドリング）
- **Phase6 Step4 (Phase9)**: storeMeta監視ページでの自動開閉店時の挙動・表示の実装（UI強警告、各状態に応じた挙動・表示）

詳細は各ステップの実装計画を参照：
- [Phase6 Step1 実装計画](../phase6/step1/implementation_plan.md)
- [Phase6 Step2 実装計画](../phase6/step2/implementation_plan.md)
- [Phase6 Step3 実装計画](../phase6/step3/implementation_plan.md)
- [Phase6 Step4 実装計画](../phase6/step4/implementation_plan.md)

---

## 1. グローバル定数の追加

### 1.1 `lib/globalConstant.dart`の更新

**追加する定数**:
```dart
// 自動開閉店（補助機能）の有効/無効
static const bool ENABLE_AUTO_OPEN_CLOSE = true;  // デフォルト: true

// 閉店認定タスクの実行時刻オフセット（閉店時間からのバッファ、分単位）
static const int TASK_CLOSE_OFFSET_MINUTES = 120;  // デフォルト: 120分（2時間）

// 開店認定タスクの実行時刻オフセット（開店時間からのバッファ、分単位）
static const int TASK_OPEN_OFFSET_MINUTES = -30;  // デフォルト: -30分（開店時間の30分前）

// 週次Plannerのcron式（Cloud Scheduler用）
static const String WEEKLY_PLANNER_CRON = '0 20 * * 0';  // 日曜20:00 JST（UTC+9のため、UTCでは11:00）
```

**注意事項**:
- `TASK_CLOSE_OFFSET_MINUTES`のデフォルトは120分（2時間）として仕様に固定
- `TASK_OPEN_OFFSET_MINUTES`のデフォルトは-30分（開店時間の30分前）として仕様に固定
- `WEEKLY_PLANNER_CRON`はJST基準で記載（実装時はUTCに変換する必要がある）

---

## 2. 週次Plannerの実装

### 2.1 `functions/src/scheduler/weeklyPlanner.ts`（新規作成）

#### 2.1.1 実装内容

**ファイル**: `functions/src/scheduler/weeklyPlanner.ts`（新規作成）

**処理フロー**:
1. `ENABLE_AUTO_OPEN_CLOSE`を確認（`false`の場合はno-op）
2. `businessHoursMonthlyMap`から翌週（月〜日）分の営業時間を取得（月跨ぎの場合は複数のドキュメントを取得）
3. 各日の「閉店認定」「開店認定」タスクをCloud Tasksに投入
   - 閉店認定: 閉店時間 + `TASK_CLOSE_OFFSET_MINUTES`（デフォルト: 120分）
   - 開店認定: 開店時間 + `TASK_OPEN_OFFSET_MINUTES`（デフォルト: -30分）
4. **taskId固定で冪等を担保**: `task.name`を`tasksClient.taskPath(...)`で固定し、`createTask`で`AlreadyExists`（`error.code === 6`）は成功扱いにして冪等化する
5. 作成時冪等: `task.name`を固定することで二重作成を防ぎ、`AlreadyExists`エラーは成功扱い

**実装例（参考）**:
```typescript
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
```

**注意事項**:
- Cloud Schedulerのcron式はUTC基準で設定（JST 20:00 = UTC 11:00）
- `businessHoursMonthlyMap`の`days`キーは日付の文字列（例: `"10"`, `"11"`）で、`"1"`/`"01"`の揺れに対応
- **月跨ぎ対応**: 翌週が月を跨ぐ場合、必要な月ドキュメントを複数取得し、同一monthIdはキャッシュしてFirestore読み取り回数を抑える
- **openMinute/closeMinuteの基準日**: `intendedBusinessDateKey`は営業日キー（YYYY-MM-DD）であり、`openMinute`/`closeMinute`はその営業日に紐づく時刻定義。`closeMinute > 1440`の時は翌日へ繰り越すルールを維持し、`openScheduleTime`/`closeScheduleTime`はJST基準で計算してからUTC epoch秒へ変換する
- **taskId固定で冪等を担保**: `task.name`を`tasksClient.taskPath(...)`で固定し、`createTask`で`AlreadyExists`（`error.code === 6`）は成功扱いにして冪等化する
- **URLは環境変数で保持**: `CLOSE_ASSESSMENT_URL`、`OPEN_ASSESSMENT_URL`を環境変数から取得（既存の`CONTROL_HOOK_URL`パターンに合わせる）
- OIDCトークン認証を設定（`TASKS_INVOKER_SA`を使用）

#### 2.1.2 環境変数の設定

**必要な環境変数**:
- `ENABLE_AUTO_OPEN_CLOSE`: 自動開閉店の有効/無効（`true`/`false`）
- `TASK_CLOSE_OFFSET_MINUTES`: 閉店認定タスクの実行時刻オフセット（分単位、デフォルト: 120）
- `TASK_OPEN_OFFSET_MINUTES`: 開店認定タスクの実行時刻オフセット（分単位、デフォルト: -30）
- `CLOSE_ASSESSMENT_URL`: 閉店認定HTTP FunctionsのURL（例: `https://${project}-${location}.cloudfunctions.net/closeAssessmentTask`）
- `OPEN_ASSESSMENT_URL`: 開店認定HTTP FunctionsのURL（例: `https://${project}-${location}.cloudfunctions.net/openAssessmentTask`）
- `TASKS_QUEUE`: Cloud Tasksのキュー名（既存の`TASKS_QUEUE`を使用）
- `TASKS_LOCATION`: Cloud Tasksのロケーション（既存の`TASKS_LOCATION`を使用、例: `us-central1`）
- `TASKS_INVOKER_SA`: サービスアカウントのメールアドレス（既存の`TASKS_INVOKER_SA`を使用）

---

## 3. 閉店認定処理の実装

### 3.1 `functions/src/tasks/closeAssessmentTask.ts`（新規作成）

#### 3.1.1 実装内容

**ファイル**: `functions/src/tasks/closeAssessmentTask.ts`（新規作成）

**処理フロー**:
1. **idempotencyKeyの生成**: `close_assessment_${intendedBusinessDateKey}_${scheduledAt}`
2. **冪等性チェック（トランザクション内）**: 既に同じ`idempotencyKey`で更新済みの場合はno-op
3. **businessDateKeyの許容範囲検証**: `serverNowJst`の暦日を`D`とし、`intendedBusinessDateKey`が`D`または`D-1`を指していれば「正常」
4. **既に閉店済みか確認**: `status === 'closed'`かつ`lastClosedBusinessDateKey === intendedBusinessDateKey`の場合は`result: 'already_closed'`
5. **次営業日が開始しているか確認**: `status === 'running'`かつ`currentBusinessDateKey !== intendedBusinessDateKey`の場合は`result: 'next_day_started'`
6. **manualOverrideの確認**: `manualOverride`が有効な場合は`result: 'needs_manual_close_suppressed'`を設定（監査情報を更新）
7. **閉店時間超過の確認**: `status === 'running'`かつ`currentBusinessDateKey === intendedBusinessDateKey`の場合は`result: 'needs_manual_close'`を設定
8. **blockersの判定**: `result === 'needs_manual_close'`または`result === 'needs_manual_close_suppressed'`の場合、`activeStays where isActive == true limit 1`を取得し、存在すれば`'activeStaysNotEmpty'`を追加
9. **認定結果の更新**: トランザクション内で`storeMeta/currentBusinessDay`を更新

**実装例（参考）**:
```typescript
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';

export const closeAssessmentTask = onRequest(
  {
    region: 'us-central1',
  },
  async (req, res) => {
    try {
      const payload = req.body as {
        action: string;
        intendedBusinessDateKey: string;
        scheduledAt: string;
      };

      if (payload.action !== 'close_assessment') {
        res.status(400).json({ error: 'Invalid action' });
        return;
      }

      const db = getFirestore();
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);  // UTC+9
      const serverNowJst = jstNow;

      // idempotencyKeyの生成
      const idempotencyKey = `close_assessment_${payload.intendedBusinessDateKey}_${payload.scheduledAt}`;

      // トランザクション内で認定処理を実行
      await db.runTransaction(async (transaction) => {
        const stateDocRef = db.collection('storeMeta').doc('currentBusinessDay');
        const stateDoc = await transaction.get(stateDocRef);

        if (!stateDoc.exists) {
          throw new Error('storeMeta/currentBusinessDay が見つかりません');
        }

        const stateData = stateDoc.data()!;
        const closeAssessment = stateData.closeAssessment as any;

        // 冪等性チェック
        if (closeAssessment?.idempotencyKey === idempotencyKey) {
          console.log(`既に同じidempotencyKeyで更新済みです: ${idempotencyKey}`);
          return;  // no-op
        }

        // businessDateKeyの許容範囲検証
        const d = new Date(serverNowJst);
        d.setHours(0, 0, 0, 0);
        const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const yesterdayKey = new Date(d);
        yesterdayKey.setDate(yesterdayKey.getDate() - 1);
        const yesterdayKeyStr = `${yesterdayKey.getFullYear()}-${String(yesterdayKey.getMonth() + 1).padStart(2, '0')}-${String(yesterdayKey.getDate()).padStart(2, '0')}`;

        if (payload.intendedBusinessDateKey !== todayKey && payload.intendedBusinessDateKey !== yesterdayKeyStr) {
          // 許容範囲外
          transaction.update(stateDocRef, {
            closeAssessment: {
              idempotencyKey,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              decidedAt: Timestamp.now(),
              result: 'skipped',
              blockers: ['date_out_of_range'],
              source: 'task',
              scheduledAt: payload.scheduledAt,
            },
          });
          return;
        }

        const status = stateData.status as string;
        const currentBusinessDateKey = stateData.currentBusinessDateKey as string | null;
        const lastClosedBusinessDateKey = stateData.lastClosedBusinessDateKey as string | null;
        const manualOverride = stateData.manualOverride as any;

        // 既に閉店済みか確認
        if (status === 'closed' && lastClosedBusinessDateKey === payload.intendedBusinessDateKey) {
          transaction.update(stateDocRef, {
            closeAssessment: {
              idempotencyKey,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              decidedAt: Timestamp.now(),
              result: 'already_closed',
              blockers: [],
              source: 'task',
              scheduledAt: payload.scheduledAt,
            },
          });
          return;
        }

        // 次営業日が開始しているか確認
        if (status === 'running' && currentBusinessDateKey !== payload.intendedBusinessDateKey) {
          transaction.update(stateDocRef, {
            closeAssessment: {
              idempotencyKey,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              decidedAt: Timestamp.now(),
              result: 'next_day_started',
              blockers: [],
              source: 'task',
              scheduledAt: payload.scheduledAt,
            },
          });
          return;
        }

        // manualOverrideの確認
        let result: string;
        let lastSuppressedAt: Timestamp | undefined;
        let suppressedByOverride: boolean | undefined;

        if (
          manualOverride &&
          manualOverride.type === 'close_skip' &&
          manualOverride.intendedBusinessDateKey === payload.intendedBusinessDateKey &&
          manualOverride.overrideUntil.toMillis() >= now.getTime()
        ) {
          result = 'needs_manual_close_suppressed';
          lastSuppressedAt = Timestamp.now();
          suppressedByOverride = true;
        } else if (status === 'running' && currentBusinessDateKey === payload.intendedBusinessDateKey) {
          result = 'needs_manual_close';
        } else {
          result = 'skipped';
        }

        // blockersの判定
        const blockers: string[] = [];
        if (result === 'needs_manual_close' || result === 'needs_manual_close_suppressed') {
          // activeStays where isActive == true limit 1 を取得し、存在すれば blockers に activeStaysNotEmpty を追加
          const activeStaysSnapshot = await db
            .collection('activeStays')
            .where('isActive', '==', true)
            .limit(1)
            .get();
          if (!activeStaysSnapshot.empty) {
            blockers.push('activeStaysNotEmpty');
          }
        }

        // 認定結果の更新
        transaction.update(stateDocRef, {
          closeAssessment: {
            idempotencyKey,
            intendedBusinessDateKey: payload.intendedBusinessDateKey,
            decidedAt: Timestamp.now(),
            result,
            blockers,
            source: 'task',
            scheduledAt: payload.scheduledAt,
            ...(lastSuppressedAt && { lastSuppressedAt }),
            ...(suppressedByOverride !== undefined && { suppressedByOverride }),
          },
        });
      });

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('閉店認定処理でエラーが発生しました:', error);
      res.status(500).json({ error: error.message });
    }
  }
);
```

**注意事項**:
- HTTP FunctionsはCloud Runの標準機能でOIDCトークンの検証が行われるため、`invoker: 'private'`の設定は不要（実装時はFirebase Functions v2の仕様を確認）
- Cloud Run側で`roles/run.invoker`を`TASKS_INVOKER_SA`に付与することで、サービスアカウントのみがHTTP Functionsを呼び出せるようになる
- トランザクション内で`storeMeta/currentBusinessDay`を更新
- 冪等性保証: トランザクション内で`idempotencyKey`をチェック
- **activeStays blocker判定**: `activeStays where isActive == true limit 1`を取得し、存在すれば`blockers`に`'activeStaysNotEmpty'`を追加（取得は最大1件のみ、存在確認目的）

---

## 4. 開店認定処理の実装

### 4.1 `functions/src/tasks/openAssessmentTask.ts`（新規作成）

#### 4.1.1 実装内容

**ファイル**: `functions/src/tasks/openAssessmentTask.ts`（新規作成）

**処理フロー**:
1. **idempotencyKeyの生成**: `open_assessment_${intendedBusinessDateKey}_${scheduledAt}`
2. **冪等性チェック（トランザクション内）**: 既に同じ`idempotencyKey`で更新済みの場合はno-op
3. **businessDateKeyの許容範囲検証**: `serverNowJst`の暦日を`D`とし、`intendedBusinessDateKey`が`D`または`D+1`を指していれば「正常」
4. **既に営業中か確認**: `status === 'running'`かつ`currentBusinessDateKey === intendedBusinessDateKey`の場合は`result: 'already_running'`
5. **営業中に別日付の開店が走ることを防止**: `status === 'running'`かつ`currentBusinessDateKey !== intendedBusinessDateKey`の場合は`result: 'skipped'`、`blockers: ['already_running_different_date']`
6. **開店条件の確認（storeMetaのみで判定）**: 
   - `status === 'closed'`または`status === 'error'`の場合
   - `status === 'closed'`（閉店状態であること）
   - `lastClosedBusinessDateKey`が存在する（前回の閉店処理が完了していること）
   - `lastError === null`（直近の閉店処理でエラーが発生していないこと）
   - **注意**: `lastClosedBusinessDateKey`と`intendedBusinessDateKey`の厳密整合は Phase5 では要求しない（「前営業日＝前日とは限らない」ため）
7. **manualOverrideの確認**: `manualOverride`が有効な場合は`lastSuppressedAt`と`suppressedByOverride`を設定（監査情報を更新）
8. **認定結果の更新**: トランザクション内で`storeMeta/currentBusinessDay`を更新

**実装例（参考）**:
```typescript
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';

export const openAssessmentTask = onRequest(
  {
    region: 'us-central1',
  },
  async (req, res) => {
    try {
      const payload = req.body as {
        action: string;
        intendedBusinessDateKey: string;
        scheduledAt: string;
      };

      if (payload.action !== 'open_assessment') {
        res.status(400).json({ error: 'Invalid action' });
        return;
      }

      const db = getFirestore();
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);  // UTC+9
      const serverNowJst = jstNow;

      // idempotencyKeyの生成
      const idempotencyKey = `open_assessment_${payload.intendedBusinessDateKey}_${payload.scheduledAt}`;

      // トランザクション内で認定処理を実行
      await db.runTransaction(async (transaction) => {
        const stateDocRef = db.collection('storeMeta').doc('currentBusinessDay');
        const stateDoc = await transaction.get(stateDocRef);

        if (!stateDoc.exists) {
          throw new Error('storeMeta/currentBusinessDay が見つかりません');
        }

        const stateData = stateDoc.data()!;
        const openAssessment = stateData.openAssessment as any;

        // 冪等性チェック
        if (openAssessment?.idempotencyKey === idempotencyKey) {
          console.log(`既に同じidempotencyKeyで更新済みです: ${idempotencyKey}`);
          return;  // no-op
        }

        // businessDateKeyの許容範囲検証
        const d = new Date(serverNowJst);
        d.setHours(0, 0, 0, 0);
        const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const tomorrowKey = new Date(d);
        tomorrowKey.setDate(tomorrowKey.getDate() + 1);
        const tomorrowKeyStr = `${tomorrowKey.getFullYear()}-${String(tomorrowKey.getMonth() + 1).padStart(2, '0')}-${String(tomorrowKey.getDate()).padStart(2, '0')}`;

        if (payload.intendedBusinessDateKey !== todayKey && payload.intendedBusinessDateKey !== tomorrowKeyStr) {
          // 許容範囲外
          transaction.update(stateDocRef, {
            openAssessment: {
              idempotencyKey,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              decidedAt: Timestamp.now(),
              result: 'skipped',
              blockers: ['date_out_of_range'],
              source: 'task',
              scheduledAt: payload.scheduledAt,
            },
          });
          return;
        }

        const status = stateData.status as string;
        const currentBusinessDateKey = stateData.currentBusinessDateKey as string | null;
        const lastClosedBusinessDateKey = stateData.lastClosedBusinessDateKey as string | null;
        const lastError = stateData.lastError as any;
        const manualOverride = stateData.manualOverride as any;

        // 既に営業中か確認
        if (status === 'running' && currentBusinessDateKey === payload.intendedBusinessDateKey) {
          transaction.update(stateDocRef, {
            openAssessment: {
              idempotencyKey,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              decidedAt: Timestamp.now(),
              result: 'already_running',
              blockers: [],
              source: 'task',
              scheduledAt: payload.scheduledAt,
            },
          });
          return;
        }

        // 営業中に別日付の開店が走ることを防止
        if (status === 'running' && currentBusinessDateKey !== payload.intendedBusinessDateKey) {
          transaction.update(stateDocRef, {
            openAssessment: {
              idempotencyKey,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              decidedAt: Timestamp.now(),
              result: 'skipped',
              blockers: ['already_running_different_date'],
              source: 'task',
              scheduledAt: payload.scheduledAt,
            },
          });
          return;
        }

        // 開店条件の確認（storeMetaのみで判定）
        // 注意: businessHoursMonthlyMap参照や「前営業日＝前日」計算は行わない
        // lastClosedBusinessDateKey と intendedBusinessDateKey の厳密整合は Phase5 では要求しない
        let result: string;
        const blockers: string[] = [];
        let lastSuppressedAt: Timestamp | undefined;
        let suppressedByOverride: boolean | undefined;

        if (status === 'closed' || status === 'error') {
          // 前回の閉店処理が正常に完了しているか確認（storeMetaのみで判定）
          if (status !== 'closed') {
            blockers.push('status_not_closed');
          }
          if (!lastClosedBusinessDateKey) {
            blockers.push('lastClosedBusinessDateKey_missing');
          }
          if (lastError !== null) {
            blockers.push('lastError_exists');
          }

          if (blockers.length === 0) {
            result = 'ready_to_open';
          } else {
            result = 'needs_manual_open';
          }
        } else {
          result = 'skipped';
        }

        // manualOverrideの確認
        if (
          manualOverride &&
          manualOverride.type === 'open_skip' &&
          manualOverride.intendedBusinessDateKey === payload.intendedBusinessDateKey &&
          manualOverride.overrideUntil.toMillis() >= now.getTime()
        ) {
          lastSuppressedAt = Timestamp.now();
          suppressedByOverride = true;
          // resultは維持（needs_manual_openのまま）
        }

        // 認定結果の更新
        transaction.update(stateDocRef, {
          openAssessment: {
            idempotencyKey,
            intendedBusinessDateKey: payload.intendedBusinessDateKey,
            decidedAt: Timestamp.now(),
            result,
            blockers,
            source: 'task',
            scheduledAt: payload.scheduledAt,
            ...(lastSuppressedAt && { lastSuppressedAt }),
            ...(suppressedByOverride !== undefined && { suppressedByOverride }),
          },
        });
      });

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('開店認定処理でエラーが発生しました:', error);
      res.status(500).json({ error: error.message });
    }
  }
);
```

**注意事項**:
- HTTP FunctionsはCloud Runの標準機能でOIDCトークンの検証が行われるため、`invoker: 'private'`の設定は不要（実装時はFirebase Functions v2の仕様を確認）
- Cloud Run側で`roles/run.invoker`を`TASKS_INVOKER_SA`に付与することで、サービスアカウントのみがHTTP Functionsを呼び出せるようになる
- トランザクション内で`storeMeta/currentBusinessDay`を更新
- 冪等性保証: トランザクション内で`idempotencyKey`をチェック
- **重要**: 開店条件の確認は`storeMeta/currentBusinessDay`のフィールドのみで判定する（`businessHoursMonthlyMap`参照や「前営業日＝前日」計算は行わない）。`lastClosedBusinessDateKey`と`intendedBusinessDateKey`の厳密整合は Phase5 では要求しない（「前営業日＝前日とは限らない」ため）

---

## 5. State Docの初期化更新

### 5.1 `functions/src/storeManagement/createInitialStateDocCallable.ts`の更新

#### 5.1.1 実装内容

**ファイル**: `functions/src/storeManagement/createInitialStateDocCallable.ts`（既存、更新）

**更新内容**:
- 新規フィールド（`closeAssessment`, `openAssessment`, `manualOverride`）の初期化を追加

**実装例（参考）**:
```typescript
// 既存のコードに追加
const initialState = {
  status: 'closed',
  currentBusinessDateKey: null,
  lastClosedBusinessDateKey: null,
  updatedAt: Timestamp.now(),
  source: 'initial',
  lastError: null,
  // 新規追加フィールド
  closeAssessment: null,
  openAssessment: null,
  manualOverride: null,
};
```

**注意事項**:
- 既存の初期化処理を壊さないように注意
- 新規フィールドの初期値は`null`

---

## 6. エラーハンドリング・ログ記録

### 6.1 エラー処理

**実装方針**:
- エラー発生時は、`storeMeta/currentBusinessDay/lastError`にエラー情報を記録
- `storeMeta/currentBusinessDay/logs`サブコレクションにログを記録（best-effort）

**エラー情報の構造**:
```typescript
{
  code: string,  // エラーコード
  message: string,  // エラーメッセージ
  failedStep: string,  // 失敗したステップ名（例: 'close_assessment:updateStateDoc'）
  at: Timestamp,  // 失敗時刻
  context: {
    intendedBusinessDateKey: string,
    action: 'close_assessment' | 'open_assessment',
    idempotencyKey?: string
  }
}
```

### 6.2 ログ記録

**ログエントリの構造**:
```typescript
{
  type: 'close_assessment' | 'open_assessment',
  businessDateKey: 'YYYY-MM-DD',
  trigger: 'auto',
  failedStep: string,
  errorCode: string,
  errorMessage: string,
  causeHint: string | null,
  createdAt: Timestamp,
  context: any | null
}
```

---

## 7. 認証/IAM設定

### 7.1 サービスアカウントの作成

**必要なサービスアカウント**:
- `TASKS_INVOKER_SA`: Cloud TasksからHTTP Functionsを呼び出すためのサービスアカウント（既存の`TASKS_INVOKER_SA`を使用）

**IAM権限の付与**:
- Cloud Run（HTTP Functions）側で、`roles/run.invoker`を`TASKS_INVOKER_SA`に付与
- これにより、`TASKS_INVOKER_SA`のみがHTTP Functionsを呼び出せるようになる

### 7.2 Cloud Tasksの設定

**OIDCトークンの付与**:
- Cloud Tasksのタスク作成時に、`oidcToken`を設定
- `serviceAccountEmail`: `TASKS_INVOKER_SA`

### 7.3 HTTP Functionsの設定

**認証設定**:
- HTTP FunctionsはCloud Runの標準機能でOIDCトークンの検証が行われるため、`invoker: 'private'`の設定は不要（実装時はFirebase Functions v2の仕様を確認）
- Cloud Run側で`roles/run.invoker`を`TASKS_INVOKER_SA`に付与することで、サービスアカウントのみがHTTP Functionsを呼び出せるようになる
- `allUsers`公開はしない方針

**注意事項**:
- 過去の401/unauthorized回避のため、デプロイ時に認証設定を必ず確認すること
- 必要以上のトークン検証実装（アプリ側でBearer検証する等）は不要

---

## 8. 実装時の注意事項

### 8.1 冪等性保証

- **作成時冪等**: `task.name`を`tasksClient.taskPath(...)`で固定し、`createTask`で`AlreadyExists`（`error.code === 6`）は成功扱いにして冪等化する
- **実行時冪等**: トランザクション内で`idempotencyKey`をチェックし、既に同じキーで更新済みの場合はno-op

### 8.2 businessDateKeyの検証

- **許容範囲検証**: `serverNowJst`の暦日を`D`とし、`intendedBusinessDateKey`が許容範囲内か確認
  - 閉店認定: `D`または`D-1`
  - 開店認定: `D`または`D+1`

### 8.3 コスト削減

- **openAssessmentの前回閉店完了チェック**: `storeMeta/currentBusinessDay`のフィールドのみで判定（ドキュメント走査をしない）
- **businessHoursMonthlyMapの取得**: 月跨ぎの場合は複数のドキュメントを取得するが、同一monthIdはキャッシュしてFirestore読み取り回数を抑える

### 8.4 エラー通知（将来実装）

- エラー発生時は、メール/LINE等で管理者に通知する機能を今後実装予定
- 実コード側には（将来追加する想定で）コメントアウトを入れる指示を仕様に書く
- 例:
  ```typescript
  // TODO: エラー通知機能（メール/LINE等）を実装予定
  // await notifyAdmin(error);
  ```

---

## 9. テスト観点

### 9.1 週次Plannerのテスト

- [ ] Cloud Schedulerは週1回（日曜20:00 JST）だけ起動している
- [ ] `ENABLE_AUTO_OPEN_CLOSE`が`false`の場合はno-op
- [ ] 翌週（月〜日）分の「閉店認定」「開店認定」タスクをCloud Tasksに投入している
- [ ] 月跨ぎの場合、必要な月ドキュメントを複数取得している
- [ ] 同一monthIdはキャッシュしてFirestore読み取り回数を抑えている
- [ ] `isClosed: true`の場合はタスクを投入していない
- [ ] 作成時冪等を実装している（`task.name`を`tasksClient.taskPath(...)`で固定し、`AlreadyExists`エラーは成功扱い）
- [ ] `openMinute`/`closeMinute`の基準日が正しく設定されている（`intendedBusinessDateKey`の営業日に紐づく）
- [ ] `closeMinute > 1440`の時は翌日へ繰り越すルールが正しく動作している
- [ ] `openScheduleTime`/`closeScheduleTime`はJST基準で計算してからUTC epoch秒へ変換されている

### 9.2 閉店認定処理のテスト

- [ ] 冪等性保証（同じ`idempotencyKey`で再実行しても安全）
- [ ] businessDateKeyの許容範囲検証（正常/異常の判定）
- [ ] 既に閉店済みの場合の処理（`result: 'already_closed'`）
- [ ] 次営業日が開始している場合の処理（`result: 'next_day_started'`）
- [ ] manualOverrideが有効な場合の処理（`result: 'needs_manual_close_suppressed'`）
- [ ] 閉店時間超過の場合の処理（`result: 'needs_manual_close'`）
- [ ] blockersの判定（`needs_manual_close`または`needs_manual_close_suppressed`の場合に`activeStays where isActive == true limit 1`で存在確認）

### 9.3 開店認定処理のテスト

- [ ] 冪等性保証（同じ`idempotencyKey`で再実行しても安全）
- [ ] businessDateKeyの許容範囲検証（正常/異常の判定）
- [ ] 既に営業中の場合の処理（`result: 'already_running'`）
- [ ] 営業中に別日付の開店が走ることを防止（`result: 'skipped'`、`blockers: ['already_running_different_date']`）
- [ ] 開店条件の確認（storeMetaのみで判定、`businessHoursMonthlyMap`参照や「前営業日＝前日」計算は行わない）
- [ ] `lastClosedBusinessDateKey`と`intendedBusinessDateKey`の厳密整合は要求しない
- [ ] manualOverrideが有効な場合の処理（`lastSuppressedAt`と`suppressedByOverride`を設定）

### 9.4 認証/IAMのテスト

- [ ] OIDCトークン認証が正しく動作している
- [ ] サービスアカウントのみがHTTP Functionsを呼び出せる
- [ ] `allUsers`公開はしていない
- [ ] Cloud Run側で`roles/run.invoker`が`TASKS_INVOKER_SA`に付与されている

---

## 10. 参照資料

- [自動開閉店（補助）機能 仕様書](../automatic_store_assessment_spec.md)
- [Step0: 最終仕様](../step0_final_spec.md)
- [Step3: state docと自動開閉店の設計](../step3_state_doc_and_scheduling.md)
- [Step4: 改修実装チェックリスト](../step4_migration_plan_checklist.md)
