# ヘルパAPI計画（ドラフト）

_最終更新: 2025-11-10 (JST)_

## 0. 前提と目的
- `businessDate` は共通ユーティリティ `calcBusinessDate` で算出し、すべての API から同一ロジックを利用する。
- `functions/src` で共通利用する抽象APIを整備し、Phase1 以降の移行で段階的に差し替える。
- すべてのAPIが `bills` を正とし、`WRITE_TODAYS_BILLS_IN_PARALLEL` フラグが有効な場合のみ旧 `todaysBills` へ最小限の複写を行う。
- 冪等性・エラー分類 (§4.2) ・テスト観点をAPI定義と同時に確定させ、実装と検証を一貫させる。
- 親ドキュメントの `updatedAt` は、すべての書き込み系API（サブコレ更新・`completeAccounting`・`/events` 含む）で同一トランザクション内に `serverTimestamp()` へ更新する。冪等リプレイで既存結果を返す場合は副作用なしとし、`updatedAt` を変更しない。

## 1. 冪等性 (Idempotency)
### 1.1 キー生成規則
- 形式: `<billId>:<operationType>:<clientNonce>`
  - `billId`: 対象となる `bills/{billId}`
  - `operationType`: `createBill`, `appendItem`, `appendSideGameChip`, `recordTournamentAction`, `recordPayment`, `postEventRefund` 等
  - `clientNonce`: クライアント側で生成する UUID または時刻＋端末IDを含む乱数

### 1.2 保存先と TTL
- イベント系 (`postEventRefund`, `postEventAdjustment`, `postEventCancel`, `postEventReopen`)
  - `/bills/{billId}/events/{eventId}` の `eventId` 自体に idempotency key を埋め込む（命名規約とし、リプレイ時は doc 再利用で no-op。履歴として保持し、TTLなし）。
- 決済／会計系 (`recordPayment`, `startAccounting`, `completeAccounting`)
  - `/bills/{billId}/payments/{paymentId}` の `paymentId` にキーを使用（履歴として保持。TTL なし）。
- 入店 (`createBillWithActiveStay`, 別名: `getOrCreateActiveStay`)
  - `/bills/{billId}/idempotency/{key}` に空ドキュメントを作成し、`exists` チェックで重複を検知。
  - 同ドキュメントに `requestHash`（payload の正規化ハッシュ）と `expiresAt` (serverTimestamp + 48h) を付与し、TTL により自動削除。再実行時は hash の一致を検証し、不一致なら `failed-precondition`。

### 1.3 冪等性チェックフロー
1. API受信時にキーを必須パラメータとして受け取り、サブコレで存在確認。
2. 既存なら再実行と判断し、前回と同じレスポンスを返却（副作用なし）。
3. 未存在ならトランザクション内で処理し、`idempotency` ドキュメントを作成。

## 2. 整合ポイントと責務分担
- `startAccounting`
  - `status ∈ {"open", "in_progress"}` のときのみ `status = "settling"` と `ops.accountingStartedAt` を設定（ロック）。条件不一致は `failed-precondition`。
- `completeAccounting`
  - 単一トランザクションで `status == "settling"` を確認し、サブコレ (`items`, `extras`, `payments`, `sideGameChips`, `tournaments`) を再読み込みして `amounts.*`, `categoryBreakdown`, `itemsSnapshot`, `sideGameChipsSummary`, `tournamentsSnapshot`, `paymentsSummary` を再計算→書込。
  - 処理後 `status = "settled"`, `closedAt`, `updatedAt` を更新。条件不一致は `failed-precondition`。
- `recordPayment`
  - 外部決済成功後に呼び出し、`payments` にレコード追加と `paymentsSummary` 更新を行う。`idempotencyKey` には可能な限り `providerTxnId` を含め、`payments/{paymentId}` の ID として使用するか、別フィールドとして保存して一意制約で検出する。タイムアウト時は `unavailable` を返却し指数バックオフで再試行。
- `recordTournamentAction`
  - `action` 引数が `entry` / `reentry` / `addon` の場合に限定してトーナメント登録関連の行を記録する。ポイント付与や賞金計上は別API (`awardTournamentResult`) で扱う。
