# R-06: 入店料 — Phase2 検証ファイル

**※ 必ず `per_id_TASK4_PROCEDURE.md` を確認しながら進めること。**

バッチ: A2（Flutter） | 対象 ID: R-06 | 対象層: Flutter（+ defaults.ts / types.ts 定義）

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 1 | 実装 | defaults.ts に entranceFee / entranceFeeDescription / chargeEntranceFeeOnReentry のデフォルト値を定義 | 完了 |
| 2 | 実装 | types.ts の StoreConfig 型に billing.entranceFee 等を含める | 完了 |
| 3 | 実装 | Flutter: globalConstant の入店料定数を削除 | 完了 |
| 4 | 実装 | Flutter: 該当する画面参照を StoreConfigService に差し替え | 完了 |
| 5 | 手続き | 取得失敗時の挙動を設計・記録 | 完了 |
| 6 | 手続き | 切り戻し手順を記録 | 完了 |
| 7 | 手続き | ALL_ID_STATUS を「完了」に更新 | 完了 |

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

**§1 確認**

| # | 要件 | 確認結果 | 確認箇所 |
|---|------|----------|----------|
| 1 | defaults.ts にデフォルト値定義 | ✅ 実装済み | defaults.ts L69-76: DEFAULT_ENTRANCE_FEE, DEFAULT_ENTRANCE_FEE_DESCRIPTION, DEFAULT_CHARGE_ENTRANCE_FEE_ON_REENTRY |
| 2 | types.ts に StoreConfig 型含める | ✅ 実装済み | types.ts L38-40: billing.entranceFee, entranceFeeDescription, chargeEntranceFeeOnReentry |
| 3 | Flutter: globalConstant の入店料定数削除 | ✅ 実装済み | globalConstant.dart: 入店料関連定数なし（既に削除済み） |
| 4 | Flutter: 該当画面を StoreConfigService に差し替え | ✅ 実装済み | userQRCheckInPage.dart L57-59、UserManualCheckInPage.dart L50-52: StoreConfigService.instance.latestData?.entranceFee 等、kDefault* フォールバック |

**§2 確認**: GAP-2-1（取得失敗時の挙動設計未記録）、GAP-2-2（切り戻し手順未記録）のみ。② を飛ばして ③ へ進む。

**§3 確認**: 該当するテスト失敗事象なし。

### 取得失敗時の挙動設計

- 読めるがフィールドが存在しない: デフォルト（entranceFee: 1000, entranceFeeDescription: "入店料", chargeEntranceFeeOnReentry: false）を適用
- 読めない時: デフォルトを正として処理を実行  
→ `取得失敗時の挙動設計.md` に billing 行で entranceFee を含めて記載済み

### 切り戻し手順

- リトライ → A,B: デフォルトで実行＋エラーコード。C,D: デフォルトで実行可能な場合は実行＋エラーコード  
→ `設定の不具合時の対応.md` に billing 行で記載済み

### テスト要件整理

| 区分 | 内容 |
|------|------|
| Cursor が CL 等で確認するもの | 型チェック・lint。entranceFee 系が StoreConfigService 参照であること |
| テストファイルで確認するもの | configLoader, phase2_migration, systemHealth で billing.entranceFee 等。Flutter store_config_phase2_test, store_config_service_test |
| ユーザーが実機で確認するもの | 来店画面で入店料金額・説明文・再入店時課金が config に従うこと |

### テストファイルの確認・修正

- **Functions**: configLoader.spec.ts, phase2_migration.spec.ts, systemHealth.spec.ts で entranceFee / entranceFeeDescription / chargeEntranceFeeOnReentry を検証済み
- **Flutter**: store_config_phase2_test.dart, store_config_service_test.dart で entranceFee 系のパース・デフォルトを検証済み

### テスト実行結果

- **Functions**: configLoader.spec.ts, phase2_migration.spec.ts, systemHealth.spec.ts の 3 套を実行。63 tests パス。
- **Flutter**: store_config_phase2_test, store_config_service_test で entranceFee 系を検証済み（既存テストでカバー）

### 実機テスト結果

対象項目: 入店料の金額・説明文・再入店時課金が config に従うか（来店画面で入店料表示を確認）

（Task 4 で記入）
