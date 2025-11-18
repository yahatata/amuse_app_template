# Bills API 契約書

_最終更新: 2025-11-10 (JST)_

## 0. 目的
- `bills` API 抽象レイヤの正式な契約を定義し、実装者・利用者間の合意を明確化する。
- メソッド一覧、Request/Response型、例外、冪等性、ライフサイクル遷移を包括的に記載する。
- 本契約は `helper_api_plan.md` の詳細仕様を基に、実装時の参照用として整理したもの。

## 1. 共通仕様

### 1.1 認証・権限
- すべてのAPIは認証済みユーザー（`request.auth.uid`）を前提とする。
- 管理者権限が必要な操作は個別に明記する。

> **命名規約:**  
> API の通信上でやり取りされる支払方法名（ワイヤー値）は  
> **すべて小文字スネークケース（例: `cash`, `credit_card`, `electronic_money`）** に統一します。  
> enum の内部表現は自由ですが、シリアライズ時は必ずこの形式に変換してください。  
> **送受信ペイロードの `paymentPayload.method` は必ず小文字スネークケース**。enum 内部値が異なる場合も**シリアライズ時に変換**すること。

### 1.2 エラーハンドリング
- すべてのエラーは `HttpsError` として返却される。
- エラーコードは `helper_api_plan.md` §4.2 に準拠する。
- クライアント側の再試行は指数バックオフ（0.5s, 1s, 2s, 4s, 上限30s）で最大5回・総試行時間90sを目安。

### 1.3 タイムゾーン
- すべての日時は JST（UTC+9）で処理される。
- `businessDate` は `calcBusinessDate` ユーティリティで算出される。

### 1.4 デュアルライト
- `WRITE_TODAYS_BILLS_IN_PARALLEL` フラグが有効な場合、旧 `todaysBills` への複写が行われる。
- 複写失敗時は `bills` への書込み結果を正とし、エラーログに記録される。

> **共通原則:**  
> - 正（真実源）は `bills`。  
> - `todaysBills` への複写は最小限・ベストエフォート。  
> - 再試行は行わず、失敗は Cloud Logging のみ記録。  
> - 整合性検証・修正は Nightly Recalculation ジョブで実施します。

## 2. API メソッド一覧

### 2.1 入店・伝票管理

#### `createBillWithActiveStay`
**目的**: 新規伝票と `activeStays` を作成する。

**Request**:
```typescript
interface CreateBillWithActiveStayRequest {
  billId: string;              // 必須: 伝票ID（クライアント生成UUID推奨）
  userId: string;              // 必須: 顧客UID
  pokerName?: string;          // 任意: 表示名
  idempotencyKey: string;      // 必須: 冪等性キー
  options?: {
    dualWrite?: boolean;       // 任意: デュアルライトのオーバーライド
  };
}
```

**Response**:
```typescript
interface CreateBillWithActiveStayResponse {
  success: boolean;
  billId: string;
  status: 'open' | 'in_progress';
  businessDate: string;        // YYYY-MM-DD形式
  activeStayCreated: boolean;
  diagnostics?: {
    reason?: string;           // 冪等性再利用時の理由
    reused?: boolean;          // 既存doc再利用フラグ
  };
}
```

**エラー**:
- `invalid-argument`: `billId`, `userId`, `idempotencyKey` が未指定
- `failed-precondition`: 既に `activeStays/{uid}` が存在する（重複入店）
- `internal`: 予期せぬエラー

**冪等性**: 
- キー形式: `<billId>:createBill:<nonce>`
- 保存先: `/bills/{billId}/idempotency/{key}` (TTL: 48h)
- リプレイ時: 既存docを返却（`reused: true`）

**デュアルライト**: 
- フラグON時: 旧 `todaysBills` にスケルトン複写（`status`, `pokerName`, `items(empty)`, `sideGameChip(empty)`, `place`, `date`, `userId`）

---

