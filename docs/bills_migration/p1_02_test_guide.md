# P1-02 テスト実行ガイド

_最終更新: 2025-11-15 (JST)_

## 概要

P1-02（注文フロー）のテストを実行するために必要な環境構築と実行手順を説明します。

## 必要な作業（順序通りに実施）

### 1. 前提条件の確認

P1-01のテストが正常に実行できることを確認してください。

```bash
cd functions
npm run test:createBill
```

### 2. Firestore Emulator の起動（ユーザー操作が必要）

**重要**: テスト実行前に Firestore Emulator を起動する必要があります。

**ターミナル1（Emulator起動）**:
```bash
cd /Users/yahatayuusei/Documents/GitHub/amuse_app_template
firebase emulators:start --only firestore
```

**確認ポイント**:
- `Firestore Emulator running at localhost:8080` が表示されること
- エラーが発生しないこと

**注意**: Emulatorは**別ターミナルで起動したまま**にしておく必要があります。

### 3. テストの実行

#### 3.1 単体テスト（Firestore Emulator 不要）

```bash
cd functions
npm run test:resolveMenuItem
```

#### 3.2 統合テスト（Firestore Emulator 必須）

**ターミナル2（テスト実行）**（Emulator起動中とは別のターミナル）:

```bash
cd functions

# 個別テスト実行
npm run test:getActiveBillByUser
npm run test:appendItem
npm run test:placeOrder
npm run test:placeOrderByUser

# または、P1-02の全テストを一括実行
npm run test:p1-02

# または、すべてのテストを実行
npm test
```

### 4. テストファイル一覧

| テストファイル | テスト種別 | テスト数 | 説明 |
|--------------|-----------|---------|------|
| `resolveMenuItem.spec.ts` | 単体 | 4件 | メニューアイテム解決のテスト |
| `getActiveBillByUser.spec.ts` | 統合 | 6件 | アクティブな伝票取得のテスト（取得順序とフィルタ） |
| `appendItem.spec.ts` | 統合 | 15件 | アイテム追加のテスト（最重要） |
| `placeOrder.spec.ts` | 統合 | 7件 | placeOrder callable の統合テスト |
| `placeOrderByUser.spec.ts` | 統合 | 8件 | placeOrderByUser callable の統合テスト |
| **合計** | - | **40件** | - |

### 5. テスト観点（詳細）

#### A. _TodaysOrders の docId = itemId（冪等で上書き・親集計は初回のみ）

- **初回作成**: `docId=itemId` で作成され、親 `orders` の `onedayOrderQuantity`/`onedayTotalPrice` が加算される
- **同一 idempotencyKey で再実行**: 同じ `docId` に上書き（内容は同一）され、親集計が増えない
- **別 clientNonce（別 itemId）で再実行**: 新規 doc が作られ、親集計が増える
- **appendItem のレスポンス itemId をそのまま _TodaysOrders/{itemId} に使っていることをassert**

#### B. placeOrderByUser：同一 menuItemId を複数行送った場合の対応付け

- **items = [{A x1}, {A x2}, {B x1}] を投入**: 3つの別 `itemId` が返り、`_TodaysOrders` にそれぞれ `docId=itemId` で3件作成される（Aが2件、Bが1件）
- **親集計は3件ぶん加算**: `onedayOrderQuantity=3`, `onedayTotalPrice=1300`
- **同じ clientNonce を使って全体リプレイした場合、0件加算**: 親集計が増えない

#### C. appendItem：idempotency doc に保存された itemId を使ったreplay

- **初回実行で `/idempotency/{key}.itemId` が保存される**
- **リプレイ時に保存済み itemId を参照し、同じitems docを返す**
- **親 `/bills/{billId}.updatedAt` が更新されないこと**

#### D. status ガードの厳密化（open|in_progress のみ許可）

- **status=settling/settled/voided で appendItem / placeOrder / placeOrderByUser が failed-precondition を返す**
- **open/in_progress では通る**

#### E. DualWrite：arrayUnion の重複抑止

- **DualWrite ON で初回**: `todaysBills.items` に1行入る（`orderId=itemId` を含む）
- **同一 idempotencyKey でリプレイ**: `todaysBills.items` の件数は増えない（リプレイ分岐では DualWrite をスキップ）
- **DualWrite OFF**: `todaysBills.items` に何も入らない

#### F. 価格の信頼境界（サーバ正規化）

- **クライアントが price を改ざんして送っても、無視され、`resolveMenuItem(...).price` が採用される**
- **`_TodaysOrders` 側の `unitPriceIncl * quantity` 分だけ親集計される（改ざん値は反映されない）**

#### G. orderedAt の実値返却

- **appendItem のレスポンス `orderedAt` が、`serverTimestamp()` 実解決値（ISO8601）になっている（`new Date()`ではない）**

#### H. getActiveBillByUser の取得順序とフィルタ

- **activeStays/{userId} に billId があり、そのbillが open → それが返る**
- **activeStays にあるが該当billが settled → フォールバックで bills をクエリし open のbillを返す**
- **該当なし → not-found**

#### Nice to have（追加テスト）

- **ルール施行**: クライアント権限で `/bills/*/items/*` / `/idempotency/*` に書けない（permission denied）
- **Chips除外**: `category='chip'` は `_TodaysOrders` が作られない（ログ記録は別動線でOK）
- **座席同梱**: `bills.place.table/seat` が `_TodaysOrders` に反映
- **多並列**: 同一 `billId` に対して並列2リクエストでも、`itemId` が衝突せず整合（`idempotencyKey`違いで成功）
- **Large quantity**: `quantity` 上限（必要なら）や0/負数で `invalid-argument`
- **メニュー未定義**: `resolveMenuItem` が `invalid-argument` を返す場合のハンドリング（上位が正しく fail する）

