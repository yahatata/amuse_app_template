# Phase 7 実施結果（中央管理アプリによる運用確認）

計画: [12_Phase7_中央管理アプリによる運用確認.md](./12_Phase7_中央管理アプリによる運用確認.md)  
**6/4 実行手順（Cursor @ 指定用）**: [Phase7_2026-06-04_実行手順書.md](../../../amuse-admin/docs/運用時資料/Phase7_2026-06-04_実行手順書.md)

---

## 記録ルール

- 確認日時（JST）、店舗（`storeId`）、**回次（第1/2/3）**、手段（自然実行 / 手動投入）を必ず書く
- 結果は **PASS** / **FAIL** / **SKIP（理由）** / **未実施** / **再確認待ち**（時刻不足）
- FAIL 時は [Phase7_2026-06-04_実行手順書.md](../../../amuse-admin/docs/運用時資料/Phase7_2026-06-04_実行手順書.md) §9 の控え情報を残す
- 自動確認コマンド: `cd amuse-admin && node scripts/verify-phase7-scheduler.mjs --round N --planning-date 2026-06-04`（要 `gcloud auth application-default login`）

---

## 日次確認ログ

| 確認日時 (JST) | 店舗 | 回次 | 手段 | 結果 | メモ |
|---------------|------|------|------|------|------|
| 2026-06-04 05:37 | `amuse-app-template` | 第3回 | 自然実行 | **PARTIAL** | 店舗側 scheduler PASS。中央 `taskLogs` 未反映 |
| 2026-06-04 05:37 | `amuse-app-template` | 第1・2回（遡及） | 自然実行 | **PASS** | 第3回と同一データから遡及判定 |

---

## 2026-06-04 第1回（遡及）

- 確認: Firestore REST + 店舗 Cloud Logging（`gcloud auth print-access-token`）
- 店舗 `amuse-app-template`: **PASS**
  - `schedulerSupervisor` 03:00 JST 成功（`planningDate=2026-06-04`）
  - 中央 `schedulerLogs` dispatch 記録 33 件（うち `planningDate=2026-06-04` は 5 job 分）
  - ① は `skip`（`task_already_exists`）または `enqueued` — `missing` なし

---

## 2026-06-04 第2回（遡及）

- 店舗 `amuse-app-template`: **PASS**
  - `schedulerAnomalies` active（`planningDate=2026-06-04`）: **なし**
  - `supervisor_missing` なし
  - 04:40〜05:00 JST の top-level job はすべて `executeScheduledJobTask` 成功（Cloud Logging）

---

## 2026-06-04 第3回

- 確認時刻: **2026-06-04 05:37 JST**
- 手段: 自然実行（03:00 supervisor 以降）
- 店舗 `amuse-app-template`: **PARTIAL**

### top-level 6 job（店舗 Functions 実動作）

| jobKey | ① dispatch | ② execution（店舗） | 判定 |
|--------|-----------|---------------------|------|
| `weeklyPlanner` | skip（既存 task） | 04:40 完了 | PASS |
| `generateRecurringTournamentsByScheduler` | skip | 04:50 完了 | PASS |
| `enqueueTournamentTasksByScheduler` | skip | 05:00 完了 | PASS |
| `scheduledCleanup` | skip | 05:00 完了 | PASS |
| `payrollNotificationScheduler` | skip | 05:00 完了 | PASS |
| `scheduleGenerateNextYearBusinessHours` | 当日 slot なし | — | SKIP（年次） |

### 中央 Firestore / 管理アプリ観点

| 項目 | 結果 | 備考 |
|------|------|------|
| 中央 `schedulerLogs` dispatch | OK | `planningDate=2026-06-04`、skip/enqueued あり |
| 中央 `schedulerLogs` execution | OK | 同一 `idempotencyKey` で completed。`planningDate` は `2026-05-29`（horizon 起点） |
| 異常バナー相当 | OK | active anomaly 0 件 |
| `schedulerTaskDispatchLogs` child | OK | 15 件（weeklyPlanner assessment + payroll child）。`parentPlanningDate=2026-05-29` |
| 中央 `taskLogs` child handler | **NG** | 本日分の `openAssessmentTask` 等が未反映 |
| Task 監視タブ相当 | **NG** | 上記のため child 実行履歴が追えない |

### NG 根拠（要フォロー）

店舗 Cloud Logging:

```
writeCentralTaskLog failed (best-effort)
error: Cannot use "undefined" as a Firestore value (found in field "context.storeId")
```

- `openAssessmentTask` は 05:30 JST に実行されたが `already_running_different_date` で skip（業務上は妥当）
- いずれにせよ中央 `taskLogs` への write が失敗しており、Phase 7 第3回の Task 監視条件を満たさない

---

## job 別サマリ

| jobKey | 最終結果 | 確認日 | 備考 |
|--------|---------|--------|------|
| `weeklyPlanner` | PASS | 2026-06-04 | 04:40 完了。assessment child dispatch あり |
| `enqueueTournamentTasksByScheduler` | PASS | 2026-06-04 | 05:00 完了 |
| `generateRecurringTournamentsByScheduler` | PASS | 2026-06-04 | 04:50 完了 |
| `scheduledCleanup` | PASS | 2026-06-04 | 05:00 完了 |
| `scheduleGenerateNextYearBusinessHours` | SKIP | — | 年 1 回（1/29）。手動投入で別途 |
| `payrollNotificationScheduler` | PASS | 2026-06-04 | 05:00 完了。child dispatch あり |

---

## child / 代表 queue サマリ

| handler / queue | 最終結果 | 確認日 | 備考 |
|-----------------|---------|--------|------|
| `openAssessmentTask` / `closeAssessmentTask` | PARTIAL | 2026-06-04 | 店舗で実行（open は skip）。中央 taskLogs 未反映 |
| `controlHookHttp` | SKIP | 2026-06-04 | 本日分の tournament child 未確認 |
| `processPayrollNotifications` | PARTIAL | 2026-06-04 | child dispatch あり。中央 taskLogs 未反映 |

---

## 未解決・フォローアップ

1. **`writeCentralTaskLog` の `context.storeId` undefined** — 店舗 Functions 側で修正・デプロイ後、再確認
2. **verify スクリプト** — 環境に ADC 未設定。`gcloud auth application-default login` または REST 突合を手順書に明記済み
3. **UI 上の ② 表示** — dispatch が `skip`（`task_already_exists`）のとき execution completed があっても ② が `n/a` になる可能性（monitoring ロジック改善候補）
4. **Phase 7 完了条件** — 日次 2 営業日連続 PASS は未達。6/5 以降も継続確認
