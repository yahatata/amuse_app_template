# Analytics Monthly 更新エラー分析レポート

_作成日: 2025-12-20 (JST)_

## 報告されたエラー

### エラー①: `byCategory` サブコレクションの `itemSales` 更新

**問題**:
- 既存のメニューアイテムの `qty` を注文数分増やす
- `sales` を加算する
これができていない

**例**:
- `itemSales.s5zd9X7t5jePPBeDeUH4.qty` が `3` のまま（増加していない）
- `itemSales.s5zd9X7t5jePPBeDeUH4.sales` が `3000` のまま（加算されていない）

---

### エラー②: `byTemplateTournaments` の `daily` と `totals` 更新

**問題**:
- 既存のトーナメントに `daily` を追加で作成する
- `totals` の更新もできていない

---

## 原因分析

### ✅ 明確に特定できた原因

#### 1. `addToByTemplateTournaments.ts` の `daily` フィールドの型の不一致（**最も可能性が高い**）

**場所**: `functions/src/analytics/addToByTemplateTournaments.ts` 79-86行目、125-141行目

**問題のコード**:
```typescript
// 79-86行目: 更新時
updateData[`daily.${businessDate}.entryCount`] = admin.firestore.FieldValue.increment(entryCount);
updateData[`daily.${businessDate}.entrySales`] = admin.firestore.FieldValue.increment(entrySales);
// ... 他の daily フィールド

// 125-141行目: 初期化時
transaction.set(templateRef, {
  templateName,
  daily: [],  // ← 配列として初期化
  totals: {
    // ...
  },
  // ...
});
```

**問題点**:
- **新規ドキュメント作成時**: `daily: []` を**配列**として初期化している（128行目）
- **更新時**: `daily.${businessDate}.entryCount` のように**オブジェクト**として更新しようとしている（80行目）
- **配列とオブジェクトの型の不一致**が原因の可能性が高い

**Firestore の動作**:
- Firestore では、配列とオブジェクトは異なる型として扱われる
- 配列として初期化されたフィールドに対して、オブジェクト形式（`daily.${businessDate}.entryCount`）で更新しようとすると、**エラーになる可能性がある**
- または、更新が無視される可能性がある

**確認方法**:
- 既存ドキュメントの `daily` フィールドの型を確認（配列かオブジェクトか）
- Cloud Functions のログでエラーが出力されていないか確認

---

#### 2. `addToByCategory.ts` の `itemSales` 更新の問題（**可能性が高い**）

**場所**: `functions/src/analytics/addToByCategory.ts` 44-47行目、99-107行目

**問題のコード**:
```typescript
// 44-47行目: 更新時
updateData[`itemSales.${menuItemId}.qty`] = admin.firestore.FieldValue.increment(itemData.qty || 0);
updateData[`itemSales.${menuItemId}.sales`] = admin.firestore.FieldValue.increment(itemData.salesIncl || 0);
updateData[`itemSales.${menuItemId}.name`] = itemData.name || '';
updateData[`itemSales.${menuItemId}.category`] = itemData.category || '';

// 99-107行目: 初期化時
transaction.set(byCategoryRef, {
  totals: {},
  orderCounts: {},
  itemSales: {},  // ← 空のオブジェクトとして初期化
  // ...
});
```

**問題点**:
1. **`name` と `category` の上書き**: 46-47行目で、`name` と `category` を毎回上書きしている（`increment` ではなく `=` で代入）
   - これは既存の値を上書きしてしまう可能性がある
   - ただし、これは `qty` と `sales` の更新ができない原因ではない

2. **Firestore の `increment` のネストされたフィールドパスへの制約（推測）**:
   - Firestore の `increment` は、ネストされたフィールドパス（例: `itemSales.menuItemId.qty`）に対して使用する場合、**親オブジェクト（`itemSales.menuItemId`）が存在しない場合にエラーになる可能性がある**
   - しかし、Firestore の公式ドキュメントによると、`increment` は存在しないフィールドに対して自動的に初期化するため、これは問題ないはず
   - **ただし、親オブジェクト（`itemSales.menuItemId`）が存在しない場合、`increment` が失敗する可能性がある**

**確認方法**:
- 既存ドキュメントの `itemSales` フィールドの構造を確認
- `itemSales.menuItemId` オブジェクトが存在するか確認
- Cloud Functions のログでエラーが出力されていないか確認

---

### ⚠️ 可能性を見出したにすぎない部分

#### 1. Firestore の `increment` のネストされたフィールドパスへの制約

**可能性**:
- Firestore の `increment` は、ネストされたフィールドパス（例: `itemSales.menuItemId.qty`）に対して使用する場合、**親オブジェクト（`itemSales.menuItemId`）が存在しない場合にエラーになる可能性がある**
- しかし、Firestore の公式ドキュメントによると、`increment` は存在しないフィールドに対して自動的に初期化するため、これは問題ないはず
- **ただし、親オブジェクトが存在しない場合、`increment` が失敗する可能性がある**

**確認方法**:
- Firestore の公式ドキュメントを確認
- 実際のエラーログを確認
- 既存ドキュメントの `itemSales` フィールドの構造を確認

---

#### 2. `transaction.set` と `transaction.update` の競合