### 6. トラブルシューティング

#### 6.1 エラー: `Cannot find module '@firebase/rules-unit-testing'`

**解決策**:
```bash
cd functions
npm install --save-dev @firebase/rules-unit-testing
```

#### 6.2 エラー: `FIRESTORE_EMULATOR_HOST is not set`

**解決策**:
1. Firestore Emulator を起動（別ターミナル）
2. 環境変数を設定: `export FIRESTORE_EMULATOR_HOST=localhost:8080`（通常は自動設定される）

**注意**: `FIREBASE_AUTH_EMULATOR_HOST` は不要ですが、将来Authを触る場合は `localhost:9099` を設定してください。

#### 6.3 エラー: `admin.initializeApp() called multiple times`

**解決策**: 
- テストファイルの `beforeAll` / `afterAll` で適切にクリーンアップする（既に実装済み）
- テスト毎に `clearFirestoreData` と `app.delete()`（または共通のsingleton管理）で二重初期化を避ける

#### 6.4 エラー: `TypeError: Cannot read property 'firestore' of undefined`

**解決策**: 
- `initializeTestEnvironment` が完了するまで待つ
- `await` を忘れていないか確認

#### 6.5 テストがタイムアウトする

**解決策**: `jest.config.js` の `testTimeout` を増やす（既に30000msに設定済み）

#### 6.6 テストデータが残っている

**解決策**: 
- Firestore Emulator を再起動
- 手動でデータをクリア: Firestore Emulator UI（http://localhost:4000）から削除

**注意**: Emulator UI は `http://localhost:4000` でアクセスできます。

#### 6.7 `onCall` 関数のテストでエラー

**解決策**: `onCall` 関数は内部でハンドラーを返すので、それを直接呼び出す:
```typescript
const handler = placeOrder as any;
const result = await handler(mockRequest);
```

#### 6.8 `orderedAt` 判定に時間依存が出る場合

**解決策**: 
- Jestの実時間を使うか、期待値を「存在・型」に寄せる
- `orderedAt` は `serverTimestamp()` の実解決値（ISO8601）を返すため、完全一致ではなく形式チェックを行う

### 7. テスト実行のワークフロー（推奨順序）

#### ステップ1: 環境準備
```bash
# 1. パッケージインストール確認（既にインストール済みのはず）
cd functions
npm list jest @types/jest @firebase/rules-unit-testing ts-jest
```

#### ステップ2: Firestore Emulator 起動
```bash
# 別ターミナルで実行（起動したままにする）
cd /Users/yahatayuusei/Documents/GitHub/amuse_app_template
firebase emulators:start --only firestore
```

#### ステップ3: 単体テスト実行
```bash
# ターミナル2（Emulator起動中とは別のターミナル）で実行
cd functions
npm run test:resolveMenuItem
```

#### ステップ4: 統合テスト実行
```bash
# ターミナル2（Emulator起動中とは別のターミナル）で実行
cd functions

# 個別実行
npm run test:getActiveBillByUser
npm run test:appendItem
npm run test:placeOrder
npm run test:placeOrderByUser

# または一括実行
npm run test:p1-02
```

### 8. テスト結果の確認

#### 8.1 成功時の出力例

```
PASS  __tests__/helpers/billsApi/resolveMenuItem.spec.ts
  resolveMenuItem
    happy path
      ✓ menuItemId からメニュー定義を解決できること (5ms)
    invalid-argument
      ✓ menuItemId 未指定 → invalid-argument (2ms)
      ✓ メニュー未解決（menuItemId が存在しない） → invalid-argument (1ms)
      ✓ メニューデータが不正（必須フィールド不足） → invalid-argument (1ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

#### 8.2 失敗時の確認ポイント

1. **エラーメッセージを確認**
   - どのテストが失敗したか
   - エラーの種類（TypeError, AssertionError 等）

2. **Firestore Emulator の状態確認**
   - Emulator が起動しているか
   - ポート8080が使用されているか: `lsof -i :8080`

3. **テストデータの確認**
   - Firestore Emulator UI（http://localhost:4000）でデータを確認
   - 予期しないデータが残っていないか

### 9. チェックリスト

テスト実行前に以下を確認してください：

- [ ] `jest`, `@types/jest`, `@firebase/rules-unit-testing`, `ts-jest` がインストールされている
- [ ] `jest.config.js` が作成されている
- [ ] `package.json` にテストスクリプトが追加されている
- [ ] Firestore Emulator が起動している（別ターミナル）
- [ ] `FIRESTORE_EMULATOR_HOST=localhost:8080` が設定されている（自動設定される場合あり）
- [ ] TypeScript のビルドが成功する: `npm run build`
- [ ] `npm run test:p1-02` が上記ケースをすべて含むことを確認

### 10. テスト実行後の確認事項

テスト実行後、以下を確認してください：

- [ ] すべてのテストが成功している
- [ ] Firestore Emulator に予期しないデータが残っていない
- [ ] テストログにエラーがない

### 11. 参考リンク

- [Jest 公式ドキュメント](https://jestjs.io/docs/getting-started)
- [Firebase Emulator 公式ドキュメント](https://firebase.google.com/docs/emulator-suite)
- [@firebase/rules-unit-testing 公式ドキュメント](https://firebase.google.com/docs/rules/unit-tests)
- P1-01 テスト実行ガイド: `test_setup_guide.md`
- P1-01 テストサマリー: `p1_01_test_summary.md`

