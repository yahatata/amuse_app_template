# D-06: configOps.ts 直書き廃止 — Phase4 スコープ

## 背景

Phase2 横断検証（Z_crossCutting）で、`functions/src/shared/time/configOps.ts` の `getStoreCloseHour()` における **`return 27` の直書き**が検出された。

Z-4（defaults.ts 唯一ソース）の観点では、デフォルト値の直書きは望ましくないが、D-06（STORE_CLOSE_HOUR）は **Phase4 で廃止**するため、Phase2 では触らない方針とする。

## Phase4 スコープ

Phase4 において **STORE_CLOSE_HOUR を廃止**する際、以下を実施する。

| 対象 | 内容 |
|------|------|
| `functions/src/shared/time/configOps.ts` | `getStoreCloseHour()` の `return 27` 直書きを廃止。当該関数および `normalizeStoreCloseHour()` は、STORE_CLOSE_HOUR 廃止に伴い呼び出し元の改修とともに削除または置き換える |
| 呼び出し元 | 夜間ジョブ（nightlyRecalculateBalanceDue, nightlyIntegrityCheck）は閉店処理/Cloud Task 起動に移行し、getStoreCloseHour を参照しない。determineAttendanceMode は STORE_CLOSE_HOUR 廃止に伴い出勤/退勤分離に改修 |

## 参照

- `docs/config_migration/phase4/README.md` … Phase4 全体のスコープ
- `docs/config_migration/phase4/NIGHTLY_RECALCULATE_BALANCE_DUE.md`
- `docs/config_migration/phase4/NIGHTLY_INTEGRITY_CHECK.md`
- `docs/config_migration/phase4/DETERMINE_ATTENDANCE_MODE.md`
- `docs/config_migration/phase2/verification/per_id/Z_crossCutting.md` … 検出元（検出した問題 #3）
