# ChangeSpec（P1-07）

## 目的 / 関連文書
- **目的**: 
  - 事後イベント（返金・キャンセル・再開）を `/events` サブコレクションに記録し、トリガで差分反映する方式に移行する。
  - 旧 `updateAccounting.ts` の役割を置き換える「会計後調整API」を新規追加し、`/events` + `postEvents.totalAdjustmentsIncl` などを更新する。
  - 会計後調整APIを操作する UI を Flutter 側に追加する。
  - **`cancelAccounting` は pre-settlement 専用の「会計開始取り消し API」とし、対象 status は `open`, `in_progress`, `settling`。会計後（`settled` 以降）のキャンセル・返金・追加徴収などの「事後イベント」は、`updateAccounting`（新世界版）と `/events`（`postEventRefund`, `postEventAdjustment`, `postEventCancel`, `postEventReopen`）で扱う。
  - **`startAccounting` は、`status` が `open`/`in_progress` の bill について、会計開始に紐づく金額計算を毎回再実行できることを前提とする（`cancelAccounting` により再度 `open` に戻った bill に対しても再計算される）。
- **参照**: 
  - `api_contract.md` §2.6 事後イベント（`postEventRefund`, `postEventAdjustment`, `postEventCancel`, `postEventReopen`）
  - `api_contract.md` §2.5 `updateAccounting` (postEventAdjustment-based) – P1-07 で追加予定
  - `helper_api_plan.md` §2 整合ポイントと責務分担（`postEventRefund`, `postEventAdjustment`）
  - `schema_plan.md` `/bills/{billId}/events/{eventId}` スキーマ
  - `trigger_plan.md` §2 Event Differential Trigger
  - `modification_plan.md` P1-07行

## 変更概要（What）

### 新規ファイル
- `functions/src/helpers/billsApi/postEventRefund.ts`: 返金イベント記録ヘルパAPI（`/events` 作成のみ、トリガで差分反映）
- `functions/src/helpers/billsApi/postEventAdjustment.ts`: 追加徴収/減額イベント記録ヘルパAPI（`/events` 作成のみ、トリガで差分反映）
- `functions/src/helpers/billsApi/postEventCancel.ts`: 伝票キャンセルイベント記録ヘルパAPI（`/events` 作成のみ、トリガで差分反映）。**post-settlement 専用**（`updateAccounting` から利用する会計後キャンセル用）。
- `functions/src/helpers/billsApi/postEventReopen.ts`: 伝票再開イベント記録ヘルパAPI（`/events` 作成のみ、トリガで差分反映）
- `functions/src/callables/updateAccounting.ts`（新世界版）: 会計後調整API（`postEventAdjustment` を内部で使用）
- `functions/src/triggers/bills.events.onCreate.ts`: イベント差分トリガ（`/events` 作成時に `postEvents.*` と `paymentsSummary` を更新）
- `functions/__tests__/helpers/billsApi/postEventRefund.spec.ts`: 単体・統合テスト
- `functions/__tests__/helpers/billsApi/postEventAdjustment.spec.ts`: 単体・統合テスト
- `functions/__tests__/helpers/billsApi/postEventCancel.spec.ts`: 単体・統合テスト
- `functions/__tests__/helpers/billsApi/postEventReopen.spec.ts`: 単体・統合テスト
- `functions/__tests__/callables/updateAccounting.spec.ts`: 統合テスト（新世界版）
- `functions/__tests__/triggers/bills.events.onCreate.spec.ts`: トリガテスト

### 更新ファイル
- `functions/src/callables/cancelAccounting.ts`:
  - `/bills/{billId}` ベースの **pre-settlement 専用 API** として再設計。
  - 対象 status: `open`, `in_progress`, `settling` のみ許可。
  - 処理内容:
    - `status` を `'open'` に戻す。
    - `ops.accountingStartedAt` / `ops.accountingStartedBy` をクリアする。
    - 必要に応じて `ops.accountingCanceledAt` / `ops.accountingCanceledBy` を追加（オプション）。
  - `/bills/{billId}/events` には何も書き込まない（pre-settlement のキャンセルは事後イベントの対象外）。
  - 会計後のキャンセルは `updateAccounting`（新世界版）＋`postEventCancel` を通じて扱う。
