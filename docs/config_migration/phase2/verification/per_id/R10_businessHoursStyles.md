# R-10: businessHoursStyles — Phase2 検証ファイル

**※ 必ず `per_id_TASK4_PROCEDURE.md` を確認しながら進めること。**

バッチ: A1（Functions コア）+ A2（Flutter） | 対象 ID: R-10 | 対象層: Functions + Flutter

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）

### Functions 側

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 1 | 実装 | Functions: `styles.ts` 内のスタイル定数を削除し、`getStoreConfig().businessHoursStyles` に差し替え | ✅ |
| 2 | 実装 | Functions: `getBusinessHoursByStyleId()` 等を async 化し、呼び出し元を `await` 対応 | ✅ |
| 3 | 実装 | Functions: 「Flutter と同期必須」コメントを撤去 | ✅ |
| 4 | 実装 | defaults.ts に businessHoursStyles の全スタイル（weekday/weekendHoliday/event/allDay/closed）のデフォルト値を定義 | ✅ |

### Flutter 側

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 5 | 実装 | Flutter: globalConstant の businessHoursStyle* / businessHoursStyles を削除 | ✅ |
| 6 | 実装 | Flutter: businessDayEditPage.dart の参照を StoreConfigService に差し替え | ✅ |

### 共通

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 7 | 手続き | 取得失敗時の挙動を設計・記録 | ✅ 取得失敗時の挙動設計.md に追記済み |
| 8 | 手続き | 切り戻し手順を記録 | ✅ 設定の不具合時の対応.md に追記済み |
| 9 | 手続き | ALL_ID_STATUS を「完了」に更新 | ✅ per_id_PROGRESS 更新済み |

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
  - 要件1: `styles.ts` L4-6, L23-31 で `getStoreConfig()` 経由で `config.businessHoursStyles` を参照。スタイル定数は削除済み。
  - 要件2: `getBusinessHoursByStyleId()` は async、呼び出し元 4 箇所（setBusinessHoursManualForDay, generateBusinessHoursForMonthFromStyles, generateBusinessHoursForYearFromStyles, scheduleGenerateNextYearBusinessHours）で `await` 使用を確認。
  - 要件3: 「Flutter と同期必須」コメントは styles.ts に存在しない。
  - 要件4: `defaults.ts` L53-62 で DEFAULT_BUSINESS_HOURS_STYLES に weekday/weekendHoliday/event/allDay/closed を定義。
  - 要件5: `lib/globalConstant.dart` に businessHoursStyle* / businessHoursStyles は存在しない。store_config_defaults.dart に kDefaultBusinessHoursStyles を定義。
  - 要件6: `businessDayEditPage.dart` L441, 496, 608, 703 で `StoreConfigService.instance.latestData ?? StoreConfigData.fromDefaults()` の `getBusinessHoursByStyleId()` を参照。
- **§2 問題あり（GAP-2-1, 2-2 のみ）**: ② をスキップして ③ へ進む。⑦-a 完了後に運用時資料 2 ファイルに追記。
- **§3 問題なし**: 該当するテスト失敗事象なし。

### 取得失敗時の挙動設計

- **読めるがフィールドが存在しない**: 必ずデフォルト（weekday/weekendHoliday/event/allDay/closed の 5 スタイル）を適用。
- **読めない（Firestore 障害等）**: A. デフォルトを正とする。

運用時資料 `docs/運用時資料/設定/取得失敗時の挙動設計.md` に追記済み。

### 切り戻し手順

1. リトライを必ず行う。
2. A,B: デフォルトで実行＋エラーコード。
3. C,D: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定はオブジェクトのため、部分不正時はマージしてデフォルト補完。常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR`。

運用時資料 `docs/運用時資料/設定/設定の不具合時の対応.md` に追記済み。

### テスト要件整理

| 区分 | 内容 |
|------|------|
| Cursor が CL 等で確認するもの | `npx tsc --noEmit`、`flutter analyze` |
| テストファイルで確認するもの | phase2_migration（businessHoursStyles, getBusinessHoursByStyleId）、systemHealth、store_config_phase2_test |
| ユーザーが実機で確認するもの | 営業日編集でスタイル一覧が config に従うか（weekday / weekendHoliday 等が正しく表示されるか） |

### テストファイルの確認・修正

**既存テストファイル**:
- `phase2_migration.spec.ts`: businessHoursStyles のデフォルト・Firestore 上書き、getBusinessHoursByStyleId の単体テスト
- `systemHealth.spec.ts`: businessHoursStyles の全 5 スタイル整合性確認
- `store_config_phase2_test.dart`: businessHoursStyles のパース・上書き・getBusinessHoursByStyleId

### テスト実行結果

- Functions: phase2_migration, systemHealth 全 60 tests passed
- Flutter: store_config_phase2_test 全 29 tests passed

### 実機テスト結果

**スキップ**（ユーザー判断）

対象項目: 営業日編集でスタイル一覧が config に従うか（weekday / weekendHoliday 等が正しく表示されるか）