- `postEventRefund` / `postEventAdjustment`
  - Functions が差分を算出し、`postEvents.*` と `paymentsSummary` を同一トランザクションで更新。
  - バリデーション:
    - `refund.amountIncl` の累計が `grandTotalRounded` を超えない
    - 反映後に `totalRefundedIncl == grandTotalRounded` なら `status = "refunded"`
    - 反映後に `0 < totalRefundedIncl < grandTotalRounded` なら `status = "partially_refunded"`
    - `adjustment.amountIncl > 0` で `sign` が +1/-1
    - 反映後も `paymentsSummary.balanceDueIncl ≥ 0`
    - 反映後も `postEvents.netSalesIncl ≥ 0`
    違反時は `failed-precondition`。
  - Analytics への差分反映は Cloud Functions トリガで行い、失敗時は再試行される構成にする。成功率・遅延はメトリクス監視対象。
  - 返金時は `/events` に加え、可能であれば `/payments` に `status:"refunded"` または負額エントリを残し、監査時の照合を容易にする。
- `postEventCancel` / `postEventReopen`
  - cancel（voided）は売上サマリに影響させず、必要な返金は別イベントで処理。reopen は `status` を `in_progress` に戻し、再確定時に amounts 等を再計算して上書きする。
- `paymentTotals` と `paymentsSummary`
  - `paymentTotals`: 会計確定時点の売上配賦スナップショット（確定値）。夜間再計算やダッシュボードで集計基準に使用。キーは小文字スネークケースへ正規化し、許容リスト外は `invalid-argument`。
  - `paymentsSummary`: 入出金の実績（変動あり）。`postEvent*` や追加支払いで更新。同じく正規化・許容リスト検証を行い、夜間再計算では `paymentTotals` を基準に照合。
  - `extras` は税込の加算/減算費用として扱い、`categoryBreakdown.extraCost` へ集計する。
- `activeStays`
  - 入店時作成・会計確定削除は常に Functions。閉店時 callable でクリーンアップ（TTL は使用しない）。

## 3. デュアルライト複写範囲 (`WRITE_TODAYS_BILLS_IN_PARALLEL`)
| 対象 API | 複写するフィールド（旧 todaysBills） | 備考 |
| --- | --- | --- |
| createBillWithActiveStay | `status`, `pokerName`, `items(empty)`, `sideGameChip(empty)`, `place`, `date`, `userId` | 旧コレでは `sideGameChip`（単数名）を使用。金額フィールドは空。
| appendItem | `items` 配列に行追加のみ。`totalPrice` など金額は更新しない。 | amounts 系は新 `bills` のみが正。
| appendSideGameChip | `sideGameChip` 配列に行追加。 | 金額再計算は旧で実施しない。
| updatePlace | `bills.place.table`, `bills.place.seat` | `activeStays` は更新しない。
| recordTournamentAction | `tournaments` 配列に該当要素追加/更新 | 旧配列構造に合わせるが、計算フィールドは書き込まない。
| startAccounting / completeAccounting | `status` のみ。`paymentMethodsByAmount` 等は旧に書かない。 | 旧金額更新は廃止。
| recordPayment | （必要時のみ）`paymentMethodsByAmount` の参照に使う最小情報 | できるだけ書かない方針。

- 複写失敗時は `bills` への書込み結果を正とし、エラーログに記録。夜間バッチで `billId` 単位の差分を補正。

## 4. エラー / 再実行規約
### 4.1 API毎の再試行可否
| API | 再試行安全性 | 条件 | 備考 |
| --- | --- | --- | --- |
| createBillWithActiveStay | ⭕ | idempotency key 必須 | 重複時は既存リファレンスを返す。
| getActiveBillByUser | ⭕ | 読み取りのみ | キャッシュ可。
| appendItem | ⭕ | idempotency key 必須 | トランザクション内で同一行追加を防止。
| appendSideGameChip | ⭕ | idempotency key 必須 | withdraw/deposit の重複防止。
| recordTournamentAction | ⭕ | idempotency key 必須 | `tournaments/{tplId}` を上書き。
| updatePlace | ⭕ | 最新値の上書きのみ。idempotency 任意。 | 最終値を採用。
| startAccounting | ⭕ | idempotency key 必須 | 同一リクエスト再実行時は同じレスポンス。
| completeAccounting | △ | 再実行は再計算を伴うため、確定済みなら成功レスポンス再利用。 | トリガ失敗時はリトライ。
| recordPayment | ⭕ | idempotency key 必須 | 外部決済成功IDを利用。タイムアウト時は `unavailable`。
| postEventRefund/Adjustment | ⭕ | idempotency key 必須 | 差分が重複適用されないようチェック。

※クライアントの再試行は指数バックオフ（例: 0.5s, 1s, 2s, 4s, 上限30s）で最大5回・総試行時間90sを目安（環境設定で変更可）。対象は `unavailable` / `aborted` のみ。