- `functions/src/callables/refundProcessing.ts`:
  - 旧実装（todaysBillsベース、refundAmountを更新）を削除。
  - `postEventRefund` ヘルパAPIを呼び出すように変更（`/events` 追加のみ、トリガで差分反映）。
  - ユーザー残高返還処理は `postEventRefund` のスコープ外（必要に応じて別途処理）。
- `functions/src/callables/updateAccounting.ts`:
  - 旧実装（todaysBillsベース、items/extraCost/tournaments/sideGameChipを更新、totalPriceを再計算）を削除。
  - 新実装（billsベース、`postEventAdjustment` を内部で使用）に置き換え。
  - 会計後調整APIとして、`/events` + `postEvents.totalAdjustmentsIncl` などを更新。
- `functions/src/helpers/billsApi/index.ts`: `postEventRefund`, `postEventAdjustment`, `postEventCancel`, `postEventReopen` をエクスポート

### 呼び出し元影響範囲
- **Flutter側**: 
  - 会計後調整APIを操作するためのシンプルな画面（例: `PostAccountingAdjustmentsPage`）を新規追加。
    - `settled` 伝票一覧から対象の bill を選択。
    - 返金（refund）は `refundProcessing` callable を呼び出し、内部で `postEventRefund` を利用。
    - 追加徴収/減額/会計後キャンセル/再開は `updateAccounting` callable を呼び出し、内部で `postEventAdjustment` / `postEventCancel` / `postEventReopen` を利用。
  - `cancelAccounting`（pre-settlement 専用）の呼び出しは既存のまま（内部実装が変更される）。
- **Functions側**:
  - `cancelAccounting.ts` → `/bills/{billId}` を直接更新（pre-settlement 専用、`/events` は使用しない）
  - `refundProcessing.ts` → `postEventRefund` ヘルパAPI呼び出し
  - `updateAccounting.ts`（新世界版） → `postEventAdjustment` / `postEventCancel` / `postEventReopen` ヘルパAPI呼び出し
  - トリガ: `/events` 作成時に `bills.events.onCreate` トリガが発火し、`postEvents.*` と `paymentsSummary` を更新

## 実装詳細（How）

### 書込み先
- **`cancelAccounting`（pre-settlement 専用）**: 
  - `/bills/{billId}` のみ（`status`, `ops.accountingStartedAt`, `ops.accountingStartedBy` を更新）
  - `/bills/{billId}/events` には何も書き込まない（pre-settlement のキャンセルは事後イベントの対象外）
- **`postEvent*` 系（refund/adjustment/cancel/reopen、post-settlement 専用）**: 
  - `/bills/{billId}/events/{eventId}`: イベント記録（`eventId = idempotencyKey`）
  - `/bills/{billId}`: `postEvents.*`, `paymentsSummary.*`, `status`（トリガで更新）

### 冪等性
- **方式**: docID = idempotencyKey（`/events/{eventId}` の `eventId` に idempotencyKey を使用）
- **保存先**: `/bills/{billId}/events/{eventId}`（履歴として保持、TTLなし）
- **リプレイ時**: 既存docを再利用（no-op、`reused: true` を返却）
- **注意**: `/idempotency` サブコレクションは使用しない（docIDの一意制約で重複を防ぐ）
- **イベント差分トリガの冪等性**: 
  - `/events/{eventId}` に `appliedAt`（または同等の `applied` フラグ）を持たせ、トリガ側が「この eventId はすでに適用済みかどうか」を判定できるようにする。
  - 適用済み event に対してはトリガは no-op とし、`updatedAt` を含む親 doc も更新しない。
  - これにより、`postEvent*` 系のリトライや将来の再インポート時にも parent の `updatedAt` を汚さない。

