# ChangeSpec（P1-03）

## 目的 / 関連文書
- **目的**: サイドゲーム関連のcallable（`withdrawTip.ts`, `depositTip.ts` 等）およびChip購入フロー（`placeOrder.ts`経由）を新スキーマ（`/bills/{billId}/sideGameChips`）に対応させ、デュアルライト制御を導入する。**サイドゲームのすべての出入り（purchase/deposit/withdraw）を `/sideGameChips` に集約**する。
- **参照**: 
  - `api_contract.md` §2.2 `appendSideGameChip`
  - `helper_api_plan.md` §10（`appendSideGameChip` 仕様）
  - `schema_plan.md` §`/bills/{billId}/sideGameChips/{chipId}`
  - `modification_plan.md` P1-03行

## 変更概要（What）

### 新規ファイル
- `functions/src/helpers/billsApi/appendSideGameChip.ts`: サイドゲームチップ取引ヘルパAPI
- `functions/__tests__/helpers/billsApi/appendSideGameChip.spec.ts`: 単体・統合テスト

### 更新ファイル
- `functions/src/itemOrder/placeOrder.ts`: Chipカテゴリの注文のみ `/bills/{billId}/sideGameChips` へ `action: 'purchase'` として記録するように変更。Chip以外は従来通り `/bills/{billId}/items` と `orders/_TodaysOrders` に記録。
- `functions/src/sideGame/withdrawTip.ts`: `appendSideGameChip` ヘルパAPI利用に変更（`action: 'withdraw'`）
- `functions/src/sideGame/depositTip.ts`: `appendSideGameChip` ヘルパAPI利用に変更（`action: 'deposit'`）
- `functions/src/sideGame/registerForSideGame.ts`: `bills.place` 更新を追加（`updatePlace` ヘルパAPI利用、P1-04で実装予定のため今回は最小限の実装）
- `functions/src/sideGame/leaveSeat.ts`: `bills.place` 更新を追加（同上）
- `functions/src/helpers/billsApi/dualWrite.ts`: `legacyAppendSideGameChipUpdate` 関数を追加
- `functions/src/helpers/billsApi/index.ts`: `appendSideGameChip` をエクスポート

### 呼び出し元影響範囲
- **Flutter側**: 変更なし（既存のcallable呼び出しを維持）。`placeOrder` のレスポンス形式は変更しない（従来通り `{ billId, itemId, orderedAt, reused }`）。
- **Functions側**: 
  - `placeOrder` → Chipカテゴリの場合のみ `appendSideGameChip` ヘルパ呼び出し（`action: 'purchase'`）。Chip以外は従来通り `appendItem` を呼び出す。
  - `withdrawTip` → `appendSideGameChip` ヘルパ呼び出し（`action: 'withdraw'`）
  - `depositTip` → `appendSideGameChip` ヘルパ呼び出し（`action: 'deposit'`）
  - `registerForSideGame` → `bills.place` 更新（`updatePlace` ヘルパAPI利用、P1-04で実装予定のため今回は最小限）
  - `leaveSeat` → `bills.place` 更新（同上）

## 実装詳細（How）

### 書込み先
- `/bills/{billId}/sideGameChips/{chipId}`: サイドゲームチップ取引ドキュメント作成（**単一トランザクション内で原子的に処理**）
  - `action`: `'purchase'` | `'deposit'` | `'withdraw'`
  - `chipQty`: チップ数量（取引の本質）
  - `amountIncl`: 税込額（`action: 'purchase'` の場合のみ併記、`deposit`/`withdraw` は `null`）
  - `menuItemId`: 商品ID（`purchase` の場合のみ）
  - `name`: 表示名（任意）
  - `orderedAt`: 実施時刻（`serverTimestamp()`）
  - `createdAt`: 作成時刻（`serverTimestamp()`）
- `/bills/{billId}/idempotency/{key}`: 冪等性記録（**同一トランザクション内、TTL: 48h**）
  - `requestHash`: payload の正規化ハッシュ（リプレイ時に一致検証）
  - `createdAt`: `serverTimestamp()`
  - `chipId`: `chipId` を保存（replay 時に使用）
