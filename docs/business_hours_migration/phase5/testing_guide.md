# Phase5: 自動開閉店（補助機能） - 認定処理 テストガイド

## 確認工程の概要

提案されている確認方法で問題ありません。以下の2つの工程で確認を行います：

1. **手動実行テスト**: `closeAssessmentTask`と`openAssessmentTask`を直接HTTPリクエストで実行し、適切にデータが書き換わるかを確認
2. **統合テスト**: 環境変数を書き換えて`weeklyPlanner`を任意の時間に動かし、Cloud Tasksが作成され、適切に関数を起動してデータが書き換えられるかを確認

---

## 工程1: 手動実行テスト

### 1.1 事前準備

#### 1.1.1 Firestoreの状態確認

**確認対象**: `storeMeta/currentBusinessDay`ドキュメント

**確認方法**:
1. Firebase Console → Firestore → `storeMeta/currentBusinessDay`を開く
2. 以下のフィールドを確認：
   - `status`: `'running'`または`'closed'`
   - `currentBusinessDateKey`: 現在の営業日キー（例: `'2025-01-15'`）
   - `lastClosedBusinessDateKey`: 最後に閉店した営業日キー（例: `'2025-01-14'`）
   - `closeAssessment`: `null`または既存の値
   - `openAssessment`: `null`または既存の値
   - `lastError`: `null`または既存の値

**適切なデータ（テスト前）**:
```json
{
  "status": "running",
  "currentBusinessDateKey": "2025-01-15",
  "lastClosedBusinessDateKey": "2025-01-14",
  "closeAssessment": null,
  "openAssessment": null,
  "lastError": null
}
```

#### 1.1.2 `activeStays`コレクションの確認（閉店認定テスト用）

**確認方法**:
1. Firebase Console → Firestore → `activeStays`コレクションを開く
2. `isActive == true`のドキュメントが存在するか確認

**テストシナリオ**:
- **シナリオA**: `isActive == true`のドキュメントが存在する場合（`blockers`に`'activeStaysNotEmpty'`が追加されることを確認）
- **シナリオB**: `isActive == true`のドキュメントが存在しない場合（`blockers`が空配列であることを確認）

---

### 1.2 `closeAssessmentTask`の手動実行

#### 1.2.1 実行方法

**方法1: curlコマンド（推奨）**

```bash

CURRENT_DATE=$(date -u +"%Y-%m-%d" -v+9H 2>/dev/null || date -u -d "+9 hours" +"%Y-%m-%d" 2>/dev/null || date +"%Y-%m-%d")
SCHEDULED_AT=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z" -v+9H 2>/dev/null || date -u -d "+9 hours" +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%S.000Z")

PAYLOAD=$(cat <<EOF
{
  "action": "close_assessment",
  "intendedBusinessDateKey": "${CURRENT_DATE}",
  "scheduledAt": "${SCHEDULED_AT}"
}
EOF
)


curl -X POST \
  https://us-central1-amuse-app-template.cloudfunctions.net/closeAssessmentTask \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}"
```

**方法2: PostmanやHTTPクライアントツール**

- **URL**: `https://us-central1-amuse-app-template.cloudfunctions.net/closeAssessmentTask`
- **Method**: `POST`
- **Headers**:
  - `Content-Type: application/json`
- **Body** (JSON):
```json
{
  "action": "close_assessment",
  "intendedBusinessDateKey": "2025-01-15",
  "scheduledAt": "2025-01-15T23:00:00.000Z"
}
```

**注意**: `intendedBusinessDateKey`は現在の日付（JST）または前日の日付（YYYY-MM-DD形式）を指定してください。

#### 1.2.2 テストシナリオ

##### シナリオ1: 閉店時間超過（`status === 'running'`かつ`currentBusinessDateKey === intendedBusinessDateKey`）

**前提条件**:
- `storeMeta/currentBusinessDay.status` = `'running'`
- `storeMeta/currentBusinessDay.currentBusinessDateKey` = `'2025-01-15'`（例）
- `intendedBusinessDateKey` = `'2025-01-15'`（同じ日付）

