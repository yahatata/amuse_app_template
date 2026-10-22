# P1-02 結合テスト結果サマリ

_最終更新: 2025-11-15 (JST)_

## 概要

P1-02（注文フロー）の結合テストを実行し、全45件のテストケースが成功しました。

### テスト実行結果

- **成功**: 45件
- **失敗**: 0件
- **合計**: 45件
- **成功率**: 100%

### 実行環境

- **実行方法**: `npm run test:p1-02`（`--runInBand` で逐次実行）
- **Firestore Emulator**: `localhost:8080`
- **テストフレームワーク**: Jest
- **実行時間**: 約3.3秒

---

## テストファイル別詳細結果

### 1. `resolveMenuItem.spec.ts` (単体テスト)

**テスト数**: 4件（全件成功）

**実装コード**: `functions/src/helpers/billsApi/resolveMenuItem.ts`

#### 実装概要

```typescript
export async function resolveMenuItem(menuItemId: string): Promise<ResolvedMenuItem> {
  // 1. バリデーション（menuItemId 必須）
  // 2. Firestore から menuItems/{menuItemId} を取得
  // 3. 必須フィールド（name, category, price）の検証
  // 4. ResolvedMenuItem を返却（unitPriceIncl = price）
}
```

**責務**: 
- `menuItemId` からメニュー定義を取得
- サーバ側でメニュー情報を正規化（クライアントの `name`/`category`/`price` は信用しない）
- 必須フィールドの検証

#### テストケース詳細

| # | テスト項目 | 内容 | 実装コード箇所 | 結果 |
|---|-----------|------|---------------|------|
| 1 | menuItemId からメニュー定義を解決できること | 正常系: `menuItems/{menuItemId}` から `name`, `category`, `unitPriceIncl` を取得 | `resolveMenuItem.ts:25-51` | ✅ 成功 |
| 2 | menuItemId 未指定 → invalid-argument | バリデーション: `menuItemId` が空文字列の場合 | `resolveMenuItem.ts:26-28` | ✅ 成功 |
| 3 | メニュー未解決（menuItemId が存在しない） → invalid-argument | エラー処理: Firestore に該当ドキュメントが存在しない場合 | `resolveMenuItem.ts:34-36` | ✅ 成功 |
| 4 | メニューデータが不正（必須フィールド不足） → invalid-argument | バリデーション: `name`, `category`, `price` のいずれかが不足している場合 | `resolveMenuItem.ts:41-43` | ✅ 成功 |

---

### 2. `getActiveBillByUser.spec.ts` (統合テスト)

**テスト数**: 7件（全件成功）

**実装コード**: `functions/src/helpers/billsApi/getActiveBillByUser.ts`

#### 実装概要

```typescript
export async function getActiveBillByUser(userId: string): Promise<GetActiveBillByUserResult> {
  // 1. バリデーション（userId 必須）
  // 2. activeStays/{userId} から billId を取得
  //    → 存在する場合、その billId の bills ドキュメントを返す（status に関係なく）
  // 3. フォールバック: bills を直接クエリ
  //    → party.userId == userId AND status in ('open','in_progress') で1件取得
  // 4. 見つからない場合は not-found エラー
}
```

**責務**:
- アクティブな伝票を取得
- `activeStays` を優先的に参照し、存在しない場合は `bills` を直接クエリ
- **重要**: `activeStays` に `billId` がある場合は、`status` に関係なく返す（`appendItem` の `status` ガードで拒否される）

#### テストケース詳細

| # | テスト項目 | 内容 | 実装コード箇所 | 結果 |
|---|-----------|------|---------------|------|
| 1 | activeStays/{userId} から billId を取得できること | 正常系: `activeStays` に `billId` がある場合、その `bills` を返す | `getActiveBillByUser.ts:39-55` | ✅ 成功 |
| 2 | activeStays が存在しない場合、bills を直接クエリで取得できること（フォールバック） | 正常系: `activeStays` が存在しない場合、`bills` を直接クエリ | `getActiveBillByUser.ts:60-78` | ✅ 成功 |
| 3 | アクティブな billId なし → not-found | エラー処理: `activeStays` も `bills` も見つからない場合 | `getActiveBillByUser.ts:69-71` | ✅ 成功 |
| 4 | bills の status が settled の場合、フォールバックでも取得されないこと | エラー処理: フォールバッククエリでは `status in ('open','in_progress')` のみ取得 | `getActiveBillByUser.ts:64` | ✅ 成功 |
| 5 | activeStays/{userId} に billId があり、そのbillが open → それが返る | 正常系: `activeStays` に `billId` があり、`status='open'` の場合 | `getActiveBillByUser.ts:39-55` | ✅ 成功 |
| 6 | activeStays にあるが該当billが settled → statusに関係なくそのbillを返す | **重要**: `activeStays` に `billId` がある場合、`status` に関係なく返す（`appendItem` の `status` ガードで拒否される） | `getActiveBillByUser.ts:49-50` | ✅ 成功 |
| 7 | userId 未指定 → invalid-argument | バリデーション: `userId` が空文字列の場合 | `getActiveBillByUser.ts:29-31` | ✅ 成功 |

---

### 3. `appendItem.spec.ts` (統合テスト)

**テスト数**: 17件（全件成功）

**実装コード**: `functions/src/helpers/billsApi/appendItem.ts`

#### 実装概要

```typescript
export async function appendItem(request: AppendItemRequest): Promise<AppendItemResponse> {
  // 1. バリデーション（billId, menuItemId, idempotencyKey, clientNonce, quantity）
  // 2. トランザクション開始
  // 3. 強い冪等チェック: /bills/{billId}/idempotency/{idempotencyKey} を確認
  //    → 存在する場合、requestHash を比較
  //    → ハッシュ一致: 既存docを返却（親updatedAtは更新しない）
  //    → ハッシュ不一致: failed-precondition
  // 4. bills/{billId} を読み込み、status チェック
  //    → 許可: open/in_progress、拒否: settling/settled/voided
  // 5. メニューアイテムを解決（サーバ側で正規化）
  // 6. /bills/{billId}/items/{itemId} を作成（itemId = idempotencyKey）
  // 7. 親 /bills/{billId}.updatedAt を更新
  // 8. /bills/{billId}/idempotency/{idempotencyKey} を作成（itemIdを保存）
  // 9. デュアルライト: todaysBills.items 配列に行追加（arrayUnion使用、金額は更新しない）
  // 10. トランザクション後に item ドキュメントを読み直して orderedAt の実値を取得
}
```