- `/bills/{billId}.updatedAt`: 親ドキュメントの `updatedAt` を更新（**同一トランザクション内**）
- デュアルライト（`WRITE_TODAYS_BILLS_IN_PARALLEL` フラグON時、**bills のトランザクション完了後にベストエフォートで実行**）:
  - `/todaysBills/{billId}`: **docIDは必ず `billId`**、`sideGameChip` 配列に行追加
    - 旧スキーマに合わせた形式で追加（`orderId = chipId` 必須、金額フィールドは入れない）
    - 失敗時は **throw せず warning ログに留める**（`bills` への書込み結果をロールバックしない、再試行もしない）

### 冪等性
- **方式**: `/bills/{billId}/idempotency/{key}` で存在チェック（**単一トランザクション内**）
- **キー形式**: 
  - `withdrawTip`/`depositTip` 経由: `<billId>:appendSideGameChip:<nonce>`
  - `placeOrder` 経由（Chip購入）: `<billId>:appendSideGameChip:<clientNonce>`（`appendItem` 系とキー空間を分離）
- **保存先**: `/bills/{billId}/idempotency/{key}`（TTL: 48h, `requestHash` 保持、`chipId` 保存）
- **リプレイ時**: 
  - 既存docを返却（`reused: true`）、`updatedAt` は変更しない（副作用なし）
  - **`requestHash` 不一致の場合は `failed-precondition`**（ハッシュ一致検証）

### デュアルライト（最小複写内容）
- **フラグ**: `WRITE_TODAYS_BILLS_IN_PARALLEL`（環境変数または `functions:config`）
- **docID**: `/todaysBills/{billId}`（**必ず `billId` を使用**、ランダムIDは使わない）
- **複写対象**: `sideGameChip` 配列に最小限の行を追加する
  - 複写するフィールド:
    - `orderId`: `/bills/{billId}/sideGameChips` の docID（`chipId`）
    - `action`: `'purchase'` | `'deposit'` | `'withdraw'`
    - `category`: `'Chip'`（固定）
    - `menuItemId`: メニューID（`purchase` の場合のみ、それ以外は `null`）
    - `name`: 表示名（任意、`null` 可）
    - `orderedAt`: 実施時刻（timestamp）
    - `amount`: チップ枚数（`chipQty` の値、金額ではない）
  - **金額フィールドは複写しない**:
    - `price`, `quantity`, `totalPrice` などの金額関連フィールドは持たない
    - 金額に関するSSoTは常に `/bills/{billId}/sideGameChips/{chipId}.amountIncl` とする
- **実行タイミング**: `bills` へのトランザクション完了後に、別途ベストエフォートで実行する（トランザクション外）
- **失敗時**: **throw せず warning ログに留める**（`bills` への書込み結果をロールバックしない、再試行もしない）

### 権限境界（Functions/Client）

**Client → Functions（callableインタフェース）:**

- **`placeOrder` 経由（Chip購入含む）**:
  - リクエスト: `userId`, `item.menuItemId`, `item.quantity`, `clientNonce`
  - Functions内部で `getActiveBillByUser` により `billId` を取得
  - Chipカテゴリの場合のみ `appendSideGameChip` ヘルパを呼び出す

- **`withdrawTip` / `depositTip` 経由**:
  - リクエスト: `userId`, `amount`（= チップ枚数、通貨額ではない）
  - Functions内部で `getActiveBillByUser` により `billId` を取得
  - `appendSideGameChip` ヘルパを呼び出す

**Functions内部 → `appendSideGameChip` ヘルパ（内部API）:**

- `appendSideGameChip` は Functions 内部のヘルパであり、Client から直接呼び出されない
- 各callableから以下のパラメータを組み立てて `appendSideGameChip` に渡す:
  - `billId`: `getActiveBillByUser` で取得
  - `action`: `'purchase'` | `'deposit'` | `'withdraw'`
  - `chipQty`: チップ枚数
    - `withdrawTip`/`depositTip` の場合: `request.data.amount` をそのまま使用
    - `placeOrder`（Chip購入）の場合: 1メニューあたりのチップ枚数 × `quantity`
  - `amountIncl`: 税込額（`purchase` の場合のみ、`withdraw`/`deposit` は `null`）
  - `menuItemId`: 商品ID（`purchase` の場合のみ）
  - `name`: 表示名（任意）
  - `idempotencyKey`: 冪等性キー
  - `requestHash`: ペイロードの正規化ハッシュ（内部で生成）