### 4.2 エラー分類 (HttpsError 語彙)
| 分類 | 説明 | 返却コード | 対応 |
| --- | --- | --- | --- |
| Validation | 入力不足・フォーマット違反 | `invalid-argument` | フィールド名を添えて返却。
| Permission | 管理権限やデバイス権限不足 | `permission-denied` | ログに操作者UIDを記録。
| NotFound | 対象 bill/activeStay が存在しない | `not-found` | UIで再取得を促す。
| Conflict / State | 状態不整合、二重確定など | `failed-precondition` | 現在の status を返却。
| ExternalPayment (外部決済一時失敗) | 決済ゲートウェイの一時障害 | `unavailable` または `aborted` | 再試行可否をメッセージで返す。
| Internal | 予期せぬエラー | `internal` | Stacktrace を格納し、SLO 監視へ送信。

## 5. API I/O テンプレート
```
interface ExampleRequest {
  billId: string;                // 必須
  idempotencyKey: string;        // 必須
  payload: { ... }               // 必須: APIごとの情報
  options?: {                    // 任意
    dualWrite?: boolean;         // 既定: 環境フラグを参照（オーバーライド可）
  }
}

interface ExampleResponse {
  success: boolean;
  billId: string;
  status?: string;               // 任意: 更新後ステータス
  diagnostics?: {                // 任意: ログ or 冪等性再利用時の情報
    reason?: string;
  }
}
```
- すべての書き込み系 API は `idempotencyKey` を必須とし、再実行時に同じレスポンスを返す。

## 6. ライフサイクル遷移表
| 現在 | イベント | 次状態 | 備考 |
| --- | --- | --- | --- |
| open | 入店直後 | in_progress | オーダーが始まるタイミングで遷移（自動または明示）。
| in_progress | `startAccounting` | settling | 会計処理ロック。status は `startAccounting` でのみ遷移。
| settling | `completeAccounting` | settled | サマリ焼き込み後。
| settled | `postEventRefund` / `postEventAdjustment` | partially_refunded / refunded | 差分でステータスを決定。
| settled | `postEventReopen` | in_progress | 監査・再開処理。再確定時に amounts 等を再計算して上書き。
| any | `postEventCancel` | voided | 営業日内のみ。監査ログ必須。売上サマリは不変で、返金は別イベントで扱う。

## 7. テスト観点（API粒度）
| API | 正常系 | 並行操作 | リトライ | 夜間跨ぎ | デュアルライト ON/OFF |
| --- | --- | --- | --- | --- | --- |
| createBillWithActiveStay | 入店→activeStays作成 | 同時入店(同UID)競合 | idempotency再送 | businessDate算出が前日/当日跨ぎ | フラグON時の旧doc作成/ OFF時未作成 |
| getActiveBillByUser | 開始状態読み取り | 会計進行中の連続読取 | - | - | 旧docの存在有無で差異が無いこと |
| appendItem | items追加→親updatedAt | 同一billで同時注文 | 同idempotency再送 | 深夜跨ぎ注文→businessDate維持 | 旧items配列に追加されること確認 |
| appendSideGameChip | purchase/withdraw の記録 | 同時購入 | 同idempotency再送 | - | 旧sideGameChip配列が更新されることを確認 |
| recordTournamentAction | entry/reentry/addon の upsert (結果付与は `awardTournamentResult` で実施) | 複数端末から同時登録 | 同idempotency再送 | - | 旧tournaments配列が更新されることを確認 |
| updatePlace | 座席移動の反映 | 複数端末から別更新 | - | - | `bills.place.*` の最終値が正しく反映されること。注文時に `_TodaysOrders` に同梱されること。 |
| startAccounting | 支払情報の登録 | 同時開始リクエスト | 同idempotency再送 | - | 旧ステータスが不要に更新されないことを確認 |
| completeAccounting | 確定→サマリ焼き込み | 確定直前にitems追加 | リトライ→再計算一致 | 深夜跨ぎでclosedAt確認 | 旧金額未更新を確認 |
| recordPayment | 支払記録 | 同一支払の重複送信 | 同idempotency再送 | - | 旧 payment 情報書き込みの有無を確認 |
| postEventRefund | Refund差分反映 | 連続refund | 同idempotency再送 | originBusinessDate=前日ケース | 旧コレクションにイベントを書き込まないことを確認 |
| postEventAdjustment | Adjustment差分反映 | 追徴/減額同時実行 | 同idempotency再送 | 深夜跨ぎの差分反映 | 旧コレクションにイベントを書き込まないことを確認 |
| byMethodValidation | 許容キー(business rule)で集計 | 不許可キーを同時送信 | Validationエラーで再送不要 | - | dualWriteの有無でレスポンス差分なし |
| idempotentUpdatedAt | 初回書込で updatedAt 更新 | 冪等再試行 | 冪等再送で更新されない | - | - |

