# トリガ設計計画（ドラフト）

_最終更新: 2025-11-10 (JST)_

## 0. 目的
- 会計確定トリガ（settlement trigger）とイベント差分トリガ（event differential trigger）の骨子を定義し、実装時の再計算ロジック・冪等性・エラーハンドリングを明文化する。
- `schema_plan.md` で定義したサマリフィールドと `helper_api_plan.md` のヘルパAPI方針をトリガ内で具現化する。

## 1. Settlement Trigger
### 1.1 発火条件
- トリガ種別: Firestore onUpdate
- 対象: `/bills/{billId}` 親ドキュメント
- 条件: `before.status == 'settling'` かつ `after.status == 'settled'`
- ガード: `before.meta.schemaVersion` から `after.meta.schemaVersion` への遷移を検証し、サポート対象外であれば `failed-precondition`

### 1.2 入出力
- 入力: 親ドキュメント (`after`), サブコレクション `/items`, `/extras`, `/payments`, `/sideGameChips`, `/tournaments`
- 出力: 親フィールド更新（`amounts.*`, `categoryBreakdown`, `paymentTotals`, `itemsSnapshot`, `sideGameChipsSummary`, `tournamentsSnapshot`, `paymentsSummary`, `postEvents.netSalesIncl`, `closedAt`, `meta.contentHash`, `updatedAt`）

### 1.3 処理フロー（疑似コード）
1. `runTransaction(async tx => …)`
2. トランザクション内で最新の親docを取得し、`status == 'settling'` を確認（`failed-precondition`）
3. サブコレクションを `tx.get` でまとめて読み取り
4. 再計算ユーティリティ (`snapshots.calculateAmounts`, `calculateCategoryBreakdown`, `calculatePaymentTotals`, `calculateSnapshots`) を呼び出し
5. `itemsSnapshot` サイズが 700KB を超える場合は売上額 Top50 に圧縮
6. `paymentsSummary.balanceDueIncl`・`postEvents.netSalesIncl` が 0 以上であることをチェック
7. 親の更新セットを作成：
   - `amounts`, `categoryBreakdown`, `paymentTotals`, `itemsSnapshot`, `sideGameChipsSummary`, `tournamentsSnapshot`
   - `paymentsSummary = { paidTotalIncl, balanceDueIncl, byMethod }`
   - `postEvents.netSalesIncl = amounts.grandTotalRounded`（初期化）
   - `postEvents.totalRefundedIncl = 0`, `postEvents.totalAdjustmentsIncl = 0`
   - `closedAt = serverTimestamp()`, `updatedAt = serverTimestamp()`, `meta.contentHash = hash(normalizedSummary)`
8. `status` が `settled` のままであることを確認しつつ `tx.update`
9. トランザクション外で Analytics トリガ（クローズ日集計）を呼び出し（非同期）
10. ログ: 成功/失敗、計算時間、itemsSnapshot 圧縮有無

### 1.4 冪等性
- `status` がすでに `settled` で `meta.contentHash` が存在する場合は no-op
- 再試行時は `snapshots` 計算結果が同じなら `meta.contentHash` も一致し、副作用なし

### 1.5 エラー/再試行
- バリデーション違反: `failed-precondition`
- 予期せぬエラー: `internal`、再試行可
- 再試行バックオフ: 0.5s → 1s → 2s → 4s → 8s（最大 5 回）

### 1.6 テスト観点
- 正常ケース: サブコレ → 親サマリの整合成立
- 冪等: 同じ入力で再試行 → `meta.contentHash` 変更なし
- サイズ上限: `itemsSnapshot` が Top50 化される
- 夜間跨ぎ: `businessDate` を跨ぐデータで `closedAt` と `businessDate` が矛盾しない
- Dual write ON/OFF: 旧 `todaysBills` 未更新でもサマリは正

## 2. Event Differential Trigger
### 2.1 発火条件
- トリガ種別: Firestore onCreate
- 対象: `/bills/{billId}/events/{eventId}`
- 条件: `eventId` = idempotencyKey（命名規約）