**責務**:
- 伝票にアイテムを追加
- **強い冪等性**: `itemId = idempotencyKey` で統一、`requestHash` でリクエスト内容を検証
- **サーバ側正規化**: クライアントの `name`/`category`/`price` は信用せず、`resolveMenuItem` でサーバ側から取得
- **status ガード**: `open`/`in_progress` のみ許可、`settling`/`settled`/`voided` は拒否
- **デュアルライト**: `WRITE_TODAYS_BILLS_IN_PARALLEL` フラグで制御、失敗は警告ログのみ

#### テストケース詳細

##### happy path (1件)

| # | テスト項目 | 内容 | 実装コード箇所 | 結果 |
|---|-----------|------|---------------|------|
| 1 | 正常なアイテム追加ができること（itemId = idempotencyKey、orderedAt のみ） | 正常系: アイテム追加、`itemId = idempotencyKey`、`orderedAt` は `serverTimestamp()` の実値 | `appendItem.ts:54-263` | ✅ 成功 |

##### invalid-argument (2件)

| # | テスト項目 | 内容 | 実装コード箇所 | 結果 |
|---|-----------|------|---------------|------|
| 2 | quantity <= 0 → invalid-argument | バリデーション: `quantity` が0以下または整数でない場合 | `appendItem.ts:63-65` | ✅ 成功 |
| 3 | メニュー未解決（menuItemId が存在しない） → invalid-argument | エラー処理: `resolveMenuItem` が `invalid-argument` を返す場合 | `appendItem.ts:142` → `resolveMenuItem.ts:34-36` | ✅ 成功 |

##### not-found (1件)

| # | テスト項目 | 内容 | 実装コード箇所 | 結果 |
|---|-----------|------|---------------|------|
| 4 | アクティブな billId なし → not-found | エラー処理: `bills/{billId}` が存在しない場合 | `appendItem.ts:128-130` | ✅ 成功 |

##### failed-precondition (3件)

| # | テスト項目 | 内容 | 実装コード箇所 | 結果 |
|---|-----------|------|---------------|------|
| 5 | status が settled の場合 → failed-precondition | ステータスガード: `status='settled'` の場合 | `appendItem.ts:136-139` | ✅ 成功 |
| 6 | status が settling の場合 → failed-precondition | ステータスガード: `status='settling'` の場合 | `appendItem.ts:136-139` | ✅ 成功 |
| 7 | status が voided の場合 → failed-precondition | ステータスガード: `status='voided'` の場合 | `appendItem.ts:136-139` | ✅ 成功 |

##### 強い冪等性 (4件)

| # | テスト項目 | 内容 | 実装コード箇所 | 結果 |
|---|-----------|------|---------------|------|
| 8 | 同一 clientNonce で再実行 → 既存docを返却（reused: true）、親updatedAtは変更されない | 冪等性: 同一 `idempotencyKey` で再実行時、既存docを返却し、親 `updatedAt` は更新しない | `appendItem.ts:84-124` | ✅ 成功 |
| 9 | itemId = idempotencyKey で統一されていること | 冪等性: `itemId` と `idempotencyKey` が同一であることを確認 | `appendItem.ts:145` | ✅ 成功 |
| 10 | idempotency doc に保存された itemId を使ったreplay | 冪等性: 初回実行で `/idempotency/{key}.itemId` が保存され、リプレイ時に保存済み `itemId` を参照 | `appendItem.ts:96-107, 179` | ✅ 成功 |
| 11 | orderedAt の実値返却: appendItem のレスポンス orderedAt が serverTimestamp() 実解決値（ISO8601）になっている | 実値返却: トランザクション後に `item` ドキュメントを読み直して `orderedAt` の実値を取得 | `appendItem.ts:223-235` | ✅ 成功 |

##### DualWrite ON/OFF (3件)

| # | テスト項目 | 内容 | 実装コード箇所 | 結果 |
|---|-----------|------|---------------|------|
| 12 | DualWrite ON: todaysBills.items 配列に arrayUnion で行追加されること（金額は更新されない、totalPriceも更新されない） | DualWrite: `WRITE_TODAYS_BILLS_IN_PARALLEL=true` の場合、`todaysBills.items` に `arrayUnion` で追加 | `appendItem.ts:184-211` | ✅ 成功 |
| 13 | DualWrite OFF: todaysBills への複写がスキップされること | DualWrite: `WRITE_TODAYS_BILLS_IN_PARALLEL=false` の場合、`todaysBills` への複写をスキップ | `appendItem.ts:152-155` | ✅ 成功 |
| 14 | DualWrite ON: 同一 idempotencyKey でリプレイ → todaysBills.items の件数は増えない（arrayUnion の重複抑止） | DualWrite: 同一 `idempotencyKey` でリプレイ時、`arrayUnion` により重複が抑止される | `appendItem.ts:198-201` | ✅ 成功 |

##### 価格の信頼境界（サーバ正規化）(1件)

| # | テスト項目 | 内容 | 実装コード箇所 | 結果 |
|---|-----------|------|---------------|------|
| 15 | クライアントが price を改ざんして送っても、無視され、resolveMenuItem(...).price が採用される | セキュリティ: クライアントが送信した `price` は無視され、サーバ側で解決した `unitPriceIncl` が採用される | `appendItem.ts:142` → `resolveMenuItem.ts` | ✅ 成功 |

##### status ガードの厳密化 (2件)

| # | テスト項目 | 内容 | 実装コード箇所 | 結果 |
|---|-----------|------|---------------|------|
| 16 | status=open では通る | ステータスガード: `status='open'` の場合は許可 | `appendItem.ts:136` | ✅ 成功 |
| 17 | status=in_progress では通る | ステータスガード: `status='in_progress'` の場合は許可 | `appendItem.ts:136` | ✅ 成功 |

---

### 4. `placeOrder.spec.ts` (統合テスト)

**テスト数**: 8件（全件成功）

**実装コード**: `functions/src/itemOrder/placeOrder.ts`

#### 実装概要