### デュアルライト
- `/events` は新スキーマのみ（`todaysBills` には複写しない）
- `postEvents.*` と `paymentsSummary.*` の更新も新スキーマのみ（`todaysBills` には複写しない）

### 権限境界（Functions/Client）
- **Client → Functions**: 
  - `cancelAccounting`: `billId`, `reason?`
  - `refundProcessing`: `billId`, `idempotencyKey`, `eventPayload: { amountIncl, reason?, method? }`
  - `updateAccounting`: `billId`, `idempotencyKey`, `eventPayload: { sign, amountIncl, reason? }`
- **Functions内部 → postEvent* ヘルパAPI**: 
  - `billId`, `idempotencyKey`, `eventPayload`, `createdBy`（実行者UID）
  - `originBusinessDate`（売上帰属日、`bill.businessDate` から取得）
  - `eventBusinessDate`（イベント計上日、`calcBusinessDate(now)` で算出）

### 競合解決
- `/events` の作成は docID の一意制約で重複を防ぐ（Firestore の仕様）
- トリガ内での `postEvents.*` と `paymentsSummary.*` の更新はトランザクション内で行う
- **`postEvent*` の pre-settlement 禁止（二段構え）**:
  - **ヘルパAPI側**: `postEventRefund` / `postEventAdjustment` / `postEventCancel` / `postEventReopen` ヘルパAPIは、`status` が許可された post-settlement 状態（refund/adjustment: `settled`/`partially_refunded`/`refunded`、cancel/reopen: `settled`）以外の bill に対しては `failed-precondition` を返し、`/events` ドキュメントも作成しない方針とする。
  - **トリガ側**: 基本的にはヘルパAPI側で弾かれるため `/events` は作成されない想定だが、防御的に pre-settlement status（`open`, `in_progress`, `settling`）や `voided` に対して生成された `/events` が存在する場合、トリガでは適用しない（no-op、`appliedAt` も更新しない）。

### ログ/メトリクス
- 構造化ログ: `op`, `billId`, `eventId`, `idempotencyKey`, `result(ok|reused|fail)`, `code`, `reason`
- メトリクス: `bills.postEvent.duration_ms`, `bills.postEvent.retry_count`, `bills.trigger.events.onCreate.duration_ms`

### 例外（HttpsErrorマッピング）
- `invalid-argument`: 必須フィールド不足、`amountIncl <= 0`, `sign` が +1/-1 以外
- `not-found`: `billId` が存在しない
- `failed-precondition`: 
  - `status` が許可されていない状態（例: `voided` で返金不可、`settled` 以外で `postEventCancel` を呼び出した場合は `failed-precondition`）
  - 金額矛盾（例: 返金額の累計が `grandTotalRounded` を超える、反映後に `balanceDueIncl < 0` または `netSalesIncl < 0`）
  - `postEventCancel` で `paidTotalIncl != 0` または `totalRefundedIncl != 0` の場合

## 仕様差分（Before→After）

### Before（現状）
- `cancelAccounting.ts`: `todaysBills/{billId}` の `status` を `open` に戻す、`accountingHistory` に記録
- `refundProcessing.ts`: `todaysBills/{billId}` の `refundAmount` を更新、`accountingHistory` に記録
- `updateAccounting.ts`: `todaysBills/{billId}` の `items`/`extraCost`/`tournaments`/`sideGameChip` を更新、`totalPrice` を再計算

