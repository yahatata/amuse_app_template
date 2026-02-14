# Cloud Tasks createTask NOT_FOUND エラー調査結果

## 調査日時
2026-02-07

## 調査方法
コード修正を一切行わず、gcloudコマンドとログ確認のみで実施

---

## 1. gcloud の現在設定

### 1.1 アクティブな設定
```
[core]
account = wl.creators.lab@gmail.com
disable_usage_reporting = True
project = amuse-app-template

Your active configuration is: [default]
```

### 1.2 認証済みアカウント
```
      Credentialed Accounts
ACTIVE  ACCOUNT
*       wl.creators.lab@gmail.com
```

### 1.3 プロジェクト情報
```
プロジェクトID: amuse-app-template
プロジェクト番号: 767044015900
```

---

## 2. Cloud Tasks キューの実在確認

### 2.1 対象キューの詳細
**キュー名**: `business-date-assessment-queue`  
**ロケーション**: `us-central1`  
**プロジェクト**: `amuse-app-template`

**キューの完全修飾名**:
```
projects/amuse-app-template/locations/us-central1/queues/business-date-assessment-queue
```

**キューの状態**:
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

**確認結果**: キューは存在し、`RUNNING`状態であることを確認 ✓

### 2.2 同一ロケーション内のキュー一覧
```
QUEUE_NAME                      STATE
business-date-assessment-queue  RUNNING
tournament-queue                RUNNING
```

**確認結果**: `us-central1`ロケーションに2つのキューが存在し、いずれも`RUNNING`状態 ✓

---

## 3. weeklyPlanner 実行環境（Cloud Run）の確認

### 3.1 サービスアカウント
```
serviceAccountName: 767044015900-compute@developer.gserviceaccount.com
```

### 3.2 環境変数の設定値

**確認できた環境変数**:

| 環境変数名 | 設定値 |
|-----------|--------|
| `TASKS_QUEUE` | `business-date-assessment-queue` |
| `TASKS_LOCATION` | `us-central1` |
| `TASKS_INVOKER_SA` | `tasks-invoker@amuse-app-template-cloudTask.iam.gserviceaccount.com` |
| `ENABLE_AUTO_OPEN_CLOSE` | `true` |
| `GCLOUD_PROJECT` | `amuse-app-template` |
| `CLOSE_ASSESSMENT_URL` | `https://amuse-app-template-us-central1.cloudfunctions.net/closeAssessmentTask` |
| `OPEN_ASSESSMENT_URL` | `https://amuse-app-template-us-central1.cloudfunctions.net/openAssessmentTask` |
| `TASK_CLOSE_OFFSET_MINUTES` | `120` |
| `TASK_OPEN_OFFSET_MINUTES` | `-30` |

**確認結果**: 
- 必要な環境変数はすべて設定されている ✓
- `TASKS_QUEUE`はフルパスではなく、キュー名のみ（`business-date-assessment-queue`）✓
- `TASKS_LOCATION`は`us-central1`で正しい ✓
- `GCLOUD_PROJECT`は`amuse-app-template`で正しい ✓

### 3.3 その他の環境変数
上記以外に14個の環境変数が設定されていることを確認（詳細は省略）

---

## 4. Cloud Scheduler ジョブの確認

### 4.1 ジョブ一覧
`us-central1`ロケーション内のスケジューラージョブ一覧:

| ジョブ名 | スケジュール | 状態 |
|---------|------------|------|
| `firebase-schedule-weeklyPlanner-us-central1` | `0 11 * * 0` | `ENABLED` |
| `firebase-schedule-monthlyPayrollTrigger-us-central1` | `59 23 25 * *` | `ENABLED` |
| `firebase-schedule-scheduledCleanup-us-central1` | `0 17 * * *` | `ENABLED` |
| `firebase-schedule-nightlyIntegrityCheck-us-central1` | `0 4 * * *` | `ENABLED` |
| `firebase-schedule-nightlyReconciliationCheck-us-central1` | `30 3 * * *` | `ENABLED` |
| `firebase-schedule-scheduleGenerateNextYearBusinessHours-us-central1` | `25 23 28 1 *` | `ENABLED` |
| `firebase-schedule-nightlyRecalculateBalanceDue-us-central1` | `0 3 * * *` | `ENABLED` |