```typescript
export const placeOrder = onCall(async (request) => {
  // 1. 入力バリデーション（userId, item, clientNonce）
  // 2. getActiveBillByUser で billId を取得
  // 3. appendItem を呼び出し（menuItemId と quantity のみ使用）
  // 4. メニューアイテムを解決（orders/_TodaysOrders 用）
  // 5. orders/_TodaysOrders に記録（提供動線専用、Chips除外、docId = itemId、親集計は初回のみ）
  //    → トランザクション内で:
  //       - orders/{YYYYMMDD} が存在しない場合は作成
  //       - _TodaysOrders/{itemId} を作成（docId = itemId、merge: true）
  //       - 親 orders の集計は初回のみインクリメント（isNew フラグで判定）
  // 6. Chip購入の場合はログ記録を追加（トランザクション外）
}
```

**責務**:
- スタッフが注文確定ボタンを押下したときの処理
- `getActiveBillByUser` で `billId` を取得
- `appendItem` で `/bills/{billId}/items/{itemId}` に追加
- `orders/_TodaysOrders` に記録（提供動線専用、Chips除外）
- **重要**: `_TodaysOrders/{itemId}` の `docId = itemId`（`appendItem` の戻り値）、親集計は初回のみインクリメント

#### テストケース詳細

##### orders/_TodaysOrders の作成 (5件)

| # | テスト項目 | 内容 | 実装コード箇所 | 結果 |
|---|-----------|------|---------------|------|
| 1 | 非 chip のみ orders/_TodaysOrders に記録されること（docId = itemId、親集計は初回のみ） | 正常系: 非 chip カテゴリの場合、`_TodaysOrders/{itemId}` を作成し、親集計を初回のみインクリメント | `placeOrder.ts:66-120` | ✅ 成功 |
| 2 | chip カテゴリは orders/_TodaysOrders に記録されないこと | 正常系: `category='chip'` または `category='Chip'` の場合は `_TodaysOrders` に記録しない | `placeOrder.ts:66` | ✅ 成功 |
| 3 | 同一 itemId で replay 時、親集計は二重加算されないこと | 冪等性: 同一 `itemId` で再実行時、`_TodaysOrders/{itemId}` は上書きされるが、親集計は増えない | `placeOrder.ts:82, 112-119` | ✅ 成功 |
| 4 | 別 clientNonce（別 itemId）で再実行 → 新規 doc が作られ、親集計が増える | 正常系: 別 `clientNonce`（別 `itemId`）で再実行時、新規docが作られ、親集計が増える | `placeOrder.ts:82, 112-119` | ✅ 成功 |
| 5 | appendItem のレスポンス itemId をそのまま _TodaysOrders/{itemId} に使っていることをassert | 正常系: `appendItem` の戻り値 `itemId` をそのまま `_TodaysOrders/{itemId}` の `docId` として使用 | `placeOrder.ts:78, 96` | ✅ 成功 |

##### status ガードの厳密化 (3件)

| # | テスト項目 | 内容 | 実装コード箇所 | 結果 |
|---|-----------|------|---------------|------|
| 6 | status=settling で failed-precondition | ステータスガード: `appendItem` が `failed-precondition` を返す場合 | `placeOrder.ts:52-60` → `appendItem.ts:136-139` | ✅ 成功 |
| 7 | status=settled で failed-precondition | ステータスガード: `appendItem` が `failed-precondition` を返す場合 | `placeOrder.ts:52-60` → `appendItem.ts:136-139` | ✅ 成功 |
| 8 | status=voided で failed-precondition | ステータスガード: `appendItem` が `failed-precondition` を返す場合 | `placeOrder.ts:52-60` → `appendItem.ts:136-139` | ✅ 成功 |

---

### 5. `placeOrderByUser.spec.ts` (統合テスト)

**テスト数**: 9件（全件成功）

**実装コード**: `functions/src/itemOrder/placeOrderByUser.ts`

#### 実装概要

```typescript
export const placeOrderByUser = onCall(async (request) => {
  // 1. 認証必須チェック
  // 2. items[] or item 単一の正規化
  // 3. 入力バリデーション
  // 4. getActiveBillByUser で billId を取得
  // 5. appendItem を順次実行（種類ごとに clientNonce を変える）
  //    → clientNonce = `${sessionNonce}-${index}`
  //    → idempotencyKey = `appendItem:${billId}:${clientNonce}`
  // 6. 非 chip のみ _TodaysOrders を作成（docId=itemId）し、親集計は新規分だけ加算
  //    → トランザクション内で:
  //       - 各 appendResult ごとに _TodaysOrders/{itemId} の読み取りを先に実行
  //       - 新規分のみ newCount と newTotal で集計
  //       - すべての書き込みを読み取りの後に実行
  //       - 各 itemId ごとに docId=itemId で set（merge）、集計は既に完了
}
```

**責務**:
- LIFF側のユーザーが注文確定ボタンを押下したときの処理
- `getActiveBillByUser` で `billId` を取得
- `appendItem` で `/bills/{billId}/items/{itemId}` に追加（複数アイテム対応）
- `orders/_TodaysOrders` に記録（提供動線専用、Chips除外）
- **重要**: 同一 `menuItemId` を複数行送った場合でも、各行ごとに正しい `itemId` で `_TodaysOrders` を作成
- **重要**: 親集計は新規分のみ加算（`isNew` フラグで判定）

#### テストケース詳細

##### permission-denied (1件)

| # | テスト項目 | 内容 | 実装コード箇所 | 結果 |
|---|-----------|------|---------------|------|
| 1 | 未認証で permission-denied | 認証: `request.auth` が `null` の場合 | `placeOrderByUser.ts:24-26` | ✅ 成功 |

##### orders/_TodaysOrders の作成 (5件)

| # | テスト項目 | 内容 | 実装コード箇所 | 結果 |
|---|-----------|------|---------------|------|
| 2 | 非 chip のみ orders/_TodaysOrders に記録されること（docId = itemId、親集計は初回のみ） | 正常系: 非 chip カテゴリの場合、`_TodaysOrders/{itemId}` を作成し、親集計を初回のみインクリメント | `placeOrderByUser.ts:75-156` | ✅ 成功 |
| 3 | 同一 menuItemId が複数行ある場合でも、各行ごとに正しい itemId で _TodaysOrders を作成できること | 正常系: 同一 `menuItemId` を複数行送った場合、各行ごとに別の `itemId` で `_TodaysOrders` を作成 | `placeOrderByUser.ts:54-73, 107` | ✅ 成功 |
| 4 | items = [{A x1}, {A x2}, {B x1}] を投入 → 3つの別 itemId が返り、_TodaysOrders にそれぞれ docId=itemId で3件作成される（Aが2件、Bが1件）、親集計は3件ぶん加算 | 正常系: 複数アイテム（同一 `menuItemId` 含む）を送った場合、各 `itemId` ごとに `_TodaysOrders` を作成し、親集計は3件ぶん加算（期待値: 1800円 = 500×1 + 500×2 + 300×1） | `placeOrderByUser.ts:54-156` | ✅ 成功 |
| 5 | 同じ clientNonce を使って全体リプレイした場合、0件加算 | 冪等性: 同一 `sessionNonce` で再実行時、`_TodaysOrders` は上書きされるが、親集計は増えない | `placeOrderByUser.ts:109, 113-116` | ✅ 成功 |
| 6 | chip カテゴリは orders/_TodaysOrders に記録されないこと | 正常系: `category='chip'` または `category='Chip'` の場合は `_TodaysOrders` に記録しない | `placeOrderByUser.ts:105` | ✅ 成功 |

