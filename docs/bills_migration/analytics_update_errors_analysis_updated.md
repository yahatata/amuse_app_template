# Analytics Monthly 更新エラー分析レポート（更新版）

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

## 既存ドキュメントの構造確認結果

### ✅ 確認できた構造

1. **`analyticsMonthly/2026-01/byCategory/summary`**:
   - `itemSales` は map（オブジェクト）として存在 ✅
   - `itemSales.s5zd9X7t5jePPBeDeUH4` オブジェクトが存在する ✅
   - `itemSales.s5zd9X7t5jePPBeDeUH4.qty` と `itemSales.s5zd9X7t5jePPBeDeUH4.sales` は数値型 ✅

2. **`analyticsMonthly/2026-01/byTemplateTournaments/{templateKey}`**:
   - `daily` は map（オブジェクト）として存在 ✅（配列ではない）
   - `daily.2026-01-17` のような構造になっている ✅
   - `totals` オブジェクトが存在する ✅

---

## 原因分析（更新版）

### ✅ 明確に特定できた原因

#### 1. `addToByTemplateTournaments.ts` の `daily` フィールドの初期化の問題

**場所**: `functions/src/analytics/addToByTemplateTournaments.ts` 128行目

**問題のコード**:
```typescript
// 125-141行目: 初期化時
transaction.set(templateRef, {
  templateName,
  daily: [],  // ← 配列として初期化（問題）
  totals: {
    // ...
  },
  // ...
});
```

**問題点**:
- **新規ドキュメント作成時**: `daily: []` を**配列**として初期化している（128行目）
- **既存ドキュメント**: `daily` は**オブジェクト（map）**として存在している
- **更新時**: `daily.${businessDate}.entryCount` のように**オブジェクト**として更新しようとしている（80行目）

**影響**:
- 新規ドキュメント作成時に配列として初期化されると、その後の更新でオブジェクト形式（`daily.${businessDate}.entryCount`）の更新が正しく動作しない可能性がある
- 既存ドキュメントに対しては、オブジェクトとして存在しているため、更新は正しく動作するはず
- **しかし、新規作成されたドキュメントに対しては、配列として初期化されているため、オブジェクト形式の更新が失敗する可能性がある**

**確認方法**:
- 新規作成された `byTemplateTournaments` ドキュメントの `daily` フィールドの型を確認
- Cloud Functions のログでエラーが出力されていないか確認

---

#### 2. `addToByCategory.ts` の `itemSales` 更新の問題（**最も可能性が高い**）

**場所**: `functions/src/analytics/addToByCategory.ts` 44-47行目

**問題のコード**:
```typescript
// 44-47行目: 更新時
updateData[`itemSales.${menuItemId}.qty`] = admin.firestore.FieldValue.increment(itemData.qty || 0);
updateData[`itemSales.${menuItemId}.sales`] = admin.firestore.FieldValue.increment(itemData.salesIncl || 0);
updateData[`itemSales.${menuItemId}.name`] = itemData.name || '';
updateData[`itemSales.${menuItemId}.category`] = itemData.category || '';
```

**問題点**:
1. **`name` と `category` の上書き**: 46-47行目で、`name` と `category` を毎回上書きしている（`increment` ではなく `=` で代入）
   - これは既存の値を上書きしてしまう可能性がある
   - ただし、これは `qty` と `sales` の更新ができない原因ではない

2. **Firestore の `increment` と `update` の混在（**最も可能性が高い**）**:
   - 同じ `updateData` オブジェクト内で、`increment` と通常の代入（`=`）を混在させている
   - 44-45行目: `increment` を使用
   - 46-47行目: 通常の代入（`=`）を使用
   - **Firestore の `transaction.update` では、同じネストされたフィールドパスに対して `increment` と通常の代入を混在させると、`increment` が正しく動作しない可能性がある**

**Firestore の動作（推測）**:
- `transaction.update` では、同じネストされたフィールドパス（例: `itemSales.menuItemId`）に対して、`increment` と通常の代入を混在させると、**通常の代入が優先され、`increment` が無視される可能性がある**
- または、`increment` と通常の代入を混在させると、**エラーになる可能性がある**

