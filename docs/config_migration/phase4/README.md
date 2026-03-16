# Phase4 README

## 目的

Phase2.1 完了後に実装する以下の機能を定義する。

- スタッフ打刻の改修（STORE_CLOSE_HOUR 廃止、出勤/退勤分離）
- 夜間再計算の扱い整理（本プロジェクトでは unused 化、別プロジェクトで実施）
- 閉店処理の一環となる整合性確認（新規作成、UI 出力）

**実装タイミング**: Phase2.1 完了後に実施可能。Phase3 の完了は不要。Phase5 との実施順序は任意。

---

## 作業単位（3 分割）

| # | フォルダ | 概要 | 変更方針 |
|---|----------|------|----------|
| 01 | [01_determineAttendanceMode/](./01_determineAttendanceMode/) | スタッフ打刻改修・configOps 廃止 | [OVERVIEW.md](./01_determineAttendanceMode/OVERVIEW.md) |
| 02 | [02_nightlyRecalculateBalanceDue/](./02_nightlyRecalculateBalanceDue/) | 夜間再計算の扱い | [OVERVIEW.md](./02_nightlyRecalculateBalanceDue/OVERVIEW.md) |
| 03 | [03_nightlyIntegrityCheck/](./03_nightlyIntegrityCheck/) | 閉店処理用整合性確認 | [OVERVIEW.md](./03_nightlyIntegrityCheck/OVERVIEW.md) |

---

## 既存ドキュメント（参考）

| 項目 | ドキュメント | 概要 |
|------|-------------|------|
| 夜間再計算 | [NIGHTLY_RECALCULATE_BALANCE_DUE.md](./NIGHTLY_RECALCULATE_BALANCE_DUE.md) | 処理内容（別プロジェクト実装時の参考） |
| 夜間整合確認 | [NIGHTLY_INTEGRITY_CHECK.md](./NIGHTLY_INTEGRITY_CHECK.md) | 既存仕様（bills/activeStays/analyticsMonthly） |
| スタッフ打刻 | [DETERMINE_ATTENDANCE_MODE.md](./DETERMINE_ATTENDANCE_MODE.md) | 詳細仕様 |
| D-06 configOps | [D06_CONFIGOPS_CLEANUP.md](./D06_CONFIGOPS_CLEANUP.md) | configOps 廃止の背景 |

---

## 参照必須

- `docs/config_migration/migration_roadmap.md`
- `docs/config_migration/phase0B/PHASE0B_TARGET_LIST.md`（D-06 STORE_CLOSE_HOUR）
- `functions/src/domains/attendance/callables/determineAttendanceMode.ts`
- `functions/src/domains/analytics/scheduler/nightlyRecalculateBalanceDue.ts`
- `functions/src/domains/analytics/scheduler/nightlyIntegrityCheck.ts`