##### status ガードの厳密化 (3件)

| # | テスト項目 | 内容 | 実装コード箇所 | 結果 |
|---|-----------|------|---------------|------|
| 7 | status=settling で failed-precondition | ステータスガード: `appendItem` が `failed-precondition` を返す場合 | `placeOrderByUser.ts:60-64` → `appendItem.ts:136-139` | ✅ 成功 |
| 8 | status=settled で failed-precondition | ステータスガード: `appendItem` が `failed-precondition` を返す場合 | `placeOrderByUser.ts:60-64` → `appendItem.ts:136-139` | ✅ 成功 |
| 9 | status=voided で failed-precondition | ステータスガード: `appendItem` が `failed-precondition` を返す場合 | `placeOrderByUser.ts:60-64` → `appendItem.ts:136-139` | ✅ 成功 |

---

## 実装コードの詳細

### 1. `resolveMenuItem.ts`

**ファイルパス**: `functions/src/helpers/billsApi/resolveMenuItem.ts`

**責務**: メニューアイテム解決ヘルパ

**主要な実装**:

```typescript
export async function resolveMenuItem(menuItemId: string): Promise<ResolvedMenuItem> {
  // 1. バリデーション
  if (!menuItemId) {
    throw new HttpsError('invalid-argument', 'menuItemId is required');
  }

  // 2. Firestore から取得
  const db = getFirestore();
  const menuItemRef = db.collection('menuItems').doc(menuItemId);
  const menuItemSnap = await menuItemRef.get();

  // 3. 存在チェック
  if (!menuItemSnap.exists) {
    throw new HttpsError('invalid-argument', `Menu item not found: ${menuItemId}`);
  }

  // 4. 必須フィールド検証
  const menuItemData = menuItemSnap.data()!;
  if (!menuItemData.name || !menuItemData.category || typeof menuItemData.price !== 'number') {
    throw new HttpsError('invalid-argument', `Invalid menu item data: ${menuItemId}`);
  }

  // 5. 返却
  return {
    menuItemId,
    name: menuItemData.name as string,
    category: menuItemData.category as string,
    unitPriceIncl: menuItemData.price as number,
  };
}
```

**重要なポイント**:
- クライアントから送信された `name`/`category`/`price` は信用せず、サーバ側で正規化
- 必須フィールド（`name`, `category`, `price`）の検証を実施

---

### 2. `getActiveBillByUser.ts`

**ファイルパス**: `functions/src/helpers/billsApi/getActiveBillByUser.ts`

**責務**: アクティブな伝票を取得するヘルパAPI

**主要な実装**:

```typescript
export async function getActiveBillByUser(userId: string): Promise<GetActiveBillByUserResult> {
  // 1. バリデーション
  if (!userId) {
    throw new HttpsError('invalid-argument', 'userId is required');
  }

  const db = getFirestore();

  // 2. activeStays/{userId} から billId を取得
  const activeStayRef = db.collection('activeStays').doc(userId);
  const activeStaySnap = await activeStayRef.get();

  if (activeStaySnap.exists) {
    const activeStayData = activeStaySnap.data()!;
    const billId = activeStayData.billId as string;
    
    if (billId) {
      const billRef = db.collection('bills').doc(billId);
      const billSnap = await billRef.get();
      
      if (billSnap.exists) {
        const billData = billSnap.data()!;
        // activeStays に billId がある場合は、status に関係なく返す
        // （appendItem の status ガードで拒否される）
        return {
          billId,
          billRef,
          billData,
        };
      }
    }
  }

  // 3. フォールバック: bills を直接クエリ
  const billsQuery = db
    .collection('bills')
    .where('party.userId', '==', userId)
    .where('status', 'in', ['open', 'in_progress'])
    .limit(1);
  
  const billsSnap = await billsQuery.get();
  
  if (billsSnap.empty) {
    throw new HttpsError('not-found', `No active bill found for user: ${userId}`);
  }

  const billDoc = billsSnap.docs[0];
  return {
    billId: billDoc.id,
    billRef: billDoc.ref,
    billData: billDoc.data(),
  };
}
```

**重要なポイント**:
- `activeStays` を優先的に参照し、存在しない場合は `bills` を直接クエリ
- **重要**: `activeStays` に `billId` がある場合は、`status` に関係なく返す（`appendItem` の `status` ガードで拒否される）
- フォールバッククエリでは `status in ('open','in_progress')` のみ取得

---

### 3. `appendItem.ts`

**ファイルパス**: `functions/src/helpers/billsApi/appendItem.ts`

**責務**: 伝票にアイテムを追加するヘルパAPI

**主要な実装**:

