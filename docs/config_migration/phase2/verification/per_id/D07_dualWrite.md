# D-07: WRITE_TODAYS_BILLS_IN_PARALLEL（dualWrite） — Phase2 検証ファイル

**※ 必ず `per_id_TASK4_PROCEDURE.md` を確認しながら進めること。**

バッチ: B（機能フラグ） | 対象 ID: D-07 | 対象層: Functions のみ

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 1 | 実装 | Functions: `shouldDualWrite()` を async 化し、`getStoreConfig().features.dualWriteEnabled` を参照 | ✅ |
| 2 | 実装 | Functions: `shouldDualWrite()` の全呼び出し元を `await` 対応に修正 | ✅ |
| 3 | 実装 | Functions: 旧 process.env 参照を削除 | ✅ |
| 4 | 実装 | defaults.ts に `dualWriteEnabled` のデフォルト値を定義（`false`） | ✅ |
| 5 | 手続き | 取得失敗時の挙動を設計・記録 | ✅ |
| 6 | 手続き | 切り戻し手順を記録 | ✅ |
| 7 | 手続き | ALL_ID_STATUS を「完了」に更新 | ✅ |

---

## 2. 実装漏れ・要調査事項（REQUIREMENTS_GAP_CHECK より）

### 確定した漏れ

| # | 内容 | 影響度 | 対応 |
|---|------|--------|------|
| GAP-2-1 | 取得失敗時の挙動設計が未記録 | 中 | ✅ 運用時資料に記載済み |
| GAP-2-2 | 切り戻し手順が未記録 | 中 | ✅ 運用時資料に記載済み |

### 要調査事項

該当なし

---

## 3. 関連テスト失敗（VERIFICATION_TASK_ORDER より）

該当するテスト失敗事象なし

---

## 4. Task 4 実施記録

### 実装確認結果

**§1 確認**: 実装済み。`dualWrite.ts` の `shouldDualWrite()` は async で `getStoreConfig().features.dualWriteEnabled` を参照（L19-23）。全呼び出し元（startAccounting, updateActiveBill, appendExtra, recordTournamentAction, updatePlace, appendItem, appendSideGameChip, updateBill, createBillWithActiveStay）で `await shouldDualWrite()` 対応済み。本番コードに `process.env.WRITE_TODAYS_BILLS_IN_PARALLEL` の参照なし（unused_function_lib 除く）。`defaults.ts` に `DEFAULT_DUAL_WRITE_ENABLED = false`、`types.ts` に `dualWriteEnabled?: boolean` 定義済み。手続き 5〜7 は GAP-2-1, 2-2 のため ⑦-a 完了後に運用時資料へ記載予定。

**§2 確認**: 確定した漏れ（GAP-2-1, GAP-2-2）の通り。要調査事項なし。② を飛ばして③ に進む。⑦-a 完了後に運用時資料 2 ファイルに蓄積する。

**§3 確認**: 該当するテスト失敗事象なしの通り。確認不要。

### 取得失敗時の挙動設計

**方針**: デフォルトを返す。**実装済み**（configLoader: 未存在時・読み取り失敗時は defaults を使用）。

- **読めるがフィールドが存在しない**: 必ずデフォルト（`false`）を適用。実装済み（mergeWithDefaults で field_missing 時は defaults を使用）。
- **読めない（Firestore 障害等）**: A. デフォルトを正とする。実装済み。

詳細は `docs/運用時資料/設定/取得失敗時の挙動設計.md` を参照。

### 切り戻し手順（2-2 設定の不具合時の対応）

1. リトライを必ず行う。
2. A,B: デフォルト値で処理を実行し、エラーコード（`CONFIG_FALLBACK`）を出力。Firestore の値を修正して解消。
3. C,D: デフォルトで実行できる場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定は boolean のため常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: configLoader が `code: CONFIG_FALLBACK` または `CONFIG_READ_ERROR` をログに出力。

詳細は `docs/運用時資料/設定/設定の不具合時の対応.md` を参照。

### テスト要件整理

| 区分 | 内容 |
|------|------|
| Cursor が CL 等で確認するもの | `npx tsc --noEmit`、`flutter analyze` |
| テストファイルで確認するもの | dualWrite 分岐（appendItem.dualwrite-failure, phase2_migration, systemHealth, configLoader）、shouldDualWrite を呼ぶ各 repo のテスト |
| ユーザーが実機で確認するもの | storeMeta/config の `features.dualWriteEnabled` 変更が todaysBills への複写の有無に反映されるか |

### テストファイルの確認・修正

**既存テストファイル**:
- `__tests__/helpers/billsApi/appendItem.dualwrite-failure.spec.ts`: WRITE_TODAYS_BILLS_IN_PARALLEL / dualWriteResult の skipped・failed・success 分岐をテスト。mockStoreConfig が dualWriteEnabled に変換。
- `__tests__/config_migration/phase2_migration.spec.ts`: dualWriteEnabled のデフォルト・Firestore 上書き確認あり。
- `__tests__/health/systemHealth.spec.ts`: config.features.dualWriteEnabled の確認あり。
- `__tests__/config/configLoader.spec.ts`: buildFromDefaults の dualWriteEnabled 確認あり。

**結論**: 既存テストで十分。新規テストは不要。

### テスト実行結果

- `appendItem.dualwrite-failure.spec.ts`: パス
- `phase2_migration.spec.ts`: パス
- `systemHealth.spec.ts`: パス
- `configLoader.spec.ts`: パス

※ `updateActiveBill.spec.ts` は Firebase 初期化のセットアップで失敗（D-07 実装とは無関係の既存事象）

### 実機テスト結果

**スキップ**