## 8. 実装前調査メモ
- `functions/src/callables/registerForTournament.ts`, `bustAndReentry.ts`, `addon.ts`, `bulkAddon.ts`, `registerParticipants.ts` など既存トーナメント関連 Functions では、エントリー/リエントリー/アドオンの処理が分散。ヘルパ `recordTournamentAction` で `action` 引数 (`entry`, `reentry`, `addon`) を取り、既存ロジックを統合可能か確認済み（実装可能と判断）。詳細設計は P0-02 継続タスクで詰める。
- Analytics 差分トリガの成否ログ・遅延は監視対象に追加。成功率が閾値を下回った場合はアラート。

## 9. 今後のTODO
- 冪等性サブコレクション (`/idempotency`) のライフサイクル実装方針を確定。
- APIモジュール名・パスの統一規約を検討 (`helpers/billsApi.ts` 等)。
- `modification_plan.md` の P0-02 完了時に最終反映。
- `test_plan.md` に 7章の観点を順次転記。

## 10. API 定義一覧
| API | 主な処理 | 必須入力 (抜粋) | 主な出力 | idempotencyKey | デュアルライト | 備考 |
| --- | --- | --- | --- | --- | --- | --- |
| createBillWithActiveStay | bills 親ドキュメント/activeStays 作成 | `billId`, `userId`, `pokerName`, `idempotencyKey` | `billId`, `status` | `<billId>:createBill:<nonce>` (`/idempotency`) | ON時のみ旧 `todaysBills` にスケルトン複写 | `calcBusinessDate` で `businessDate` 算出。重複時は既存doc返却。 |
| getActiveBillByUser | アクティブ伝票参照 | `userId` | `billId`, `status`, `place` | - (読取のみ) | なし | status in (`open`,`in_progress`,`settling`) でフィルタ。 |
| appendItem | `/items` サブコレへ行追加 | `billId`, `itemPayload`, `idempotencyKey` | `itemId`, `updatedAt` | `<billId>:appendItem:<nonce>` (`/idempotency`) | 旧 `items` 配列へ行をpush | 親 `updatedAt` 更新。冪等再送は既存レスポンス。注文時は `orders/{YYYYMMDD}/_TodaysOrders/{orderId}` に `bills.place.table`, `bills.place.seat` を同梱。 |
| appendSideGameChip | `/sideGameChips` に取引追加 | `billId`, `chipPayload`, `idempotencyKey` | `chipId`, `updatedAt` | `<billId>:appendSideGameChip:<nonce>` (`/idempotency`) | 旧 `sideGameChip` 配列にpush | withdraw / deposit / purchase のみ扱う。 |
| recordTournamentAction | `/tournaments/{tplId}` upsert | `billId`, `tplId`, `action`, `payload`, `idempotencyKey` | `tplId`, `updatedAt` | `<billId>:tournament:<tplId>:<action>:<nonce>` (`/idempotency`) | 旧 `tournaments` 配列に同期 | `action` は `entry`/`reentry`/`addon` 限定。結果付与は `awardTournamentResult`。 |
| updatePlace | `bills.place.*` のテーブル/席更新 | `billId`, `table`, `seat` | `bills.place.table`, `bills.place.seat`, `bills.updatedAt` | 任意（`<billId>:updatePlace:<nonce>` 推奨） | 旧 `currentTable`/`currentSeat` 更新 | `activeStays` は更新しない。最終値を採用。冪等keyなしでも安全。 |
| startAccounting | 会計開始ロック | `billId`, `idempotencyKey`, `paymentDraft` | `status="settling"`, `ops.accountingStartedAt` | `<billId>:startAccounting:<nonce>` (`/idempotency`) | 旧 `status` のみ更新 | status が `open`/`in_progress` のときのみ許可。 |
| completeAccounting | 会計確定・スナップショット焼込 | `billId`, `idempotencyKey` | `status="settled"`, `amounts`, サマリ類 | `<billId>:completeAccounting:<nonce>` (`/payments`) | 旧金額は更新しない | 単一トランザクションで再計算。status guard付き。 |
| recordPayment | `/payments` 行追加＋サマリ更新 | `billId`, `paymentPayload`, `idempotencyKey` | `paymentId`, `paymentsSummary` | `<billId>:payment:<providerTxnId or nonce>` (`/payments`) | 旧 `paymentMethodsByAmount` 等の最小情報のみ複写 | 外部決済成功後に呼び出し。タイムアウトは `unavailable`。 |
| postEventRefund | 返金イベント記録/差分反映 | `billId`, `eventPayload`, `idempotencyKey` | `eventId`, 更新後 status | `<billId>:event:refund:<nonce>` (`/events`) | 旧コレにイベント書込なし | 合計返金判定で `refunded` / `partially_refunded` を更新。 |
| postEventAdjustment | 追加徴収/減額イベント | `billId`, `eventPayload`, `idempotencyKey` | `eventId`, `postEvents` | `<billId>:event:adjustment:<nonce>` (`/events`) | 旧コレにイベント書込なし | `postEvents.netSalesIncl` を 0 以上に維持。 |
| postEventCancel | 伝票キャンセル | `billId`, `idempotencyKey`, `reason` | `status="voided"` | `<billId>:event:cancel:<nonce>` (`/events`) | 旧コレにイベント書込なし | 売上サマリは不変。返金は別イベント。 |
| postEventReopen | 伝票再開 | `billId`, `idempotencyKey`, `reason` | `status="in_progress"` | `<billId>:event:reopen:<nonce>` (`/events`) | 旧コレにイベント書込なし | 再確定時にサマリを再計算して上書き。 |
| awardTournamentResult | トーナメント結果付与 | `billId`, `tplId`, `resultPayload`, `idempotencyKey` | 更新後 `tournamentsSnapshot`, `paymentsSummary` | `<billId>:tournament:award:<tplId>:<nonce>` (`/idempotency`) | 旧 `tournaments` 配列へは複写しない | 賞金・ポイント付与専用。settled 以降はイベント経由。 |
| calcBusinessDate | 日付ユーティリティ | `timestamp`, `storeCloseHour` | `businessDate` | - | なし | すべてのAPIで利用。テスト基盤を共有。 |