```typescript
export async function appendItem(request: AppendItemRequest): Promise<AppendItemResponse> {
  const { billId, item, idempotencyKey } = request;
  const { menuItemId, quantity, clientNonce } = item;

  // 1. バリデーション
  if (!billId || !menuItemId || !idempotencyKey || !clientNonce) {
    throw new HttpsError('invalid-argument', 'billId, menuItemId, idempotencyKey, clientNonce are required');
  }

  if (quantity <= 0 || !Number.isInteger(quantity)) {
    throw new HttpsError('invalid-argument', 'quantity must be a positive integer');
  }

  const db = getFirestore();
  const billRef = db.collection('bills').doc(billId);
  const idempotencyRef = billRef.collection('idempotency').doc(idempotencyKey);

  // 2. requestHash を生成
  const requestHash = stableHash({
    billId,
    menuItemId,
    quantity,
  });

  let reused = false;

  try {
    const result: AppendItemResponse = await db.runTransaction(async (tx) => {
      // 3. 強い冪等チェック
      const idemSnap = await tx.get(idempotencyRef);
      if (idemSnap.exists) {
        const prevHash = idemSnap.data()?.requestHash;
        if (prevHash && prevHash !== requestHash) {
          throw new HttpsError('failed-precondition', 'idempotency requestHash mismatch');
        }
        reused = true;
        
        // 既存docを返却（親updatedAtは更新しない）
        const savedItemId = idemSnap.data()?.itemId as string;
        if (!savedItemId) {
          throw new HttpsError('internal', 'idempotency exists but itemId missing');
        }
        
        const itemRef = billRef.collection('items').doc(savedItemId);
        const itemSnap = await tx.get(itemRef);
        if (!itemSnap.exists) {
          throw new HttpsError('internal', 'idempotency exists but item missing');
        }
        
        const itemData = itemSnap.data()!;
        const orderedAt = itemData.orderedAt;
        const orderedAtIso = orderedAt && orderedAt.toDate ? orderedAt.toDate().toISOString() : new Date().toISOString();
        
        return {
          success: true,
          billId,
          itemId: savedItemId,
          orderedAt: orderedAtIso,
          diagnostics: {
            reason: 'idempotent replay',
            reused: true,
          },
        };
      }

      // 4. bills/{billId} を読み込み、status チェック
      const billSnap = await tx.get(billRef);
      if (!billSnap.exists) {
        throw new HttpsError('not-found', `Bill not found: ${billId}`);
      }

      const billData = billSnap.data()!;
      const status = billData.status as string;
      
      // 許可: open/in_progress、拒否: settling/settled/voided
      const allowed = status === 'open' || status === 'in_progress';
      if (!allowed) {
        throw new HttpsError('failed-precondition', `Cannot append item to bill with status: ${status}`);
      }

      // 5. メニューアイテムを解決（サーバ側で正規化）
      const resolved = await resolveMenuItem(menuItemId);

      // 6. /bills/{billId}/items/{itemId} を作成（itemId = idempotencyKey）
      const itemId = idempotencyKey;
      const itemRef = billRef.collection('items').doc(itemId);
      const now = admin.firestore.FieldValue.serverTimestamp();

      // 7. デュアルライト: todaysBills の読み取りを書き込みの前に実行
      let legacyRef: admin.firestore.DocumentReference | null = null;
      let legacySnap: admin.firestore.DocumentSnapshot | null = null;
      if (shouldDualWrite()) {
        legacyRef = db.collection('todaysBills').doc(billId);
        legacySnap = await tx.get(legacyRef);
      }
      
      // 8. 書き込み操作
      tx.set(itemRef, {
        menuItemId: resolved.menuItemId,
        category: resolved.category,
        name: resolved.name,
        unitPriceIncl: resolved.unitPriceIncl,
        quantity,
        totalPriceIncl: resolved.unitPriceIncl * quantity,
        orderedAt: now,
        voided: false,
      });

      // 9. 親 /bills/{billId}.updatedAt を更新
      tx.update(billRef, {
        updatedAt: now,
      });

      // 10. /bills/{billId}/idempotency/{idempotencyKey} を作成（itemIdを保存）
      tx.set(idempotencyRef, {
        requestHash,
        createdAt: now,
        itemId,
      });

      // 11. デュアルライト: todaysBills.items 配列に行追加
      if (shouldDualWrite() && legacyRef && legacySnap && legacySnap.exists) {
        try {
          const legacyItem = {
            orderId: itemId,
            menuItemId: resolved.menuItemId,
            category: resolved.category,
            name: resolved.name,
            quantity,
          };
          
          tx.update(legacyRef, {
            items: admin.firestore.FieldValue.arrayUnion(legacyItem),
          });
        } catch (error: any) {
          logger.warn('dualWrite appendItem failed', {
            billId,
            itemId,
            reason: error?.message || String(error),
          });
        }
      }

      return {
        success: true,
        billId,
        itemId,
        orderedAt: '', // トランザクション外で設定
      };
    });

    // 12. トランザクション後に item ドキュメントを読み直して orderedAt の実値を取得
    const itemRef = billRef.collection('items').doc(result.itemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) {
      throw new HttpsError('internal', 'Item document not found after transaction');
    }
    const itemData = itemSnap.data()!;
    const orderedAt = itemData.orderedAt;
    const orderedAtIso = orderedAt && orderedAt.toDate ? orderedAt.toDate().toISOString() : new Date().toISOString();

    result.orderedAt = orderedAtIso;

    return result;
  } catch (error) {
    // エラーハンドリング
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', 'Failed to append item');
  }
}
```

**重要なポイント**:
- **強い冪等性**: `itemId = idempotencyKey` で統一、`requestHash` でリクエスト内容を検証
- **サーバ側正規化**: クライアントの `name`/`category`/`price` は信用せず、`resolveMenuItem` でサーバ側から取得
- **status ガード**: `open`/`in_progress` のみ許可、`settling`/`settled`/`voided` は拒否
- **デュアルライト**: `WRITE_TODAYS_BILLS_IN_PARALLEL` フラグで制御、`arrayUnion` を使用して重複を防止、失敗は警告ログのみ
- **orderedAt の実値返却**: トランザクション後に `item` ドキュメントを読み直して `serverTimestamp()` の実値を取得

---

### 4. `placeOrder.ts`

**ファイルパス**: `functions/src/itemOrder/placeOrder.ts`

**責務**: スタッフが注文確定ボタンを押下したときの処理

**主要な実装**:

