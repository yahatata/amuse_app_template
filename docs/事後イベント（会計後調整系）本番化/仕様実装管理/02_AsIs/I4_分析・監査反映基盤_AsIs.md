# I4_分析・監査反映基盤_AsIs

参照元: [../01_改修項目再編.md](../01_改修項目再編.md)

## 1. 論点一覧

### 1.1 現状認識済みの問題点

- `F9`: 事後イベント後の Analytics 差分反映が TODO のまま
- `F10`: `getRefundHistory` がスタブ

### 1.2 コード調査で追加発見した問題点

- `billsEventsOnCreate` が失敗しても例外を再スローしないため、event doc だけ作られて親 `bills` が未更新のまま止まる余地がある
- Analytics 設計資料は `refundsByMethod` や `eventsLog` を前提にしているが、現行実装には event 差分集計エントリポイントも marker もない
- 返金方法 `method` が自由文字列なので、将来 `refundsByMethod` を集計する際のキー正規化前提が崩れている

## 2. 対象コード

| 区分 | パス | 現在の役割 |
|------|------|------------|
| settlement trigger | `functions/src/domains/bills/triggers/billsOnSettle.ts` | `settled` 遷移時の親 snapshot 更新と analytics enqueue |
| event trigger | `functions/src/domains/bills/triggers/billsEventsOnCreate.ts` | 事後イベントの親 `bills` 差分反映 |
| analytics 設計資料 | `docs/bills_migration/analytics_plan.md` | 本来やりたい差分集計方針 |
| refund history API | `functions/src/domains/bills/callables/refundProcessing.ts` | `getRefundHistory` の入口 |

## 3. 現挙動

### 3.1 会計確定時だけ analytics enqueue がある

- `billsOnSettle` は `before.status != settled && after.status == settled` のときに発火する
- 親 doc に `amounts`, `categoryBreakdown`, `sideGameChipsSummary`, `paymentTotals`, `paymentsSummary`, `postEvents(初期値)` を書いたあと、`settlementAggregatorEnabled` が有効なら `enqueueSettlement()` を呼ぶ

### 3.2 事後イベント時は親 doc 更新だけで、analytics は TODO

- `billsEventsOnCreate` は refund / adjustment / cancel / reopen を親 doc に反映する
- その後の analytics 差分処理は `TODO: Analytics 差分処理の実装` のコメントだけで未実装
- したがって、親 `bills` と analytics 集計の差が発生しうる

### 3.3 `getRefundHistory` は空配列固定

- `getRefundHistory` は認証/権限チェックまでは実装されている
- 実データ取得はなく、常に `refundHistory: []`, `totalRefunds: 0`, `totalRefundAmount: 0` を返す

### 3.4 event trigger の失敗は UI に返らない

- `billsEventsOnCreate` は内部でエラーを catch し、`logOpsError` に記録したうえで再スローしない
- Firestore Trigger の性質上やむを得ない面はあるが、現状コードには「未適用 event を拾って再実行する」経路がない
- そのため、Callable 側は成功でも親 doc や監査集計が未更新のまま止まる可能性がある

### 3.5 analytics 設計と実装の差

- `analytics_plan.md` は event 差分用に `enqueueEvent`, `eventsLog/{eventId}`, `aggregationMarkers/events/{eventId}`, `refundsByMethod` を前提にしている
- 現行コードには settlement 側の `enqueueSettlement` はあるが、event 差分側の実装はない
- `analytics_plan.md` は `refundsByMethod[method]` を想定するが、現実の refund `method` は自由文字列である

## 4. 制約

- analytics は「会計確定時の初回加算」まではあるが、「事後差分の補正」は未実装
- `getRefundHistory` は API 形だけ存在し、監査用途では使えない
- event trigger エラー時の再処理導線が実装されていない
- event method のキー体系が未固定で、将来集計時の正規化仕様が必要

## 5. 不具合再現条件

### 5.1 返金後も analytics が古いままになる

1. `settled` bill を確定し、analytics が初回加算される状態を作る
2. その後 refund または adjustment を実行する
3. `billsEventsOnCreate` は親 `bills` を更新するが、analytics 差分処理は TODO のためダッシュボード側数値が変わらない

### 5.2 返金履歴 API を呼んでも空になる

1. 実際に refund event が入った bill を作る
2. `getRefundHistory` を呼ぶ
3. 認証は通っても空配列固定のレスポンスしか返らない

### 5.3 event doc はあるのに親 doc が更新されないまま残りうる

1. `/bills/{billId}/events/{eventId}` が作成される
2. `billsEventsOnCreate` 内で何らかの実行時エラーが起きる
3. Trigger はエラーをログ化するだけで終了する
4. event doc は残るが `appliedAt` も親更新も行われず、UI 側は自動復旧しない

### 5.4 将来 `refundsByMethod` を集計する際に method がばらつく

1. 返金方法に `cash` と `bank_transfer` と `other` を混在させる
2. event doc の `refund.method` を見る
3. analytics 設計上の支払手段キー体系と一致せず、そのままでは集計キーがぶれる

## 6. Step3 以降で必ず判断が必要な点

- 事後イベント差分を analytics にどう反映するか
- event trigger エラー時の再処理運用をどう持つか
- `getRefundHistory` を `/events` 直接参照で作るか、専用履歴 view を持つか
- refund method を analytics 集計キーへどう正規化するか
- `voided` / `reopen` を監査上どう見せるか