#### `getActiveBillByUser`
**目的**: 指定ユーザーのアクティブ伝票を取得する。

**Request**:
```typescript
interface GetActiveBillByUserRequest {
  userId: string;              // 必須: 顧客UID
}
```

**Response**:
```typescript
interface GetActiveBillByUserResponse {
  success: boolean;
  billId: string | null;
  status: 'open' | 'in_progress' | 'settling' | null;
  place?: {
    table: string | null;
    seat: number | null;
  };
  businessDate?: string;
}
```

**エラー**:
- `invalid-argument`: `userId` が未指定
- `not-found`: アクティブ伝票が存在しない（正常系、`billId: null` を返す）

**備考**: 読み取り専用、冪等性不要

---

### 2.2 注文・明細管理

#### `appendItem`
**目的**: 伝票にアイテムを追加する。

**Request**:
```typescript
interface AppendItemRequest {
  billId: string;              // 必須
  itemPayload: {
    menuItemId: string;
    category: string;
    name: string;
    price: number;             // 税込価格
    quantity: number;
    // その他任意フィールド
  };
  idempotencyKey: string;      // 必須
  options?: {
    dualWrite?: boolean;
  };
}
```

**Response**:
```typescript
interface AppendItemResponse {
  success: boolean;
  billId: string;
  itemId: string;              // 生成されたitemId
  updatedAt: string;           // ISO8601形式
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}
```

**エラー**:
- `invalid-argument`: 必須フィールド不足、`price < 0`, `quantity <= 0`
- `not-found`: `billId` が存在しない
- `failed-precondition`: `status == "settled"` で更新不可
- `internal`: 予期せぬエラー

**冪等性**: 
- キー形式: `<billId>:appendItem:<nonce>`
- 保存先: `/bills/{billId}/idempotency/{key}` (TTL: 48h)
- リプレイ時: 既存レスポンスを返却

**デュアルライト**: 
- フラグON時: 旧 `todaysBills.items` 配列に行追加（金額は更新しない）

**備考**: 注文時は `orders/{YYYYMMDD}/_TodaysOrders/{orderId}` に `bills.place.table`, `bills.place.seat` を同梱する。

---

#### `appendSideGameChip`
**目的**: サイドゲームチップ取引を記録する。

**Request**:
```typescript
interface AppendSideGameChipRequest {
  billId: string;
  chipPayload: {
    action: 'purchase' | 'withdraw' | 'deposit';
    amount: number;            // チップ数量
    // その他任意フィールド
  };
  idempotencyKey: string;
  options?: {
    dualWrite?: boolean;
  };
}
```

**Response**:
```typescript
interface AppendSideGameChipResponse {
  success: boolean;
  billId: string;
  chipId: string;
  updatedAt: string;
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}
```

**エラー**: `appendItem` と同様

**冪等性**: 
- キー形式: `<billId>:appendSideGameChip:<nonce>`
- 保存先: `/bills/{billId}/idempotency/{key}` (TTL: 48h)

**デュアルライト**: 
- フラグON時: 旧 `todaysBills.sideGameChip` 配列に追加

---

### 2.3 座席管理

#### `updatePlace`
**目的**: 伝票の座席情報を更新する。

**Request**:
```typescript
interface UpdatePlaceRequest {
  billId: string;
  table: string | null;
  seat: number | null;
  idempotencyKey?: string;     // 任意（推奨）
  options?: {
    dualWrite?: boolean;
  };
}
```

**Response**:
```typescript
interface UpdatePlaceResponse {
  success: boolean;
  billId: string;
  place: {
    table: string | null;
    seat: number | null;
  };
  updatedAt: string;
}
```

**エラー**:
- `invalid-argument`: `billId` が未指定
- `not-found`: `billId` が存在しない
- `failed-precondition`: `status == "settled"` で更新不可

**冪等性**: 
- キー形式: `<billId>:updatePlace:<nonce>`（任意）
- 最終値を採用するため、冪等keyなしでも安全

