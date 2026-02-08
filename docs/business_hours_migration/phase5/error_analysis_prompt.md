# Cloud Tasks createTask エラー分析と改善策検討プロンプト

## 背景

Firebase Functions v2の`onSchedule`を使用して実装した週次Planner関数（`weeklyPlanner`）が、Cloud Tasksにタスクを投入する際に`NOT_FOUND`エラーを発生させています。

## エラーの詳細

### エラーメッセージ
```
Error: 5 NOT_FOUND: Requested entity was not found.
```

### エラーの発生箇所
- **発生関数**: `weeklyPlanner` (Cloud Scheduler経由で実行)
- **発生API**: `@google-cloud/tasks` の `CloudTasksClient.createTask()`
- **エラーコード**: `5` (NOT_FOUND)
- **HTTPステータス**: `500 Internal Server Error`

### エラーのスタックトレース
```
Error: 5 NOT_FOUND: Requested entity was not found.
    at callErrorFromStatus (/workspace/node_modules/@grpc/grpc-js/build/src/call.js:32:19)
    at Object.onReceiveStatus (/workspace/node_modules/@grpc/grpc-js/build/src/client.js:193:76)
    ...
    at /workspace/node_modules/@google-cloud/tasks/build/cjs/src/v2/cloud_tasks_client.cjs:279:25
```

### 実行環境
- **実行元**: Cloud Scheduler (`userAgent: Google-Cloud-Scheduler`)
- **実行サービスアカウント**: `767044015900-compute@developer.gserviceaccount.com`
- **Cloud Runサービス**: `weeklyplanner` (リビジョン: `weeklyplanner-00007-6qn`)
- **リージョン**: `us-central1`
- **プロジェクト**: `amuse-app-template`

## 実装されている機能

### 1. weeklyPlanner関数の実装

**ファイル**: `functions/src/scheduler/weeklyPlanner.ts`

**処理内容**:
1. `ENABLE_AUTO_OPEN_CLOSE`を確認（`false`の場合はno-op）
2. `businessHoursMonthlyMap`から翌週（月〜日）分の営業時間を取得（月跨ぎの場合は複数のドキュメントを取得、同一monthIdはキャッシュ）
3. 各日の「閉店認定」「開店認定」タスクをCloud Tasksに投入
   - 閉店認定: 閉店時間 + `TASK_CLOSE_OFFSET_MINUTES`（デフォルト: 120分）
   - 開店認定: 開店時間 + `TASK_OPEN_OFFSET_MINUTES`（デフォルト: -30分）
4. `task.name`を`tasksClient.taskPath(...)`で固定し、`createTask`で`AlreadyExists`（`error.code === 6`）は成功扱いにして冪等化

**主要な実装ポイント**:
- `PROJECT_ID`の取得: `process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.PROJECT_ID || 'amuse-app-template'`
- `queuePath`の生成: `tasksClient.queuePath(PROJECT_ID, tasksLocation, tasksQueue)`
- `task.name`の生成: `tasksClient.taskPath(PROJECT_ID, tasksLocation, tasksQueue, taskId)`
- `taskId`の形式: `open_assessment_${dateKey}` / `close_assessment_${dateKey}`

**タスク作成コード（開店認定の例）**:
```typescript
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
      name: openTaskName,  // ← 明示的に指定
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
        seconds: Math.floor(openScheduleTime.getTime() / 1000),
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
```

### 2. 参考実装（正常に動作している関数）

**ファイル**: `functions/src/lib/tasks.ts`

**関数**: `enqueueStartTask`, `enqueueRegistTask`

**実装の違い**:
- `task.name`を**明示的に指定していない**
- `task`オブジェクトに`name`プロパティを含めていない

**タスク作成コード（enqueueStartTaskの例）**:
```typescript
const queuePath = client.queuePath(PROJECT_ID, tasksLocation, tasksQueue);

const task = {
  httpRequest: {
    httpMethod: 'POST' as const,
    url: controlHookUrl,
    headers: {
      'Content-Type': 'application/json',
    },
    body: Buffer.from(JSON.stringify(payload)).toString('base64'),
    oidcToken: {
      serviceAccountEmail: tasksInvokerSa,
    },
  },
  scheduleTime: {
    seconds: Math.floor(scheduledTime.getTime() / 1000),
  },
  // ← task.name を指定していない
};

const [response] = await client.createTask({
  parent: queuePath,
  task: task,
});
```

## 確認済みの項目

### 1. キューの存在確認
- **キュー名**: `business-date-assessment-queue`
- **ロケーション**: `us-central1`
- **状態**: `RUNNING` ✓
- **確認コマンド**: `gcloud tasks queues describe business-date-assessment-queue --location=us-central1`

**キューの詳細**:
```json
{
  "name": "projects/amuse-app-template/locations/us-central1/queues/business-date-assessment-queue",
  "rateLimits": {
    "maxBurstSize": 100,
    "maxConcurrentDispatches": 1000,
    "maxDispatchesPerSecond": 500.0
  },
  "retryConfig": {
    "maxAttempts": 100,
    "maxBackoff": "3600s",
    "maxDoublings": 16,
    "maxRetryDuration": "3600s",
    "minBackoff": "0.100s"
  },
  "state": "RUNNING"
}
```

