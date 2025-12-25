# ChangeSpec（P1-02）

## 目的 / 関連文書

- **目的**: `placeOrder.ts` と `placeOrderByUser.ts` を新スキーマ（`/bills/{billId}/items/{itemId}`）に対応させ、合計金額更新を廃止する。**強い冪等**（時間窓なし、expiresAt廃止）を採用し、サーバ側でメニュー情報を正規化する。
- **参照**: 
  - `api_contract.md` §2.2 `appendItem`
  - `helper_api_plan.md` §10 API定義一覧（`appendItem`）
  - `schema_plan.md` `/bills/{billId}/items/{itemId}` スキーマ

## 変更概要（What）

### 新規/更新ファイル
- **新規**: `functions/src/helpers/billsApi/getActiveBillByUser.ts` - アクティブな伝票を取得するヘルパAPI
- **新規**: `functions/src/helpers/billsApi/appendItem.ts` - アイテム追加ヘルパAPI（強い冪等、サーバ正規化）
- **新規**: `functions/src/helpers/billsApi/resolveMenuItem.ts` - メニューアイテム解決ヘルパ（`menuItems`コレクションから取得）
- **新規**: `functions/src/triggers/onSettleCleanupIdempotency.ts` - 会計確定時にidempotency一括削除（stub可、P1-06で本実装）
- **更新**: `functions/src/itemOrder/placeOrder.ts` - 新ヘルパAPIを使用、orders/_TodaysOrdersスキーマ確定（Chips除外）
- **更新**: `functions/src/itemOrder/placeOrderByUser.ts` - 新ヘルパAPIを使用、orders/_TodaysOrdersスキーマ確定（Chips除外）
- **更新**: `functions/src/helpers/billsApi/index.ts` - 新ヘルパAPIをエクスポート
- **更新**: `firestore.rules` - `/bills/{billId}/items/{itemId}` と `/bills/{billId}/idempotency/{key}` をFunctions専用に設定

### 呼び出し元影響範囲
- `placeOrder`: スタッフが注文確定ボタンを押下したとき
- `placeOrderByUser`: LIFF側のユーザーが注文確定ボタンを押下したとき
- 両方とも `orders/{YYYYMMDD}/_TodaysOrders/{orderId}` への記録は維持（`bills.place.table`, `bills.place.seat` を同梱）

## 実装詳細（How）

### 書込み先
- **新スキーマ**: `/bills/{billId}/items/{itemId}` サブコレクションにドキュメント作成
- **デュアルライト**: `WRITE_TODAYS_BILLS_IN_PARALLEL=true` 時のみ `todaysBills.items` 配列に行追加（金額は更新しない）

### 冪等性（強い冪等のみ、時間窓なし）
- **方式**: `/bills/{billId}/idempotency/{key}` に `requestHash` と `createdAt` を保存（**expiresAt廃止**）
- **キー形式**: `appendItem:<billId>:<clientNonce>`（同一画面セッションの二度押し＝完全no-op、画面再オープン＝clientNonce再生成で新規扱い）
- **保存先**: `/bills/{billId}/idempotency/{key}`
- **リプレイ時**: 既存レスポンスを返却（**親updatedAtは更新しない**）
- **クリーンアップ**: 会計確定（settle）時に `/bills/{billId}/idempotency/*` を一括削除（P1-06で本実装、今回はstub可）

### デュアルライト
- **最小複写内容**: `todaysBills.items` 配列に行追加のみ
- **更新しない**: `totalPrice` など金額フィールドは更新しない（新 `bills` がSSoT）
- **失敗時**: 警告ログのみ記録、`bills` への書込みは成功

### 権限境界（Functions/Client）
- **Functions のみ**: `/items` サブコレクションの作成は Functions のみ
- **Client 禁止**: クライアントからの直接書き込みは禁止（Firestore ルールで制限）

### 競合解決（LWW or なし）
- **なし**: 同一 `billId` で同時注文は可能（各アイテムは独立したドキュメントとして作成）
- **冪等性**: 同一 `idempotencyKey` で再実行時は既存レスポンスを返却

### ログ/メトリクス（出力フィールド）
- **構造化ログ**: `op: 'appendItem'`, `billId`, `itemId`, `idempKey`, `attempt`, `result(ok|reused|fail)`, `code`, `reason`, `requestHash8`
- **メトリクス**: `bills.op.duration_ms`, `bills.op.retry_count`, `dualwrite.error_count`

