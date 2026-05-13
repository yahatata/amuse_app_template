# 実装サマリ B（第2段階：`console.error` の `logOpsError` 化）

## 1. 目的

仕様（実装サマリ A §6・As-is §6.2 / §8）どおり、**既存の `console.error` 呼び出し**を A と同様に **`logOpsError` 1 回**へ寄せ、Cloud Logging 上の **構造化フィールド**（`failureType` / `functionEntry` / `cause` 由来の `errorMessage` 等）で横断比較できるようにする。

---

## 2. 変更範囲

| 区分 | 内容 |
|------|------|
| **対象** | `functions/src/**/*.ts` にあった **`console.error(...)`**（呼び出し行ベース） |
| **最終出力** | いずれも **`logOpsError` → `logger.error` 1 回**（A と同じ共通モジュール） |
| **対象外（例）** | `functions/__tests__/**`、`functions/scripts/**` 内の `console.error`（ローカル検証・スクリプト用のため未変更） |

**規模（本リポジトリの差分目安）:** `functions/src` で **113 ファイル**、`+1000 / -194` 行程度（`git diff --stat` ベース）。

---

## 3. `failureType` の付け方（概要）

- **原則:** Callable・業務処理の失敗は **`business`**。スケジューラ／月次トリガ等は **`scheduled`**。Webhook 系は **`webhook`**。未使用ライブラリは **`internal`**。ストアメタのスクリプト等は **`internal`** を使用した箇所あり。
- **Scheduler 補足:** `enqueueTournamentTasksByScheduler` / `generateRecurringTournamentsByScheduler` / `scheduleGenerateNextYearBusinessHours` 等は **`scheduled`**。
- **`functionEntry`:** 原則 **Cloud Functions の `export const` 名**（ヘルパのみのファイルは関数名・モジュールに合わせて統一）。

---

## 4. 実装上の特記（手修正を含む）

1. **複数行の `console.error`**  
   「`=== タイトル ===` + `console.error(error)`」などは **1 回の `logOpsError`** に統合（二重 ERROR 行を増やさない）。

2. **サイドゲーム（`depositTip` / `registerForSideGame` / `leaveSeat` / `withdrawTip`）**  
   置換後も **`console.error('エラー詳細:', { ... })` が残る**ケースがあったため、**第2引数のオブジェクト出力を削除**し、`cause` に寄せた **単一の `logOpsError`** にした。

3. **`generateQRCode.ts`**  
   トランザクション失敗時の **複数行 `console.error`** を **`logOpsError` 1 回**に統合（Phase B 用の置換ロジックで対応）。

4. **`getActionLogs.ts`**  
   `console.error("[getActionLogs] error:", message, error)` を **`logOpsError` + `context.detailMessage`** に整理。

5. **`qrCodeUtils.ts`**  
   Storage 保存失敗の `console.error` を `logOpsError` 化。`deleteOldQRCodeFiles` の **`functionEntry` を `unknown` のままにしない**よう `deleteOldQRCodeFiles` に修正。

6. **`setRankingData.ts`**  
   置換の途中で **`console.error` と `logOpsError` が重複**したため、**`logOpsError` のみ**に整理。

7. **`EnqueueTournamentTasksByScheduler.ts`**  
   **`functionEntry` を export 名 `enqueueTournamentTasksByScheduler` に統一**（誤って `runEnqueueTournamentTasksByScheduler` となっていた箇所を修正）。

8. **`GenerateRecurringTournamentsByScheduler.ts`**  
   失敗分岐の `console.error(result.error)` を **`logOpsError`（`errorMessage`）** に変更。

9. **`import { logOpsError }` の挿入位置**  
   自動処理の都合で **`import { ... }` の複数行ブロック途中に挿入されて構文エラー**になったファイル（例: `clockOut.ts`、`rollbackAction.ts`、`cleanupActiveStaysOnClose.ts` 等）を **手でブロック外に移動**して修正。

10. **`src/shared/**` 配下の相対パス**  
    `shared/businessHours/scheduler`・`shared/devices/callables` 等は **`../../logging/logOpsError`**（`src/shared/logging`）が正。**誤った `../../../logging/logOpsError`** を **`../../logging/logOpsError`** に修正済み。

---

## 5. 検証

- `cd functions && npm run build`（`tsc`）**成功**。
- `functions/src` 配下で **`console.error(` は 0 件**（`grep` 確認）。

---

## 6. 関連ドキュメント

- 実装サマリ A: [`logOpsError実装サマリA.md`](./logOpsError実装サマリA.md)
- As-is 分類: [`../04_仕様書/logOpsError実装/As-is_エラー出力箇所の洗い出しと分類.md`](../04_仕様書/logOpsError実装/As-is_エラー出力箇所の洗い出しと分類.md)
- 仕様本文: [`../04_仕様書/logOpsError実装/保守運用時のエラーログ.md`](../04_仕様書/logOpsError実装/保守運用時のエラーログ.md)