### 2.2 入出力
- 入力: event doc (`type`, `refund`, `adjustment`, `originBusinessDate`, `eventBusinessDate`, `idempotencyKey`, `reason` ...)、親 doc 現在値
- 出力: 親 doc の `postEvents.*`, `paymentsSummary`, `status`, `updatedAt`, `meta.contentHash`、Analytics 差分更新

### 2.3 処理フロー
1. `runTransaction(async tx => …)`
2. 親docを `tx.get`。`status` が `settled` / `partially_refunded` / `refunded` / `voided` の場合のみイベント適用（`open` 等は `failed-precondition`）。タイプ別に追加ガードを適用（例: reopen は `settled` 系のみ、cancel は入出金ゼロ時のみ）。
3. イベント種別ごとの差分計算：
   - refund: `totalRefundedIncl += refund.amountIncl`、`paymentsSummary.byMethod[refund.method] -= amount`（下限 0）
   - adjustment: `totalAdjustmentsIncl += sign * amount`, `paymentsSummary` も反映
   - cancel: `status = 'voided'`（サマリは不変）
   - reopen: `status = 'in_progress'`, 再確定を待つ
4. `postEvents.netSalesIncl = grandTotalRounded - totalRefundedIncl + totalAdjustmentsIncl` が ≥0 を保証
5. `paymentsSummary.balanceDueIncl = max(0, grandTotalRounded - paidTotalIncl)`
6. `updatedAt = serverTimestamp()`, `meta.contentHash` を再計算
7. 返金が総額一致 → `status = 'refunded'`; 0 < 返金 < 合計 → `status = 'partially_refunded'`
8. `tx.update` 親doc
9. トランザクション外で Analytics 差分処理をトリガ（非同期）。`originBusinessDate` 基準の日次/月次へ反映
10. ログ: eventId, 反映金額, netSales 変化

### 2.4 冪等性
- `eventId` が既に存在 → Firebase onCreate は発火しない
- 再送による二重適用は idempotencyKey で排除
- Analytics 差分ロジックには `aggregationMarkers` を用い、同 eventId の再処理を弾く

### 2.5 バリデーション
- `refund.amountIncl <= paymentsSummary.paidTotalIncl`
- `paymentsSummary.balanceDueIncl >= 0`
- `postEvents.netSalesIncl >= 0`
- `originBusinessDate` が `businessDate` と整合（違えば矯正 or `failed-precondition`）

### 2.6 エラー/再試行
- 冪等性違反（ID重複）: no-op
- 金額矛盾: `failed-precondition`
- Analytics 差分失敗: Cloud Tasks 等で再試行キュー化を検討

### 2.7 テスト観点
- Refund 100% → `status='refunded'`
- Refund 50% → `status='partially_refunded'`
- Adjustment +/− → netSales, paymentsSummary balance 変化
- カスタム eventBusinessDate → 監査ログで反映、originBusinessDate に基づき Analytics 更新
- idempotency: 同じ eventId で再送 → 2 回目は無視

## 3. アーキテクチャ図（テキスト）
```
[Client] --(callable)--> [Helper API] --(Firestore write)--> bills/{billId}
                                          | (status change)
                                          V
                              [Settlement Trigger]
                                  |  (transaction)
                                  V
                            bills/{billId} summary
                                  | (pub/sub or call)
                                  V
                            [Analytics Aggregator]

[Client] --(helper)--> bills/{billId}/events/{eventId}
                                          | (create)
                                          V
                              [Event Differential Trigger]
                                  |  (transaction)
                                  V
                            bills/{billId} summary
                                  | (pub/sub or call)
                                  V
                            [Analytics Aggregator]
```

## 4. TODO
- Analytics 差分反映の実装手段（直接呼び出し vs Cloud Tasks）を検討。
- エラーログ出力形式（構造化ログ）を定義。
- Firestore インデックスが必要な読み取り（events 集計など）を洗い出し、`firestore.indexes.json` に反映。
- ユニット/統合テストのケース一覧を `test_plan.md` に統合。
