# Phase0B 廃止計画（タスク4 成果物）

作成日: 2026-03-04  
参照: [PHASE0B_BEFORE_AFTER_DECISION.md](./PHASE0B_BEFORE_AFTER_DECISION.md), [STOREMETA_CONFIG_SPEC.md](./STOREMETA_CONFIG_SPEC.md)

---

## 1. 方針

- Phase0B では **このフェーズで統一すべきもの** について方針を確定する
- storeMeta/config への Run-time 化は Phase2 で実施。Phase0B の目的は **重複 SSoT の解消と To-Be の確定**
- 廃止側には deprecate コメントを付与するか、Phase2 で To-Be 側へ差し替えて削除する

---

## 2. ID 別廃止計画

### D-06: STORE_CLOSE_HOUR

| 項目 | 内容 |
|------|------|
| 廃止側 | Dart、Functions とも廃止 |
| 実施内容 | Phase4 で完全廃止。determineAttendanceMode は出勤/退勤分離、nightly ジョブは閉店処理/Cloud Task 起動 |
| 互換期間 | Phase4 実装完了まで現状の getStoreCloseHour を維持 |
| 実施タイミング | Phase4（Phase2.1 完了後に実施可能） |
| 参照 | `docs/config_migration/phase4/` |

---

### D-10: ENABLE_AUTO_OPEN_CLOSE, TASK_*_OFFSET

| 項目 | 内容 |
|------|------|
| 廃止側 | Dart globalConstant、Functions env 直接参照 |
| 実施内容 | Phase2 で storeMeta/config 読み取り層を実装。weeklyPlanner は config 取得に差し替え。Dart は deprecate |
| 互換期間 | Phase2 実装完了まで env をフォールバックとして維持可能 |
| 実施タイミング | Phase2 |
| 参照 | STOREMETA_CONFIG_SPEC.md |

---

### R-09: requiredStaffByTimeSlot

| 項目 | 内容 |
|------|------|
| 廃止側 | Dart globalConstant、TS 各 callable 内のローカル定義 |
| 実施内容 | Phase2 で storeMeta/config（または別 doc）へ移行。TS の getRequiredStaffByTimeSlot を共通化し config 取得に差し替え |
| 互換期間 | Phase2 実装完了まで現状維持。曜日ごと分離の要否は実装時に検討 |
| 実施タイミング | Phase2 |

---

### R-10: businessHoursStyles

| 項目 | 内容 |
|------|------|
| 廃止側 | Dart globalConstant、TS styles.ts の直接定義 |
| 実施内容 | Phase2 で storeMeta/config へ移行。getBusinessHoursByStyleId は config 取得に差し替え。Dart は API 経由 |
| 互換期間 | Phase2 実装完了まで現状維持 |
| 実施タイミング | Phase2 |

---

### R-11, R-12: 会計ポリシー

| 項目 | 内容 |
|------|------|
| 廃止側 | Dart globalConstant、TS 各所のハードコード（accounting, getBillPreviewTotals, snapshots 等） |
| 実施内容 | Phase2 で storeMeta/config へ移行。paymentSplitCalculator を単一参照元とし、他はそこから取得。Dart は API 経由 |
| 互換期間 | Phase2 実装完了まで現状維持 |
| 実施タイミング | Phase2 |

---

### D-04: linePlan

| 項目 | 内容 |
|------|------|
| 廃止側 | Dart globalConstant、Functions defineString、public/staff/config.js |
| 実施内容 | Phase2 で storeMeta/config へ移行。lineWebhook, confirmShiftRequest, staff config は config 取得に差し替え |
| 互換期間 | Phase2 実装完了まで env 等をフォールバックとして維持可能 |
| 実施タイミング | Phase2 |

---

### CALC_BUSINESS_DATE_BUFFER_MINUTES

| 項目 | 内容 |
|------|------|
| 廃止側 | Dart globalConstant、TS calcBusinessDateHelpers 内の直書き |
| 実施内容 | Phase2 で storeMeta/config へ移行。getCalcBusinessDateBufferMinutes は config 取得に差し替え |
| 互換期間 | Phase2 実装完了まで defaults.ts および直書きで維持 |
| 実施タイミング | Phase2 |

---

## 3. Phase2 との役割分担

- **Phase0B**: To-Be SSoT の確定、廃止計画の定義、STOREMETA_CONFIG_SPEC の作成
- **Phase2**: storeMeta/config 読み取り基盤の実装、defaults.ts の作成、各参照の差し替え
