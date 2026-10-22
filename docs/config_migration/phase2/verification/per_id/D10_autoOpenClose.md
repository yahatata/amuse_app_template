# D-10: 自動開閉店 — Phase2 検証ファイル

**※ 必ず `per_id_TASK4_PROCEDURE.md` を確認しながら進めること。**

バッチ: A1（Functions コア） | 対象 ID: D-10 | 対象層: Functions + Dart（globalConstant 削除）

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 1 | 実装 | Functions: `weeklyPlanner.ts` の process.env 3 箇所を `getStoreConfig().autoOpenClose.*` に差し替え | ✅ |
| 2 | 実装 | Functions: 旧 process.env 参照を削除 | ✅ |
| 3 | 実装 | defaults.ts に `autoOpenClose` 3 フィールドのデフォルト値を定義 | ✅ |
| 4 | 実装 | Dart: globalConstant の ENABLE_AUTO_OPEN_CLOSE / TASK_CLOSE_OFFSET_MINUTES / TASK_OPEN_OFFSET_MINUTES を削除 | ✅ |
| 5 | 手続き | 取得失敗時の挙動を設計・記録 | ✅ 取得失敗時の挙動設計.md に追記済み |
| 6 | 手続き | 切り戻し手順を記録 | ✅ 設定の不具合時の対応.md に追記済み |
| 7 | 手続き | ALL_ID_STATUS を「完了」に更新 | ✅ per_id_PROGRESS 更新済み |

---

## 2. 実装漏れ・要調査事項（REQUIREMENTS_GAP_CHECK より）

### 確定した漏れ

| # | 内容 | 影響度 |
|---|------|--------|
| GAP-2-1 | 取得失敗時の挙動設計が未記録 | 中 |
| GAP-2-2 | 切り戻し手順が未記録 | 中 |

### 要調査事項

該当なし

---

## 3. 関連テスト失敗（VERIFICATION_TASK_ORDER より）

該当するテスト失敗事象なし

---

## 4. Task 4 実施記録

### 実装確認結果

- **§1 実装済み**
  - 要件1: `weeklyPlanner.ts` L32-45 で `getStoreConfig()` を呼び、`config.autoOpenClose?.enabled`（L34）、`config.autoOpenClose?.taskCloseOffsetMinutes`（L44）、`config.autoOpenClose?.taskOpenOffsetMinutes`（L45）を参照。process.env の ENABLE_AUTO_OPEN_CLOSE / TASK_CLOSE_OFFSET_MINUTES / TASK_OPEN_OFFSET_MINUTES は使用されていない。
  - 要件2: 旧 process.env 参照は削除済み。
  - 要件3: `defaults.ts` L40-46 で `DEFAULT_AUTO_OPEN_CLOSE_ENABLED`、`DEFAULT_TASK_CLOSE_OFFSET_MINUTES`、`DEFAULT_TASK_OPEN_OFFSET_MINUTES` を定義。configLoader の buildFromDefaults で autoOpenClose にマッピング。
  - 要件4: `lib/globalConstant.dart` に ENABLE_AUTO_OPEN_CLOSE / TASK_CLOSE_OFFSET_MINUTES / TASK_OPEN_OFFSET_MINUTES は存在しない。`store_config_defaults.dart` に kDefaultAutoOpenCloseEnabled 等を定義し、store_config_service 経由で config から取得。
- **§2 問題あり（GAP-2-1, 2-2 のみ）**: ② をスキップして ③ へ進む。⑦-a 完了後に運用時資料 2 ファイルに追記。
- **§3 問題なし**: 該当するテスト失敗事象なし。

### 取得失敗時の挙動設計

- **読めるがフィールドが存在しない**: 必ずデフォルト（`enabled: true`, `taskCloseOffsetMinutes: 120`, `taskOpenOffsetMinutes: -30`）を適用。
- **読めない（Firestore 障害等）**: A. デフォルトを正とする。

運用時資料 `docs/運用時資料/設定/取得失敗時の挙動設計.md` に追記済み。

### 切り戻し手順

1. リトライを必ず行う。
2. A,B: デフォルトで実行＋エラーコード。
3. C,D: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定は boolean と数値のため常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR`。

運用時資料 `docs/運用時資料/設定/設定の不具合時の対応.md` に追記済み。

### テスト要件整理

| 区分 | 内容 |
|------|------|
| Cursor が CL 等で確認するもの | `npx tsc --noEmit`、`flutter analyze` |
| テストファイルで確認するもの | phase2_migration（autoOpenClose）、configLoader、systemHealth、store_config_phase2_test、store_config_service_test |
| ユーザーが実機で確認するもの | 自動開閉店が config に従って動作するか（enabled / taskCloseOffsetMinutes / taskOpenOffsetMinutes が期待どおりか） |

### テストファイルの確認・修正

**既存テストファイル**:
- `phase2_migration.spec.ts`: autoOpenClose のデフォルト・Firestore 上書き確認
- `configLoader.spec.ts`: getStoreConfig で autoOpenClose が取得できること
- `systemHealth.spec.ts`: autoOpenClose の整合性確認
- `store_config_phase2_test.dart`: autoOpenClose のパース・上書き確認
- `store_config_service_test.dart`: autoOpenCloseEnabled 等の取得確認

### テスト実行結果

- Functions: phase2_migration, configLoader, systemHealth 全 63 tests passed
- Flutter: store_config_phase2_test, store_config_service_test 全 33 tests passed

### 実機テスト結果

**スキップ**（ユーザー判断）

対象項目: 自動開閉店が config に従って動作するか（enabled / taskCloseOffsetMinutes / taskOpenOffsetMinutes が期待どおりか）
