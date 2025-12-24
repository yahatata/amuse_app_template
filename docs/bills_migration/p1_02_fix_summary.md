# P1-02 修正サマリー

_最終更新: 2025-11-15 (JST)_

## 概要

P1-02（注文フロー）の実装後、8つのクリティカルな修正点を指摘され、全て修正を完了しました。本ドキュメントでは、修正内容を網羅的にまとめます。

---

## 🔧 修正内容詳細

### 1. appendItem.ts: itemId ≠ idempotencyKey の統一

**問題**: 
- `items` の docID を自動採番しており、「強い冪等（replayは完全no-op）」が構造的に担保されていない

**修正内容**:
- `itemId = idempotencyKey` に統一
- `const itemId = idempotencyKey;` として、`itemRef = billRef.collection('items').doc(itemId)` に変更

**修正箇所**:
- `functions/src/helpers/billsApi/appendItem.ts` 144-146行目

**効果**:
- 同一 `idempotencyKey` で再実行時、同じ `itemId` のドキュメントを参照するため、完全なno-opが保証される

---

### 2. appendItem.ts: idempotency doc に itemId を保存

**問題**: 
- replay 分岐で「items を orderedAt desc で1件取得」という誤動作の恐れ（別アイテムを拾う危険）

**修正内容**:
- 生成時: `tx.set(idempotencyRef, { requestHash, createdAt: now, itemId })` に `itemId` を追加
- replay 時: `const savedItemId = idemSnap.data()?.itemId as string;` で取得し、`billRef.collection('items').doc(savedItemId)` を参照

**修正箇所**:
- `functions/src/helpers/billsApi/appendItem.ts` 96-123行目（replay分岐）、166-172行目（生成時）

**効果**:
- replay 時に確実に正しい `itemId` を参照できる

---

### 3. appendItem.ts: status ガード不足

**問題**: 
- `settled` のみ拒否。合意は 拒否＝`settling`/`settled`/`voided`、許可＝`open`/`in_progress`

**修正内容**:
```typescript
// 許可: open/in_progress、拒否: settling/settled/voided
const allowed = status === 'open' || status === 'in_progress';
if (!allowed) {
  throw new HttpsError('failed-precondition', `Cannot append item to bill with status: ${status}`);
}
```

**修正箇所**:
- `functions/src/helpers/billsApi/appendItem.ts` 135-139行目

**効果**:
- `settling` 状態での誤った追加を防止

---

### 4. placeOrder.ts / placeOrderByUser.ts: orders/_TodaysOrders が autoId（要：冪等 docId）

**問題**: 
- replay 時に重複行が増える／親集計も二重加算

**修正内容**:
- `_TodaysOrders/{docId}` は `docId = itemId` に変更
- 親 `orders` の集計は初回のみインクリメント（存在チェックで判定）

**修正箇所**:
- `functions/src/itemOrder/placeOrder.ts` 88-118行目
- `functions/src/itemOrder/placeOrderByUser.ts` 154-199行目

**修正詳細**:
```typescript
// docId = itemId で作成
const todaysOrderRef = ordersRef.collection("_TodaysOrders").doc(appendResult.itemId);
const todaysOrderSnap = await tx.get(todaysOrderRef);

// 存在しない時だけ set + 親集計 increment、存在時は上書きのみで親集計スキップ
const isNew = !todaysOrderSnap.exists;

tx.set(todaysOrderRef, { ... }, { merge: true });

if (isNew) {
  tx.update(ordersRef, {
    onedayOrderQuantity: FieldValue.increment(1),
    onedayTotalPrice: FieldValue.increment(resolved.unitPriceIncl * item.quantity),
  });
}
```

**効果**:
- replay 時に重複行が増えない
- 親集計の二重加算を防止

---

### 5. appendItem.ts: DualWrite が単純 push（重複抑止なし）

**問題**: 
- `todaysBills.items` へ `...existingItems, legacyItem` は二重挿入を招く

**修正内容**:
- `arrayUnion` を使用し、`orderId = itemId` を必須フィールドとして保持
- 金額フィールドは入れない（SSoTは `bills`）

**修正箇所**:
- `functions/src/helpers/billsApi/appendItem.ts` 174-206行目

**修正詳細**:
```typescript
const legacyItem = {
  orderId: itemId, // itemId を必須フィールドとして保持（重複抑止）
  menuItemId: resolved.menuItemId,
  category: resolved.category,
  name: resolved.name,
  quantity,
  orderedAt: now,
  // 金額フィールドは入れない（SSoTは bills）
};

// arrayUnion を使用して重複挿入を防止
tx.update(legacyRef, {
  items: admin.firestore.FieldValue.arrayUnion(legacyItem),
  // totalPrice は更新しない（新 bills がSSoT）
});
```

**効果**:
- 重複挿入を防止
- 金額フィールドを排除し、SSoTを明確化

---

### 6. appendItem.ts: レスポンスの orderedAt が new Date()

**問題**: 
- サーバ `serverTimestamp()` と乖離。クライアントの期待値とズレる

**修正内容**:
- トランザクション後に `itemRef.get()` で `orderedAt` の実値を読み直して返す

**修正箇所**:
- `functions/src/helpers/billsApi/appendItem.ts` 208-220行目

**修正詳細**:
```typescript
// 8) トランザクション後に item ドキュメントを読み直して orderedAt の実値を取得
// （serverTimestamp の実際の値を返すため）
const itemSnap = await itemRef.get();
const itemData = itemSnap.data()!;
const orderedAt = itemData.orderedAt;
const orderedAtIso = orderedAt && orderedAt.toDate ? orderedAt.toDate().toISOString() : new Date().toISOString();

return {
  success: true,
  billId,
  itemId,
  orderedAt: orderedAtIso,
};
```