**デュアルライト**: 
- フラグON時: 旧 `todaysBills.currentTable`, `currentSeat` を更新

**備考**: `activeStays` は更新しない（最小スキーマのため）。

> **整合ルール:**  
> 座席情報の更新は LWW（Last Write Wins）方式を採用します。  
> サーバ受信時刻を基準に「最後に届いた更新」が採用されます。  
> 冪等キーは任意ですが、連打・多端末更新の検知には推奨します。  
> 競合時は **serverTimestamp()（受信時刻）を優先**して LWW を判定する。

---

### 2.4 トーナメント管理

#### `recordTournamentAction`
**目的**: トーナメント参加・リエントリー・アドオンを記録する。

**Request**:
```typescript
interface RecordTournamentActionRequest {
  billId: string;
  tplId: string;               // トーナメントテンプレートID
  action: 'entry' | 'reentry' | 'addon';
  payload: {
    // action ごとの詳細情報
  };
  idempotencyKey: string;
  options?: {
    dualWrite?: boolean;
  };
}
```

**Response**:
```typescript
interface RecordTournamentActionResponse {
  success: boolean;
  billId: string;
  tplId: string;
  updatedAt: string;
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}
```

**エラー**: `appendItem` と同様

**冪等性**: 
- キー形式: `<billId>:tournament:<tplId>:<action>:<nonce>`
- 保存先: `/bills/{billId}/idempotency/{key}` (TTL: 48h)

**デュアルライト**: 
- フラグON時: 旧 `todaysBills.tournaments` 配列に同期

**備考**: ポイント付与や賞金計上は別API (`awardTournamentResult`) で扱う。

---

#### `awardTournamentResult`
**目的**: トーナメント結果（ポイント・賞金）を付与する。

**Request**:
```typescript
interface AwardTournamentResultRequest {
  billId: string;
  tplId: string;
  resultPayload: {
    pointsAwarded?: number;
    // その他任意フィールド
  };
  idempotencyKey: string;
}
```

**Response**:
```typescript
interface AwardTournamentResultResponse {
  success: boolean;
  billId: string;
  tplId: string;
  tournamentsSnapshot: Record<string, any>;  // 更新後のスナップショット
  paymentsSummary: {
    paidTotalIncl: number;
    balanceDueIncl: number;
    byMethod?: Record<string, number>;
  };
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}
```

**エラー**: `recordTournamentAction` と同様

**冪等性**: 
- キー形式: `<billId>:tournament:award:<tplId>:<nonce>`
- 保存先: `/bills/{billId}/idempotency/{key}` (TTL: 48h)

**備考**: 賞金・ポイント付与専用。`settled` 以降はイベント経由で処理する。

---

### 2.5 会計管理

> **balanceDueIncl の整合（用語統一）:**  
> - **用語**: 本書では「Nightly Recalculation（再計算）」を正と呼ぶ。  
> - **スコープ**: **`analyticsMonthly/*` の再計算結果が"正（SSoT）"**。  
>   個々の `bills/{billId}.paymentsSummary.balanceDueIncl` はリアルタイムで正しく更新されるが、**集計ビュー（ダッシュボード/レポート）は Nightly Recalculation の再計算値で最終上書き**される。  
> - **実装指針**: 画面表示のリアルタイム値は暫定扱い。確定表示・締め処理・比較には `analyticsMonthly/*` の nightly 値を使用。

> 補足: 用語は `tools_and_operations_plan.md` §1 と一致させ、「Recalculation」を採用。

#### `startAccounting`
**目的**: 会計処理を開始し、伝票をロックする。

**Request**:
```typescript
interface StartAccountingRequest {
  billId: string;
  idempotencyKey: string;
  paymentDraft?: {
    // 支払方法の下書き情報（任意）
  };
  options?: {
    dualWrite?: boolean;
  };
}
```