### 4.2 weeklyPlanner ジョブの詳細
**ジョブ名**: `firebase-schedule-weeklyPlanner-us-central1`

**設定内容**:
- **URI**: `https://us-central1-amuse-app-template.cloudfunctions.net/weeklyPlanner`
- **ServiceAccount**: `767044015900-compute@developer.gserviceaccount.com`
- **Schedule**: `0 11 * * 0` (UTC、日曜11:00 = JST 20:00)
- **TimeZone**: `UTC`
- **State**: `ENABLED`

**確認結果**: 
- ジョブは存在し、有効化されている ✓
- 実行サービスアカウントは`767044015900-compute@developer.gserviceaccount.com` ✓

---

## 5. IAM権限の確認

### 5.1 サービスアカウントへの権限付与状況

**対象サービスアカウント**: `767044015900-compute@developer.gserviceaccount.com`

**付与されている権限**:
```
roles/cloudtasks.enqueuer  serviceAccount:767044015900-compute@developer.gserviceaccount.com
roles/editor               serviceAccount:767044015900-compute@developer.gserviceaccount.com
```

**確認結果**: 
- `roles/cloudtasks.enqueuer`権限が付与されている ✓
- `roles/editor`権限も付与されている（より広範な権限）✓

---

## 6. エラーログの確認

### 6.1 エラーメッセージ
```
Error: 5 NOT_FOUND: Requested entity was not found.
```

### 6.2 エラーの発生箇所（スタックトレース）
```
at callErrorFromStatus (/workspace/node_modules/@grpc/grpc-js/build/src/call.js:32:19)
at Object.onReceiveStatus (/workspace/node_modules/@grpc/grpc-js/build/src/client.js:193:76)
at Object.onReceiveStatus (/workspace/node_modules/@grpc/grpc-js/build/src/client-interceptors.js:361:141)
at Object.onReceiveStatus (/workspace/node_modules/@grpc/grpc-js/build/src/client-interceptors.js:324:181)
at /workspace/node_modules/@grpc/grpc-js/build/src/resolving-call.js:135:78
at process.processTicksAndRejections (node:internal/process/task_queues:85:11)
for call at
at ServiceClientImpl.makeUnaryRequest (/workspace/node_modules/@grpc/grpc-js/build/src/client.js:161:32)
at ServiceClientImpl.<anonymous> (/workspace/node_modules/@grpc/grpc-js/build/src/make-client.js:105:19)
at /workspace/node_modules/@google-cloud/tasks/build/cjs/src/v2/cloud_tasks_client.cjs:279:25
at /workspace/node_modules/@google-cloud/tasks/node_modules/google-gax/build/src/normalCalls/timeout.js:44:16
```

**確認結果**: 
- エラーは`@google-cloud/tasks`の`createTask`呼び出し時に発生している ✓
- エラーコードは`5`（`NOT_FOUND`）✓

### 6.3 ログ内の実際の値の確認

**確認したログ検索条件**:
- `textPayload`に`queue`、`task`、`PROJECT`、`LOCATION`を含むログ
- `jsonPayload.message`に`queue`、`task`を含むログ

**結果**: 
- ログ内に`queuePath`や`taskName`の実際の値は出力されていない
- エラーメッセージのみが記録されている

**過去のエラー履歴**:
- `PROJECT_ID is not set`というエラーが過去に発生していた（2026-02-07 04:13:39、02:31:22）
- 現在は`PROJECT_ID`は設定されている（`GCLOUD_PROJECT=amuse-app-template`）

---

## 7. パス計算の検証

### 7.1 計算されるパス形式

**前提条件**:
- `PROJECT_ID`: `amuse-app-template`
- `LOCATION`: `us-central1`
- `QUEUE`: `business-date-assessment-queue`
- `TASK_ID`: `open_assessment_2025-01-20`（例）