**実行**:
```bash
curl -X POST \
  https://us-central1-amuse-app-template.cloudfunctions.net/closeAssessmentTask \
  -H "Content-Type: application/json" \
  -d '{
    "action": "close_assessment",
    "intendedBusinessDateKey": "2025-01-15",
    "scheduledAt": "2025-01-15T23:00:00.000Z"
  }'
```

**適切なデータ（実行後）**:
```json
{
  "closeAssessment": {
    "idempotencyKey": "close_assessment_2025-01-15_2025-01-15T23:00:00.000Z",
    "intendedBusinessDateKey": "2025-01-15",
    "decidedAt": "2025-01-15T14:00:00.000Z",  // Timestamp
    "result": "needs_manual_close",
    "blockers": ["activeStaysNotEmpty"],  // activeStaysが存在する場合
    "source": "task",
    "scheduledAt": "2025-01-15T23:00:00.000Z"
  }
}
```

**確認ポイント**:
- [ ] `closeAssessment.result` = `'needs_manual_close'`
- [ ] `closeAssessment.blockers`に`'activeStaysNotEmpty'`が含まれる（`activeStays`が存在する場合）
- [ ] `closeAssessment.idempotencyKey`が正しく生成されている
- [ ] `closeAssessment.decidedAt`が現在時刻（JST）に近い値である

##### シナリオ2: 既に閉店済み（`status === 'closed'`かつ`lastClosedBusinessDateKey === intendedBusinessDateKey`）

**前提条件**:
- `storeMeta/currentBusinessDay.status` = `'closed'`
- `storeMeta/currentBusinessDay.lastClosedBusinessDateKey` = `'2025-01-15'`
- `intendedBusinessDateKey` = `'2025-01-15'`（同じ日付）

**実行**:
```bash
curl -X POST \
  https://us-central1-amuse-app-template.cloudfunctions.net/closeAssessmentTask \
  -H "Content-Type: application/json" \
  -d '{
    "action": "close_assessment",
    "intendedBusinessDateKey": "2025-01-15",
    "scheduledAt": "2025-01-15T23:00:00.000Z"
  }'
```

**適切なデータ（実行後）**:
```json
{
  "closeAssessment": {
    "idempotencyKey": "close_assessment_2025-01-15_2025-01-15T23:00:00.000Z",
    "intendedBusinessDateKey": "2025-01-15",
    "decidedAt": "2025-01-15T14:00:00.000Z",
    "result": "already_closed",
    "blockers": [],
    "source": "task",
    "scheduledAt": "2025-01-15T23:00:00.000Z"
  }
}
```

**確認ポイント**:
- [ ] `closeAssessment.result` = `'already_closed'`
- [ ] `closeAssessment.blockers` = `[]`

##### シナリオ3: 次営業日が開始している（`status === 'running'`かつ`currentBusinessDateKey !== intendedBusinessDateKey`）

**前提条件**:
- `storeMeta/currentBusinessDay.status` = `'running'`
- `storeMeta/currentBusinessDay.currentBusinessDateKey` = `'2025-01-16'`（次の日）
- `intendedBusinessDateKey` = `'2025-01-15'`（前の日）

**実行**:
```bash
curl -X POST \
  https://us-central1-amuse-app-template.cloudfunctions.net/closeAssessmentTask \
  -H "Content-Type: application/json" \
  -d '{
    "action": "close_assessment",
    "intendedBusinessDateKey": "2025-01-15",
    "scheduledAt": "2025-01-15T23:00:00.000Z"
  }'
```

**適切なデータ（実行後）**:
```json
{
  "closeAssessment": {
    "idempotencyKey": "close_assessment_2025-01-15_2025-01-15T23:00:00.000Z",
    "intendedBusinessDateKey": "2025-01-15",
    "decidedAt": "2025-01-15T14:00:00.000Z",
    "result": "next_day_started",
    "blockers": [],
    "source": "task",
    "scheduledAt": "2025-01-15T23:00:00.000Z"
  }
}
```

**確認ポイント**:
- [ ] `closeAssessment.result` = `'next_day_started'`
- [ ] `closeAssessment.blockers` = `[]`

##### シナリオ4: 許容範囲外（`intendedBusinessDateKey`が当日または前日以外）

