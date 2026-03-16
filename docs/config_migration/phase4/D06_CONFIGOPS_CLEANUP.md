# D-06: configOps.ts 直書き廃止 — Phase4 スコープ

## 背景

Phase2 横断検証（Z_crossCutting）で、`functions/src/shared/time/configOps.ts` の `getStoreCloseHour()` における **`return 27` の直書き**が検出された。

Z-4（defaults.ts 唯一ソース）の観点では、デフォルト値の直書きは望ましくないが、D-06（STORE_CLOSE_HOUR）は **Phase4 で廃止**するため、Phase2 では触らない方針とする。

## Phase4 実施内容【完了】

| 対象 | 内容 |
|------|------|
| `configOps.ts` | `unused_function_lib/configOps.ts` に移動。shared/time からの export を削除 |
| `determineAttendanceMode` | `unused_function_lib/determineAttendanceMode.ts` に移動。configOps を同梱の unused から参照 |
| analytics `helpers.ts` | `normalizeStoreCloseHour` 依存を解消。`resolveBusinessDate` 内で `storeCloseHour % 24` をインライン使用 |

## 参照

- `docs/config_migration/phase4/README.md` … Phase4 全体のスコープ
- `docs/config_migration/phase4/NIGHTLY_RECALCULATE_BALANCE_DUE.md`
- `docs/config_migration/phase4/NIGHTLY_INTEGRITY_CHECK.md`
- `docs/config_migration/phase4/DETERMINE_ATTENDANCE_MODE.md`
- `docs/config_migration/phase2/verification/per_id/Z_crossCutting.md` … 検出元（検出した問題 #3）
