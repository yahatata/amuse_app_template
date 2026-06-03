# Phase 7 実施結果（中央管理アプリによる運用確認）

計画: [12_Phase7_中央管理アプリによる運用確認.md](./12_Phase7_中央管理アプリによる運用確認.md)  
**6/4 実行手順（Cursor @ 指定用）**: [Phase7_2026-06-04_実行手順書.md](../../../amuse-admin/docs/運用時資料/Phase7_2026-06-04_実行手順書.md)

---

## 記録ルール

- 確認日時（JST）、店舗（`storeId`）、**回次（第1/2/3）**、手段（自然実行 / 手動投入）を必ず書く
- 結果は **PASS** / **FAIL** / **SKIP（理由）** / **未実施** / **再確認待ち**（時刻不足）
- FAIL 時は [Phase7_2026-06-04_実行手順書.md](../../../amuse-admin/docs/運用時資料/Phase7_2026-06-04_実行手順書.md) §9 の控え情報を残す
- 自動確認コマンド: `cd amuse-admin && node scripts/verify-phase7-scheduler.mjs --round N --planning-date 2026-06-04`

---

## 日次確認ログ

| 確認日時 (JST) | 店舗 | 回次 | 手段 | 結果 | メモ |
|---------------|------|------|------|------|------|
| （未記入） | | | | | |

---

## 2026-06-04 第1回

（未実施 — Cursor が実行手順書 §0 第1回指示で記入）

---

## 2026-06-04 第2回

（未実施）

---

## 2026-06-04 第3回

（未実施）

---

## job 別サマリ

| jobKey | 最終結果 | 確認日 | 備考 |
|--------|---------|--------|------|
| `weeklyPlanner` | 未 | | 週次（木 04:40 JST） |
| `enqueueTournamentTasksByScheduler` | 未 | | 日次 05:00 JST |
| `generateRecurringTournamentsByScheduler` | 未 | | 週次（木 04:50 JST） |
| `scheduledCleanup` | 未 | | 日次 05:00 JST |
| `scheduleGenerateNextYearBusinessHours` | SKIP | | 年 1 回（1/29）。手動投入で別途 |
| `payrollNotificationScheduler` | 未 | | 日次 05:00 JST → `processPayrollNotifications` |

---

## child / 代表 queue サマリ

| handler / queue | 最終結果 | 確認日 | 備考 |
|-----------------|---------|--------|------|
| `openAssessmentTask` / `closeAssessmentTask` | 未 | | `weeklyPlanner` downstream |
| `controlHookHttp` | 未 | | `enqueueTournamentTasksByScheduler` downstream |
| `processPayrollNotifications` | 未 | | `payrollNotificationScheduler` downstream |

---

## 未解決・フォローアップ

（なし）