**前提条件**:
- 現在の日付（JST） = `2025-01-15`
- `intendedBusinessDateKey` = `'2025-01-13'`（2日前）

**実行**:
```bash
curl -X POST \
  https://us-central1-amuse-app-template.cloudfunctions.net/closeAssessmentTask \
  -H "Content-Type: application/json" \
  -d '{
    "action": "close_assessment",
    "intendedBusinessDateKey": "2025-01-13",
    "scheduledAt": "2025-01-15T23:00:00.000Z"
  }'
```

**適切なデータ（実行後）**:
```json
{
  "closeAssessment": {
    "idempotencyKey": "close_assessment_2025-01-13_2025-01-15T23:00:00.000Z",
    "intendedBusinessDateKey": "2025-01-13",
    "decidedAt": "2025-01-15T14:00:00.000Z",
    "result": "skipped",
    "blockers": ["date_out_of_range"],
    "source": "task",
    "scheduledAt": "2025-01-15T23:00:00.000Z"
  }
}
```

**確認ポイント**:
- [ ] `closeAssessment.result` = `'skipped'`
- [ ] `closeAssessment.blockers`に`'date_out_of_range'`が含まれる

##### シナリオ5: 冪等性チェック（同じ`idempotencyKey`で再実行）

**前提条件**:
- シナリオ1を実行済み（`closeAssessment.idempotencyKey`が存在する）

**実行**:
```bash
# 同じpayloadで再実行
curl -X POST \
  https://us-central1-amuse-app-template.cloudfunctions.net/closeAssessmentTask \
  -H "Content-Type: application/json" \
  -d '{
    "action": "close_assessment",
    "intendedBusinessDateKey": "2025-01-15",
    "scheduledAt": "2025-01-15T23:00:00.000Z"
  }'
```

**適切なデータ（実行後）**:
- `closeAssessment`の値が変更されない（no-op）
- ログに「既に同じidempotencyKeyで更新済みです」が記録される

**確認ポイント**:
- [ ] `closeAssessment`の値が変更されない
- [ ] 関数のログに「既に同じidempotencyKeyで更新済みです」が記録される

---

### 1.3 `openAssessmentTask`の手動実行

#### 1.3.1 実行方法

**curlコマンド**:
```bash
CURRENT_DATE=$(date -u +"%Y-%m-%d" -v+9H 2>/dev/null || date -u -d "+9 hours" +"%Y-%m-%d" 2>/dev/null || date +"%Y-%m-%d")
SCHEDULED_AT=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z" -v+9H 2>/dev/null || date -u -d "+9 hours" +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%S.000Z")

PAYLOAD=$(cat <<EOF
{
  "action": "open_assessment",
  "intendedBusinessDateKey": "${CURRENT_DATE}",
  "scheduledAt": "${SCHEDULED_AT}"
}
EOF
)

curl -X POST \
  https://us-central1-amuse-app-template.cloudfunctions.net/openAssessmentTask \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}"
```

#### 1.3.2 テストシナリオ

##### シナリオ1: 開店条件を満たしている（`status === 'closed'`かつ`lastClosedBusinessDateKey`が存在し、`lastError === null`）

**前提条件**:
- `storeMeta/currentBusinessDay.status` = `'closed'`
- `storeMeta/currentBusinessDay.lastClosedBusinessDateKey` = `'2025-01-14'`（存在する）
- `storeMeta/currentBusinessDay.lastError` = `null`
- `intendedBusinessDateKey` = `'2025-01-15'`（当日または翌日）

**実行**:
```bash
curl -X POST \
  https://us-central1-amuse-app-template.cloudfunctions.net/openAssessmentTask \
  -H "Content-Type: application/json" \
  -d '{
    "action": "open_assessment",
    "intendedBusinessDateKey": "2025-01-15",
    "scheduledAt": "2025-01-15T10:00:00.000Z"
  }'
```

