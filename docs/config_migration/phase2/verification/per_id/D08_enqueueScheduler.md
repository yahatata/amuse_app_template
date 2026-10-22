# D-08: ENQUEUE_SCHEDULER_ENABLED — Phase2 検証ファイル

**※ 必ず `per_id_TASK4_PROCEDURE.md` を確認しながら進めること。**

バッチ: B（機能フラグ） | 対象 ID: D-08 | 対象層: Functions のみ

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 1 | 実装 | Functions: process.env 参照を `getStoreConfig().features.enqueueSchedulerEnabled` に差し替え | ✅ |
| 2 | 実装 | Functions: 旧 process.env 参照を削除 | ✅ |
| 3 | 実装 | defaults.ts に `enqueueSchedulerEnabled` のデフォルト値を定義（`true`） | ✅ |
| 4 | 手続き | 取得失敗時の挙動を設計・記録 | ✅ 運用時資料に記載 |
| 5 | 手続き | 切り戻し手順を記録 | ✅ 運用時資料に記載 |
| 6 | 手続き | ALL_ID_STATUS を「完了」に更新 | ✅ 完了済み |

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

**§1 確認**:

- **要件 1**（process.env 参照を `getStoreConfig().features.enqueueSchedulerEnabled` に差し替え）  
  - `EnqueueTournamentTasksByScheduler.ts` L24-26: `getStoreConfig()` で config を取得し、`config.features?.enqueueSchedulerEnabled` を参照。`false` のとき即 return。  
  - `enqueueTournamentTasksCore.ts` L270-274: `runEnqueueTournamentTasks` 入口で `getStoreConfig()` を呼び、`storeConfig.features?.enqueueSchedulerEnabled` を参照。`false` のとき `{ success: true, processedCount: 0, enqueuedCount: 0 }` を返す。  
  - 呼び出し元（Scheduler, enqueueTournamentTasks callable, createScheduledTournament, createTournamentRecurrence, generateRecurringTournamentsCore）はいずれも Core 経由で呼ぶため、Core 内のガードで統一されている。  
  → **要件を満たしている**

- **要件 2**（旧 process.env 参照を削除）  
  - `functions/src` 内で `process.env.ENQUEUE_SCHEDULER_ENABLED` を参照している箇所はなし。  
  - `EnqueueTournamentTasksByScheduler.ts` L5 のコメントに "ENQUEUE_SCHEDULER_ENABLED" という文字列があるが、実装上の参照ではない。  
  → **要件を満たしている**

- **要件 3**（defaults.ts にデフォルト値を定義）  
  - `defaults.ts` L23-24: `DEFAULT_ENQUEUE_SCHEDULER_ENABLED = true`。  
  - `configLoader.ts` L111: `buildFromDefaults()` で `enqueueSchedulerEnabled: DEFAULT_ENQUEUE_SCHEDULER_ENABLED`。  
  - `configLoader.ts` L161-162: `mergeWithDefaults` で `features.enqueueSchedulerEnabled` をマージ。  
  - `types.ts` L23: `StoreConfig.features.enqueueSchedulerEnabled?: boolean`。  
  → **要件を満たしている**

**§2 確認**: 確定した漏れは GAP-2-1, GAP-2-2 のみ。② を飛ばして ③ に進む。

**§3 確認**: 該当するテスト失敗事象なし。確認不要。

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
| テストファイルで確認するもの | configLoader, phase2_migration, systemHealth（enqueueSchedulerEnabled）、store_config_phase2_test |
| ユーザーが実機で確認するもの | enqueue バッチが config に従って実行/スキップされるか |

### テストファイルの確認・修正

**既存テストファイル**:
- `configLoader.spec.ts`: buildFromDefaults の features に enqueueSchedulerEnabled が含まれることを確認
- `phase2_migration.spec.ts`: enqueueSchedulerEnabled のデフォルト値・Firestore 上書きを確認
- `systemHealth.spec.ts`: config.features?.enqueueSchedulerEnabled のデフォルト・Firestore 上書きを確認
- `store_config_phase2_test.dart`: fromDefaults で enqueueSchedulerEnabled、fromMap で features フラグ上書き（enqueueSchedulerEnabled: true）を確認

**結論**: 既存テストで十分。新規テストは不要。

### テスト実行結果

- configLoader.spec.ts: パス
- phase2_migration.spec.ts: パス
- systemHealth.spec.ts: パス
- store_config_phase2_test.dart: パス

### 実機テスト結果

**スキップ**（ユーザー判断）
