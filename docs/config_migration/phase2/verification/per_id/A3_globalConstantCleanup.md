# A-5: globalConstant.dart クリーンアップ — Phase2 検証ファイル

**※ 必ず `per_id_TASK4_PROCEDURE.md` を確認しながら進めること。**

バッチ: A3（Web / クリーンアップ） | 対象 ID: A-5 | 対象層: Flutter（globalConstant.dart）

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 1 | 実装 | StoreConfigService に移行した全定数を globalConstant.dart から削除 | ✅ |
| 2 | 確認 | 残すべき定数のみが残っていることを確認（STORE_CLOSE_HOUR, schemaVersion, menuCategories, sideGameTypes, トーナメント設定, CRON 設定, ADMIN_CREATED_SHIFT_ID 等） | ✅ |

---

## 2. 実装漏れ・要調査事項（REQUIREMENTS_GAP_CHECK より）

### 確定した漏れ

該当なし（REQUIREMENTS_GAP_CHECK §1-4 で globalConstant.dart のクリーンアップ済みを確認済み）

### 要調査事項

該当なし

---

## 3. 関連テスト失敗（VERIFICATION_TASK_ORDER より）

該当するテスト失敗事象なし

---

## 4. Task 4 実施記録

### 実装確認結果

- **§1 実装済み**: REQUIREMENTS_GAP_CHECK §1-4 で確認済み。linePlan, businessHoursStyles, autoOpenClose, calcBuffer, payroll, shift, billing, entranceFee, settlementAggregator, dualWrite, enqueueScheduler, templateBusinessDateCheck, requiredStaff 等の移行済み定数は globalConstant.dart に存在しない。
- **§2 確認済み**: 残存定数は STORE_CLOSE_HOUR, STORE_CLOSE_DESCRIPTION, normalizeStoreCloseHour（Phase4）、schemaVersion, menuCategories, sideGameTypes, pointTypes（B-01〜B-05）、トーナメント設定（B-04）、CRON 設定（D-15）、ADMIN_CREATED_SHIFT_ID（B-07）のいずれも要件の「残すべき」一覧に含まれる。
- **§3 問題なし**: 該当するテスト失敗事象なし。

### テスト要件整理

| 区分 | 内容 |
|------|------|
| Cursor が CL 等で確認するもの | globalConstant.dart の定数一覧と要件の照合。移行済み定数の grep による不在確認 |
| テストファイルで確認するもの | 本 ID は削除確認のみ。configLoader / phase2_migration / store_config 等の既存テストで間接検証 |
| ユーザーが実機で確認するもの | なし（確認タスクのため） |

### テストファイルの確認・修正

既存テストで globalConstant 参照が壊れていないことを確認。修正不要。

### テスト実行結果

（削除確認のみのため、既存テストパスを前提とする）

### 実機テスト結果

対象なし（確認タスクのため）