**適切なデータ（実行後）**:
```json
{
  "openAssessment": {
    "idempotencyKey": "open_assessment_2025-01-15_2025-01-15T10:00:00.000Z",
    "intendedBusinessDateKey": "2025-01-15",
    "decidedAt": "2025-01-15T19:00:00.000Z",
    "result": "ready_to_open",
    "blockers": [],
    "source": "task",
    "scheduledAt": "2025-01-15T10:00:00.000Z"
  }
}
```

**確認ポイント**:
- [ ] `openAssessment.result` = `'ready_to_open'`
- [ ] `openAssessment.blockers` = `[]`

##### シナリオ2: 手動開店が必要（`lastClosedBusinessDateKey`が存在しない、または`lastError !== null`）

**前提条件**:
- `storeMeta/currentBusinessDay.status` = `'closed'`
- `storeMeta/currentBusinessDay.lastClosedBusinessDateKey` = `null`（存在しない）
- または`storeMeta/currentBusinessDay.lastError` ≠ `null`

**実行**:
```bash
curl -X POST \
  https://us-central1-amuse-app-template.cloudfunctions.net/openAssessmentTask \
  -H "Content-Type: application/json" \
  -d '{
    "action": "open_assessment",
    "intendedBusinessDateKey": "2025-01-15",
    "scheduledAt": "2025-01-15T10:00:00.000Z"
  }'
```

**適切なデータ（実行後）**:
```json
{
  "openAssessment": {
    "idempotencyKey": "open_assessment_2025-01-15_2025-01-15T10:00:00.000Z",
    "intendedBusinessDateKey": "2025-01-15",
    "decidedAt": "2025-01-15T19:00:00.000Z",
    "result": "needs_manual_open",
    "blockers": ["lastClosedBusinessDateKey_missing"],  // または ["lastError_exists"]
    "source": "task",
    "scheduledAt": "2025-01-15T10:00:00.000Z"
  }
}
```

**確認ポイント**:
- [ ] `openAssessment.result` = `'needs_manual_open'`
- [ ] `openAssessment.blockers`に`'lastClosedBusinessDateKey_missing'`または`'lastError_exists'`が含まれる

##### シナリオ3: 既に営業中（`status === 'running'`かつ`currentBusinessDateKey === intendedBusinessDateKey`）

**前提条件**:
- `storeMeta/currentBusinessDay.status` = `'running'`
- `storeMeta/currentBusinessDay.currentBusinessDateKey` = `'2025-01-15'`
- `intendedBusinessDateKey` = `'2025-01-15'`（同じ日付）

**実行**:
```bash
curl -X POST \
  https://us-central1-amuse-app-template.cloudfunctions.net/openAssessmentTask \
  -H "Content-Type: application/json" \
  -d '{
    "action": "open_assessment",
    "intendedBusinessDateKey": "2025-01-15",
    "scheduledAt": "2025-01-15T10:00:00.000Z"
  }'
```

**適切なデータ（実行後）**:
```json
{
  "openAssessment": {
    "idempotencyKey": "open_assessment_2025-01-15_2025-01-15T10:00:00.000Z",
    "intendedBusinessDateKey": "2025-01-15",
    "decidedAt": "2025-01-15T19:00:00.000Z",
    "result": "already_running",
    "blockers": [],
    "source": "task",
    "scheduledAt": "2025-01-15T10:00:00.000Z"
  }
}
```

**確認ポイント**:
- [ ] `openAssessment.result` = `'already_running'`
- [ ] `openAssessment.blockers` = `[]`

##### シナリオ4: 営業中に別日付の開店が走ることを防止（`status === 'running'`かつ`currentBusinessDateKey !== intendedBusinessDateKey`）

**前提条件**:
- `storeMeta/currentBusinessDay.status` = `'running'`
- `storeMeta/currentBusinessDay.currentBusinessDateKey` = `'2025-01-14'`
- `intendedBusinessDateKey` = `'2025-01-15'`（別の日付）

**実行**:
```bash
curl -X POST \
  https://us-central1-amuse-app-template.cloudfunctions.net/openAssessmentTask \
  -H "Content-Type: application/json" \
  -d '{
    "action": "open_assessment",
    "intendedBusinessDateKey": "2025-01-15",
    "scheduledAt": "2025-01-15T10:00:00.000Z"
  }'
```