**確認方法**:
- Cloud Functions のログでエラーが出力されていないか確認
- `itemSales.menuItemId.qty` と `itemSales.menuItemId.sales` の更新が正しく動作しているか確認

---

### ⚠️ 可能性を見出したにすぎない部分

#### 1. Firestore の `increment` と `update` の混在による問題

**可能性**:
- 同じ `updateData` オブジェクト内で、`increment` と通常の代入（`=`）を混在させると、`increment` が正しく動作しない可能性がある
- Firestore の `transaction.update` では、同じネストされたフィールドパスに対して、`increment` と通常の代入を混在させると、**通常の代入が優先され、`increment` が無視される可能性がある**

**確認方法**:
- Firestore の公式ドキュメントを確認
- 実際のエラーログを確認
- `itemSales.menuItemId.qty` と `itemSales.menuItemId.sales` の更新が正しく動作しているか確認

---

#### 2. `totals` フィールドの更新の問題

**可能性**:
- `totals` フィールドが存在する場合、`increment` が正しく動作するはず
- しかし、何らかの理由で `increment` が失敗している可能性がある

**確認方法**:
- Cloud Functions のログでエラーが出力されていないか確認
- `totals.entryCount` などの更新が正しく動作しているか確認

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

### 1. Cloud Functions のエラーログ確認（最優先）

Cloud Functions のログで、以下のエラーが出力されていないか確認：
- `transaction.update` の実行エラー
- `increment` の実行エラー
- Firestore のエラーメッセージ（`INVALID_ARGUMENT`, `FAILED_PRECONDITION` など）

### 2. 実際の更新内容の確認

Firestore Console で、更新前後の値を比較：
- `itemSales.s5zd9X7t5jePPBeDeUH4.qty` が増加しているか
- `itemSales.s5zd9X7t5jePPBeDeUH4.sales` が加算されているか
- `daily.${businessDate}.entryCount` が更新されているか
- `totals.entryCount` が更新されているか

### 3. 新規作成されたドキュメントの確認

新規作成された `byTemplateTournaments` ドキュメントの `daily` フィールドの型を確認：
- 配列として初期化されているか
- オブジェクトとして更新されているか

---

## 結論

### ✅ 明確に特定できた原因

1. **`addToByCategory.ts` の `itemSales` 更新の問題（最も可能性が高い）**:
   - 同じ `updateData` オブジェクト内で、`increment` と通常の代入（`=`）を混在させている
   - 44-45行目: `increment` を使用（`qty` と `sales`）
   - 46-47行目: 通常の代入（`=`）を使用（`name` と `category`）
   - **Firestore の `transaction.update` では、同じネストされたフィールドパス（`itemSales.menuItemId`）に対して `increment` と通常の代入を混在させると、`increment` が正しく動作しない可能性がある**

2. **`addToByTemplateTournaments.ts` の `daily` フィールドの初期化の問題**:
   - 新規ドキュメント作成時に `daily: []` を配列として初期化しているが、更新時にはオブジェクト形式で更新しようとしている
   - 既存ドキュメントではオブジェクトとして存在しているため、既存ドキュメントに対しては問題ない可能性がある
   - **しかし、新規作成されたドキュメントに対しては、配列として初期化されているため、オブジェクト形式の更新が失敗する可能性がある**

### ⚠️ 可能性を見出したにすぎない部分

1. **Firestore の `increment` と `update` の混在による問題**:
   - 同じネストされたフィールドパスに対して、`increment` と通常の代入を混在させると、`increment` が正しく動作しない可能性がある
   - しかし、Firestore の公式ドキュメントでは、この制約について明記されていない可能性がある

2. **`totals` フィールドの更新の問題**:
   - `totals` フィールドが存在する場合、`increment` が正しく動作するはず
   - しかし、何らかの理由で `increment` が失敗している可能性がある

---

## 次のステップ

1. **Cloud Functions のエラーログを確認（最優先）**:
   - `transaction.update` の実行エラー
   - `increment` の実行エラー
   - Firestore のエラーメッセージ

2. **実際の更新内容を確認**:
   - Firestore Console で、更新前後の値を比較

3. **新規作成されたドキュメントの確認**:
   - 新規作成された `byTemplateTournaments` ドキュメントの `daily` フィールドの型を確認