### 例外（HttpsErrorマッピング）
- `invalid-argument`: 必須フィールド不足、`quantity <= 0`、メニュー未解決（`menuItemId`が存在しない）
- `permission-denied`: `placeOrderByUser` で未認証
- `not-found`: アクティブな `billId` なし（`getActiveBillByUser` で見つからない）
- `failed-precondition`: `status ∈ {'settling','settled','voided'}` で更新不可（許可は `open`/`in_progress` のみ）
- `internal`: 予期せぬエラー

## 仕様差分（Before→After）

### Before（現行実装）
```
placeOrder / placeOrderByUser
  ↓
1. todaysBills を userId で検索（status=open）
2. todaysBills.items 配列に行追加
3. todaysBills.totalPrice を加算更新
4. orders/{YYYYMMDD}/_TodaysOrders に記録
```

### After（新実装）
```
placeOrder / placeOrderByUser
  ↓
1. getActiveBillByUser(userId) で bills/{billId} を取得
   （activeStays/{uid} から billId を取得、フォールバック: bills を直接クエリ）
2. リクエストの item は menuItemId と quantity のみ使用（name/category/price は無視）
3. clientNonce（画面セッションで固定）から idempotencyKey を生成: appendItem:<billId>:<clientNonce>
4. appendItem({ billId, item:{menuItemId, quantity, clientNonce}, idempotencyKey }) を呼び出し
   ↓
   a. 強い冪等チェック（/idempotency/{key} 存在チェック → あれば reused で既存レスポンス返却、親updatedAtは更新しない）
   b. status チェック（open/in_progress のみ許可、settling/settled/voided は拒否）
   c. resolveMenuItem(menuItemId) で name/category/unitPriceIncl をサーバ確定（リクエスト値は無視）
   d. /bills/{billId}/items/{itemId} にドキュメント作成（orderedAt のみ、createdAt/updatedAt は持たせない）
   e. 親 /bills/{billId}.updatedAt = serverTimestamp()
   f. /bills/{billId}/idempotency/{idempotencyKey} を作成（requestHash, createdAt、expiresAtは保存しない）
   g. デュアルライト: todaysBills.items 配列に行追加（金額は更新しない、totalPriceも更新しない）
5. orders/{YYYYMMDD}/_TodaysOrders に記録（提供動線専用、Chips除外）
   - if (resolved.category !== 'chip') のときのみ作成
   - 1アイテム種類=1ドキュメント（複数種類は複数doc）
   - bills.place.table, bills.place.seat を同梱
```

### Firestoreドキュメント例

#### Before（todaysBills）
```json
{
  "items": [
    {
      "menuItemId": "item_001",
      "name": "ビール",
      "price": 500,
      "quantity": 2,
      "totalPrice": 1000,
      "orderedAt": "2025-11-15T10:00:00Z"
    }
  ],
  "totalPrice": 1000
}
```

#### After（bills/{billId}/items/{itemId}）
```json
{
  "menuItemId": "item_001",
  "category": "drink",
  "name": "ビール",
  "unitPriceIncl": 500,
  "quantity": 2,
  "totalPriceIncl": 1000,
  "orderedAt": "serverTimestamp()",
  "voided": false
}
```
※ `createdAt`/`updatedAt` は持たせない（親 `/bills/{billId}.updatedAt` のみ更新）

#### orders/{YYYYMMDD}/_TodaysOrders/{itemId}（Chipsは登録しない）
```json
{
  "orderDocId": "20251115",
  "billId": "bill_abc123",
  "userId": "user_xyz789",
  "userName": "山田太郎",
  "menuItemId": "item_001",
  "name": "ビール",
  "category": "drink",
  "quantity": 2,
  "status": "preparing",
  "orderedAt": "serverTimestamp()",
  "currentTable": "A",
  "currentSeat": 12
}
```
※ `docId = itemId` で作成（冪等性担保）。同一 `itemId` で replay 時は上書きのみで親集計はスキップ。1アイテム種類=1ドキュメント、複数種類は複数doc、Chips（category='chip'）は除外

## テスト

### 単体（happy/edge/idempotent/permission）
1. **happy path**: 
   - `billId`, `item: {menuItemId, quantity, clientNonce}`, `idempotencyKey` を指定して呼び出し
   - `resolveMenuItem(menuItemId)` で name/category/unitPriceIncl をサーバ確定
   - `/bills/{billId}/items/{itemId}` が作成されること（`itemId = idempotencyKey`、`orderedAt` のみ、`createdAt`/`updatedAt` は持たせない）
   - レスポンスに `success: true`, `itemId`, `orderedAt` が含まれること