### 競合解決（LWW or なし）
- **重複チェック**: 同一 `idempotencyKey` で再実行時は既存docを返却（副作用なし）
- **冪等性**: 同一 `idempotencyKey` で再実行時は既存docを返却（副作用なし）

### ログ/メトリクス（出力フィールド）
- **構造化ログ**: 
  - `op: "appendSideGameChip"`
  - `billId`, `chipId`, `action`, `idempKey`, `attempt: 1`, `result: "ok" | "reused" | "fail"`
  - `code`, `reason`, `requestHash8`（ハッシュの先頭8文字）
  - `dualWriteEnabled: boolean`, `dualWriteResult: "success" | "failed" | "skipped"`
- **メトリクス名**: 
  - `bills.op.duration_ms`（処理時間）
  - `bills.op.retry_count`（リトライ回数、今回は0）
  - `dualwrite.error_count`（デュアルライト失敗件数）

### 例外（HttpsErrorマッピング）
- `invalid-argument`: `billId`, `action`, `chipQty`, `idempotencyKey` が未指定、`action` が `'purchase'|'deposit'|'withdraw'` 以外、`chipQty <= 0`、`purchase` 時に `amountIncl <= 0`
- `not-found`: `billId` が存在しない、`status == "settled"` で更新不可
- `failed-precondition`: 
  - `status` が `open` または `in_progress` でない場合
  - **idempotency の `requestHash` 不一致の場合**（ハッシュ一致検証）
- `internal`: 予期せぬエラー

## 仕様差分（Before→After）

### Before（現状）

#### withdrawTip / depositTip
```
withdrawTip / depositTip
  → users/{userId}.sideGameChip を更新
  → todaysBills の sideGameChip 配列にエントリーを追加
  → sideGameChipLogs に記録
```

#### placeOrder（Chip購入含む）
```
placeOrder（すべてのカテゴリ共通）
  → getActiveBillByUser で billId を取得
  → appendItem を呼び出し
    → /bills/{billId}/items/{itemId} に書き込み（Chipも含む）
  → resolveMenuItem でメニュー情報を解決
  → resolved.category が Chip/chip 以外の場合のみ
    → orders/{YYYYMMDD}/_TodaysOrders/{itemId} に doc を作成・集計更新
  → resolved.category が Chip/chip の場合のみ
    → sideGameChipLogs にログを1件追加
  → /bills/{billId}/sideGameChips には現状一切書き込んでいない
```

### After（新仕様）

#### withdrawTip / depositTip
```
withdrawTip / depositTip
  → request.data.amount を受け取る（= チップ枚数、通貨額ではない）
  → getActiveBillByUser で billId を取得
  → appendSideGameChip ヘルパ呼び出し
    → パラメータ:
      - billId: getActiveBillByUser で取得
      - action: 'withdraw' | 'deposit'
      - chipQty: request.data.amount をそのまま使用（チップ枚数）
      - amountIncl: null（withdraw/deposit は課金イベントではない）
      - menuItemId: null
      - name: null（任意）
      - idempotencyKey: <billId>:appendSideGameChip:<nonce>
    → 単一トランザクション内で原子的に処理:
      1. idempotency/{key} 読み → 既存なら replay（requestHash一致検証、不一致なら failed-precondition）
      2. bills/{billId} 読み → status チェック（open/in_progress のみ許可）
      3. sideGameChips/{chipId} 作成（chipId = idempotencyKey）
         - chipQty: request.data.amount（チップ枚数）
         - amountIncl: null
      4. idempotency/{key} 作成（requestHash, chipId）
      5. bills/{billId}.updatedAt 更新
    → トランザクション完了後、ベストエフォートで todaysBills/{billId} の sideGameChip 配列に追加（失敗はwarningログ、bills への書込み結果をロールバックしない）
  → users/{userId}.sideGameChip を更新（既存ロジック維持、ヘルパ成功後）
  → sideGameChipLogs に記録（既存ロジック維持、ヘルパ成功後）
```

#### placeOrder（Chip購入を含む）