### 2. 環境変数の設定
以下の環境変数が設定されていることを確認済み：
- `ENABLE_AUTO_OPEN_CLOSE`: `true`
- `TASKS_QUEUE`: `business-date-assessment-queue`
- `TASKS_LOCATION`: `us-central1`
- `TASKS_INVOKER_SA`: 設定済み
- `CLOSE_ASSESSMENT_URL`: 設定済み
- `OPEN_ASSESSMENT_URL`: 設定済み
- `TASK_CLOSE_OFFSET_MINUTES`: `120`
- `TASK_OPEN_OFFSET_MINUTES`: `-30`

### 3. IAM権限の確認
- **実行サービスアカウント**: `767044015900-compute@developer.gserviceaccount.com`
- **付与済み権限**: `roles/cloudtasks.enqueuer` ✓
- **確認方法**: `gcloud run services describe weeklyplanner --region=us-central1`

### 4. 実行元の確認
- **実行元**: Cloud Scheduler (`userAgent: Google-Cloud-Scheduler`)
- **リクエストIP**: `107.178.194.102` (Google Cloud SchedulerのIP)
- **実行方法**: Cloud Schedulerのジョブを手動実行

### 5. コードのデプロイ状態
- **リビジョン**: `weeklyplanner-00007-6qn`
- **デプロイ状態**: 最新コードがデプロイ済み
- **Firebase Functions Hash**: `408f3078d75bf0b1a60d798fa21259b2f999a2d8`

## 実装の違い（正常動作関数との比較）

### 正常動作している関数（enqueueStartTask, enqueueRegistTask）
- `task.name`を**指定していない**
- Cloud Tasks SDKが自動的にタスク名を生成

### エラーが発生している関数（weeklyPlanner）
- `task.name`を**明示的に指定している**
- `tasksClient.taskPath(PROJECT_ID, tasksLocation, tasksQueue, taskId)`で生成
- 冪等性を担保するために`task.name`を固定する設計

## 考えられる原因

### 1. task.nameの指定方法の問題
- `task.name`を明示的に指定する場合、完全修飾名が必要
- `tasksClient.taskPath()`で生成した名前が正しい形式でない可能性
- `task.name`に指定する値が、Cloud Tasks APIが期待する形式と異なる可能性

### 2. キューのパス指定の問題
- `queuePath`の生成方法に問題がある可能性
- `PROJECT_ID`, `tasksLocation`, `tasksQueue`の値が正しくない可能性
- 実際に使用されている値と、期待される値が異なる可能性

### 3. 権限の問題（可能性は低い）
- `roles/cloudtasks.enqueuer`は付与済みだが、特定のキューへのアクセス権限が不足している可能性
- サービスアカウントの権限が正しく反映されていない可能性

### 4. キューのプロパゲーション遅延（可能性は低い）
- キュー作成直後で、Cloud Tasks APIに反映されていない可能性
- ただし、キューは`RUNNING`状態で存在確認済み

### 5. task.nameとparentの不整合
- `task.name`に指定したパスと`parent`（`queuePath`）が一致していない可能性
- `task.name`に含まれるキュー名と`parent`のキュー名が異なる可能性

## 確認が必要な項目

### 1. 実際に使用されている値の確認
- `PROJECT_ID`の実際の値
- `tasksLocation`の実際の値
- `tasksQueue`の実際の値
- `queuePath`の実際の値
- `task.name`の実際の値

### 2. ログ出力の確認
- `queuePath`の値をログに出力して確認
- `task.name`の値をログに出力して確認
- `createTask`呼び出し前のパラメータをログに出力して確認

### 3. 正常動作関数との比較
- `enqueueStartTask`や`enqueueRegistTask`が使用しているキュー名とロケーション
- 正常動作関数とエラー関数の実装の違いを詳細に比較

## 改善策の検討依頼

上記の情報を基に、以下の観点から改善策を検討してください：

1. **エラーの根本原因の特定**
   - `NOT_FOUND`エラーが発生する具体的な理由
   - `task.name`を明示的に指定する場合の正しい実装方法

2. **実装方法の修正案**
   - `task.name`を指定しない方法への変更
   - `task.name`を指定する場合の正しい形式
   - 冪等性を担保する別の方法

3. **デバッグ方法の提案**
   - エラーの原因を特定するためのログ出力方法
   - 実際に使用されている値を確認する方法

4. **Cloud Tasks APIの仕様確認**
   - `task.name`を明示的に指定する場合の要件
   - `parent`と`task.name`の関係性
   - 完全修飾名の正しい形式

5. **推奨される実装方法**
   - 正常動作している関数との整合性を保つ方法
   - 冪等性を担保しつつ、エラーを回避する方法

## 追加情報

### 使用しているライブラリ
- `@google-cloud/tasks`: Cloud Tasks Client Library
- `firebase-functions/v2/scheduler`: Firebase Functions v2 Scheduler

### プロジェクト構成
- **プロジェクトID**: `amuse-app-template`
- **リージョン**: `us-central1`
- **Cloud Runサービス**: `weeklyplanner`
- **Cloud Tasksキュー**: `business-date-assessment-queue`

### 関連ドキュメント
- Phase5実装仕様書: `docs/business_hours_migration/phase5/changeSpec_implementation.md`
- Phase5実装サマリー: `docs/business_hours_migration/phase5/implementation_summary.md`

---

**質問**: 上記の情報を基に、`NOT_FOUND`エラーの根本原因を特定し、具体的な改善策を提案してください。特に、`task.name`を明示的に指定する場合の正しい実装方法と、正常動作している関数（`enqueueStartTask`, `enqueueRegistTask`）との整合性を保つ方法について、詳細な説明をお願いします。