**適切なデータ（実行後）**:
```json
{
  "openAssessment": {
    "idempotencyKey": "open_assessment_2025-01-15_2025-01-15T10:00:00.000Z",
    "intendedBusinessDateKey": "2025-01-15",
    "decidedAt": "2025-01-15T19:00:00.000Z",
    "result": "skipped",
    "blockers": ["already_running_different_date"],
    "source": "task",
    "scheduledAt": "2025-01-15T10:00:00.000Z"
  }
}
```

**確認ポイント**:
- [ ] `openAssessment.result` = `'skipped'`
- [ ] `openAssessment.blockers`に`'already_running_different_date'`が含まれる

##### シナリオ5: 冪等性チェック（同じ`idempotencyKey`で再実行）

**前提条件**:
- シナリオ1を実行済み（`openAssessment.idempotencyKey`が存在する）

**実行**:
```bash
# 同じpayloadで再実行
curl -X POST \
  https://us-central1-amuse-app-template.cloudfunctions.net/openAssessmentTask \
  -H "Content-Type: application/json" \
  -d '{
    "action": "open_assessment",
    "intendedBusinessDateKey": "2025-01-15",
    "scheduledAt": "2025-01-15T10:00:00.000Z"
  }'
```

**適切なデータ（実行後）**:
- `openAssessment`の値が変更されない（no-op）
- ログに「既に同じidempotencyKeyで更新済みです」が記録される

**確認ポイント**:
- [ ] `openAssessment`の値が変更されない
- [ ] 関数のログに「既に同じidempotencyKeyで更新済みです」が記録される

---

## 工程2: 統合テスト（weeklyPlanner → Cloud Tasks → 認定処理）

### 2.1 事前準備

#### 2.1.1 環境変数の一時的な変更

**目的**: `weeklyPlanner`を任意の時間に実行できるようにする

**方法**: Firebase Consoleで`weeklyPlanner`関数の環境変数を一時的に変更

**変更内容**:
- `ENABLE_AUTO_OPEN_CLOSE` = `true`（既に設定済みのはず）
- その他の環境変数は既存の値を維持

**注意**: テスト後は元の値に戻してください。

#### 2.1.2 Cloud Schedulerの手動実行

**方法1: Firebase Consoleから実行**

1. Firebase Console → Functions → `weeklyPlanner`を開く
2. 「トリガー」タブを開く
3. Cloud Schedulerのジョブ名をクリック
4. Cloud Schedulerコンソールで「今すぐ実行」をクリック

**方法2: gcloud CLIから実行**

```bash
# Cloud Schedulerジョブ名を確認
gcloud scheduler jobs list --location=us-central1 | grep weeklyPlanner

# 手動実行
gcloud scheduler jobs run [JOB_NAME] --location=us-central1
```

**方法3: 関数を直接呼び出す（推奨）**

```bash
# Firebase Functionsのログを確認しながら実行
firebase functions:log --only weeklyPlanner

# 別ターミナルで関数を直接呼び出す（Firebase CLIでは直接呼び出せないため、HTTPリクエストで実行）
# 注意: weeklyPlannerはonSchedule関数のため、直接HTTPリクエストでは実行できません
# Cloud Schedulerから実行する必要があります
```

**推奨方法**: Cloud Schedulerのジョブを手動実行する方法を使用してください。

#### 2.1.3 `businessHoursMonthlyMap`の確認

**確認方法**:
1. Firebase Console → Firestore → `businessHoursMonthlyMap`コレクションを開く
2. 翌週（月〜日）分の月ドキュメントが存在することを確認
3. 各日の`days`マップに`isClosed: false`の日が存在することを確認

**適切なデータ**:
```json
{
  "days": {
    "15": {
      "openMinute": 900,
      "closeMinute": 1500,
      "isClosed": false
    },
    "16": {
      "openMinute": 900,
      "closeMinute": 1500,
      "isClosed": false
    }
    // ... 他の日
  }
}
```

---

### 2.2 `weeklyPlanner`の実行と確認

#### 2.2.1 実行方法

**Cloud Schedulerから手動実行**:
1. Firebase Console → Functions → `weeklyPlanner`を開く
2. 「トリガー」タブを開く
3. Cloud Schedulerのジョブ名をクリック
4. Cloud Schedulerコンソールで「今すぐ実行」をクリック

