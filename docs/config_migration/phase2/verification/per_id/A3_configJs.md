# A-4: public/staff/config.js — Phase2 検証ファイル

**※ 必ず `per_id_TASK4_PROCEDURE.md` を確認しながら進めること。**

バッチ: A3（Web / クリーンアップ） | 対象 ID: A-4 | 対象層: Web（public/staff/config.js）

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 1 | 実装 | config.js の linePlan / isShiftRequestEnabled のハードコードを Firestore `storeMeta/config` JS SDK 読み取りに差し替え | ✅ |
| 2 | 実装 | 旧ハードコードを削除 | ✅ |

---

## 2. 実装漏れ・要調査事項（REQUIREMENTS_GAP_CHECK より）

### 確定した漏れ

該当なし

### 要調査事項

| # | GAP ID | 内容 | 影響度 | Task 4 結果 |
|---|--------|------|--------|-------------|
| 1 | GAP-3-5 | **`loadLinePlanFromFirestore()` の呼び出し有無**: 関数は定義されているが、Firebase 初期化後に呼び出されているかどうか未確認 | 中 | ✅ 解消: index.html L150-154 で Firebase 初期化後に呼び出し確認 |

※ この件は D04_linePlan.md にも記載あり。Web 固有の確認として本ファイルにも記載する。

---

## 3. 関連テスト失敗（VERIFICATION_TASK_ORDER より）

該当するテスト失敗事象なし

---

## 4. Task 4 実施記録

### 実装確認結果

- **§1 実装済み**
  - 要件1: `public/staff/config.js` L27-31 で linePlan 初期値 "communication"、loadLinePlanFromFirestore で Firestore storeMeta/config から読み取り上書き。isShiftRequestEnabled は linePlan !== 'communication' で算出。
  - 要件2: 旧 defineString(LINE_PLAN) 等のハードコードは存在しない。linePlan はデフォルト値で初期化し Firestore で上書きする構成。
- **§2 要調査（GAP-3-5）解消**: `public/staff/index.html` L150-154 で Firebase 初期化後に `await window.__CONFIG__.loadLinePlanFromFirestore(db)` を呼び出していることを確認。
- **§2 GAP-2-1/2-2**: ② をスキップして ③ へ進む。⑦-a 完了後に運用時資料 2 ファイルへ追記（D04 で linePlan は既に追記済み）。
- **§3 問題なし**: 該当するテスト失敗事象なし。

### テスト要件整理

| 区分 | 内容 |
|------|------|
| Cursor が CL 等で確認するもの | config.js の構文・loadLinePlanFromFirestore の定義、index.html での Firebase 初期化後の呼び出し |
| テストファイルで確認するもの | linePlan は D04 で configLoader, phase2_migration, systemHealth, store_config_phase2_test, store_config_service_test により検証済み。Web config.js 単体のユニットテストはなし（静的ファイルのため） |
| ユーザーが実機で確認するもの | Web staff ページで linePlan / isShiftRequestEnabled が Firestore 値に従うか（DevTools で __CONFIG__.linePlan 確認） |

### テストファイルの確認・修正

linePlan に関する既存テスト: configLoader.spec.ts, phase2_migration.spec.ts, systemHealth.spec.ts, store_config_phase2_test.dart, store_config_service_test.dart。A3 は Web 層のため、上記 Functions/Flutter テストで linePlan の config 連動を間接的に検証。修正不要。

### テスト実行結果

- Functions: configLoader.spec, phase2_migration.spec, systemHealth.spec → 63 tests passed
- Flutter: store_config_phase2_test.dart, store_config_service_test.dart → 32 tests passed

### 実機テスト結果

対象項目: Web staff ページで linePlan / isShiftRequestEnabled が Firestore 値に従うか（ブラウザ DevTools で確認）

スキップ（ユーザー判断）。D04 検証時に同内容を確認済み。
