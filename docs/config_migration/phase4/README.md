# Phase4 README

## 目的

Phase3 完了後に実装する以下の機能の詳細仕様を定義する。

- 夜間再計算・夜間整合確認（閉店処理/Cloud Task 起動、STORE_CLOSE_HOUR 不使用）
- スタッフ打刻（determineAttendanceMode）の改修（STORE_CLOSE_HOUR 廃止、出勤/退勤分離、例外時の管理者解消）

**実装タイミング**: Phase3 終了後に実施。本ドキュメントは設計・仕様の確定用。

---

## スコープ

| 項目 | ドキュメント | 概要 |
|------|-------------|------|
| 夜間再計算 | [NIGHTLY_RECALCULATE_BALANCE_DUE.md](./NIGHTLY_RECALCULATE_BALANCE_DUE.md) | analyticsMonthly 残高再計算。閉店処理または Cloud Task から起動 |
| 夜間整合確認 | [NIGHTLY_INTEGRITY_CHECK.md](./NIGHTLY_INTEGRITY_CHECK.md) | bills/activeStays/analyticsMonthly の整合性チェック。同上 |
| スタッフ打刻 | [DETERMINE_ATTENDANCE_MODE.md](./DETERMINE_ATTENDANCE_MODE.md) | STORE_CLOSE_HOUR 廃止、出勤/退勤分離、例外時の管理者認証 |
| D-06 configOps 直書き廃止 | [D06_CONFIGOPS_CLEANUP.md](./D06_CONFIGOPS_CLEANUP.md) | `functions/src/shared/time/configOps.ts` の `getStoreCloseHour` における `return 27` の直書きを廃止（STORE_CLOSE_HOUR 廃止に伴う） |

---

## 参照必須

- `docs/config_migration/migration_roadmap.md`
- `docs/config_migration/phase0B/PHASE0B_TARGET_LIST.md`（D-06 STORE_CLOSE_HOUR）
- `functions/src/domains/attendance/callables/determineAttendanceMode.ts`
- `functions/src/domains/analytics/scheduler/nightlyRecalculateBalanceDue.ts`
- `functions/src/domains/analytics/scheduler/nightlyIntegrityCheck.ts`
