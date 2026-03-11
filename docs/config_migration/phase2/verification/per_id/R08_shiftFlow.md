# R-08: シフト提出・組む期間 — Phase2 検証ファイル

**※ 必ず `per_id_TASK4_PROCEDURE.md` を確認しながら進めること。**

バッチ: A2（Flutter） | 対象 ID: R-08 | 対象層: Flutter（+ defaults.ts / types.ts 定義）

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 1 | 実装 | defaults.ts に shift フロー 3 フィールドのデフォルト値を定義（submissionStartDay / submissionEndDay / schedulingStartDay） | ✅ 実装済み |
| 2 | 実装 | types.ts の StoreConfig 型に shift を含める | ✅ 実装済み |
| 3 | 実装 | Flutter: globalConstant の SHIFT_SUBMISSION_START_DAY 等を削除 | ✅ 削除済み |
| 4 | 実装 | Flutter: shiftHomePage 等の参照を StoreConfigService に差し替え | ✅ 実装済み |
| 5 | 手続き | 取得失敗時の挙動を設計・記録 | ✅ 取得失敗時の挙動設計.md に記載 |
| 6 | 手続き | 切り戻し手順を記録 | ✅ 設定の不具合時の対応.md に記載 |
| 7 | 手続き | ALL_ID_STATUS を「完了」に更新 | ✅ 既に完了済み |

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

**§1 実装済み**
- **要件1**: defaults.ts L120-126 に DEFAULT_SHIFT_SUBMISSION_START_DAY(1), DEFAULT_SHIFT_SUBMISSION_END_DAY(15), DEFAULT_SHIFT_SCHEDULING_START_DAY(16) を定義。configLoader で buildFromDefaults・merge にマッピング済み。
- **要件2**: types.ts L52-56 に StoreConfig.shift 型定義（submissionStartDay, submissionEndDay, schedulingStartDay）。
- **要件3**: lib/globalConstant.dart に SHIFT_SUBMISSION_START_DAY 等の定数は存在しない（削除済み）。
- **要件4**: shiftHomePage.dart L146-147, L163, L950, L957 で StoreConfigService.instance.latestData?.shiftSubmissionStartDay 等と kDefault* フォールバックを使用。store_config_service.dart, store_config_defaults.dart でパース・デフォルト定義済み。

**§2 GAP-2-1, GAP-2-2 のみ**（②を飛ばして③に進む）

**§3 該当なし**

### 取得失敗時の挙動設計

- 読めるがフィールドが存在しない: デフォルト（submissionStartDay=1, submissionEndDay=15, schedulingStartDay=16）を適用
- 読めない時: デフォルトを正とする  
→ `取得失敗時の挙動設計.md` に shift 行で記載済み

### 切り戻し手順

- リトライ後、A,B: デフォルトで実行＋エラーコード。C,D: デフォルトで実行可能な場合は実行＋エラーコード  
→ `設定の不具合時の対応.md` に shift 行で記載済み

### テスト要件整理

| 区分 | 内容 |
|------|------|
| Cursor が CL 等で確認するもの | 型チェック・lint。shift 系が StoreConfigService 参照であること |
| テストファイルで確認するもの | configLoader, phase2_migration, systemHealth で shift.submissionStartDay / submissionEndDay / schedulingStartDay。Flutter store_config_phase2_test |
| ユーザーが実機で確認するもの | シフト画面で提出期間・シフト組む期間の日付表示が config に従うか |

### テストファイルの確認・修正

- **Functions**: configLoader.spec.ts, phase2_migration.spec.ts, systemHealth.spec.ts で shift 3 フィールドを検証済み
- **Flutter**: store_config_phase2_test.dart で shift のパース・デフォルト・部分上書きを検証済み（L171-173, L315-317）
- 新規テスト不要

### テスト実行結果

- **Functions**: configLoader.spec, phase2_migration.spec, systemHealth.spec … 63 tests passed
- **Flutter**: store_config_phase2_test.dart … 28 tests passed

### 実機テスト結果

対象項目: シフト提出開始日・締切日・シフト組む日が config に従うか（シフト画面で日付表示を確認）

実機テストスキップ（他 ID と同様）