**Response**:
```typescript
interface StartAccountingResponse {
  success: boolean;
  billId: string;
  status: 'settling';
  ops: {
    accountingStartedAt: string;  // ISO8601形式
    accountingStartedBy: string;  // オペレータUID
  };
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}
```

**エラー**:
- `invalid-argument`: 必須フィールド不足
- `not-found`: `billId` が存在しない
- `failed-precondition`: `status` が `open` または `in_progress` でない

**冪等性**: 
- キー形式: `<billId>:startAccounting:<nonce>`
- 保存先: `/bills/{billId}/idempotency/{key}`（TTL:48h, `requestHash` 保持）。既存時は副作用なしで前回レスポンス再利用。

**デュアルライト**: 
- フラグON時: 旧 `todaysBills.status` のみ更新

---

#### `completeAccounting`
**目的**: 会計を確定し、スナップショットを焼き込む。

**Request**:
```typescript
interface CompleteAccountingRequest {
  billId: string;
  idempotencyKey: string;
}
```

**Response**:
```typescript
interface CompleteAccountingResponse {
  success: boolean;
  billId: string;
  status: 'settled';
  amounts: {
    subTotalIncl: number;
    discountTotalIncl: number;
    serviceChargeIncl: number;
    grandTotalIncl: number;
    roundingDelta: number;
    grandTotalRounded: number;
    taxBreakdown?: Array<{rate: number, taxable: number, tax: number}>;
    taxTotal?: number;
  };
  categoryBreakdown: {
    items: number;
    extraCost: number;
    sideGameChips: number;
    tournaments: number;
  };
  paymentTotals: Record<string, number>;  // 支払方法別合計
  paymentsSummary: {
    paidTotalIncl: number;
    balanceDueIncl: number;
    byMethod?: Record<string, number>;
  };
  closedAt: string;                      // ISO8601形式
  ops: {
    accountingCompletedAt: string;
    accountingCompletedBy: string;
  };
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}
```

**エラー**:
- `invalid-argument`: 必須フィールド不足
- `not-found`: `billId` が存在しない
- `failed-precondition`: `status != "settling"`

**冪等性**: 
- キー形式: `<billId>:completeAccounting:<nonce>`
- 保存先: `/bills/{billId}/idempotency/{key}`（`requestHash` と `expiresAt=serverTimestamp()+48h` を保持）
- リプレイ時: 既存エントリ検出時は**副作用なし**で前回レスポンスを返却（`diagnostics.reused=true`）。履歴（確定スナップショット）は通常どおり `/payments/*` に記録されるが、**idempotency 判定は `/idempotency/*` のみ**で行う。

