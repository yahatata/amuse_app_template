# Phase 0: 実環境 diff

実施日: 2026-06-01（追記: 同日 Phase 0 拡張確認 — Firestore / 8日分ログ / skip 突合）  
プロジェクト: `amuse-app-template`  
region: `asia-northeast1`

## 1. 実施内容

| # | 項目 | 結果 |
|---|------|------|
| 1 | [04_期待状態一覧.md](./04_期待状態一覧.md) をコード正本として確定 | ✅ |
| 2 | `storeMeta/schedulerConfig` 実値の取得・突合 | ✅（Firestore REST API、`gcloud auth print-access-token`） |
| 3 | GCP queue / Scheduler 一覧取得 | ✅ |
| 4 | supervisor 直近8日ログ（投入まで） | ✅ |
| 5 | `schedulerDispatchLogs` による skip 妥当性突合 | ✅ |
| 6 | diff 記録 | ✅ 本ファイル |

---

## 2. Cloud Scheduler（実環境）

| ID | SCHEDULE | TIME_ZONE | STATE | 期待との diff |
|----|----------|-----------|-------|---------------|
| `firebase-schedule-schedulerSupervisor-asia-northeast1` | `0 3 * * *` | `Asia/Tokyo` | ENABLED | **一致** |

`us-central1` の Scheduler job: **0 件**

---

## 3. Cloud Tasks queue（実環境 vs コード期待）

### 3.1 一覧突合

| queue 名 | GCP | コード期待 | pending 数 | 備考 |
|-----------|-----|-----------|------------|------|
| `business-date-assessment-queue` | ✅ RUNNING | ✅ | 11 | 未来 schedule（dispatch 0） |
| `tournament-queue` | ✅ RUNNING | ✅ | 8 | 未来 schedule |
| `scheduled-job-weekly-planner` | ✅ RUNNING | ✅ | 1 | 未来 schedule |
| `scheduled-job-enqueue-tournament-tasks-by-scheduler` | ✅ RUNNING | ✅ | 6 | 未来 schedule |
| `scheduled-job-generate-recurring-tournaments-by-scheduler` | ✅ RUNNING | ✅ | 1 | 未来 schedule |
| `scheduled-job-scheduled-cleanup` | ✅ RUNNING | ✅ | 6 | 未来 schedule |
| `scheduled-job-schedule-generate-next-year-business-hours` | ✅ RUNNING | ✅ | 0 | — |
| `scheduled-job-payroll-notification-scheduler` | ✅ RUNNING | ✅ | 6 | 未来 schedule |
| `processPayrollNotifications` | ✅ RUNNING | ✅ | 1 | Firebase Task Queue |
| `processStaffPayroll` | ✅ RUNNING | ✅ | 0 | Firebase Task Queue |
| `finalizePayrollRun` | ✅ RUNNING | ✅ | 0 | Firebase Task Queue |

**件数**: GCP 11 / コード期待 11 → **過不足なし**  
`us-central1` の queue: **0 件**

### 3.2 pending task の健全性

- サンプル確認: 未来 `scheduleTime`・`dispatchCount: 0`（実行前）
- 全 queue: **400/500 再試行・dispatchCount>3 の task: 0 件**

---

## 4. storeMeta/schedulerConfig（Firestore 実値）

取得方法: Firestore REST API + `gcloud auth print-access-token`

| 項目 | 実値 | コード default との diff |
|------|------|-------------------------|
| `supervisorEnabled` | true | 一致 |
| `planningHorizonDays` | **7** | 一致 |
| `schemaVersion` | 1 | 一致 |
| 全 6 job | **enabled: true** | 一致 |
| 日次 3 job | 05:00 JST | 一致 |
| 週次 2 job | 木 04:40 / 04:50 | 一致 |
| 年次 1 job | 1/29 05:10 JST | 一致 |

**結論**: Firestore 設定は `schedulerConfigDefaults.ts` と整合。jobKey の過不足なし。

---

## 5. schedulerSupervisor 直近8日（queue 投入まで）

Cloud Logging `jsonPayload.functionEntry="schedulerSupervisor"`:

| planningDate | enqueued | skipped | failed | error ログ |
|--------------|----------|---------|--------|-----------|
| 2026-05-25 | 3 | 20 | 0 | なし |
| 2026-05-26 | 3 | 20 | 0 | なし |
| 2026-05-27 | 3 | 20 | 0 | なし |
| 2026-05-28 | 3 | 20 | 0 | なし |
| 2026-05-29 | **5** | 18 | 0 | なし |
| 2026-05-30 | 3 | 20 | 0 | なし |
| 2026-05-31 | 3 | 20 | 0 | なし |
| 2026-06-01 | 3 | 20 | 0 | なし |