2. **invalid-argument**: 
   - `quantity <= 0` → `invalid-argument`
   - メニュー未解決（`menuItemId` が存在しない） → `invalid-argument`
3. **not-found**: 
   - アクティブな `billId` なし（`getActiveBillByUser` で見つからない） → `not-found`
4. **failed-precondition**: 
   - `status` が `settling`/`settled`/`voided` の場合 → `failed-precondition`（許可は `open`/`in_progress` のみ）
5. **強い冪等性**: 
   - 同一 `clientNonce` で再実行 → 既存docを返却（`reused: true`）、**親updatedAtは変更されない**
   - `itemId = idempotencyKey` で統一（同一 `idempotencyKey` は同じ `itemId` を参照）
   - `/bills/{billId}/idempotency/{key}` に `itemId` を保存（replay 時に使用）
   - `/bills/{billId}/idempotency/{key}` に `expiresAt` は保存されない
6. **permission-denied**: 
   - `placeOrderByUser` で未認証 → `permission-denied`

### 統合（DualWrite ON/OFF、orders/_TodaysOrders）
1. **DualWrite ON**: 
   - `WRITE_TODAYS_BILLS_IN_PARALLEL=true` で実行
   - `todaysBills.items` 配列に行追加されること（**金額は更新されない、totalPriceも更新されない**）
   - 複写失敗時も `bills` への書込みは成功すること
2. **DualWrite OFF**: 
   - `WRITE_TODAYS_BILLS_IN_PARALLEL=false` で実行
   - `todaysBills` への複写がスキップされること
3. **orders/_TodaysOrders**: 
   - 非 chip のみ作成される（`category !== 'chip'`）
   - 1種類=1ドキュメント、複数種類は複数doc
   - `orderedAt` はサーバ時刻、`name`/`category`/`unitPriceIncl` はサーバ解決値
   - `bills.place.table`, `bills.place.seat` が同梱されている
4. **placeOrderByUser**: 
   - 未認証で `permission-denied`
   - 複数アイテム配列受領時：種類ごとに `appendItem` を順に呼ぶ（同一 `clientNonce` を流用すると冪等に引っかかるため、種類ごとに `clientNonce` を変える：`<sessionNonce>-<index>` など）

### 手動（3手順以内）
1. Flutter アプリから `placeOrder` を呼び出し（`userId`, `item: {menuItemId, quantity}` を指定、`name`/`category`/`price` は無視される）
2. Firestore Console で以下を確認:
   - `/bills/{billId}/items/{itemId}` が作成されている（`orderedAt` のみ、`createdAt`/`updatedAt` は持たせない）
   - `/bills/{billId}/idempotency/{key}` が作成されている（`requestHash`, `createdAt` のみ、**expiresAtは保存されない**）
   - `/bills/{billId}.updatedAt` が更新されている
   - `/todaysBills/{billId}.items` 配列に行追加されている（デュアルライトON時、**金額は更新されていない、totalPriceも更新されていない**）
   - `/orders/{YYYYMMDD}/_TodaysOrders/{orderId}` が作成されている（非 chip のみ、1種類=1doc、`docId = itemId`、`bills.place.table`, `bills.place.seat` が同梱、親集計は初回のみ）
3. 同一 `clientNonce` で再実行 → 既存docを返却（`reused: true`）、**親updatedAtは変更されない**

## ドキュメント更新
- `README.md`: P1-02 完了を追記（概要1〜3行）
- `modification_plan.md`: P1-02 状態を「完了」に更新、仕様差分1行を追記
- `changelog.md`: `YYYY-MM-DD: P1-02 注文を /bills/items へ。強い冪等・orders スキーマ確定（Chips 除外）` を追記
- `test_plan.md`: 上記テストケースを追記（強い冪等、サーバ正規化、orders/_TodaysOrders、Chips除外）

## 実装ファイル詳細

### 1. getActiveBillByUser.ts
- **入力**: `userId: string`
- **取得順序**: 
  1. `activeStays/{userId}` → `billId` を取得
  2. フォールバック: `bills` を `party.userId == userId AND status in ('open','in_progress')` で1件取得
- **戻り値**: `{ billId, billRef, billData }`（見つからなければ `not-found`）