> 補足: 「履歴の格納（/payments/*）」と「冪等性の判定（/idempotency/*）」を**必ず分離**する。

**備考**: 
- 単一トランザクションでサブコレを再読み込みし、`amounts.*`, `categoryBreakdown`, `itemsSnapshot`, `sideGameChipsSummary`, `tournamentsSnapshot`, `paymentsSummary` を再計算→書込。
- `itemsSnapshot` が 700KB を超える場合は売上額 Top50 に圧縮する。
- `paymentsSummary.balanceDueIncl` はリアルタイム更新されますが、夜間再計算の結果が正値（Single Source of Truth）です。

---

#### `recordPayment`
**目的**: 支払いを記録し、`paymentsSummary` を更新する。

**Request**:
```typescript
interface RecordPaymentRequest {
  billId: string;
  paymentPayload: {
    method: string;            // 支払方法（AllowedPaymentMethods準拠）
    amountIncl: number;        // 税込金額
    providerTxnId?: string;   // 外部決済トランザクションID（推奨）
    // その他任意フィールド
  };
  idempotencyKey: string;      // `providerTxnId` を含めることを推奨
}
```

**Response**:
```typescript
interface RecordPaymentResponse {
  success: boolean;
  billId: string;
  paymentId: string;
  paymentsSummary: {
    paidTotalIncl: number;
    balanceDueIncl: number;
    byMethod?: Record<string, number>;
  };
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}
```

**エラー**:
- `invalid-argument`: 
  - 必須フィールド不足、`amountIncl <= 0`、許容リスト外の `method`
  - **`providerTxnId` がある場合、`idempotencyKey` と同一値でなければ `invalid-argument` を返す**
- `not-found`: `billId` が存在しない
- `unavailable`: 外部決済ゲートウェイの一時障害（再試行可能）
- `aborted`: 外部決済ゲートウェイのタイムアウト（再試行可能）
- `internal`: 予期せぬエラー

**冪等性**: 
- キー形式: `<billId>:payment:<providerTxnId or nonce>`
- 保存先: `/bills/{billId}/payments/{paymentId}`（履歴として保持、TTLなし）
- **`paymentId = providerTxnId`（存在しない場合は nonce）。docID = 冪等キー**。
- **一意ルール**: `providerTxnId` があるときは `idempotencyKey` も同一値を要求（不一致は `invalid-argument`）
- Firestore の docID 一意制約で重複を検出

**デュアルライト**: 
- フラグON時: 旧 `todaysBills.paymentMethodsByAmount` 等の最小情報のみ複写

---

### 2.6 事後イベント

#### `postEventRefund`
**目的**: 返金イベントを記録し、`postEvents.*` と `paymentsSummary` を更新する。

**Request**:
```typescript
interface PostEventRefundRequest {
  billId: string;
  eventPayload: {
    amountIncl: number;         // 返金額（税込）
    reason?: string;            // 任意: 返金理由
    method?: string;            // 任意: 返金方法
    // その他任意フィールド
  };
  idempotencyKey: string;
}
```

**Response**:
```typescript
interface PostEventRefundResponse {
  success: boolean;
  billId: string;
  eventId: string;
  status: 'settled' | 'partially_refunded' | 'refunded';
  postEvents: {
    totalRefundedIncl: number;
    netSalesIncl: number;
  };
  paymentsSummary: {
    paidTotalIncl: number;
    balanceDueIncl: number;
    byMethod?: Record<string, number>;
  };
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}
```

**エラー**:
- `invalid-argument`: 必須フィールド不足、`amountIncl <= 0`
- `not-found`: `billId` が存在しない
- `failed-precondition`: 
  - `refund.amountIncl` の累計が `grandTotalRounded` を超える
  - 反映後に `paymentsSummary.balanceDueIncl < 0`
  - 反映後に `postEvents.netSalesIncl < 0`
  - `status == "voided"` で返金不可

**冪等性**: 
- キー形式: `<billId>:event:refund:<nonce>`
- 保存先: `/bills/{billId}/events/{eventId}`（**`eventId = idempotencyKey`**。履歴として保持、TTLなし）
- **`/events` は Functions のみ書込。クライアント直書き禁止。**
- リプレイ時: 既存docを再利用（no-op）

**備考**: 
- 合計返金判定: `totalRefundedIncl == grandTotalRounded` なら `status = "refunded"`、`0 < totalRefundedIncl < grandTotalRounded` なら `status = "partially_refunded"`。
- Analytics への差分反映は Cloud Functions トリガで行う。

---

#### `postEventAdjustment`
**目的**: 追加徴収/減額イベントを記録する。

**Request**:
```typescript
interface PostEventAdjustmentRequest {
  billId: string;
  eventPayload: {
    amountIncl: number;         // 調整額（税込、正の値）
    sign: 1 | -1;              // +1: 追加徴収、-1: 減額
    reason?: string;
    // その他任意フィールド
  };
  idempotencyKey: string;
}
```

**Response**:
```typescript
interface PostEventAdjustmentResponse {
  success: boolean;
  billId: string;
  eventId: string;
  postEvents: {
    totalAdjustmentsIncl: number;
    netSalesIncl: number;
  };
  paymentsSummary: {
    paidTotalIncl: number;
    balanceDueIncl: number;
    byMethod?: Record<string, number>;
  };
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}
```

**エラー**: `postEventRefund` と同様（`amountIncl > 0`, `sign` が +1/-1 であることを検証）

**冪等性**: 
- キー形式: `<billId>:event:adjustment:<nonce>`
- 保存先: `/bills/{billId}/events/{eventId}`（**`eventId = idempotencyKey`**。履歴として保持、TTLなし）
- **`/events` は Functions のみ書込。クライアント直書き禁止。**

---

#### `postEventCancel`
**目的**: 伝票をキャンセル（voided）する。

> **営業日制約:**  
> この操作は `businessDate` の範囲内（営業日内）のみ実行可能です。  
> 支払または返金が一切ない状態（`paidTotalIncl == 0` かつ `totalRefundedIncl == 0`）でのみ許可されます。  
> 監査ログを必須とし、実行後は `status = "voided"` へ遷移します。  
> `businessDate` の算出は `calcBusinessDate(timestamp, STORE_CLOSE_HOUR)` に従う（Frontend/Backend とも `STORE_CLOSE_HOUR` を一致させる）。

**Request**:
```typescript
interface PostEventCancelRequest {
  billId: string;
  idempotencyKey: string;
  reason?: string;              // 任意: キャンセル理由
}
```

**Response**:
```typescript
interface PostEventCancelResponse {
  success: boolean;
  billId: string;
  eventId: string;
  status: 'voided';
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}
```

**エラー**:
- `invalid-argument`: 必須フィールド不足
- `not-found`: `billId` が存在しない
- `failed-precondition`: 
  - `status` が `open`, `in_progress`, `settling` 以外の場合、キャンセル不可（`settled` からは返金/再開で扱う）
  - `paymentsSummary.paidTotalIncl != 0` または `postEvents.totalRefundedIncl != 0` の場合、キャンセル不可（先に返金処理が必要）
  - ※ゼロ額伝票などの特例が要る場合は例外は運用Runbookで許可

**冪等性**: 
- キー形式: `<billId>:event:cancel:<nonce>`
- 保存先: `/bills/{billId}/events/{eventId}`（**`eventId = idempotencyKey`**。履歴として保持、TTLなし）
- **`/events` は Functions のみ書込。クライアント直書き禁止。**

**備考**: 
- 売上サマリは不変。必要な返金は別イベント (`postEventRefund`) で処理する。
- 営業日内のみ実行可能（監査ログ必須）。

---

#### `postEventReopen`
**目的**: 確定済み伝票を再開する。

**Request**:
```typescript
interface PostEventReopenRequest {
  billId: string;
  idempotencyKey: string;
  reason?: string;              // 任意: 再開理由
}
```

**Response**:
```typescript
interface PostEventReopenResponse {
  success: boolean;
  billId: string;
  eventId: string;
  status: 'in_progress';
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}
```

**エラー**:
- `invalid-argument`: 必須フィールド不足
- `not-found`: `billId` が存在しない
- `failed-precondition`: `status != "settled"`（`settled` からのみ再開可能）

**冪等性**: 
- キー形式: `<billId>:event:reopen:<nonce>`
- 保存先: `/bills/{billId}/events/{eventId}`（**`eventId = idempotencyKey`**。履歴として保持、TTLなし）
- **`/events` は Functions のみ書込。クライアント直書き禁止。**

**備考**: 
- 再確定時 (`completeAccounting`) に `amounts` 等を再計算して上書きする。
- `businessDate` は原則固定（通常は変えない）。変える場合の例外手順は運用Runbookで定義する。

---

### 2.7 ユーティリティ

#### `calcBusinessDate`
**目的**: 営業日を算出する（内部ユーティリティ、直接呼び出し不可）。

**入力**: `timestamp`, `storeCloseHour`
**出力**: `businessDate` (YYYY-MM-DD形式)

**備考**: すべてのAPIで利用される共通ロジック。

---

## 3. エラーコード一覧

| コード | 意味 | 発生条件 | クライアント対応 |
| --- | --- | --- | --- |
| `invalid-argument` | 入力不足・フォーマット違反 | 必須フィールド未指定、型不一致、範囲外の値 | フィールド名を確認し、正しい値を再送信 |
| `permission-denied` | 権限不足 | 管理者権限が必要な操作を一般ユーザーが実行 | 管理者に連絡 |
| `not-found` | リソース不存在 | `billId` が存在しない | UIで再取得を促す |
| `failed-precondition` | 状態不整合 | `status` ガード違反、バリデーション違反 | 現在の `status` を確認し、適切な操作を実行 |
| `unavailable` | 外部サービス一時障害 | 外部決済ゲートウェイの一時障害 | 指数バックオフで再試行 |
| `aborted` | タイムアウト | 外部決済ゲートウェイのタイムアウト | 指数バックオフで再試行 |
| `internal` | 予期せぬエラー | サーバー側の予期せぬエラー | ログを確認し、管理者に連絡 |

---

## 4. 冪等性契約の詳細

### 4.1 キー生成規則
- **形式**: `<billId>:<operationType>:<clientNonce>`
  - `billId`: 対象となる `bills/{billId}`
  - `operationType`: `createBill`, `appendItem`, `appendSideGameChip`, `recordTournamentAction`, `recordPayment`, `postEventRefund` 等
  - `clientNonce`: クライアント側で生成する UUID または時刻＋端末IDを含む乱数

> **統一ルール:**  
> イベントおよび支払いドキュメントは、ID 自体に冪等キーを埋め込みます。  
> - 支払い (`recordPayment`) → `paymentId = providerTxnId`（存在しない場合は nonce）  
> - イベント (`postEventRefund`, `postEventAdjustment`, `postEventCancel`, `postEventReopen`) → `eventId = idempotencyKey`  
> この構成により Firestore の一意制約を利用して再実行時の重複登録を防ぎます。  
> **注意**: `recordPayment` および `postEvent*` は「docID＝冪等キー」方式であり、`/idempotency/*` サブコレクションは使用しません。

### 4.2 保存先と TTL
- **入店/会計系（create/start/complete）** (`createBillWithActiveStay`, `startAccounting`, `completeAccounting`)
  - `/bills/{billId}/idempotency/{key}`（TTL:48h, `requestHash` 保持）
  - `requestHash`（payload の正規化ハッシュ）と `expiresAt` (serverTimestamp + 48h) を付与
  - TTL により自動削除
  - 再実行時は hash の一致を検証し、不一致なら `failed-precondition`
- **支払い（recordPayment）**
  - `/bills/{billId}/payments/{paymentId}`（**`paymentId = providerTxnId` or nonce**。履歴/明細の保存先であり、idempotency は **docID の一意性**で担保）
  - 履歴として保持、TTLなし
- **イベント（refund/adjustment/cancel/reopen）** (`postEventRefund`, `postEventAdjustment`, `postEventCancel`, `postEventReopen`)
  - `/bills/{billId}/events/{eventId}`（**`eventId = idempotencyKey`**。履歴保存先であり、idempotency は **docID の一意性**で担保）
  - 履歴として保持、TTLなし

> **補足:**  
> すべての create/start/complete 系 API は、idempotency の保存先を  
> `/bills/{billId}/idempotency/{key}` に統一します。  
> ここにはリクエストのハッシュと有効期限 (TTL: 48h) を記録します。  
> 一方 `/payments/` や `/events/` は履歴を残す目的であり、idempotency 判定とは別管理です。

### 4.3 冪等性チェックフロー
1. API受信時にキーを必須パラメータとして受け取り、サブコレで存在確認
2. 既存なら再実行と判断し、前回と同じレスポンスを返却（副作用なし、`updatedAt` は変更しない）
3. 未存在ならトランザクション内で処理し、`idempotency` ドキュメントを作成

### 4.4 リプレイ時の動作
- **成功レスポンス再利用**: 既存docが存在する場合、前回と同じレスポンスを返却
- **`updatedAt` 不変**: 冪等リプレイ時は `updatedAt` を変更しない
- **`diagnostics.reused`**: 再利用時は `true` を返却

---

## 5. ライフサイクル遷移表

| 現在状態 | イベント | 次状態 | ガード条件 | エラーケース |
| --- | --- | --- | --- | --- |
| - | `createBillWithActiveStay` | `open` | - | 重複入店（`activeStays/{uid}` 既存） |
| `open` | オーダー開始（自動/明示） | `in_progress` | - | - |
| `open` / `in_progress` | `startAccounting` | `settling` | `status ∈ {"open", "in_progress"}` | `status` が条件外 |
| `settling` | `completeAccounting` | `settled` | `status == "settling"` | `status != "settling"` |
| `settled` | `postEventRefund` | `partially_refunded` / `refunded` | `totalRefundedIncl < grandTotalRounded` / `== grandTotalRounded` | 累計返金額超過、`balanceDueIncl < 0` |
| `settled` | `postEventAdjustment` | `settled` | `netSalesIncl >= 0`, `balanceDueIncl >= 0` | 条件違反 |
| `settled` | `postEventReopen` | `in_progress` | `status == "settled"` | `status != "settled"` |
| any | `postEventCancel` | `voided` | `paidTotalIncl == 0`, `totalRefundedIncl == 0` | 条件違反 |

---

## 6. 型定義（TypeScript）

共通型定義は `functions/src/types/bills.ts` に配置する。

```typescript
// 支払方法の許容リスト
export enum AllowedPaymentMethods {
  CASH = 'cash',
  CREDIT_CARD = 'credit_card',
  ELECTRONIC_MONEY = 'electronic_money',
  // その他
}

// 拡張ガイド:
// - カスタム追加時は「ワイヤー値は小文字スネークケース、UI表示名は別マップ」を遵守
// - 将来の多言語表示対応のため、表示名は enum とは分離して管理する

// 伝票ステータス
export type BillStatus = 
  | 'open'
  | 'in_progress'
  | 'settling'
  | 'settled'
  | 'partially_refunded'
  | 'refunded'
  | 'voided';

// 共通Request/Response型
export interface BaseRequest {
  billId: string;
  idempotencyKey?: string;
  options?: {
    dualWrite?: boolean;
  };
}

export interface BaseResponse {
  success: boolean;
  billId: string;
  diagnostics?: {
    reason?: string;
    reused?: boolean;
  };
}
```

---

## 7. 実装ファイル構成

- `functions/src/helpers/billsApi/index.ts`: 外部公開API
- `functions/src/helpers/billsApi/dualWrite.ts`: デュアルライトロジック
- `functions/src/helpers/billsApi/idempotency.ts`: 冪等性管理
- `functions/src/helpers/billsApi/snapshots.ts`: スナップショット再計算
- `functions/src/helpers/billsApi/events.ts`: イベント作成・差分適用
- `functions/src/helpers/billsApi/payments.ts`: 支払い管理
- `functions/src/helpers/billsApi/tournaments.ts`: トーナメント管理
- `functions/src/helpers/billsApi/date.ts`: `calcBusinessDate` ユーティリティ
- `functions/src/types/bills.ts`: 型定義

---

## 8. テスト要件

- **ユニットテスト**: `functions/__tests__/helpers/billsApi/*.spec.ts` に API ごとの happy/edge/idempotent ケースを実装
- **統合テスト**: `functions/__tests__/integration/billsApi.spec.ts` で dual write フラグ ON/OFF の整合を検証
- **テスト観点**: `helper_api_plan.md` §7 を参照

---

## 9. 参照ドキュメント

- `helper_api_plan.md`: 詳細仕様・設計方針
- `schema_plan.md`: データモデル定義
- `trigger_plan.md`: トリガ設計
- `test_plan.md`: テスト計画

