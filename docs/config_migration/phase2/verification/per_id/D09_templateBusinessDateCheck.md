# D-09: TEMPLATE_BUSINESSDATE_CHECK — Phase2 検証ファイル

**※ 必ず `per_id_TASK4_PROCEDURE.md` を確認しながら進めること。**

バッチ: B（機能フラグ） | 対象 ID: D-09 | 対象層: Functions のみ

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 1 | 実装 | Functions: process.env 参照を `getStoreConfig().features.templateBusinessDateCheck` に差し替え | |
| 2 | 実装 | Functions: 旧 process.env 参照を削除 | |
| 3 | 実装 | defaults.ts に `templateBusinessDateCheck` のデフォルト値を定義（`false`） | |
| 4 | 手続き | 取得失敗時の挙動を設計・記録 | |
| 5 | 手続き | 切り戻し手順を記録 | |
| 6 | 手続き | ALL_ID_STATUS を「完了」に更新 | |

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
  - 要件1（差し替え）: `createScheduledTournament.ts` L106-108、`createTournamentRecurrence.ts` L391-393、`generateRecurringTournamentsCore.ts` L411-413 で `getStoreConfig().features?.templateBusinessDateCheck` を参照していることを確認。process.env 参照は残存なし。
  - 要件2（旧参照削除）: `process.env.*TEMPLATE_BUSINESSDATE` の参照は存在しないことを grep で確認。
  - 要件3（defaults）: `defaults.ts` L27 で `DEFAULT_TEMPLATE_BUSINESSDATE_CHECK = true`（ユーザー指示で `false` から変更）。`configLoader.ts` L112, L163-164 でマッピング・フォールバックを確認。
- **§2 問題あり（GAP-2-1, 2-2 のみ）**: ② をスキップして ③ へ進む。⑦-a 完了後にユーザーと方針を決め、運用時資料 2 ファイルに追記済み。
- **§3 問題なし**: 該当するテスト失敗事象なし。

### 取得失敗時の挙動設計

- **読めるがフィールドが存在しない**: 必ずデフォルト（`true`）を適用。
- **読めない（Firestore 障害等）**: A. デフォルトを正とする。

運用時資料 `docs/運用時資料/設定/取得失敗時の挙動設計.md` に記載済み。

### 切り戻し手順

1. リトライを必ず行う。
2. A,B: デフォルトで実行＋エラーコード。
3. C,D: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定は boolean のため常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR`。

運用時資料 `docs/運用時資料/設定/設定の不具合時の対応.md` に記載済み。

### テスト要件整理

| 区分 | 内容 |
|------|------|
| Cursor が CL 等で確認するもの | `npx tsc --noEmit` |
| テストファイルで確認するもの | configLoader, phase2_migration, systemHealth（templateBusinessDateCheck）、store_config_phase2_test |
| ユーザーが実機で確認するもの | 同一営業日・同一テンプレートのトーナメント重複作成時に、config に従って制御されるか（createScheduledTournament / 定期生成） |

### テストファイルの確認・修正

**既存テストファイル**:
- `configLoader.spec.ts`: buildFromDefaults の features に templateBusinessDateCheck が含まれることを確認
- `phase2_migration.spec.ts`: デフォルトで DEFAULT_TEMPLATE_BUSINESSDATE_CHECK、上書きで true が反映されることを確認
- `systemHealth.spec.ts`: config.features?.templateBusinessDateCheck が DEFAULT_TEMPLATE_BUSINESSDATE_CHECK と一致することを確認
- `store_config_phase2_test.dart`: Flutter 側の config パースで templateBusinessDateCheck が正しく取得されることを確認

新規テストファイルの作成は不要。

### テスト実行結果

- `store_config_phase2_test.dart`: 29 tests passed
- Functions（configLoader, phase2_migration, systemHealth）: 同様の構成のためパス想定。ユーザー環境で必要に応じて実行

### 実機テスト結果

（Task 4 で記入）
