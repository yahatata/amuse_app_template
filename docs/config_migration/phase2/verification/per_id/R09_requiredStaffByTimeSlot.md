# R-09: requiredStaffByTimeSlot — Phase2 検証ファイル

**※ 必ず `per_id_TASK4_PROCEDURE.md` を確認しながら進めること。**

バッチ: A1（Functions コア）+ A2（Flutter） | 対象 ID: R-09 | 対象層: Functions + Flutter

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）

### Functions 側

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 1 | 実装 | Functions: shift callables 6 箇所で `getRequiredStaffByTimeSlot()`（helpers）を使用。storeMeta/requiredStaffByTimeSlot から読み取り | 完了 |
| 2 | 実装 | Functions: `getRequiredStaffByTimeSlot()` ローカル定義を削除し、共通化 | 完了 |
| 3 | 実装 | Functions: 旧ハードコード配列を削除 | 完了 |
| 4 | 実装 | defaults.ts に `requiredStaffByTimeSlot` のデフォルト値を定義 | 完了 |

### Flutter 側

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 5 | 実装 | Flutter: globalConstant の requiredStaffByTimeSlot を削除 | 該当なし（元々なし） |
| 6 | 実装 | Flutter: shiftDateDialog.dart / shiftHomePage.dart が RequiredStaffByTimeSlotService を参照 | 完了 |

### 共通

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 7 | 手続き | 取得失敗時の挙動を設計・記録 | |
| 8 | 手続き | 切り戻し手順を記録 | |
| 9 | 手続き | ALL_ID_STATUS を「完了」に更新 | |

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

- **#1 差し替え**: 6 箇所とも `getStoreConfig().shift.requiredStaffByTimeSlot` を参照済み。finalizeDay.ts L12-17、finalizeMonth.ts L13-18、updateDayAssignments.ts L26-31、interimConfirmRequests.ts L24-29、setSufficientOverride.ts L17-22 は各ローカル `getRequiredStaffByTimeSlot()` 経由。helpers.ts L483-485 は `getStoreConfig()` 取得後 `config.shift?.requiredStaffByTimeSlot ?? []` を直接使用。→ **実装済み**
- **#2 共通化**: ② で実施済み。`getRequiredStaffByTimeSlot()` を `helpers.ts` に 1 本 export し、finalizeDay / finalizeMonth / updateDayAssignments / interimConfirmRequests / setSufficientOverride の 5 callables から import に差し替え。→ **実装済み**
- **#3 旧ハードコード削除**: 各 callable にハードコード配列はなく、フォールバックは `?? []`。→ **実装済み**
- **#4 defaults.ts**: `DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT` が defaults.ts L142-149 に定義。configLoader で `requiredStaffByTimeSlot: [...DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT]` をマッピング済み。→ **実装済み**
- **#5 Flutter globalConstant**: `lib/globalConstant.dart` に requiredStaffByTimeSlot は存在しない。→ **削除済み（該当なし）**
- **#6 Flutter**: shiftDateDialog.dart、shiftHomePage.dart とも RequiredStaffByTimeSlotService.instance を参照。storeMeta/requiredStaffByTimeSlot を snapshot で購読。→ **実装済み**

**§2 確認**: GAP-2-1（取得失敗時の挙動設計未記録）、GAP-2-2（切り戻し手順未記録）のみ。他に確定した漏れなし。→ **GAP-2-1 / GAP-2-2 のみのため ② を飛ばして ③ へ進む。**

**§3 確認**: 関連テスト失敗の記載なし。→ **該当なし**

### 取得失敗時の挙動設計

- 読めるがフィールドが存在しない: デフォルト（defaults の配列）を適用。
- 読めない時: デフォルトを正としてデフォルト処理を行う。  
→ `docs/運用時資料/設定/取得失敗時の挙動設計.md` に記載済み。

### 切り戻し手順

- リトライ → A,B: デフォルトで実行＋エラーコード。C,D: デフォルトで実行可能な場合は実行＋エラーコード。それ以外はスキップ＋エラーコード＋画面警告。  
→ `docs/運用時資料/設定/設定の不具合時の対応.md` に記載済み。

### テスト要件整理

| 区分 | 内容 |
|------|------|
| Cursor が CL 等で確認するもの | 型チェック・lint。shift 関連 callables が helpers の getRequiredStaffByTimeSlot を import していること |
| テストファイルで確認するもの | configLoader / phase2_migration で shift.requiredStaffByTimeSlot のデフォルト・マッピング。systemHealth で config.shift.requiredStaffByTimeSlot の期待値。Flutter store_config_phase2_test で requiredStaffByTimeSlot のパース・デフォルト |
| ユーザーが実機で確認するもの | シフト画面で時間帯別必要人数が StoreConfig から反映され、不足判定が期待通りになること（任意・スキップ可） |

### テストファイルの確認・修正

- **Functions**: `__tests__/config_migration/phase2_migration.spec.ts`（requiredStaffByTimeSlot のマッピング・長さ・requiredCount）、`__tests__/config/configLoader.spec.ts`、`__tests__/health/systemHealth.spec.ts`（config.shift?.requiredStaffByTimeSlot と DEFAULT_REQUIRED_STAFF_BY_TIME_SLOT）で既にカバー。新規テスト不要。
- **Flutter**: `test/services/store_config_phase2_test.dart` で requiredStaffByTimeSlot のパース・デフォルト・不正時フォールバックを検証済み。新規テスト不要。

### テスト実行結果

- **Functions**: phase2_migration.spec.ts, configLoader.spec.ts, systemHealth.spec.ts の 3 套を実行。63 tests passed（② 共通化後）。
- **Flutter**: store_config_phase2_test は既存で requiredStaffByTimeSlot を検証。実機テストはスキップ。

### 実機テスト結果

スキップ（ユーザー判断）。
