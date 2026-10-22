# Cloud Tasks createTask NOT_FOUND エラー 根本原因確定

## 調査日時
2026-02-07

## 調査目的
Cloud Tasks createTask の NOT_FOUND の原因が「OIDCで指定しているサービスアカウント(TASKS_INVOKER_SA)が存在しない」ことかどうかを、修正前に確定する。

---

## 調査結果

### 1) 誤SAが実在しないことの確認（最重要）

**実行コマンド**:
```bash
gcloud iam service-accounts describe "tasks-invoker@amuse-app-template-cloudTask.iam.gserviceaccount.com" \
  --project="amuse-app-template"
```

**実行結果**:
```
ERROR: (gcloud.iam.service-accounts.describe) NOT_FOUND: Unknown service account.
```

**確認結果**: 
- ✗ 誤SA（`tasks-invoker@amuse-app-template-cloudTask.iam.gserviceaccount.com`）は存在しない ✓

---

### 2) 正SAが実在することの確認

**実行コマンド**:
```bash
gcloud iam service-accounts describe "tasks-invoker@amuse-app-template.iam.gserviceaccount.com" \
  --project="amuse-app-template"
```

**実行結果**:
```
displayName: Cloud Tasks Invoker
email: tasks-invoker@amuse-app-template.iam.gserviceaccount.com
etag: MDEwMjE5MjA=
name: projects/amuse-app-template/serviceAccounts/tasks-invoker@amuse-app-template.iam.gserviceaccount.com
oauth2ClientId: '107739812402582967766'
projectId: amuse-app-template
uniqueId: '107739812402582967766'
```

**確認結果**: 
- ✓ 正SA（`tasks-invoker@amuse-app-template.iam.gserviceaccount.com`）は存在する ✓

---

### 3) 現在 weeklyplanner に入っている環境変数 TASKS_INVOKER_SA の値を確認（証拠化）

**実行コマンド**:
```bash
gcloud run services describe weeklyplanner \
  --project="amuse-app-template" --region="us-central1" \
  --format=json | python3 -c "..."
```

**実行結果**:
```
TASKS_INVOKER_SA=tasks-invoker@amuse-app-template-cloudTask.iam.gserviceaccount.com
```

**確認結果**: 
- ✓ 現在設定されている値は誤SA（`tasks-invoker@amuse-app-template-cloudTask.iam.gserviceaccount.com`）✓
- ✓ 証拠化完了 ✓

---

### 4) OIDCなしタスク作成が成功すること（キュー・APIが正常である証明）

**実行コマンド**:
```bash
TS=$(date -u +"%Y%m%d%H%M%S")
TASK_ID="nooidc_confirm_${TS}"
gcloud tasks create-http-task "${TASK_ID}" \
  --project="amuse-app-template" \
  --location="us-central1" \
  --queue="business-date-assessment-queue" \
  --url="https://amuse-app-template-us-central1.cloudfunctions.net/openAssessmentTask" \
  --method=POST \
  --header="Content-Type:application/json" \
  --body-content='{"action":"open_assessment","intendedBusinessDateKey":"2099-01-02","scheduledAt":"2099-01-02T00:00:00.000Z"}'
```

**実行結果**:
```
TASK_ID=nooidc_confirm_20260207063115
Created task [projects/amuse-app-template/locations/us-central1/queues/business-date-assessment-queue/tasks/nooidc_confirm_20260207063115].
```

**確認結果**: 
- ✓ OIDCなしではタスク作成が成功 ✓
- ✓ キュー・APIは正常であることを証明 ✓

---

### 5) OIDCあり(誤SA)で失敗することの再現（原因切り分け）

**実行コマンド**:
```bash
TS=$(date -u +"%Y%m%d%H%M%S")
TASK_ID="oidc_wrongsa_${TS}"
gcloud tasks create-http-task "${TASK_ID}" \
  --project="amuse-app-template" \
  --location="us-central1" \
  --queue="business-date-assessment-queue" \
  --url="https://amuse-app-template-us-central1.cloudfunctions.net/openAssessmentTask" \
  --method=POST \
  --header="Content-Type:application/json" \
  --body-content='{"action":"open_assessment","intendedBusinessDateKey":"2099-01-02","scheduledAt":"2099-01-02T00:00:00.000Z"}' \
  --oidc-service-account-email="tasks-invoker@amuse-app-template-cloudTask.iam.gserviceaccount.com" \
  --oidc-token-audience="https://amuse-app-template-us-central1.cloudfunctions.net/openAssessmentTask"
```

**実行結果**:
```
TASK_ID=oidc_wrongsa_20260207063121
ERROR: (gcloud.tasks.create-http-task) NOT_FOUND: Requested entity was not found.
```

**確認結果**: 
- ✗ OIDCあり（誤SA指定）ではタスク作成が失敗 ✓
- ✓ エラーメッセージは「NOT_FOUND: Requested entity was not found」✓
- ✓ weeklyPlannerで発生しているエラーと同じ ✓