## 11. 実装構成案
- ディレクトリ例: `functions/src/helpers/billsApi/`
  - `index.ts`: 外部公開API (`createBillWithActiveStay` など) をエクスポート。
  - `dualWrite.ts`: `shouldDualWriteTodaysBills()` と複写ロジック。環境変数 `WRITE_TODAYS_BILLS_IN_PARALLEL` とリクエスト `options.dualWrite` を統合。
  - `idempotency.ts`: キー生成・`/idempotency` 管理（requestHash 照合・TTL設定含む）。
  - `snapshots.ts`: `completeAccounting` 用の再計算ユーティリティ（`amounts`, `categoryBreakdown`, `paymentTotals`, `paymentsSummary`）。`itemsSnapshot` は 700KB を超える場合 Top50 の品目に圧縮するフォールバックを実装。
  - `events.ts`: `/events` 作成と差分適用、Analytics トリガ呼び出し。
  - `payments.ts`: `/payments` 追加、`paymentsSummary` 更新、返金エントリ作成。
  - `tournaments.ts`: `recordTournamentAction` と `awardTournamentResult` のドメインロジック。
  - `date.ts`: `calcBusinessDate` ユーティリティ。JST 固定の境界テストを同梱。
- 共通型定義: `functions/src/types/bills.ts` に Request/Response インターフェース、`AllowedPaymentMethods` の列挙を配置。
- ロギング: `helpers/logger.ts` に `withIdempotencyLog(context, fn)` を用意し、再送時の診断情報を統一。
- Dual write 実装指針:
  - ヘルパ内部で `if (dualWriteEnabled(options)) { await legacyAdapter.syncToTodaysBills(...) }` の形で明示。
  - 複写失敗時は warning ログ＋`aggregationMarkers` 対象に差分修復ジョブを登録。
- テスト:
  - ユニットテスト: `functions/__tests__/helpers/billsApi/*.spec.ts` に API ごとの happy/edge/idempotent ケースを実装。
  - Firestore エミュレータ統合テスト: `functions/__tests__/integration/billsApi.spec.ts` で dual write フラグ ON/OFF の整合を検証。
- デプロイフロー: Phase1 の各ステップで既存 Functions を順次このヘルパに差し替え、旧ロジックとの比較ログを一時的に出力する。
