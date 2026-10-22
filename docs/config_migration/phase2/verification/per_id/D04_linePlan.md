# D-04: linePlan — Phase2 検証ファイル

**※ 必ず `per_id_TASK4_PROCEDURE.md` を確認しながら進めること。**

バッチ: A1（Functions コア）+ A2（Flutter）+ A3（Web） | 対象 ID: D-04 | 対象層: Functions + Flutter + Web

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）

### Functions 側

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 1 | 実装 | Functions: `lineWebhook.ts` の defineString("LINE_PLAN") を `getStoreConfig().linePlan` に差し替え | ✅ |
| 2 | 実装 | Functions: `confirmShiftRequest.ts` の defineString 参照を差し替え | ✅ |
| 3 | 実装 | Functions: 旧 defineString 2 箇所を削除 | ✅ |
| 4 | 実装 | defaults.ts に `linePlan` のデフォルト値を定義（`"communication"`） | ✅ |

### Flutter 側

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 5 | 実装 | Flutter: globalConstant の linePlan / isShiftRequestEnabled / linePlanName を削除 | ✅ |
| 6 | 実装 | Flutter: 該当する画面参照を StoreConfigService に差し替え | ✅ |

### Web 側

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 7 | 実装 | Web: `public/staff/config.js` のハードコードを Firestore JS SDK 読み取りに差し替え | ✅ |

### 共通

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 8 | 手続き | 取得失敗時の挙動を設計・記録 | ✅ 取得失敗時の挙動設計.md に追記済み |
| 9 | 手続き | 切り戻し手順を記録 | ✅ 設定の不具合時の対応.md に追記済み |
| 10 | 手続き | ALL_ID_STATUS を「完了」に更新 | ✅ per_id_PROGRESS 更新済み |

---

## 2. 実装漏れ・要調査事項（REQUIREMENTS_GAP_CHECK より）

### 確定した漏れ

| # | 内容 | 影響度 |
|---|------|--------|
| GAP-2-1 | 取得失敗時の挙動設計が未記録 | 中 |
| GAP-2-2 | 切り戻し手順が未記録 | 中 |

### 要調査事項

| # | GAP ID | 内容 | 影響度 |
|---|--------|------|--------|
| 1 | GAP-3-5 | **config.js の `loadLinePlanFromFirestore()` 呼び出し有無**: 関数は定義済みだが、Firebase 初期化後に呼び出されているかどうか未確認。呼ばれていない場合、常にデフォルト値 `"communication"` が使われる | 中 |

---

## 3. 関連テスト失敗（VERIFICATION_TASK_ORDER より）

該当するテスト失敗事象なし

---

## 4. Task 4 実施記録

### 実装確認結果

- **§1 実装済み**
  - 要件1: `lineWebhook.ts` L114-117 で `getStoreConfig()` を呼び、`storeConfig.linePlan === 'communication'` で判定。defineString("LINE_PLAN") は存在しない（STAFF_RICHMENU_ID / USER_RICHMENU_ID は別用途）。
  - 要件2: `confirmShiftRequest.ts` L30-31 で `getStoreConfig()` を呼び、`config.linePlan === 'communication'` で判定。
  - 要件3: 旧 defineString("LINE_PLAN") 2 箇所は削除済み。
  - 要件4: `defaults.ts` L106 で `DEFAULT_LINE_PLAN = 'communication'`。
  - 要件5: `lib/globalConstant.dart` に linePlan / isShiftRequestEnabled / linePlanName は存在しない。store_config_defaults に kDefaultLinePlan。
  - 要件6: Flutter で linePlan を直接参照する画面は検索されず。store_config_service 経由で config に格納。該当画面が元々無いか、削除済みと判断。
  - 要件7: `public/staff/config.js` に `loadLinePlanFromFirestore()` を定義。`public/staff/index.html` L38-39 で Firebase 初期化後に `await window.__CONFIG__.loadLinePlanFromFirestore(db)` を呼び出し。GAP-3-5 解消。
- **§2 問題あり（GAP-2-1, 2-2 のみ）**: ② をスキップして ③ へ進む。⑦-a 完了後に運用時資料 2 ファイルに追記。
- **§2 要調査（GAP-3-5）**: loadLinePlanFromFirestore は staff/index.html で Firebase 初期化後に呼ばれている。✅ 解消。
- **§3 問題なし**: 該当するテスト失敗事象なし。

### 取得失敗時の挙動設計

- **読めるがフィールドが存在しない**: 必ずデフォルト（`"communication"`）を適用。
- **読めない（Firestore 障害等）**: A. デフォルトを正とする。

運用時資料 `docs/運用時資料/設定/取得失敗時の挙動設計.md` に追記済み。

### 切り戻し手順

1. リトライを必ず行う。
2. A,B: デフォルトで実行＋エラーコード。
3. C,D: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定は string のため常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR`。

運用時資料 `docs/運用時資料/設定/設定の不具合時の対応.md` に追記済み。

### テスト要件整理

| 区分 | 内容 |
|------|------|
| Cursor が CL 等で確認するもの | `npx tsc --noEmit`、`flutter analyze` |
| テストファイルで確認するもの | phase2_migration（linePlan）、configLoader、systemHealth、store_config_phase2_test、store_config_service_test |
| ユーザーが実機で確認するもの | linePlan に応じたシフト辞退等の動作（LINE 連携がある場合、プラン種別に応じた機能の有無） |

### テストファイルの確認・修正

**既存テストファイル**:
- `phase2_migration.spec.ts`: linePlan のデフォルト・Firestore 上書き・無効値フォールバック
- `configLoader.spec.ts`: getStoreConfig で linePlan 取得
- `systemHealth.spec.ts`: linePlan の整合性
- `store_config_phase2_test.dart` / `store_config_service_test.dart`: linePlan のパース・上書き

### テスト実行結果

- Functions: phase2_migration, configLoader, systemHealth 全 63 tests passed
- Flutter: store_config_phase2_test, store_config_service_test 全 33 tests passed

### 実機テスト結果

**スキップ**（ユーザー判断）

対象項目: linePlan に応じたシフト辞退等の動作（LINE 連携がある場合、プラン種別に応じた機能の有無を確認）