#### 2.2.2 実行ログの確認

**確認方法**:
```bash
# Firebase Functionsのログを確認
firebase functions:log --only weeklyPlanner

# または、Cloud Functionsのログを確認
gcloud functions logs read weeklyPlanner --region=us-central1 --limit=50
```

**適切なログ出力**:
```
開店認定タスク投入完了: 2025-01-20, taskName: projects/amuse-app-template/locations/asia-northeast1/queues/tournament-queue/tasks/open_assessment_2025-01-20
閉店認定タスク投入完了: 2025-01-20, taskName: projects/amuse-app-template/locations/asia-northeast1/queues/tournament-queue/tasks/close_assessment_2025-01-20
開店認定タスク投入完了: 2025-01-21, taskName: ...
閉店認定タスク投入完了: 2025-01-21, taskName: ...
...
```

**確認ポイント**:
- [ ] 翌週（月〜日）分のタスクが投入されている（最大14個: 開店7個 + 閉店7個）
- [ ] `isClosed: true`の日はタスクが投入されていない
- [ ] エラーが発生していない

#### 2.2.3 Cloud Tasksの確認

**確認方法**:
1. Google Cloud Console → Cloud Tasks → キューを選択（`tournament-queue`）
2. 「タスク」タブを開く
3. 以下のタスクが作成されていることを確認：
   - `open_assessment_YYYY-MM-DD`（開店認定タスク）
   - `close_assessment_YYYY-MM-DD`（閉店認定タスク）

**適切なデータ**:
- タスク名: `open_assessment_2025-01-20`, `close_assessment_2025-01-20`など
- スケジュール時刻: 各日の開店時間の30分前、閉店時間の2時間後（JST基準）
- ペイロード:
```json
{
  "action": "open_assessment",
  "intendedBusinessDateKey": "2025-01-20",
  "scheduledAt": "2025-01-20T10:00:00.000Z"
}
```

**確認ポイント**:
- [ ] タスクが正しく作成されている
- [ ] タスク名が`open_assessment_YYYY-MM-DD`または`close_assessment_YYYY-MM-DD`の形式である
- [ ] スケジュール時刻が正しい（JST基準で計算されている）

---

### 2.3 Cloud Tasksの実行と確認

#### 2.3.1 タスクの手動実行（テスト用）

**方法1: Cloud Tasksコンソールから実行**

1. Google Cloud Console → Cloud Tasks → キューを選択
2. タスクを選択
3. 「今すぐ実行」をクリック

**方法2: gcloud CLIから実行**

```bash
# タスクを手動実行（タスク名を指定）
gcloud tasks run [TASK_NAME] --queue=[QUEUE_NAME] --location=[LOCATION]
```

**注意**: Cloud Tasksは通常、スケジュール時刻になると自動的に実行されますが、テストのため手動実行も可能です。

#### 2.3.2 実行ログの確認

**確認方法**:
```bash
# closeAssessmentTaskのログを確認
firebase functions:log --only closeAssessmentTask

# openAssessmentTaskのログを確認
firebase functions:log --only openAssessmentTask
```

**適切なログ出力**:
```
閉店認定処理でエラーが発生しました: [エラー内容]  # エラーが発生した場合
# または、エラーが発生しなかった場合はログが出力されない（正常終了）
```

#### 2.3.3 Firestoreの確認

**確認方法**:
1. Firebase Console → Firestore → `storeMeta/currentBusinessDay`を開く
2. `closeAssessment`または`openAssessment`フィールドが更新されていることを確認

**適切なデータ（closeAssessment実行後）**:
```json
{
  "closeAssessment": {
    "idempotencyKey": "close_assessment_2025-01-20_2025-01-20T23:00:00.000Z",
    "intendedBusinessDateKey": "2025-01-20",
    "decidedAt": "2025-01-20T14:00:00.000Z",
    "result": "needs_manual_close",  // または "already_closed", "next_day_started", "skipped"
    "blockers": ["activeStaysNotEmpty"],  // または []
    "source": "task",
    "scheduledAt": "2025-01-20T23:00:00.000Z"
  }
}
```