- 8日連続: `logOpsInfo(start)` → `logOpsSuccess`
- **`failedCount: 0` が8日すべて**
- supervisor **error ログ: 8日間 0 件**（30日検索も 0 件）
- `dispatchLogWrite` **error: 0 件**

### 5.1 言えること（投入までの範囲）

> 直近8日間、supervisor は毎日失敗なく完了し、queue への task 投入計画を error なく処理している。

### 5.2 まだ言えないこと

- enqueue された task の **handler 実行完了**（Phase 3）
- payload 内容の全件検証

---

## 6. skip 妥当性（schedulerDispatchLogs 突合）

### 6.1 skip になる条件（コード）

| reason | 意味 |
|--------|------|
| `task_already_exists` | 同一 task が既に queue に存在（重複投入防止） |
| `planned_run_at_in_past` | 実行予定時刻が過去 |

`enabled: false` や「その日は実行日でない job」は **skip カウントにも dispatch log にも載らない**。

### 6.2 1 日あたりの期待 slot 数

`planningHorizonDays: 7`、全 job enabled のとき:

- 日次 3 job × 7 日 = **21**
- 週次 2 job × horizon 内の木曜 1 日 = **2**
- 年次 job（1/29）は 6 月 horizon に **対象外**
- **合計 23 slot/日**

### 6.3 直近8日の dispatch log（Firestore クエリ）

| planningDate | 総件数 | enqueued | skip | error | skip reason |
|--------------|--------|----------|------|-------|-------------|
| 2026-05-25 〜 28 | 23 | 3 | 20 | 0 | すべて `task_already_exists` |
| 2026-05-29 | 23 | **5** | 18 | 0 | すべて `task_already_exists` |
| 2026-05-30 〜 06-01 | 23 | 3 | 20 | 0 | すべて `task_already_exists` |

**enqueued + skip = 23** が毎日一致 → 対象 slot を漏れなく処理。

### 6.4 典型パターン（enqueued 3 / skip 20）

毎朝 03:00 JST に 7 日先まで計画:

| 区分 | 件数 | 内容 |
|------|------|------|
| skip 20 | 日次 3×6 日 = 18 | 既存 task → `task_already_exists` |
| skip 20 | 週次 2×1 = 2 | 既存 task → `task_already_exists` |
| enqueued 3 | 日次 3×1 日 | horizon 7 日目（新規日）のみ新規投入 |

### 6.5 2026-05-29 の enqueued 5（例外パターン）

horizon 7 日目に **新しい木曜（2026-06-03）** が入り、週次 job も新規 enqueue:

- 日次 3 件（6/3 分）
- 週次 2 件（weeklyPlanner + generateRecurring、6/3 木曜分）

→ **5 enqueued + 18 skip = 23** — 週次が新規 horizon に入った日の正常パターン。

### 6.6 skip 結論

**skip はすべて skip されて当然の条件。** 異常 skip（`planned_run_at_in_past` の不当な大量発生、`error` 等）は直近8日で見つかっていない。

---

## 7. diff サマリ

| 区分 | 結果 |
|------|------|
| **一致** | queue 11/11、Scheduler 1/1、`schedulerConfig`、8日分投入パターン |
| **parked（削除候補）** | 0 件（旧 region・コード未参照 queue なし） |
| **Phase 3 へ** | handler 完了までの確認 |

---

## 8. Phase 1a parked リスト

Phase 0 時点: **parked 候補なし**

---

## 9. Phase 0 結論

- **インフラ（Scheduler / queue / config）** はコード期待と一致
- **supervisor の queue 投入** は直近8日、失敗・dispatch error なし
- **skip 20/日** は `task_already_exists` による正常な重複防止
- **Phase 3（handler 完了確認）** へ進行可能

---

## 10. 使用コマンド（再現用）

```bash
PROJECT=amuse-app-template
LOC=asia-northeast1
TOKEN=$(gcloud auth print-access-token)

# Queue / Scheduler
gcloud tasks queues list --location=$LOC --project=$PROJECT
gcloud scheduler jobs list --location=$LOC --project=$PROJECT

# supervisor 成功ログ（8日）
gcloud logging read \
  'jsonPayload.functionEntry="schedulerSupervisor" AND jsonPayload.outcome="success"' \
  --project=$PROJECT --limit=10 --freshness=8d \
  --format='table(timestamp,jsonPayload.context.planningDate,jsonPayload.context.enqueuedCount,jsonPayload.context.skippedCount,jsonPayload.context.failedCount)'

# schedulerConfig
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default)/documents/storeMeta/schedulerConfig"

# dispatch log（planningDate 指定）
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default)/documents:runQuery" \
  -d '{"structuredQuery":{"from":[{"collectionId":"schedulerDispatchLogs"}],"where":{"fieldFilter":{"field":{"fieldPath":"planningDate"},"op":"EQUAL","value":{"stringValue":"2026-06-01"}}},"limit":100}}'
```
