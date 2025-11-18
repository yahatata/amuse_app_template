# Analytics 設計計画（ドラフト）

_最終更新: 2025-11-10 (JST)_

## 0. 目的
- `bills` 親ドキュメントのスナップショットおよび事後イベント差分をもとに、`analyticsMonthly`／`analyticsDaily` 系指標を再構築する。
- 返金／追徴などの事後差分を `bills` 親と `analytics` の両方で累積管理し、ダッシュボードに「確定売上」「事後差分」「最終 net」を並列表示できるようにする。
- Settlement Trigger・Event Differential Trigger から呼び出す差分集計ロジックの設計を固める。

## 1. データソース
- **入力**: `bills/{billId}` 親ドキュメントのみを読み取る。サブコレ（`items`, `events`, etc.）の走査は禁止。
- Settlement Trigger で書き込まれるフィールド:
  - `amounts.*`（確定売上・税込）
  - `categoryBreakdown`（items / extraCost / sideGameChips / tournaments）
  - `paymentTotals`
  - `paymentsSummary`
  - `postEvents` 初期化（差分ゼロ）
- Event Differential Trigger で更新されるフィールド:
  - `postEvents.totalRefundedIncl`
  - `postEvents.totalAdjustmentsIncl`
  - `postEvents.netSalesIncl`
  - `paymentsSummary`
  - `status`（`refunded` / `partially_refunded` / `voided` / `in_progress`）
- 返金・調整イベントはカテゴリ指定を初期段階では受け付けない。`eventPayload.attribution` は optional で、`ALLOW_EVENT_ATTRIBUTION == true` のときのみ受理。デフォルトは `unattributed`。


## 1.5 命名整合ポリシー
- category keys: `items`, `extraCost`, `sideGameChips`, `tournaments`（親 `bills` の `categoryBreakdown` と一致）
- payment keys: `AllowedPaymentMethods` 準拠（小文字スネークケース）
- 金額は円整数（小数点なし）
- 日付は JST `businessDate`（YYYY-MM-DD）

## 1.6 現行 analyticsMonthly とのマッピング表
| 旧フィールド（現行） | 新フィールド（移行後） | 備考 |
| --- | --- | --- |
| `categorySales.items` | `analyticsMonthly.sales.category.items` | そのまま |
| `categorySales.extras` | `analyticsMonthly.sales.category.extraCost` | キー名変更 |
| `categorySales.sideGameChips` | `analyticsMonthly.sales.category.sideGameChips` | そのまま |
| `categorySales.tournaments` | `analyticsMonthly.sales.category.tournaments` | そのまま |
| `paymentMethodSales[method]` | `analyticsMonthly.cashflow.paymentTotals[method]` | レイヤ変更 |
| `refundsByMethod[method]` | `analyticsMonthly.cashflow.refundsByMethod[method]` | そのまま |
| `grandTotalRounded`（月合計） | `analyticsMonthly.sales.grossIncl` | 名称変更 |
| `netSales`（月最終） | `analyticsMonthly.net.netSalesIncl` | レイヤ変更 |
| `balanceDue`（月末未収合計） | `analyticsMonthly.net.balanceDueIncl` | nightly再計算で上書き |

## 1.7 balanceDueIncl 方針
- `net.balanceDueIncl` は nightly 再計算の結果を"正"とし、Settlement/Event の逐次集計では更新しない（近似が必要なら `net.balanceDueApprox` を別途利用）。

## 1.8 UI互換維持
- 既存で `analyticsMonthly` を画面表示している機能は残す。新スキーマ追加後も現行表示と同じ見た目/数値を保つこと。
- 過渡期は互換アダプタ層で旧 → 新を吸収。
- Feature Flag: `USE_ANALYTICS_V2_READS`（既定: オフ）。オン時は新スキーマ直読みに切替可能。

## 2. analyticsMonthly 構造
```
analyticsMonthly/{YYYY-MM}
  doc: {
    sales: {
      grossIncl: number,
      category: { items: number, extraCost: number, sideGameChips: number, tournaments: number }
    },
    events: {
      totalRefundedIncl: number,
      totalAdjustmentsIncl: number,
      unattributedRefundsIncl: number,
      unattributedAdjustmentsIncl: number
    },
    cashflow: {
      paymentTotals: { [method: string]: number },
      refundsByMethod: { [method: string]: number }
    },
    net: {
      netSalesIncl: number,   // sales.grossIncl - events.totalRefundedIncl + events.totalAdjustmentsIncl
      balanceDueIncl: number  // Σ paymentsSummary.balanceDueIncl
    }
  }
  collection days/{businessDate}: 同様の sales/events/cashflow/net を保持
  collection eventsLog/{eventId}: { billId, type, amountIncl, originBusinessDate, eventBusinessDate, attribution?, createdAt }
  collection aggregationMarkers/{eventId}: { billId, originBusinessDate, processedAt }
```
- `originBusinessDate` をキーにして月・日単位の集計を行い、当日・後日イベントを吸収。
- 返金・追徴イベントは `events.` レイヤに累積値として反映し、カテゴリ配賦は行わない（`unattributed` に加算）。
- `cashflow` レイヤで支払方法別の受領額／返金額を管理。
- `net` レイヤで最終 net を算出。ダッシュボードは `sales.grossIncl`（確定）、`events.totalRefundedIncl/totalAdjustmentsIncl`（差分）、`net.netSalesIncl`（最終）を並列表示。

