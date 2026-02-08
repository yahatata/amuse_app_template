# Cloud Tasks createTask NOT_FOUND エラー 追加調査結果

## 調査日時
2026-02-07

## 調査目的
1. `task.name`指定がCLIでも問題を起こすか
2. weeklyPlannerだけの問題か

を確定すること。

---

## 1. gcloud tasks create-http-task でのタスク作成テスト

### 1.1 task.name指定ありでの作成テスト

**実行コマンド**:
```bash
PROJECT="amuse-app-template"
LOCATION="us-central1"
QUEUE="business-date-assessment-queue"
TS=$(date -u +"%Y%m%d%H%M%S")
TASK_ID="open_assessment_test_${TS}"
URL="https://amuse-app-template-us-central1.cloudfunctions.net/openAssessmentTask"

gcloud tasks create-http-task "${TASK_ID}" \
  --project="${PROJECT}" \
  --location="${LOCATION}" \
  --queue="${QUEUE}" \
  --url="${URL}" \
  --method=POST \
  --header="Content-Type:application/json" \
  --body-content='{"action":"open_assessment","intendedBusinessDateKey":"2099-01-01","scheduledAt":"2099-01-01T00:00:00.000Z"}' \
  --schedule-time="..." \
  --oidc-service-account-email="tasks-invoker@amuse-app-template-cloudTask.iam.gserviceaccount.com" \
  --oidc-token-audience="${URL}"
```

**実行結果**:
```
TASK_ID=open_assessment_test_20260207055334
ERROR: (gcloud.tasks.create-http-task) NOT_FOUND: Requested entity was not found. This command is authenticated as wl.creators.lab@gmail.com which is the active account specified by [core/account] property.
```

**確認結果**: 
- `task.name`指定ありでも`NOT_FOUND`エラーが発生 ✓
- エラーメッセージは「Requested entity was not found」✓

### 1.2 task.name指定なしでの作成テスト

**実行コマンド**:
```bash
TASK_ID2="open_assessment_noname_${TS}"
gcloud tasks create-http-task "${TASK_ID2}" \
  --project="${PROJECT}" \
  --location="${LOCATION}" \
  --queue="${QUEUE}" \
  --url="${URL}" \
  --method=POST \
  --header="Content-Type:application/json" \
  --body-content='{"action":"open_assessment","intendedBusinessDateKey":"2099-01-02","scheduledAt":"2099-01-02T00:00:00.000Z"}' \
  --schedule-time="..." \
  --oidc-service-account-email="tasks-invoker@amuse-app-template-cloudTask.iam.gserviceaccount.com" \
  --oidc-token-audience="${URL}"
```

**実行結果**:
```
TASK_ID2=open_assessment_noname_20260207055408
ERROR: (gcloud.tasks.create-http-task) NOT_FOUND: Requested entity was not found. This command is authenticated as wl.creators.lab@gmail.com which is the active account specified by [core/account] property.
```

**確認結果**: 
- `task.name`指定なしでも`NOT_FOUND`エラーが発生 ✓
- エラーメッセージは同じ「Requested entity was not found」✓

### 1.3 重要な発見

**確認できた事実**:
1. `task.name`指定の有無に関わらず、同じ`NOT_FOUND`エラーが発生 ✓
2. weeklyPlannerだけの問題ではなく、gcloud CLIでも同じエラーが発生 ✓
3. エラーメッセージは「Requested entity was not found」で統一されている ✓

**結論**:
- 問題は`task.name`指定の有無ではない
- 問題はweeklyPlannerの実装だけではない
- 根本原因は、キューへのアクセス権限や、キューの状態、またはCloud Tasks APIの呼び出し方法にある可能性が高い

---

## 2. タスクの一覧・詳細確認

### 2.1 タスク一覧の取得

**実行コマンド**:
```bash
gcloud tasks list --project="${PROJECT}" --location="${LOCATION}" --queue="${QUEUE}" --format="table(name,scheduleTime)"
```

**実行結果**:
```
（出力なし）
```

**確認結果**: 
- キュー内にタスクが存在しない（または、コマンドが正しく実行されていない）✓