**計算結果**:
```
queuePath: projects/amuse-app-template/locations/us-central1/queues/business-date-assessment-queue
taskName:  projects/amuse-app-template/locations/us-central1/queues/business-date-assessment-queue/tasks/open_assessment_2025-01-20
```

### 7.2 実際のキューの完全修飾名との比較

**実際のキューの`name`フィールド**:
```
projects/amuse-app-template/locations/us-central1/queues/business-date-assessment-queue
```

**比較結果**:
- 計算される`queuePath`と実際のキューの`name`は一致する ✓
- `taskName`は`queuePath`で始まっている（親子関係が正しい）✓

---

## 8. 正常動作している関数との実装の違い

### 8.1 正常動作している関数（参考）

**ファイル**: `functions/src/lib/tasks.ts`  
**関数**: `enqueueStartTask`, `enqueueRegistTask`

**実装の特徴**:
- `task`オブジェクトに`name`プロパティを指定していない
- `createTask`呼び出し時に`parent`（`queuePath`）のみを指定
- Cloud Tasks SDKが自動的にタスク名を生成

**コード例**（`enqueueStartTask`）:
```typescript
const queuePath = client.queuePath(PROJECT_ID, tasksLocation, tasksQueue);

const task = {
  httpRequest: {...},
  scheduleTime: {...},
  // name プロパティを指定していない
};

const [response] = await client.createTask({
  parent: queuePath,
  task: task,
});
```

### 8.2 エラーが発生している関数

**ファイル**: `functions/src/scheduler/weeklyPlanner.ts`  
**関数**: `weeklyPlanner`

**実装の特徴**:
- `task`オブジェクトに`name`プロパティを明示的に指定している
- `tasksClient.taskPath(PROJECT_ID, tasksLocation, tasksQueue, taskId)`で生成した値を`task.name`に設定

**コード例**（`weeklyPlanner.ts`）:
```typescript
const openTaskId = `open_assessment_${dateKey}`;
const openTaskName = tasksClient.taskPath(PROJECT_ID, tasksLocation, tasksQueue, openTaskId);
// ...
task: {
  name: openTaskName,  // ← 明示的に指定
  httpRequest: {...},
  scheduleTime: {...},
}
```

**確認結果**: 
- 実装方法に明確な違いがある ✓
- 正常動作している関数は`task.name`を指定していない ✓
- エラーが発生している関数は`task.name`を明示的に指定している ✓

---

## 調査結果のまとめ

### 確認できた事実

1. **環境設定は正しい**
   - プロジェクトID: `amuse-app-template` ✓
   - ロケーション: `us-central1` ✓
   - キュー名: `business-date-assessment-queue` ✓
   - キューは存在し、`RUNNING`状態 ✓

2. **環境変数は正しく設定されている**
   - `TASKS_QUEUE`: `business-date-assessment-queue`（フルパスではない）✓
   - `TASKS_LOCATION`: `us-central1` ✓
   - `GCLOUD_PROJECT`: `amuse-app-template` ✓

3. **IAM権限は正しく付与されている**
   - `roles/cloudtasks.enqueuer`が付与されている ✓

4. **パス計算は正しい**
   - 計算される`queuePath`は実際のキューの`name`と一致 ✓
   - `taskName`は`queuePath`で始まっている（親子関係が正しい）✓

5. **実装の違い**
   - 正常動作している関数は`task.name`を指定していない ✓
   - エラーが発生している関数は`task.name`を明示的に指定している ✓

### 確認できなかったこと

1. **ログ内の実際の値**
   - `queuePath`や`taskName`の実際の値がログに出力されていない
   - エラーメッセージのみが記録されている

2. **エラーの詳細な原因**
   - `NOT_FOUND`エラーが発生する具体的な理由はログからは特定できない
   - Cloud Tasks APIがどのエンティティを見つけられなかったかは不明

---

## 次のステップ

1. **コード修正による検証**
   - `task.name`の指定を削除して動作確認
   - または、ログ出力を追加して実際の値を確認

2. **Cloud Tasks APIの仕様確認**
   - `task.name`を明示的に指定する場合の要件を確認
   - 公式ドキュメントでの仕様確認