## 3. Settlement Aggregation
- Trigger: Settlement Trigger 完了後に `analyticsAggregator.enqueueSettlement(billId, businessDate)` を呼び出す。
- 入力: `bill` 親ドキュメント（status = settled）、`amounts`、`categoryBreakdown`、`paymentTotals`、`paymentsSummary`。
- 処理:
  1. `originBusinessDate = bill.businessDate`
  2. `month = originBusinessDate.substring(0,7)`
  3. `delta` を計算:
     - sales.grossIncl += `amounts.grandTotalRounded`
     - sales.category += `categoryBreakdown`
     - cashflow.paymentTotals += `paymentTotals`
     - cashflow.refundsByMethod += 0（settlement時点ではゼロ）
     - net.netSalesIncl += `amounts.grandTotalRounded`
     - net.balanceDueIncl += `paymentsSummary.balanceDueIncl`
     - events.* は 0（初期）
  4. `aggregationMarkers/{billId}` で重複チェック
  5. 月 doc、日 doc を `FieldValue.increment` で更新
  6. eventsLog には追加しない（売上確定なので差分イベントではない）

## 4. Event Differential Aggregation
- Trigger: Event Differential Trigger 完了後に `analyticsAggregator.enqueueEvent(billId, eventId, originBusinessDate)` を呼び出す。
- 入力: 親 doc（最新の postEvents.*, paymentsSummary, status）、event doc（type, amountIncl, method?, attribution?）。
- 処理:
  1. `originBusinessDate = event.originBusinessDate`
  2. `month = originBusinessDate.substring(0,7)`
  3. `delta` 計算（refunded / adjustment / cancel / reopen）：
     - refund:
       - events.totalRefundedIncl += `refund.amountIncl`
       - events.unattributedRefundsIncl += `refund.amountIncl` (attribution が無効の場合)
       - cashflow.refundsByMethod[method] += amount
       - net.netSalesIncl -= amount
     - adjustment (sign=+1/-1):
       - events.totalAdjustmentsIncl += sign*amount
       - events.unattributedAdjustmentsIncl += sign*amount (attribution 無効時)
       - net.netSalesIncl += sign*amount
     - cancel: events レイヤ更新なし（前提条件を満たした場合に status=voided へ）
     - reopen: analytics には差分ゼロ（status 変更のみ）
     - 常に net.balanceDueIncl を `paymentsSummary.balanceDueIncl` 分だけ調整
  4. `aggregationMarkers/events/{eventId}` で重複チェック
  5. `eventsLog/{eventId}` にイベント詳細を記録（attribution フィールドは optional）
  6. 月 doc・日 doc を `increment` 更新
  7. `cashflow` や `net` にずれが生じた場合に備え、`diagnostics` ログを出す

## 5. Analytics Aggregator 実装案
- `functions/src/analytics/aggregator/`
  - `index.ts`: Settlement/Event 用エントリポイント
  - `delta.ts`: 差分計算（sales/events/cashflow/net）
  - `markers.ts`: aggregationMarkers の読み書き
  - `writer.ts`: 月/日 doc への書き込み、eventsLog への追加
  - `tasks.ts`: Cloud Tasks キュー（必要なら）
- `AllowedPaymentMethods` を利用してキー正規化。許容外は `invalid-argument`。
- `ALLOW_EVENT_ATTRIBUTION` 環境変数で attribution フィールドを許可／拒否。

## 6. 冪等性・エラー
- Settlement: `aggregationMarkers/{billId}` を doc ID に利用。
- Event: `aggregationMarkers/events/{eventId}` を doc ID に利用。既存なら no-op。
- エラー分類:
  - Validation（差分が負方向でガード違反）: `failed-precondition`
  - Internal（書き込み失敗）: `internal`。Cloud Tasks で再試行。
- ログ: success/failure, delta内容, elapsed ms。

## 7. テスト観点
- Settlement → Analytics:
  - 確定売上が `sales.*` に正しく転記。
  - paymentsSummary.balanceDueIncl が net.balanceDueIncl に反映。
  - 冪等（同 billId 二回目） → `aggregationMarkers` で拒否。
- Event → Analytics:
  - Refund 全額 → `events.totalRefundedIncl = grandTotalRounded`、`net` の減算を確認。
  - Refund 部分 → net 差分計算が一致。
  - 調整 (sign=-1/+1) → net が増減。
  - attribution 無効時 → 全て `unattributed` に加算。
  - cancel 条件未達 → `failed-precondition`。
  - reopen → analytics 差分なし。
- メトリクス: originBusinessDate 別に集計が正しい（後日イベントが正しい日付に反映される）。

## 8. TODO
- ✅ 現行 `analyticsMonthly` スキーマとの差異を調査し、移行手順を定義（`ui_compatibility_plan.md` に記載）。
- ✅ `analyticsMonthly` と `analyticsMonthly/days` の Cloud Functions テストを整備（`aggregator.spec.ts` に最小ケース追加）。
- ダッシュボード用 API が `sales/events/net` を並列取得できるようエンドポイント仕様を更新（Phase1 で実装）。
- `ALLOW_EVENT_ATTRIBUTION` の運用方法と監査ログ設計を決める（Phase1 で環境変数導入）。
- UI互換アダプタ層の実装（P1-14 で着手）。