**Chip以外（通常メニュー）の場合:**
```
placeOrder（Chip以外）
  → getActiveBillByUser で billId を取得
  → appendItem を呼び出し（現行動作を維持）
    → /bills/{billId}/items/{itemId} に書き込み
  → orders/{YYYYMMDD}/_TodaysOrders/{itemId} に記録（1種類=1doc、初回のみ集計加算）
  → sideGameChipLogs は触らない
  → /sideGameChips は触らない
```

**Chipカテゴリの場合（resolved.category === 'Chip' または 'chip'）:**
```
placeOrder（Chip）
  → getActiveBillByUser で billId を取得
  → resolveMenuItem でメニュー情報を解決
  → appendItem は呼ばない（Chipは /items に入れない）
  → appendSideGameChip を呼び出す（action: 'purchase'）
    → 単一トランザクション内で原子的に処理:
      1. idempotency/{key} 読み → 既存なら replay（requestHash一致検証、不一致なら failed-precondition）
      2. bills/{billId} 読み → status チェック（open/in_progress のみ許可）
      3. sideGameChips/{chipId} 作成（chipId = idempotencyKey）
         - chipQty: 1メニューあたりのチップ枚数 × quantity
         - amountIncl: resolved.unitPriceIncl * quantity（この購入に対して課金された合計金額・税込）
         - menuItemId: resolved.menuItemId
         - name: resolved.name
      4. idempotency/{key} 作成（requestHash, chipId）
      5. bills/{billId}.updatedAt 更新
    → トランザクション完了後、ベストエフォートで todaysBills/{billId} の sideGameChip 配列に追加（失敗はwarningログ、bills への書込み結果をロールバックしない）
  → orders/{YYYYMMDD}/_TodaysOrders には書き込まない（Chipは提供動線には乗せない）
  → sideGameChipLogs に purchase ログ追加（既存ロジック維持、appendSideGameChip の戻り値（chipQty）などを利用して二重実装を避ける）
  → レスポンス: data: { billId, itemId, orderedAt, reused }
    - P1-03ではレスポンス形式を変更せず、chipIdはクライアントに返さない
    - sideGameChips/{chipId} の chipId は内部識別子として利用し、将来的に必要になればP1-09以降でレスポンスに追加検討する
```

**chipQty の計算方法:**
- Chip名から数値部分を抽出（例: "SideGame 1000" → 1000）
- `chipQty = 1メニューあたりのチップ枚数 × quantity`
- 例: メニュー名が "SideGame 1000" で `quantity=2` の場合、`chipQty = 1000 * 2 = 2000`

### Firestoreドキュメント例

#### `/bills/{billId}/sideGameChips/{chipId}`（新規作成、`action: 'withdraw'`）
```json
{
  "action": "withdraw",
  "chipQty": 100,
  "amountIncl": null,
  "menuItemId": null,
  "name": null,
  "orderedAt": "2025-11-10T12:00:00Z",
  "createdAt": "2025-11-10T12:00:00Z"
}
```

#### `/bills/{billId}/sideGameChips/{chipId}`（新規作成、`action: 'deposit'`）
```json
{
  "action": "deposit",
  "chipQty": 200,
  "amountIncl": null,
  "menuItemId": null,
  "name": null,
  "orderedAt": "2025-11-10T12:00:00Z",
  "createdAt": "2025-11-10T12:00:00Z"
}
```

#### `/bills/{billId}/sideGameChips/{chipId}`（新規作成、`action: 'purchase'`）
```json
{
  "action": "purchase",
  "chipQty": 500,
  "amountIncl": 5000,
  "menuItemId": "menu_item_123",
  "name": "チップ購入",
  "orderedAt": "2025-11-10T12:00:00Z",
  "createdAt": "2025-11-10T12:00:00Z"
}
```

#### `/todaysBills/{billId}`（デュアルライト、フラグON時、**docIDは必ず `billId`**）
```json
{
  "sideGameChip": [
    {
      "orderId": "chip_abc123",
      "action": "withdraw",
      "amount": 100,
      "category": "Chip",
      "menuItemId": null,
      "name": null,
      "orderedAt": "2025-11-10T12:00:00Z"
    }
  ]
}
```
注意: 
- `amount` はチップ枚数（`chipQty` の値）であり、金額ではない
- `price`, `quantity`, `totalPrice` などの金額フィールドは持たない（金額のSSoTは `/bills/{billId}/sideGameChips/{chipId}.amountIncl`）