```typescript
export const placeOrder = onCall(async (request) => {
  const db = getFirestore();

  try {
    const { userId, item, clientNonce } = request.data as {
      userId: string;
      item: {
        menuItemId: string;
        quantity: number;
      };
      clientNonce: string;
    };

    // 1. 入力バリデーション
    if (!userId || !item || !item.menuItemId || !clientNonce || item.quantity <= 0) {
      return { success: false, error: "入力が不正です" };
    }

    // 2. getActiveBillByUser で billId を取得
    const { billId, billData } = await getActiveBillByUser(userId);

    // 3. appendItem を呼び出し
    const idempotencyKey = `appendItem:${billId}:${clientNonce}`;
    const appendResult = await appendItem({
      billId,
      item: {
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        clientNonce,
      },
      idempotencyKey,
    });

    // 4. メニューアイテムを解決（orders/_TodaysOrders 用）
    const resolved = await resolveMenuItem(item.menuItemId);

    // 5. orders/_TodaysOrders に記録（提供動線専用、Chips除外）
    if (resolved.category !== 'chip' && resolved.category !== 'Chip') {
      const now = new Date();
      const orderDocId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const dateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      await db.runTransaction(async (tx) => {
        const ordersRef = db.collection("orders").doc(orderDocId);
        // すべての読み取りを先に実行
        const ordersSnap = await tx.get(ordersRef);
        const todaysOrderRef = ordersRef.collection("_TodaysOrders").doc(appendResult.itemId);
        const todaysOrderSnap = await tx.get(todaysOrderRef);
        
        // 存在しない時だけ set + 親集計 increment、存在時は上書きのみで親集計スキップ
        const isNew = !todaysOrderSnap.exists;
        
        // すべての書き込みを読み取りの後に実行
        if (!ordersSnap.exists) {
          tx.set(ordersRef, {
            date: dateString,
            onedayOrderQuantity: 0,
            onedayTotalPrice: 0,
            createdAt: now,
            updatedAt: now,
          });
        }

        // _TodaysOrders に1種類=1ドキュメントを作成（docId = itemId）
        tx.set(todaysOrderRef, {
          orderDocId,
          billId,
          userId,
          userName: (billData.party?.pokerName as string) || "",
          menuItemId: resolved.menuItemId,
          name: resolved.name,
          category: resolved.category,
          quantity: item.quantity,
          status: "preparing",
          orderedAt: FieldValue.serverTimestamp(),
          currentTable: (billData.place?.table as string) || null,
          currentSeat: (billData.place?.seat as number) || null,
        }, { merge: true });

        // 親 orders の集計は初回のみインクリメント
        if (isNew) {
          tx.update(ordersRef, {
            onedayOrderQuantity: FieldValue.increment(1),
            onedayTotalPrice: FieldValue.increment(resolved.unitPriceIncl * item.quantity),
            date: dateString,
            updatedAt: now,
          });
        }
      });
    }

    return {
      success: true,
      data: {
        billId,
        itemId: appendResult.itemId,
        orderedAt: appendResult.orderedAt,
        reused: appendResult.diagnostics?.reused || false,
      },
    };
  } catch (error) {
    // エラーハンドリング
    return { success: false, error: errorMessage };
  }
});
```

**重要なポイント**:
- `getActiveBillByUser` で `billId` を取得
- `appendItem` で `/bills/{billId}/items/{itemId}` に追加
- `orders/_TodaysOrders` に記録（提供動線専用、Chips除外）
- **重要**: `_TodaysOrders/{itemId}` の `docId = itemId`（`appendItem` の戻り値）、親集計は初回のみインクリメント（`isNew` フラグで判定）
- トランザクション内で、すべての読み取りを先に実行し、その後にすべての書き込みを実行（Firestore の制約）

---

### 5. `placeOrderByUser.ts`

**ファイルパス**: `functions/src/itemOrder/placeOrderByUser.ts`

**責務**: LIFF側のユーザーが注文確定ボタンを押下したときの処理

**主要な実装**:

```typescript
export const placeOrderByUser = onCall(async (request) => {
  const db = getFirestore();

  try {
    // 1. 認証必須チェック
    if (!request.auth) {
      throw new HttpsError("permission-denied", "認証が必要です");
    }

    const userId = request.auth.uid;

    // 2. items[] or item 単一の正規化
    let items: Array<{ menuItemId: string; quantity: number }> = [];
    if (request.data?.items && Array.isArray(request.data.items)) {
      items = request.data.items;
    } else if (request.data?.item) {
      items = [request.data.item];
    }

    if (!items.length) {
      throw new HttpsError("invalid-argument", "アイテムが指定されていません");
    }

    // 3. 入力バリデーション
    for (const it of items) {
      if (!it?.menuItemId || typeof it.quantity !== "number" || it.quantity <= 0) {
        throw new HttpsError("invalid-argument", "アイテム情報が不正です");
      }
    }

    const sessionNonce: string = request.data?.clientNonce || `session_${Date.now()}`;

    // 4. getActiveBillByUser で billId を取得
    const { billId, billData } = await getActiveBillByUser(userId);

    // 5. appendItem を順次実行（種類ごとに clientNonce を変える）
    const appendResults: Array<{ itemId: string; orderedAt: string; reused: boolean; menuItemId: string; quantity: number; }> = [];
    for (let index = 0; index < items.length; index++) {
      const it = items[index];
      const clientNonce = `${sessionNonce}-${index}`;
      const idempotencyKey = `appendItem:${billId}:${clientNonce}`;

      const res = await appendItem({
        billId,
        item: { menuItemId: it.menuItemId, quantity: it.quantity, clientNonce },
        idempotencyKey,
      });

      appendResults.push({
        itemId: res.itemId,
        orderedAt: res.orderedAt,
        reused: !!res.diagnostics?.reused,
        menuItemId: it.menuItemId,
        quantity: it.quantity,
      });
    }

    // 6. 非 chip のみ _TodaysOrders を作成（docId=itemId）し、親集計は新規分だけ加算
    const now = new Date();
    const orderDocId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const dateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    // 事前に menu 情報を解決（親集計に単価を使うため）
    const resolvedCache = new Map<string, { name: string; category: string; unitPriceIncl: number }>();
    for (const ar of appendResults) {
      if (!resolvedCache.has(ar.menuItemId)) {
        const r = await resolveMenuItem(ar.menuItemId);
        resolvedCache.set(ar.menuItemId, { name: r.name, category: r.category, unitPriceIncl: r.unitPriceIncl });
      }
    }

    await db.runTransaction(async (tx) => {
      const ordersRef = db.collection("orders").doc(orderDocId);
      // すべての読み取りを先に実行
      const ordersSnap = await tx.get(ordersRef);

      // 各 _TodaysOrders の読み取りを先に実行
      const todaysOrderSnaps: Array<{ ref: admin.firestore.DocumentReference; isNew: boolean; ar: typeof appendResults[0]; r: { name: string; category: string; unitPriceIncl: number } }> = [];
      let newCount = 0;
      let newTotal = 0;

      for (const ar of appendResults) {
        const r = resolvedCache.get(ar.menuItemId)!;
        // chip は除外
        if (r.category === "chip" || r.category === "Chip") continue;

        const todaysOrderRef = ordersRef.collection("_TodaysOrders").doc(ar.itemId);
        const todaysOrderSnap = await tx.get(todaysOrderRef);
        const isNew = !todaysOrderSnap.exists;
        todaysOrderSnaps.push({ ref: todaysOrderRef, isNew, ar, r });

        // 新規分のみ集計（読み取りループで計算）
        if (isNew) {
          newCount += 1;
          newTotal += r.unitPriceIncl * ar.quantity;
        }
      }

      // すべての書き込みを読み取りの後に実行
      if (!ordersSnap.exists) {
        tx.set(ordersRef, {
          date: dateString,
          onedayOrderQuantity: 0,
          onedayTotalPrice: 0,
          createdAt: now,
          updatedAt: now,
        });
      }

      // 各 itemId ごとに docId=itemId で set（merge）、集計は既に完了
      for (const { ref: todaysOrderRef, ar, r } of todaysOrderSnaps) {
        tx.set(todaysOrderRef, {
          orderDocId,
          billId,
          userId,
          userName: (billData.party?.pokerName as string) || "",
          menuItemId: ar.menuItemId,
          name: r.name,
          category: r.category,
          quantity: ar.quantity,
          status: "preparing",
          orderedAt: FieldValue.serverTimestamp(),
          currentTable: (billData.place?.table as string) || null,
          currentSeat: (billData.place?.seat as number) || null,
        }, { merge: true });
      }

      if (newCount > 0 || newTotal > 0) {
        tx.update(ordersRef, {
          onedayOrderQuantity: FieldValue.increment(newCount),
          onedayTotalPrice: FieldValue.increment(newTotal),
          date: dateString,
          updatedAt: now,
        });
      }
    });

    return {
      success: true,
      data: {
        billId,
        items: appendResults.map(({ itemId, orderedAt, reused }) => ({ itemId, orderedAt, reused })),
        itemsCount: appendResults.length,
      },
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", (error as Error)?.message || "注文の登録に失敗しました");
  }
});
```