**可能性**:
- 新規ドキュメント作成時に `itemSales: {}` を初期化しているが、既存ドキュメントの場合、`itemSales.menuItemId` オブジェクトが存在しない可能性がある
- この場合、`increment` が失敗する可能性がある

**確認方法**:
- 既存ドキュメントの `itemSales` フィールドの構造を確認
- エラーログを確認

---

#### 3. `totals` フィールドの初期化の問題

**可能性**:
- `totals` フィールドが存在しない場合、`increment` が失敗する可能性がある
- しかし、Firestore の公式ドキュメントによると、`increment` は存在しないフィールドに対して自動的に初期化するため、これは問題ないはず

**確認方法**:
- 既存ドキュメントの `totals` フィールドの存在を確認
- エラーログを確認

---

## 確認すべきログ

### 1. Firestore のエラーログ

以下のエラーが出力されていないか確認：
- `INVALID_ARGUMENT`: フィールドパスの形式が正しくない
- `FAILED_PRECONDITION`: フィールドが存在しない、または型が一致しない
- `ABORTED`: トランザクションが競合した

### 2. Cloud Functions のエラーログ

以下のエラーが出力されていないか確認：
- `transaction.update` の実行エラー
- `increment` の実行エラー
- Firestore のエラーメッセージ

---

## 推奨される確認方法

### 1. 既存ドキュメントの構造確認（最優先）

Firestore Console で、以下のドキュメントの構造を確認：

1. **`analyticsMonthly/2026-01/byCategory/summary`**:
   - `itemSales` フィールドの構造
   - `itemSales.menuItemId` オブジェクトが存在するか（例: `itemSales.s5zd9X7t5jePPBeDeUH4`）
   - `itemSales.menuItemId.qty` と `itemSales.menuItemId.sales` の型（数値かどうか）

2. **`analyticsMonthly/2026-01/byTemplateTournaments/{templateKey}`**:
   - `daily` フィールドの型（配列かオブジェクトか）
   - `totals` オブジェクトが存在するか
   - `totals.entryCount` などのフィールドの型（数値かどうか）

### 2. エラーログの確認

Cloud Functions のログで、以下のエラーが出力されていないか確認：
- `transaction.update` の実行エラー
- `increment` の実行エラー
- Firestore のエラーメッセージ（`INVALID_ARGUMENT`, `FAILED_PRECONDITION` など）

### 3. 実際の更新内容の確認

Firestore Console で、更新前後の値を比較：
- `itemSales.menuItemId.qty` が増加しているか
- `itemSales.menuItemId.sales` が加算されているか
- `daily.${businessDate}.entryCount` が更新されているか
- `totals.entryCount` が更新されているか

---

## 結論

### ✅ 明確に特定できた原因

1. **`addToByTemplateTournaments.ts` の `daily` フィールドの型の不一致（最も可能性が高い）**:
   - 新規ドキュメント作成時に `daily: []` を**配列**として初期化しているが、更新時には `daily.${businessDate}.entryCount` のように**オブジェクト**として更新しようとしている
   - **配列とオブジェクトの型の不一致**が原因の可能性が高い
   - Firestore では、配列とオブジェクトは異なる型として扱われるため、型の不一致が原因の可能性が高い

2. **`addToByCategory.ts` の `itemSales` 更新の問題（可能性が高い）**:
   - `name` と `category` を毎回上書きしている（これは問題ないが、`qty` と `sales` の更新ができない原因ではない）
   - Firestore の `increment` が、ネストされたフィールドパス（`itemSales.menuItemId.qty`）に対して正しく動作するか確認が必要
   - **親オブジェクト（`itemSales.menuItemId`）が存在しない場合、`increment` が失敗する可能性がある**

### ⚠️ 可能性を見出したにすぎない部分

1. **Firestore の `increment` のネストされたフィールドパスへの制約**:
   - 親オブジェクトが存在しない場合にエラーになる可能性がある
   - しかし、Firestore の公式ドキュメントによると、`increment` は存在しないフィールドに対して自動的に初期化するため、これは問題ないはず
   - **ただし、親オブジェクトが存在しない場合、`increment` が失敗する可能性がある**

2. **`transaction.set` と `transaction.update` の競合**:
   - 既存ドキュメントの場合、`itemSales.menuItemId` オブジェクトが存在しない可能性がある
   - この場合、`increment` が失敗する可能性がある

3. **`totals` フィールドの初期化の問題**:
   - `totals` フィールドが存在しない場合、`increment` が失敗する可能性がある
   - しかし、Firestore の公式ドキュメントによると、`increment` は存在しないフィールドに対して自動的に初期化するため、これは問題ないはず

---

## 次のステップ

1. **既存ドキュメントの構造を確認（最優先）**:
   - `itemSales` フィールドの構造
   - `daily` フィールドの型（配列かオブジェクトか）
   - `totals` オブジェクトの存在

2. **エラーログを確認**:
   - Cloud Functions のログでエラーが出力されていないか確認

3. **実際の更新内容を確認**:
   - Firestore Console で、更新前後の値を比較

4. **Firestore の公式ドキュメントを確認**:
   - `increment` のネストされたフィールドパスへの制約
   - 配列とオブジェクトの型の不一致に関する制約