## テスト

### 単体（happy/edge/idempotent/permission）
1. **happy path（withdraw）**: 
   - `withdrawTip` callable に `userId`, `amount`（チップ枚数）を指定して呼び出し
   - Functions内部で `getActiveBillByUser` により `billId` を取得
   - `appendSideGameChip` ヘルパに `action: 'withdraw'`, `chipQty: amount`（`amount` をそのまま使用）を渡す
   - `/bills/{billId}/sideGameChips/{chipId}` が作成されること
   - `chipQty` が `request.data.amount` と一致すること
   - `amountIncl` が `null` であること
   - レスポンスに `success: true`, `billId`, `chipId`, `action: 'withdraw'` が含まれること
2. **happy path（deposit）**: 
   - `depositTip` callable に `userId`, `amount`（チップ枚数）を指定して呼び出し
   - Functions内部で `getActiveBillByUser` により `billId` を取得
   - `appendSideGameChip` ヘルパに `action: 'deposit'`, `chipQty: amount`（`amount` をそのまま使用）を渡す
   - `/bills/{billId}/sideGameChips/{chipId}` が作成されること
   - `chipQty` が `request.data.amount` と一致すること
   - `amountIncl` が `null` であること
   - レスポンスに `success: true`, `billId`, `chipId`, `action: 'deposit'` が含まれること
3. **happy path（purchase）**: 
   - `billId`, `action: 'purchase'`, `chipQty`, `amountIncl`, `menuItemId`, `idempotencyKey` を指定して呼び出し
   - `/bills/{billId}/sideGameChips/{chipId}` が作成されること（`amountIncl` が含まれること）
   - レスポンスに `success: true`, `billId`, `chipId`, `action: 'purchase'` が含まれること
4. **invalid-argument**: 
   - `billId` 未指定 → `invalid-argument`
   - `action` 未指定 → `invalid-argument`
   - `action` が `'purchase'|'deposit'|'withdraw'` 以外 → `invalid-argument`
   - `chipQty` 未指定 → `invalid-argument`
   - `chipQty <= 0` → `invalid-argument`
   - `purchase` 時に `amountIncl <= 0` → `invalid-argument`
   - `idempotencyKey` 未指定 → `invalid-argument`
5. **not-found**: 
   - `billId` が存在しない → `not-found`
6. **failed-precondition（status ガード）**: 
   - `status == "settling"` で更新不可 → `failed-precondition`
   - `status == "settled"` で更新不可 → `failed-precondition`
7. **idempotent-replay**: 
   - 同一 `idempotencyKey` で再実行 → 既存docを返却（`reused: true`）、`updatedAt` は変更されない
8. **idempotent-replay（ハッシュ不一致）**: 
   - 同一 `idempotencyKey` だが payload 差し替え → `failed-precondition`（`requestHash` 不一致）

### 統合（DualWrite ON/OFF）
1. **DualWrite ON**: 
   - `WRITE_TODAYS_BILLS_IN_PARALLEL=true` で実行
   - `todaysBills/{billId}` の `sideGameChip` 配列に追加が作成されること（**docIDは必ず `billId`**）
   - **`todaysBills` 側の失敗が `bills` の成功を壊さないこと**（`bills` への書込み結果をロールバックしない、失敗はwarningログのみ）
   - `bills` へのトランザクション完了後に、ベストエフォートで `todaysBills` への複写が実行されること
2. **DualWrite OFF**: 
   - `WRITE_TODAYS_BILLS_IN_PARALLEL=false` で実行
   - `todaysBills` への複写がスキップされること

### placeOrder × Chip（新規追加）
1. **placeOrder × Chip（happy path）**: 
   - Chipカテゴリのメニューを `quantity=2` で注文する
   - `/bills/{billId}/sideGameChips/{chipId}` が1 docだけ増えること
   - `/bills/{billId}/items` は増えないこと
   - `chipQty` が「1個あたりのチップ枚数 × 2」となっていること
   - `amountIncl` が `resolved.unitPriceIncl * 2` になっていること
   - `sideGameChipLogs` に purchase ログが追加されていること
   - `orders/{YYYYMMDD}/_TodaysOrders` には何も書かれないこと
   - レスポンスは従来通り `data: { billId, itemId, orderedAt, reused }` のみであること（`chipId` は返していない）
