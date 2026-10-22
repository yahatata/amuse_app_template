# Phase 3 実施結果（handler 完了確認）

実施日: 2026-06-01  
対象期間: 直近 8 日（2026-05-24 〜 2026-06-01、supervisor planningDate 基準）

## 1. 判定サマリ

| 対象 | 判定 | 備考 |
|------|------|------|
| `scheduledCleanup` | **PASS** | 8/8 日 completed（execution log） |
| `enqueueTournamentTasksByScheduler` | **PASS** | 8/8 日 completed。8日間 error 0 |
| `payrollNotificationScheduler` | **PASS** | 8/8 日 completed → downstream も後述 |
| `weeklyPlanner` | **PASS** | 週次 1 回 completed（5/27）。downstream assessment 動作 |
| `generateRecurringTournamentsByScheduler` | **PASS** | 週次 1 回 completed（5/27） |
| `scheduleGenerateNextYearBusinessHours` | **SKIP** | 年次（1/29）のため期間外。execution log 0 件 |
| `processPayrollNotifications`（downstream） | **PASS** | 8/8 日 start + `completed` logger.info。error 0 |
| `business-date-assessment-queue` | **PASS** | open/close start あり。8日 error 0 |
| `tournament-queue` / controlHook | **PASS** | start あり。8日 error 0 |
| `processStaffPayroll` → `finalizePayrollRun` | **N/A** | 直近 30 日 run なし（給与計算未トリガー） |

**直近 8 日の execution log error: 0 件**（過去の default-store / NOT_FOUND エラーは 5/24 より前）

---

## 2. 共通 PASS 連鎖（scheduled job）

確認方法: Firestore `schedulerExecutionLogsByCloudTask` + Cloud Logging

| 層 | 直近8日 |
|----|---------|
| `executeScheduledJobTask` start | 毎実行あり（logging） |
| execution log `started` → `completed` | 日次 job 8/8、週次 job 1/1 |
| execution log `error` | **0 件**（since 2026-05-24） |
| `executeScheduledJobTask` logOpsError | **0 件**（8日） |

---

## 3. job 別詳細

### 3.1 scheduledCleanup（日次）

- execution log: **completed 8 / started 8**（2026-05-24 以降）
- error: 0

### 3.2 enqueueTournamentTasksByScheduler（日次）

- execution log: **completed 8 / started 8**
- 内側 handler: `logOpsInfo(start)` → `logOpsSuccess`（8日）
- error: 0
- 過去（4〜5 月上旬）に `default-store` 起因 error あり → **5/24 以降は再発なし**

### 3.3 payrollNotificationScheduler（日次）

- execution log: **completed 8 / started 8**
- 内側 `payrollNotificationScheduler`: `logOpsSuccess`（enqueue）8日
- downstream `processPayrollNotifications`:
  - `logOpsInfo(start)`: **8/8 日**（毎日 ~10:00 JST）
  - `logger.info('processPayrollNotifications: completed')`: **8/8 日**
  - `logOpsError`: 0
  - **Phase 4 改善候補**: 完了が `logOpsSuccess` ではなく `logger.info` のみ

### 3.4 weeklyPlanner（週次・木）

- execution log: **completed 1 / started 1**（8 日間に木曜 1 回 = 期待どおり）
- `logOpsSuccess`: open/close 各 7 task enqueue（5/27 実行分）
- downstream assessment:
  - `openAssessmentTask` / `closeAssessmentTask` start: 8日間に複数回
  - error: 0
- 過去（4〜5 月）に Cloud Tasks `NOT_FOUND` error あり → **5/24 以降再発なし**

### 3.5 generateRecurringTournamentsByScheduler（週次・木）

- execution log: **completed 1 / started 1**
- 内側 handler: start → success（5/27）
- error: 0

### 3.6 scheduleGenerateNextYearBusinessHours（年次・1/29）

- execution log: **0 件**（6 月は実行対象日外）
- **判定: SKIP（期間外）**
- **残タスク**: 次回 1/29 前に手動投入で代表確認、または年次接近時に実施

---

## 4. scheduler 経由以外の代表 queue

### business-date-assessment-queue

- 直近 8 日: open/close の `logOpsInfo(start)` 複数回
- `logOpsError`: 0
- pending task は未来 schedule 中心（Phase 0 確認済み）

### tournament-queue / controlHookHttp

- 直近 8 日: start ログあり（トーナメント自動実行）
- error: 0

### 給与計算（processStaffPayroll → finalizePayrollRun）

- 直近 30 日: start ログ **なし**（月次給与計算未トリガー）
- queue pending: 0
- **判定: N/A** — scheduler 経路とは独立。給与計算実行時に別途確認

---

## 5. 過去エラー（参考・直近8日外）

Firestore `schedulerExecutionLogsByCloudTask` に **2026-05-24 より前**の error が残存:

| job | 原因 | 状態 |
|-----|------|------|
| enqueueTournamentTasksByScheduler | `default-store` 本番禁止 | 5/24 以降再発なし |
| weeklyPlanner | Cloud Tasks `NOT_FOUND`（SA 問題） | 5/24 以降再発なし。5/27 PASS |

復旧作業（2026-04-07）後の修正が効いていると判断。

---

## 6. 修正・改善（Phase 3 で検出）

| 項目 | 重要度 | 対応 Phase |
|------|--------|-----------|
| `processPayrollNotifications` 完了が `logger.info` のみ | 中 | Phase 4（logOpsSuccess 追加検討） |
| `scheduleGenerateNextYearBusinessHours` 未実地確認 | 低 | 1/29 前に手動 PASS |
| `processStaffPayroll` 代表 E2E 未実施 | 低 | 次回給与計算実行時 |

**Phase 3 時点でコード修正は不要**（動作上の blocker なし）。

---

## 7. Phase 2 残り

- [x] `plannedRunAt` と queue task scheduleTime — Phase 0 サンプルで整合（未来 schedule・dispatch 0）
- [ ] loader / dispatch log の追跡しづらさ — Phase 4 でログ統一時に確認

---

## 8. 結論

**enabled かつ実行期間内の scheduled job は、直近 8 日間すべて handler 完了まで PASS。**  
年次 job のみ SKIP（期間外）。給与計算 queue は未トリガーのため N/A。

次: **Phase 4**（ログ統一）→ **Phase 5**（検知・ルール）→ **Phase 6**（クローズ）
