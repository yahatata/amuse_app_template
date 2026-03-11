# R-07: 給与締め — Phase2 検証ファイル

**※ 必ず `per_id_TASK4_PROCEDURE.md` を確認しながら進めること。**

バッチ: A2（Flutter） | 対象 ID: R-07 | 対象層: Flutter（+ defaults.ts / types.ts 定義）

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 1 | 実装 | defaults.ts に payroll.startDay / payroll.endDay のデフォルト値を定義 | ✅ |
| 2 | 実装 | types.ts の StoreConfig 型に payroll を含める | ✅ |
| 3 | 実装 | Flutter: globalConstant の PAYROLL_START_DAY / PAYROLL_END_DAY を削除 | ✅ |
| 4 | 実装 | Flutter: 該当する画面参照を StoreConfigService に差し替え | ✅ |
| 5 | 手続き | 取得失敗時の挙動を設計・記録 | ✅ 運用時資料に記載 |
| 6 | 手続き | 切り戻し手順を記録 | ✅ 運用時資料に記載 |
| 7 | 手続き | ALL_ID_STATUS を「完了」に更新 | ✅ 完了済み |

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

**§1 確認**: 実装済み。`defaults.ts` に `DEFAULT_PAYROLL_START_DAY=26`, `DEFAULT_PAYROLL_END_DAY=25`。`types.ts` に `payroll?: { startDay?, endDay? }`。`globalConstant.dart` に `PAYROLL_START_DAY`/`PAYROLL_END_DAY` は存在せず（削除済み）。`allStaffAttendancePage.dart` が `StoreConfigService.instance.latestData?.payrollStartDay` / `payrollEndDay` と `kDefaultPayrollStartDay` / `kDefaultPayrollEndDay` を使用。手続き 5〜7 は GAP-2-1, 2-2 のため ⑦-a 完了後に運用時資料へ記載予定。

**§2 確認**: 確定した漏れ（GAP-2-1, GAP-2-2）の通り。要調査事項なし。② を飛ばして③ に進む。

**§3 確認**: 該当するテスト失敗事象なしの通り。確認不要。

### 取得失敗時の挙動設計

- **読めるがフィールドが存在しない**: 必ずデフォルト（startDay=26, endDay=25）を適用。
- **読めない（Firestore 障害等）**: A. デフォルトを正とする。

運用時資料 `docs/運用時資料/設定/取得失敗時の挙動設計.md` に記載済み。

### 切り戻し手順

1. リトライを必ず行う。
2. A,B: デフォルトで実行＋エラーコード。
3. C,D: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定は 1〜31 の数値のため常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR`。

運用時資料 `docs/運用時資料/設定/設定の不具合時の対応.md` に記載済み。

### テスト要件整理

| 区分 | 内容 |
|------|------|
| Cursor が CL 等で確認するもの | `npx tsc --noEmit`、`flutter analyze` |
| テストファイルで確認するもの | configLoader, phase2_migration, systemHealth（payroll フィールド）、store_config_phase2_test（payroll R-07） |
| ユーザーが実機で確認するもの | 給与締め日が config に従うか（給与・勤怠画面で締め日が正しく反映されているか） |

### テストファイルの確認・修正

**既存テストファイル**:
- `functions/__tests__/config/configLoader.spec.ts`: buildFromDefaults の payroll 確認あり
- `functions/__tests__/config_migration/phase2_migration.spec.ts`: payroll のデフォルト・Firestore 上書き確認あり
- `functions/__tests__/health/systemHealth.spec.ts`: payroll 期間 1〜31 検証、Firestore 上書き確認あり
- `test/services/store_config_phase2_test.dart`: payroll (R-07) の fromDefaults・fromMap 確認あり

**結論**: 既存テストで十分。新規テストは不要。

### テスト実行結果

- `configLoader.spec.ts`: パス
- `phase2_migration.spec.ts`: パス
- `systemHealth.spec.ts`: パス
- `store_config_phase2_test.dart`: パス
- `store_config_service_test.dart`: パス

### 実機テスト結果

対象項目: 給与締め日が config に従うか（給与・勤怠画面で締め日が正しく反映されているか確認）

**スキップ**（ユーザー判断）