### After（新実装）
- `cancelAccounting.ts`: `/bills/{billId}` ベースの pre-settlement 専用 API として再設計。`status` を `open` に戻し、`ops.accountingStartedAt` / `ops.accountingStartedBy` をクリア。`/bills/{billId}/events` には何も書き込まない（pre-settlement のキャンセルは事後イベントの対象外）。会計後のキャンセルは `updateAccounting`（新世界版）＋`postEventCancel` を通じて扱う。
- `refundProcessing.ts`: `postEventRefund` ヘルパAPIを呼び出し、`/bills/{billId}/events/{eventId}` にイベントを記録。トリガで `postEvents.totalRefundedIncl` と `paymentsSummary` を更新。
- `updateAccounting.ts`（新世界版）: `postEventAdjustment` ヘルパAPIを呼び出し、`/bills/{billId}/events/{eventId}` にイベントを記録。トリガで `postEvents.totalAdjustmentsIncl` と `paymentsSummary` を更新。

### イベント差分トリガの動作
1. `/bills/{billId}/events/{eventId}` が作成されると `bills.events.onCreate` トリガが発火
2. トランザクション内で親docを取得し、以下を確認：
   - **トリガ適用対象の status**:
     - refund / adjustment イベント: `settled`, `partially_refunded`, `refunded` のみ
     - cancel / reopen イベント: `settled` のみ
     - `voided` に対してはどのイベントも適用しない（no-op）
   - **pre-settlement status**（`open`, `in_progress`, `settling`）に対して生成された `/events` は、本来 create させない想定だが、もし存在してもトリガでは適用しない（= no-op、`appliedAt` も更新しない）
   - **`appliedAt` / `applied` フラグを参照**して、既に適用済みの event の場合は二重適用を防ぐ（no-op、`updatedAt` も変更しない）
3. イベント種別ごとの差分計算：
   - `refund`: `postEvents.totalRefundedIncl += refund.amountIncl`、`paymentsSummary.balanceDueIncl` を更新、返金が総額一致 → `status = 'refunded'`、0 < 返金 < 合計 → `status = 'partially_refunded'`
   - `adjustment`: `postEvents.totalAdjustmentsIncl += sign * amountIncl`、`paymentsSummary.balanceDueIncl` を更新
   - `cancel`: `status = 'voided'`（サマリは不変）
   - `reopen`: `status = 'in_progress'`（再確定を待つ）
4. `postEvents.netSalesIncl = grandTotalRounded - totalRefundedIncl + totalAdjustmentsIncl` が ≥0 を保証
5. `paymentsSummary.balanceDueIncl = max(0, grandTotalRounded - paidTotalIncl - totalRefundedIncl + totalAdjustmentsIncl)` を更新
6. 親docを `tx.update` で更新し、`/events/{eventId}` に `appliedAt = serverTimestamp()` を設定
7. トランザクション外で Analytics 差分処理をトリガ（非同期）

### ステータス遷移（概要）
- **`settled`**:
  - `postEventRefund`（部分返金） → `partially_refunded`
  - `postEventRefund`（全額返金） → `refunded`
  - `postEventCancel`（会計後キャンセル） → `voided`
  - `postEventReopen` → `in_progress`（再度会計フローに戻す）
- **`partially_refunded`**:
  - 追加の `postEventRefund` で総返金額が合計に一致 → `refunded`
  - `postEventCancel` は許可しない（`failed-precondition`）
- **`refunded`**:
  - `postEventCancel` は許可しない（`failed-precondition`）
- **`voided`**:
  - 原則として `postEventRefund` / `postEventAdjustment` / `postEventCancel` / `postEventReopen` は全て `failed-precondition`

## テスト

### 単体テスト（各ヘルパAPI）
- **postEventRefund**:
  - happy path（正常な返金、部分返金、全額返金）
  - invalid-argument（billId未指定、idempotencyKey未指定、amountIncl <= 0）
  - not-found（billId不存在）
  - failed-precondition（status=voided、返金額の累計がgrandTotalRoundedを超える、反映後にbalanceDueIncl < 0、反映後にnetSalesIncl < 0）
  - idempotent-replay（reused: true、既存docを再利用）
