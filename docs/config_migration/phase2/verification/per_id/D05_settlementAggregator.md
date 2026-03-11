# D-05: ENABLE_SETTLEMENT_AGGREGATOR — Phase2 検証ファイル

**※ 必ず `per_id_TASK4_PROCEDURE.md` を確認しながら進めること。**

バッチ: B（機能フラグ） | 対象 ID: D-05 | 対象層: Functions のみ

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 1 | 実装 | Functions: defineString / process.env 参照を `getStoreConfig().features.settlementAggregatorEnabled` に差し替え | ✅ |
| 2 | 実装 | Functions: 旧 defineString / process.env 参照を削除 | ✅ |
| 3 | 実装 | defaults.ts に `settlementAggregatorEnabled` のデフォルト値を定義（`true`） | ✅ |
| 4 | 実装 | types.ts の StoreConfig 型に `features.settlementAggregatorEnabled` を含める | ✅ |
| 5 | 手続き | 取得失敗時の挙動を設計・記録 | ✅ |
| 6 | 手続き | 切り戻し手順を記録 | ✅ |
| 7 | 手続き | ALL_ID_STATUS を「完了」に更新 | ✅ |

---

## 2. 実装漏れ・要調査事項（REQUIREMENTS_GAP_CHECK より）

### 確定した漏れ

| # | 内容 | 影響度 | 対応 |
|---|------|--------|------|
| GAP-2-1 | 取得失敗時の挙動設計が未記録 | 中 | ✅ 運用時資料に記載済み |
| GAP-2-2 | 切り戻し手順が未記録 | 中 | ✅ 運用時資料に記載済み。configLoader にエラーコード追加済み |

### 要調査事項

該当なし

---

## 3. 関連テスト失敗（VERIFICATION_TASK_ORDER より）

該当するテスト失敗事象なし

---

## 4. Task 4 実施記録

### 実装確認結果

**§1 確認**: 実装済み。`billsOnSettle.ts` が `getStoreConfig()` で storeConfig を取得し、`storeConfig.features?.settlementAggregatorEnabled` を参照している（L71, L176）。本番コードに defineString / process.env の参照は残っていない。`defaults.ts` に `DEFAULT_SETTLEMENT_AGGREGATOR_ENABLED = true`、`types.ts` に `settlementAggregatorEnabled?: boolean` が定義済み。手続き 5〜7 は ⑦-b で運用時資料に記載済み。

**§2 確認**: GAP-2-1, GAP-2-2 は運用時資料に記載済み。configLoader にエラーコード追加済み。

**§3 確認**: 該当するテスト失敗事象なしの通り。確認不要。

### 取得失敗時の挙動設計

**方針**: デフォルトを返す。storeMeta/config の取得失敗時（未存在・読み取りエラー）は `defaults.ts` の値を使用。**実装済み**（configLoader.ts: 未存在時・リトライ後も読み取り失敗時は `buildFromDefaults()` を返す）。

- **読めるがフィールドが存在しない**: 必ずデフォルト（`true`）を適用。実装済み（mergeWithDefaults で field_missing 時は defaults を使用）。
- **読めない（Firestore 障害等）**: A. デフォルトを正とする。実装済み。

詳細は `docs/運用時資料/設定/取得失敗時の挙動設計.md` を参照。

### 切り戻し手順（2-2 設定の不具合時の対応）

1. **リトライを必ず行う**
2. **A, B**（設定値の誤り・運用ミス）: デフォルト値で処理を実行し、エラーコード（`CONFIG_FALLBACK`）を出力。Firestore の値を修正して解消。
3. **C, D**（コードのバグ・不整合）: デフォルトで実行できる場合は実行＋エラーコード。それ以外は処理をスキップし、エラーコード出力＋画面に警告表示（「会計等の蓄積処理ができていないため、管理者にご連絡ください。」）
4. **本設定**（settlementAggregatorEnabled）は boolean のため常にデフォルトで実行可能。スキップは発生しない想定。
5. **エラーコード**: configLoader が `code: CONFIG_FALLBACK` または `CONFIG_READ_ERROR` をログに出力。クエリ例: `jsonPayload.code=CONFIG_FALLBACK AND jsonPayload.configKey=features.settlementAggregatorEnabled`

詳細は `docs/運用時資料/設定/設定の不具合時の対応.md` を参照。

### テスト要件整理

| 区分 | 内容 |
|------|------|
| Cursor が CL 等で確認するもの | `npx tsc --noEmit`、`flutter analyze`（Flutter 側に settlementAggregatorEnabled 参照あり） |
| テストファイルで確認するもの | `bills.onSettle.spec.ts`（enqueue 分岐）、`phase2_migration.spec.ts`、`systemHealth.spec.ts`（config 取得確認） |
| ユーザーが実機で確認するもの | storeMeta/config の `features.settlementAggregatorEnabled` 変更が、会計完了時の analytics（enqueueSettlement）の有無に反映されるか |

### テストファイルの確認・修正

**既存テストファイル**:
- `functions/__tests__/triggers/bills.onSettle.spec.ts`: `ENABLE_SETTLEMENT_AGGREGATOR` の enqueue 分岐テストあり。mockStoreConfig が `process.env.ENABLE_SETTLEMENT_AGGREGATOR` を `settlementAggregatorEnabled` に変換しているため、getStoreConfig 経由の実装と整合。修正不要。
- `functions/__tests__/config_migration/phase2_migration.spec.ts`: settlementAggregatorEnabled のデフォルト・Firestore 上書き確認あり。
- `functions/__tests__/health/systemHealth.spec.ts`: config.features.settlementAggregatorEnabled の確認あり。
- `test/services/store_config_phase2_test.dart`: Flutter 側の StoreConfig.settlementAggregatorEnabled テストあり。

**結論**: 既存テストで十分。新規テストは不要。

### テスト実行結果

- `bills.onSettle.spec.ts`: パス（ENABLE_SETTLEMENT_AGGREGATOR の enqueue 分岐含む）
- `phase2_migration.spec.ts`: パス（settlementAggregatorEnabled のデフォルト・上書き確認）
- `systemHealth.spec.ts`: パス（config.features.settlementAggregatorEnabled 確認）

### 実機テスト結果

**スキップ**。storeMeta/config の features.settlementAggregatorEnabled 変更が会計完了時の analytics（enqueueSettlement）の有無に反映されるかは未確認。