**効果**:
- クライアントに正確な `orderedAt` を返す

---

### 7. placeOrderByUser.ts: 配列入力時の冪等キーはOKだが、orders 側が冪等でない

**問題**: 
- 上記 #4 と同根。種類ごとに `docId=itemId` にして親集計は初回のみに修正

**修正内容**:
- `placeOrderByUser.ts` でも `docId = itemId` を使用
- `itemIdMap` を構築して `menuItemId` から `itemId` を取得
- 親集計は初回のみインクリメント

**修正箇所**:
- `functions/src/itemOrder/placeOrderByUser.ts` 67-199行目

**修正詳細**:
```typescript
// itemId を menuItemId にマッピング（orders/_TodaysOrders 用）
const itemIdMap = new Map<string, string>();

for (let index = 0; index < items.length; index++) {
  // ... appendItem 呼び出し ...
  itemIdMap.set(item.menuItemId, appendResult.itemId);
}

// orders/_TodaysOrders 作成時
for (const orderItem of ordersToCreate) {
  const itemId = itemIdMap.get(orderItem.menuItemId);
  const todaysOrderRef = ordersRef.collection("_TodaysOrders").doc(itemId);
  const todaysOrderSnap = await tx.get(todaysOrderRef);
  const isNew = !todaysOrderSnap.exists;
  
  // ... set with merge: true ...
  
  if (isNew) {
    newOrderCount++;
    newOrderTotalPrice += orderItem.unitPriceIncl * orderItem.quantity;
  }
}
```

**効果**:
- 複数アイテム配列でも replay 時に重複行が増えない
- 親集計の二重加算を防止

---

### 8. 仕様ドリフト：ChangeSpec の更新

**修正内容**:
- ChangeSpec の該当節を追記・確定

**修正箇所**:
- `docs/bills_migration/changespecs/P1-02_change_spec.md`

**修正詳細**:
- `itemId = idempotencyKey` の明記
- `status` ガードの詳細化（`open`/`in_progress` のみ許可）
- `idempotency` doc に `itemId` を保存する旨を追記
- DualWrite の `arrayUnion` 使用を明記
- `orders/_TodaysOrders` の `docId = itemId` と親集計初回のみを明記
- `orderedAt` の実値取得を明記

---

## 📊 修正ファイル一覧

| ファイル | 修正内容 | 行数変更 |
|---------|---------|---------|
| `functions/src/helpers/billsApi/appendItem.ts` | itemId統一、idempotency保存、statusガード、DualWrite arrayUnion、orderedAt実値取得 | 約50行変更 |
| `functions/src/itemOrder/placeOrder.ts` | orders/_TodaysOrders の docId=itemId、親集計初回のみ | 約30行変更 |
| `functions/src/itemOrder/placeOrderByUser.ts` | orders/_TodaysOrders の docId=itemId、親集計初回のみ、itemIdMap構築 | 約40行変更 |
| `docs/bills_migration/changespecs/P1-02_change_spec.md` | 仕様ドリフト修正 | 約10行変更 |

---

## ✅ 修正後の動作

### 強い冪等性の担保

1. **itemId = idempotencyKey の統一**
   - 同一 `clientNonce` で再実行時、同じ `itemId` のドキュメントを参照
   - 完全なno-opが保証される

2. **idempotency doc に itemId 保存**
   - replay 時に確実に正しい `itemId` を参照できる
   - 誤ったアイテムを拾うリスクを排除

3. **orders/_TodaysOrders の docId = itemId**
   - replay 時に重複行が増えない
   - 親集計の二重加算を防止

### データ整合性の向上

1. **status ガードの強化**
   - `settling` 状態での誤った追加を防止
   - 許可状態を明確化（`open`/`in_progress` のみ）

2. **DualWrite の重複抑止**
   - `arrayUnion` を使用して重複挿入を防止
   - `orderId = itemId` を必須フィールドとして保持

3. **orderedAt の実値取得**
   - トランザクション後に `itemRef.get()` で実値を読み直し
   - クライアントに正確な `orderedAt` を返す

---

## 🧪 テスト観点（追加）

修正後のテストで確認すべき点：

1. **itemId = idempotencyKey の確認**
   - 同一 `clientNonce` で再実行時、`itemId` が同じであること

2. **idempotency doc の itemId 保存確認**
   - replay 時に `idempotency` doc から `itemId` を取得できること

3. **status ガードの確認**
   - `settling` 状態で `failed-precondition` が返されること

4. **orders/_TodaysOrders の冪等性確認**
   - replay 時に重複行が増えないこと
   - 親集計が二重加算されないこと

5. **DualWrite の重複抑止確認**
   - replay 時に `todaysBills.items` に重複が入らないこと

6. **orderedAt の実値確認**
   - レスポンスの `orderedAt` が `serverTimestamp()` の実値であること

---

## 📝 まとめ

8つのクリティカルな修正点を全て修正し、以下の改善を実現しました：

1. ✅ **強い冪等性の完全担保**（itemId = idempotencyKey、idempotency doc に itemId 保存）
2. ✅ **status ガードの強化**（settling/settled/voided を拒否）
3. ✅ **orders/_TodaysOrders の冪等性担保**（docId = itemId、親集計初回のみ）
4. ✅ **DualWrite の重複抑止**（arrayUnion使用、orderId=itemId必須）
5. ✅ **orderedAt の実値取得**（トランザクション後に読み直し）

これらの修正により、P1-02の実装が ChangeSpec の要件を完全に満たすようになりました。