- **postEventAdjustment**:
  - happy path（追加徴収、減額）
  - invalid-argument（billId未指定、idempotencyKey未指定、amountIncl <= 0、signが+1/-1以外）
  - not-found（billId不存在）
  - failed-precondition（status=voided、反映後にbalanceDueIncl < 0、反映後にnetSalesIncl < 0）
  - idempotent-replay（reused: true、既存docを再利用）
- **postEventCancel**:
  - happy path（正常なキャンセル）
  - invalid-argument（billId未指定、idempotencyKey未指定）
  - not-found（billId不存在）
  - failed-precondition（status が 'settled' 以外、または paidTotalIncl != 0、または totalRefundedIncl != 0 の場合）
  - idempotent-replay（reused: true、既存docを再利用）
- **postEventReopen**:
  - happy path（正常な再開）
  - invalid-argument（billId未指定、idempotencyKey未指定）
  - not-found（billId不存在）
  - failed-precondition（status != 'settled'）
  - idempotent-replay（reused: true、既存docを再利用）

### 統合テスト（callable）
- **cancelAccounting**（pre-settlement 専用）:
  - `status=settling` の bill に対して成功し、`status=open` に戻ること
  - `ops.accountingStartedAt` / `ops.accountingStartedBy` がクリアされること
  - `status=settled` など対象外 status に対しては `failed-precondition` となること
  - `cancelAccounting` 実行後に再度 `startAccounting` を実行すると、金額計算が再実行されること（必要に応じてテストで検証）
  - `/bills/{billId}/events` には何も書き込まれないこと
- **refundProcessing**: `postEventRefund` ヘルパAPI使用確認、エラーハンドリング
- **updateAccounting**（新世界版）: `postEventAdjustment` ヘルパAPI使用確認、エラーハンドリング

### トリガテスト
- **bills.events.onCreate**:
  - refund イベント作成時に `postEvents.totalRefundedIncl` と `paymentsSummary` が正しく更新されること
  - adjustment イベント作成時に `postEvents.totalAdjustmentsIncl` と `paymentsSummary` が正しく更新されること
  - cancel イベント作成時に `status = 'voided'` に更新されること
  - reopen イベント作成時に `status = 'in_progress'` に更新されること
  - 複数イベントの累積処理が正しく動作すること
  - バリデーション違反時に `failed-precondition` が返ること

### 手動チェック（3手順以内）
1. `createBill` → `appendItem` → `startAccounting` → `completeAccounting` → `postEventRefund` → `postEvents.totalRefundedIncl` と `paymentsSummary.balanceDueIncl` が正しく更新される
2. 同一 `idempotencyKey` で `postEventRefund` を再送 → 副作用なし（`reused: true`）
3. `postEventAdjustment` → `postEvents.totalAdjustmentsIncl` と `paymentsSummary.balanceDueIncl` が正しく更新される → nightlyで集計へ反映

## ドキュメント更新
- `README.md`: P1-07完了を追記、会計後調整APIのUI操作について記載
- `modification_plan.md`: P1-07の状態を「完了」に更新、仕様差分を追記
- `changelog.md`: P1-07完了のエントリを追加
- `test_plan.md`: P1-07のテスト観点を「実施済み」に更新
- `api_contract.md`: `postEventRefund`, `postEventAdjustment`, `postEventCancel`, `postEventReopen` の詳細仕様を追記、`updateAccounting`（新世界版）の仕様を確定

## Out of Scope
- `completeAccounting` の新スキーマ対応（P1-06でlegacyとして残置、別フェーズで対応）
- Analytics 差分処理の実装詳細（トリガから呼び出す前提で、詳細は `analytics_plan.md` を参照）
- **`accountingHistory` への新規書き込み**: 
  - P1-07 では `accountingHistory` への新規書き込みは行わない。
  - refund / cancel / adjustment / reopen の履歴は `/bills/{billId}/events` に一本化する。
  - `accountingHistory` コレクションは将来的に削除予定であり、本フェーズでは read-only（過去データ参照のみ）として扱う。