2. **placeOrder × Chip（idempotent replay）**: 
   - 同一 `clientNonce` を使い、同じ Chipメニューを2回連続で呼び出す
   - 2回とも成功レスポンスが返るが、`/sideGameChips` の doc 数は1つのまま
   - 2回目のレスポンスには `reused: true` 相当の情報が含まれる
   - 親 `bills/{billId}.updatedAt` が 1回目の実行時から変化しない（リプレイ時に更新されない）
   - レスポンスは従来通り `data: { billId, itemId, orderedAt, reused }` のみであること（`chipId` は返していない）
3. **placeOrder × 非Chip（リグレッションテスト）**: 
   - 非Chipメニューを注文した場合、従来通り `/bills/{billId}/items` と `orders/{YYYYMMDD}/_TodaysOrders` に記録されること
   - `/bills/{billId}/sideGameChips` には何も書かれないこと

### 横断テスト（purchase/deposit/withdraw の統一性）
1. **サイドゲーム3種類の統一性確認**: 
   - Chip購入（`action: 'purchase'`）、預入（`action: 'deposit'`）、引出し（`action: 'withdraw'`）の3種類の action が
   - 全て同じ `/bills/{billId}/sideGameChips/{chipId}` スキーマを使っていることを確認
   - 全て同じ `/bills/{billId}/idempotency/{key}` で冪等性管理されていることを確認
   - 全て同じ DualWrite パターン（`todaysBills.sideGameChip` 配列への最小複写）を使っていることを確認

### 手動（3手順以内）
1. Flutter アプリから `withdrawTip` を呼び出し（`userId`, `amount` を指定）
2. Firestore Console で以下を確認:
   - `/bills/{billId}/sideGameChips/{chipId}` が作成されている
   - `/bills/{billId}/idempotency/{key}` が作成されている（TTL: 48h）
   - `/todaysBills/{billId}` の `sideGameChip` 配列に追加されている（デュアルライトON時）
3. 同一 `idempotencyKey` で再実行 → 既存docを返却（`reused: true`）

## ドキュメント更新
- `README.md`: P1-03 完了を追記（概要1〜3行）。Chip購入を含むサイドゲームフローを `/sideGameChips` に統一したことを明記。
- `modification_plan.md`: P1-03 状態を「完了」に更新、仕様差分1行を追記。「Chip購入を含むサイドゲームフロー（purchase/deposit/withdraw）を `/sideGameChips` に統一」を明記。
- `changelog.md`: `YYYY-MM-DD: P1-03 サイドゲームフローを新スキーマ対応、デュアルライト導入（Chip購入含む）` を追記
- `test_plan.md`: フェーズ1テスト観点に「サイドゲームフロー（`appendSideGameChip`）の冪等性・デュアルライト・Chip購入（placeOrder経由）の統合」を追記

## Out of Scope（P1-03のスコープ外）

以下の項目は P1-03 のスコープ外として、将来のタスクに残します：

1. **`placeOrder` レスポンスへの `chipId` 追加（レスポンス形式の変更）**: 
   - 現時点では行わない
   - P1-03ではレスポンス形式を変更せず、従来通り `{ billId, itemId, orderedAt, reused }` を返す
   - `sideGameChips/{chipId}` の `chipId` は内部識別子として利用し、クライアントには晒さない
   - Flutter側の表示・操作要件を踏まえ、P1-09（読み取り（Flutter））で再検討する

2. **`registerForSideGame.ts` と `leaveSeat.ts` の `bills.place` 更新**: 最小限の実装は行うが、完全な `updatePlace` ヘルパAPI利用は P1-04（座席管理）で実装予定。

3. **`sideGameChipLogs` の移行**: 既存の `sideGameChipLogs` へのログ記録は維持するが、将来的な移行計画は別途検討（P1-03では維持のみ）。

4. **`users/{userId}.sideGameChip` 残高管理の移行**: 既存の残高更新ロジックは維持するが、将来的に `/bills/{billId}/sideGameChips` から集計する方式への移行は別途検討（P1-03では維持のみ）。

---

_このChangeSpecは P1-03（サイドゲームフロー）の実装前に承認が必要です。_