**重要なポイント**:
- 認証必須（`request.auth` が `null` の場合は `permission-denied`）
- `items[]` または `item` 単一の両方に対応
- `getActiveBillByUser` で `billId` を取得
- `appendItem` を順次実行（種類ごとに `clientNonce = ${sessionNonce}-${index}` を変える）
- **重要**: 同一 `menuItemId` を複数行送った場合でも、各行ごとに別の `itemId` で `_TodaysOrders` を作成
- **重要**: 親集計は新規分のみ加算（`isNew` フラグで判定、`newCount` と `newTotal` で事前計算）
- トランザクション内で、すべての読み取りを先に実行し、その後にすべての書き込みを実行（Firestore の制約）

---

## 修正内容の詳細

### クリティカルな修正: `getFirestore()` の呼び出し方法

**問題**: 
- 実装コード（`getActiveBillByUser.ts`, `appendItem.ts` など）は `getFirestore()` を引数なしで呼び出している（デフォルトアプリを使用）
- 修正前のテストコードは名前付きアプリ（`app-${projectId}`）を作成して `getFirestore(app)` を呼び出していた
- この不一致により、実装コード内で `getFirestore()` を呼び出すと「The default Firebase app does not exist」エラーが発生

**修正**:
```typescript
// 修正前
const app = admin.initializeApp({ projectId }, `app-${projectId}`);
db = getFirestore(app);

// 修正後
admin.initializeApp({ projectId });  // デフォルトアプリとして初期化
db = getFirestore();  // 引数なし = デフォルトアプリを使用
```

**影響範囲**:
- `getActiveBillByUser.spec.ts`: 全7件の失敗が解消
- `appendItem.spec.ts`: 全17件の失敗が解消
- `placeOrder.spec.ts`: 全8件の失敗が解消
- `placeOrderByUser.spec.ts`: 全9件の失敗が解消

**合計**: 41件の失敗が解消されました。

---

### その他の修正

#### 1. Jest実行設定の見直し

**修正内容**:
- `package.json` の `test:p1-02` に `--runInBand` を追加（逐次実行）
- 各specファイルで `projectId` を一意化（`process.pid` と `Date.now()` を使用）

**効果**: 並列実行による環境競合を防止

#### 2. `bills.place` 更新処理の安定化

**修正内容**:
- `update()` を `set(..., { merge: true })` に変更
- `placeOrder.spec.ts` と `placeOrderByUser.spec.ts` で修正
- `status` の更新も同様に `set(..., { merge: true })` に変更

**効果**: ドキュメントが存在しない場合でもエラーが発生しない

#### 3. Firestore Emulator のクリーンアップ統一

**修正内容**:
- `afterAll` で `Promise.all(admin.apps.map(a => a?.delete()).filter(Boolean))` を使用して全アプリを削除

**効果**: リソースリークを防止

---

## テスト観点と実装の対応関係

### 1. 冪等性

**テスト観点**:
- 同一 `idempotencyKey` で再実行時、既存docを返却し、親 `updatedAt` は更新しない
- `itemId = idempotencyKey` で統一されていること
- `idempotency` doc に保存された `itemId` を使ったreplay

**実装**:
- `appendItem.ts:84-124`: 強い冪等チェック（`requestHash` でリクエスト内容を検証）
- `appendItem.ts:145`: `itemId = idempotencyKey` で統一
- `appendItem.ts:96-107, 179`: `idempotency` doc に `itemId` を保存し、replay時に参照

### 2. サーバ側正規化

**テスト観点**:
- クライアントが `price` を改ざんして送っても、無視され、`resolveMenuItem(...).price` が採用される

**実装**:
- `appendItem.ts:142`: `resolveMenuItem` でサーバ側からメニュー情報を取得
- `resolveMenuItem.ts`: クライアントから送信された `name`/`category`/`price` は信用せず、Firestore から取得

### 3. status ガード

**テスト観点**:
- `status=open`/`in_progress` では通る
- `status=settling`/`settled`/`voided` で `failed-precondition`

**実装**:
- `appendItem.ts:136-139`: 許可: `open`/`in_progress`、拒否: `settling`/`settled`/`voided`

### 4. DualWrite

**テスト観点**:
- DualWrite ON: `todaysBills.items` 配列に `arrayUnion` で行追加されること（金額は更新されない）
- DualWrite OFF: `todaysBills` への複写がスキップされること
- DualWrite ON: 同一 `idempotencyKey` でリプレイ → `todaysBills.items` の件数は増えない（`arrayUnion` の重複抑止）

**実装**:
- `appendItem.ts:152-155`: `shouldDualWrite()` で制御
- `appendItem.ts:184-211`: `arrayUnion` を使用して重複を防止、金額フィールドは含めない、失敗は警告ログのみ