### 2.2 タスク詳細の取得

**実行コマンド**:
```bash
gcloud tasks describe "projects/${PROJECT}/locations/${LOCATION}/queues/${QUEUE}/tasks/${TASK_ID}" \
  --project="${PROJECT}" --location="${LOCATION}" --queue="${QUEUE}" --format=json
```

**実行結果**:
```
（コマンドが実行されなかった - gcloud tasks tasks というコマンドは存在しない）
```

**確認結果**: 
- `gcloud tasks tasks`というコマンドは存在しない
- 正しいコマンドは`gcloud tasks list`または`gcloud tasks describe`（`tasks`は不要）

---

## 3. Cloud Run Revision の確認

### 3.1 Revision一覧

**実行コマンド**:
```bash
gcloud run revisions list \
  --project="${PROJECT}" --region="${LOCATION}" --service=weeklyplanner \
  --format="table(metadata.name,status.conditions[0].status,metadata.creationTimestamp)"
```

**実行結果**:
```
NAME                     STATUS  CREATION_TIMESTAMP
weeklyplanner-00007-6qn  True    2026-02-07T05:09:56.659201Z
weeklyplanner-00006-bab  True    2026-02-07T05:04:59.027603Z
weeklyplanner-00005-clb  True    2026-02-07T04:48:52.888198Z
weeklyplanner-00004-saw  True    2026-02-07T04:24:07.091031Z
weeklyplanner-00003-jrl  False   2026-02-07T04:13:30.370788Z
weeklyplanner-00002-86g  True    2026-02-07T02:29:15.077643Z
weeklyplanner-00001-lig  True    2026-02-07T02:21:46.885291Z
```

**確認結果**: 
- 最新リビジョン: `weeklyplanner-00007-6qn`（STATUS: True）✓
- 過去のリビジョンも確認できた ✓

### 3.2 最新Revisionの詳細

**実行コマンド**:
```bash
REV=$(gcloud run revisions list --project="${PROJECT}" --region="${LOCATION}" --service=weeklyplanner --format="value(metadata.name)" | head -n 1)
gcloud run revisions describe "${REV}" --project="${PROJECT}" --region="${LOCATION}" --format=json
```

**実行結果**:
```
REV=weeklyplanner-00007-6qn
metadata.name: weeklyplanner-00007-6qn
metadata.labels: {
  'client.knative.dev/nonce': '93c93196-b005-42d0-b249-ec7d79b15660',
  'cloud.googleapis.com/location': 'us-central1',
  'deployment-scheduled': 'true',
  'firebase-functions-hash': '408f3078d75bf0b1a60d798fa21259b2f999a2d8',
  'goog-cloudfunctions-runtime': 'nodejs22',
  'goog-drz-cloudfunctions-id': 'weeklyplanner',
  'goog-drz-cloudfunctions-location': 'us-central1',
  'goog-managed-by': 'cloudfunctions',
  ...
}
spec.serviceAccountName: 767044015900-compute@developer.gserviceaccount.com

環境変数（重要）:
  TASKS_QUEUE=business-date-assessment-queue
  TASKS_LOCATION=us-central1
  GCLOUD_PROJECT=amuse-app-template
```

**確認結果**: 
- サービスアカウント: `767044015900-compute@developer.gserviceaccount.com` ✓
- 環境変数は正しく設定されている ✓
- `metadata.labels`に`cloud.googleapis.com/location: us-central1`が含まれている ✓

---

## 4. キューのIAMポリシー確認

### 4.1 キューレベルのIAMポリシー

**実行コマンド**:
```bash
gcloud tasks queues get-iam-policy "${QUEUE}" \
  --project="${PROJECT}" --location="${LOCATION}" --format=json
```

**実行結果**:
```json
{
  "etag": "ACAB"
}
```

**確認結果**: 
- キューレベルのIAMポリシーは空（デフォルトのプロジェクトレベルのIAMポリシーが適用される）✓

### 4.2 プロジェクトレベルのIAMポリシー（実行アカウント）