### 2. appendItem.ts
- **入力**: `{ billId: string; item: { menuItemId: string; quantity: number; clientNonce: string }; idempotencyKey: string }`
- **強い冪等**: 
  - `idempotencyKey = appendItem:<billId>:<clientNonce>`
  - `/bills/{billId}/idempotency/{idempotencyKey}` 存在チェック → あれば `reused` で既存レスポンス返却（親updatedAtは更新しない）
  - `expiresAt` は保存しない（`requestHash` と `createdAt` のみ）
  - `requestHash` は `normalize({billId, menuItemId, quantity})` を SHA-256 で
- **ビルド**:
  - `bills/{billId}` 読込 → `status` が `open` または `in_progress` であることを検証（`settling`/`settled`/`voided` は `failed-precondition`）
  - `resolveMenuItem(menuItemId)` で `name`/`category`/`unitPriceIncl` をサーバ確定（`price` はリクエストを無視）
  - `/bills/{billId}/items/{itemId}` を新規ドキュメントで作成（`itemId = idempotencyKey`、`orderedAt` のみ、`createdAt`/`updatedAt` は持たせない）
  - 親 `/bills/{billId}.updatedAt = serverTimestamp()`
  - `/bills/{billId}/idempotency/{idempotencyKey}` を作成（`requestHash`, `createdAt`, `itemId`）
  - トランザクション後に item ドキュメントを読み直して `orderedAt` の実値を取得
- **DualWrite**: `WRITE_TODAYS_BILLS_IN_PARALLEL=true` のときのみ旧 `todaysBills/{billId}.items` 配列へ `arrayUnion` で追記（`orderId = itemId` 必須、金額フィールドは入れない、totalPriceも更新しない）

### 3. resolveMenuItem.ts
- **入力**: `menuItemId: string`
- **出力**: `{ menuItemId, name, category, unitPriceIncl }`
- **実データ取得元**: `/menuItems/{menuItemId}`（既存実装に合わせる）
- **見つからなければ**: `invalid-argument`

### 4. placeOrder.ts / placeOrderByUser.ts
- **やること**:
  - 直書きしている `todaysBills` 更新・`totalPrice` 加算ロジックを全面撤去
  - `getActiveBillByUser(userId)` で `billId` 決定（なければ `not-found`）
  - リクエストの `item` は `menuItemId` と `quantity` のみ使用（`name`/`category`/`price` は無視）
  - `clientNonce`（画面セッションで固定）から `idempotencyKey` を生成
  - `appendItem({ billId, item:{menuItemId, quantity, clientNonce}, idempotencyKey })`
  - `orders` への登録（提供動線用・Chips は除外）
    - `if (resolved.category !== 'chip')` のときのみ、`orders/{YYYYMMDD}/_TodaysOrders` に1種類=1ドキュメントを作る
    - `docId = itemId` で作成（冪等性担保）
    - 存在しない時だけ set + 親集計 increment、存在時は上書きのみで親集計スキップ
    - 複数種類の同時注文は種類数ぶんのドキュメントを作成（配列itemsは使わない）
- **placeOrderByUser の差分**:
  - `userId = request.auth.uid` を使用（未認証は `permission-denied`）
  - `items` 配列受領時：種類ごとに `appendItem` を順に呼ぶ（同一 `clientNonce` を流用すると冪等に引っかかるため、種類ごとに `clientNonce` を変える：`<sessionNonce>-<index>` など）

### 5. onSettleCleanupIdempotency.ts（stub可）
- 会計確定（新旧どちらのトリガでも可）で `/bills/{billId}/idempotency/*` を一括削除
- コメントに「P1-06 で本実装」と TODO を残す（今回PRでは stub でも良い）

### 6. firestore.rules
- `/bills/{billId}/items/{itemId}`：クライアント書込み禁止（Functions のみ許可）
- `/bills/{billId}/idempotency/{key}`：完全 Functions 限定
- `orders/{YYYYMMDD}/_TodaysOrders/{autoId}`：Functions が作成／更新（UI からの status 更新を許容するなら、その更新のみ許可）

### 7. firestore.indexes.json（必要に応じて同梱）
- `orders/{YYYYMMDD}/_TodaysOrders`:
  - `(status ASC, orderedAt ASC)`
  - `(currentTable ASC, status ASC, orderedAt ASC)`
  - `(billId ASC, orderedAt DESC)`