### 5. `orders/_TodaysOrders` の作成

**テスト観点**:
- 非 chip のみ `orders/_TodaysOrders` に記録されること（`docId = itemId`、親集計は初回のみ）
- 同一 `itemId` で replay 時、親集計は二重加算されないこと
- 別 `clientNonce`（別 `itemId`）で再実行 → 新規 doc が作られ、親集計が増える

**実装**:
- `placeOrder.ts:66-120`: 非 chip のみ記録、`docId = itemId`、親集計は初回のみ（`isNew` フラグで判定）
- `placeOrderByUser.ts:75-156`: 複数アイテム対応、親集計は新規分のみ加算（`newCount` と `newTotal` で事前計算）

---

## まとめ

### テスト結果

- **全45件のテストケースが成功**
- **成功率**: 100%

### 実装コード

- **5つの実装ファイル**をテスト
  - `resolveMenuItem.ts`: メニューアイテム解決
  - `getActiveBillByUser.ts`: アクティブな伝票取得
  - `appendItem.ts`: アイテム追加（最重要）
  - `placeOrder.ts`: スタッフ注文確定
  - `placeOrderByUser.ts`: ユーザー注文確定

### クリティカルな修正

- **`getFirestore()` の呼び出し方法**: 実装コードとテスト環境のアプリ初期化方法を一致させたことで、41件の失敗が解消されました。

### テスト観点

- **冪等性**: 強い冪等性（`itemId = idempotencyKey`、`requestHash` 検証）
- **サーバ側正規化**: クライアントの `name`/`category`/`price` は信用せず、サーバ側で正規化
- **status ガード**: `open`/`in_progress` のみ許可
- **DualWrite**: `WRITE_TODAYS_BILLS_IN_PARALLEL` フラグで制御、`arrayUnion` で重複防止
- **`orders/_TodaysOrders`**: 非 chip のみ記録、`docId = itemId`、親集計は初回のみ

---

## P1-02.1 完了サマリ

_最終更新: 2025-11-18 (JST)_

### 完了状況

**P1-02.1 完了。businessDate不変化はスコープ外へ移管（P1-06 / P1-11）**

### 実行コマンド例

```bash
# P1-02.1 関連テストの実行
npm test -- __tests__/itemOrder/placeOrder.boundary-dates.spec.ts --runInBand
npm test -- __tests__/helpers/billsApi/appendItem.parallel-replay.spec.ts --runInBand
npm test -- __tests__/helpers/billsApi/appendItem.dualwrite-failure.spec.ts --runInBand
npm test -- __tests__/helpers/billsApi/appendItem.concurrent.spec.ts --runInBand
npm test -- __tests__/helpers/billsApi/appendItem.mismatch.spec.ts --runInBand
```

### 通過した代表テスト

1. **ordersキー境界日付テスト** (`placeOrder.boundary-dates.spec.ts`)
   - 12ケース（パターンA/B/C/C'/D-1/D-2 × STORE_CLOSE_HOUR=27/9）
   - 年跨ぎ・月跨ぎ・うるう年・平年・閉店時刻差分の多パターンで検証
   - 全ケースで `orders/{YYYYMMDD}` の DocID と `date` が `bill.businessDate` と一致

2. **並行リプレイテスト** (`appendItem.parallel-replay.spec.ts`)
   - 1ケース: 完全同一の `idempotencyKey` とペイロードを並行送信
   - 作成は1回のみ、片方は `reused: true`、親 `updatedAt` はリプレイで更新されない

3. **DualWrite失敗耐性テスト** (`appendItem.dualwrite-failure.spec.ts`)
   - 3ケース: DualWrite失敗時でも `bills/items` は成功、ログ出力確認

4. **並行競合テスト** (`appendItem.concurrent.spec.ts`)
   - 2ケース: `status=open` で異なる `idempotencyKey` なら並行成功、`status=settling` 遷移時は拒否

5. **requestHash不一致テスト** (`appendItem.mismatch.spec.ts`)
   - 2ケース: 同一 `idempotencyKey` でペイロード変更時は `failed-precondition`、親 `updatedAt` は不変

### 移管タスク

- **P1-06**: `helpers/billsApi/updateBill.ts` で businessDate 変更拒否（パターンA）
- **P1-11**: `triggers/bills.businessDateLock.ts` で巻き戻し＆監視（パターンB）

### P1-02.1 追加テスト詳細

#### DualWrite三分岐ログの厳密一致検証（`appendItem.dualwrite-failure.spec.ts` に追加）

**テスト数**: 3件（全件成功）

**実装コード**: `functions/src/helpers/billsApi/appendItem.ts`（240-264行目）

**テスト観点**:
- success: `WRITE_TODAYS_BILLS_IN_PARALLEL=true` + `todaysBills`存在 + `legacyAppendItemUpdate`正常 → `logger.info('dualWrite appendItem ok', { op, billId, itemId, dualWriteResult: 'success' })` が厳密一致で呼ばれる
- failed: `WRITE_TODAYS_BILLS_IN_PARALLEL=true` + `todaysBills`存在 + `legacyAppendItemUpdate` throw → `logger.warn('dualWrite appendItem failed', { op, billId, itemId, dualWriteResult: 'failed', reason: expect.any(String) })` が厳密一致で呼ばれる
- skipped: `WRITE_TODAYS_BILLS_IN_PARALLEL=false` → `logger.info('dualWrite appendItem skipped', { op, billId, itemId, dualWriteResult: 'skipped' })` が厳密一致で呼ばれる

**検証内容**:
- 第1引数メッセージ文字列: 完全一致
- 第2引数オブジェクト: キー数の完全一致（success/skipped: 4キー、failed: 5キー）
- 各キーの値: `expect.objectContaining` で検証

---

## 補足: CI実行条件

CIジョブは DualWrite の ON/OFF 両モードで実行される。

| モード | 環境変数 | 目的 |
|--------|------------|------|
| DualWrite ON | `WRITE_TODAYS_BILLS_IN_PARALLEL=true` | 本番想定モード |
| DualWrite OFF | `WRITE_TODAYS_BILLS_IN_PARALLEL=false` | 旧todaysBillsを無効化した検証モード |

すべてのジョブで `FIRESTORE_EMULATOR_HOST=localhost:8080` を指定すること。

---

_このドキュメントは P1-02 の結合テスト結果をまとめたものです。_