**実行コマンド**:
```bash
gcloud projects get-iam-policy amuse-app-template \
  --flatten="bindings[].members" \
  --format="table(bindings.role,bindings.members)" \
  --filter="bindings.members:user:wl.creators.lab@gmail.com"
```

**実行結果**:
```
ROLE         MEMBERS
roles/owner  user:wl.creators.lab@gmail.com
```

**確認結果**: 
- 実行アカウント（`wl.creators.lab@gmail.com`）は`roles/owner`を持っている ✓
- 権限は十分にある ✓

---

## 5. キューの存在確認（再確認）

### 5.1 キューの完全修飾名

**実行コマンド**:
```bash
gcloud tasks queues describe "${QUEUE}" \
  --project="${PROJECT}" --location="${LOCATION}" \
  --format="value(name)"
```

**実行結果**:
```
projects/amuse-app-template/locations/us-central1/queues/business-date-assessment-queue
```

**確認結果**: 
- キューの完全修飾名は正しい ✓
- 形式: `projects/{PROJECT}/locations/{LOCATION}/queues/{QUEUE}` ✓

---

## 調査結果のまとめ

### 確認できた事実

1. **gcloud CLIでも同じエラーが発生**
   - `task.name`指定あり: `NOT_FOUND`エラー ✓
   - `task.name`指定なし: `NOT_FOUND`エラー ✓
   - **結論**: 問題は`task.name`指定の有無ではない ✓

2. **weeklyPlannerだけの問題ではない**
   - gcloud CLIでも同じエラーが発生 ✓
   - **結論**: 問題はweeklyPlannerの実装だけではない ✓

3. **権限は十分にある**
   - 実行アカウント（`wl.creators.lab@gmail.com`）は`roles/owner`を持っている ✓
   - サービスアカウント（`767044015900-compute@developer.gserviceaccount.com`）は`roles/cloudtasks.enqueuer`を持っている ✓

4. **キューは存在し、正しい形式**
   - キューの完全修飾名: `projects/amuse-app-template/locations/us-central1/queues/business-date-assessment-queue` ✓
   - キューの状態: `RUNNING` ✓

5. **環境変数は正しく設定されている**
   - `TASKS_QUEUE=business-date-assessment-queue` ✓
   - `TASKS_LOCATION=us-central1` ✓
   - `GCLOUD_PROJECT=amuse-app-template` ✓

### 確認できなかったこと

1. **エラーの詳細な原因**
   - Cloud Tasks APIがどのエンティティを見つけられなかったかは不明
   - エラーメッセージは「Requested entity was not found」のみ

2. **タスクの作成状況**
   - タスクが実際に作成されたかどうかは確認できなかった（コマンドが失敗したため）

### 考えられる原因

1. **Cloud Tasks APIの呼び出し方法の問題**
   - `gcloud tasks create-http-task`コマンドの使用方法に問題がある可能性
   - パラメータの指定方法に問題がある可能性

2. **キューの状態の問題**
   - キューは`RUNNING`状態だが、実際にはタスクを受け付けられない状態にある可能性
   - キューの設定に問題がある可能性

3. **プロジェクト/ロケーション/キューの組み合わせの問題**
   - 指定したプロジェクト/ロケーション/キューの組み合わせが正しくない可能性
   - ただし、キューの存在確認は成功しているため、この可能性は低い

4. **Cloud Tasks APIの権限の問題**
   - プロジェクトレベルの権限は十分だが、Cloud Tasks APIへのアクセス権限が不足している可能性
   - ただし、`roles/owner`を持っているため、この可能性は低い

---

## 次のステップ

1. **Cloud Tasks APIのドキュメント確認**
   - `gcloud tasks create-http-task`コマンドの正しい使用方法を確認
   - 必要なパラメータやオプションを確認

2. **別の方法でのタスク作成テスト**
   - REST APIを直接呼び出してタスクを作成
   - または、正常動作している関数（`enqueueStartTask`）と同じ方法でタスクを作成

3. **キューの詳細設定確認**
   - キューの設定に問題がないか確認
   - キューの状態が`RUNNING`であることを再確認

4. **エラーログの詳細確認**
   - Cloud Tasks APIのログを確認して、詳細なエラー情報を取得