---

### 6) OIDCあり(正SA)で成功することの確認（これが通れば原因確定）

**実行コマンド**:
```bash
TS=$(date -u +"%Y%m%d%H%M%S")
TASK_ID="oidc_correctsa_${TS}"
gcloud tasks create-http-task "${TASK_ID}" \
  --project="amuse-app-template" \
  --location="us-central1" \
  --queue="business-date-assessment-queue" \
  --url="https://amuse-app-template-us-central1.cloudfunctions.net/openAssessmentTask" \
  --method=POST \
  --header="Content-Type:application/json" \
  --body-content='{"action":"open_assessment","intendedBusinessDateKey":"2099-01-02","scheduledAt":"2099-01-02T00:00:00.000Z"}' \
  --oidc-service-account-email="tasks-invoker@amuse-app-template.iam.gserviceaccount.com" \
  --oidc-token-audience="https://amuse-app-template-us-central1.cloudfunctions.net/openAssessmentTask"
```

**実行結果**:
```
TASK_ID=oidc_correctsa_20260207063128
Created task [projects/amuse-app-template/locations/us-central1/queues/business-date-assessment-queue/tasks/oidc_correctsa_20260207063128].
```

**確認結果**: 
- ✓ OIDCあり（正SA指定）ではタスク作成が成功 ✓
- ✓ 原因確定 ✓

---

## 原因確定

### 確認条件のチェック

| 条件 | 期待値 | 実際の結果 | 判定 |
|------|--------|-----------|------|
| 1) 誤SAが存在しない | NOT_FOUND | NOT_FOUND | ✓ |
| 2) 正SAが存在する | OK | OK | ✓ |
| 4) OIDCなしで成功 | OK | OK | ✓ |
| 5) OIDCあり(誤SA)で失敗 | NOT_FOUND | NOT_FOUND | ✓ |
| 6) OIDCあり(正SA)で成功 | OK | OK | ✓ |

### 結論

**✓ 原因確定: TASKS_INVOKER_SA の誤りが原因**

すべての条件が揃いました。以下が確定しました：

1. **誤SA（`tasks-invoker@amuse-app-template-cloudTask.iam.gserviceaccount.com`）は存在しない**
2. **正SA（`tasks-invoker@amuse-app-template.iam.gserviceaccount.com`）は存在する**
3. **現在設定されている環境変数`TASKS_INVOKER_SA`は誤SA**
4. **OIDCなしではタスク作成が成功（キュー・APIは正常）**
5. **OIDCあり（誤SA指定）ではタスク作成が失敗（NOT_FOUNDエラー）**
6. **OIDCあり（正SA指定）ではタスク作成が成功**

---

## 根本原因

**環境変数`TASKS_INVOKER_SA`に設定されているサービスアカウント名が間違っている**

**現在の値（誤り）**:
```
tasks-invoker@amuse-app-template-cloudTask.iam.gserviceaccount.com
```

**正しい値**:
```
tasks-invoker@amuse-app-template.iam.gserviceaccount.com
```

**違い**: `cloudTask`が含まれている（存在しないサービスアカウント）

---

## 解決方法

環境変数`TASKS_INVOKER_SA`の値を修正する必要があります。

**修正先**: Firebase Functions の環境変数設定（`weeklyPlanner`関数）

**修正内容**:
```
TASKS_INVOKER_SA=tasks-invoker@amuse-app-template.iam.gserviceaccount.com
```

**修正方法**:
- Firebase Console から環境変数を修正
- または、`firebase functions:config:set`コマンドで修正
- または、`.env.amuse-app-template`ファイルを修正して再デプロイ

---

## 追加の確認事項

### 3) 環境変数の確認結果

**現在設定されている値**:
```
TASKS_INVOKER_SA=tasks-invoker@amuse-app-template-cloudTask.iam.gserviceaccount.com
```

**証拠化完了**: 
- ✓ 現在の設定値が誤SAであることを確認 ✓
- ✓ これが原因であることを確定 ✓

---

## まとめ

### 確定した事実

1. **誤SAは存在しない** → `NOT_FOUND`エラー
2. **正SAは存在する** → タスク作成が成功
3. **現在の環境変数は誤SA** → これが原因
4. **OIDCなしでは成功** → キュー・APIは正常
5. **OIDCあり（誤SA）では失敗** → 同じエラーが再現
6. **OIDCあり（正SA）では成功** → 原因確定

### 次のステップ

1. **環境変数`TASKS_INVOKER_SA`を修正**
   - 現在: `tasks-invoker@amuse-app-template-cloudTask.iam.gserviceaccount.com`
   - 修正後: `tasks-invoker@amuse-app-template.iam.gserviceaccount.com`

2. **修正後の動作確認**
   - `weeklyPlanner`を実行してタスク作成が成功することを確認

3. **修正方法の選択**
   - Firebase Console から修正
   - または、`firebase functions:config:set`コマンドで修正
   - または、`.env.amuse-app-template`ファイルを修正して再デプロイ