**適切なデータ（openAssessment実行後）**:
```json
{
  "openAssessment": {
    "idempotencyKey": "open_assessment_2025-01-20_2025-01-20T10:00:00.000Z",
    "intendedBusinessDateKey": "2025-01-20",
    "decidedAt": "2025-01-20T19:00:00.000Z",
    "result": "ready_to_open",  // または "needs_manual_open", "already_running", "skipped"
    "blockers": [],  // または ["lastClosedBusinessDateKey_missing"], ["already_running_different_date"]
    "source": "task",
    "scheduledAt": "2025-01-20T10:00:00.000Z"
  }
}
```

**確認ポイント**:
- [ ] `closeAssessment`または`openAssessment`フィールドが更新されている
- [ ] `result`が適切な値である（シナリオに応じて）
- [ ] `blockers`が適切に設定されている
- [ ] `idempotencyKey`が正しく生成されている

---

## 確認チェックリスト

### 工程1: 手動実行テスト

#### closeAssessmentTask
- [ ] シナリオ1: 閉店時間超過 → `result: 'needs_manual_close'`
- [ ] シナリオ2: 既に閉店済み → `result: 'already_closed'`
- [ ] シナリオ3: 次営業日が開始している → `result: 'next_day_started'`
- [ ] シナリオ4: 許容範囲外 → `result: 'skipped'`, `blockers: ['date_out_of_range']`
- [ ] シナリオ5: 冪等性チェック → 値が変更されない

#### openAssessmentTask
- [ ] シナリオ1: 開店条件を満たしている → `result: 'ready_to_open'`
- [ ] シナリオ2: 手動開店が必要 → `result: 'needs_manual_open'`
- [ ] シナリオ3: 既に営業中 → `result: 'already_running'`
- [ ] シナリオ4: 営業中に別日付の開店が走ることを防止 → `result: 'skipped'`, `blockers: ['already_running_different_date']`
- [ ] シナリオ5: 冪等性チェック → 値が変更されない

### 工程2: 統合テスト

- [ ] `weeklyPlanner`が正常に実行される
- [ ] 翌週（月〜日）分のタスクがCloud Tasksに投入される
- [ ] タスクが正しいスケジュール時刻で設定されている
- [ ] Cloud TasksからHTTP Functionsが呼び出される
- [ ] `storeMeta/currentBusinessDay`の`closeAssessment`/`openAssessment`が更新される

---

## トラブルシューティング

### HTTPリクエストが401エラーを返す場合

**原因**: IAM権限が設定されていない

**対処法**:
1. Cloud Runコンソールで`closeAssessmentTask`と`openAssessmentTask`の権限を確認
2. `TASKS_INVOKER_SA`に`roles/run.invoker`が付与されていることを確認

### HTTPリクエストが403エラーを返す場合

**原因**: OIDCトークン認証が失敗している

**対処法**:
1. Cloud Tasksのタスク作成時に`oidcToken`が正しく設定されていることを確認
2. `TASKS_INVOKER_SA`のサービスアカウントが正しいことを確認

### `weeklyPlanner`がタスクを投入しない場合

**原因**: `ENABLE_AUTO_OPEN_CLOSE`が`false`または環境変数が設定されていない

**対処法**:
1. Firebase Consoleで`weeklyPlanner`の環境変数を確認
2. `ENABLE_AUTO_OPEN_CLOSE=true`が設定されていることを確認

### Cloud Tasksが実行されない場合

**原因**: スケジュール時刻が未来である、またはタスクが正しく作成されていない

**対処法**:
1. Cloud Tasksコンソールでタスクのスケジュール時刻を確認
2. テストのため、タスクを手動実行する

---

## まとめ

提案されている確認方法で問題ありません。上記の手順に従って、各シナリオを確認してください。

**確認の順序**:
1. 工程1: 手動実行テスト（各シナリオを順番に実行）
2. 工程2: 統合テスト（weeklyPlanner → Cloud Tasks → 認定処理）

各ステップで「適切なデータ」を確認し、期待通りの結果が得られることを確認してください。
