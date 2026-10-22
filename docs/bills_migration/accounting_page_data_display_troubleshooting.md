# 会計管理画面 データ表示不具合 トラブルシューティングガイド

_作成日: 2025-12-20 (JST)_

## 概要

会計管理画面（`lib/Accounting/accountingPage.dart`）でデータが表示されない場合の原因検討と診断方法をまとめます。

## データ取得条件の確認

### 未会計タブ（`_loadActiveBills()`）

**クエリ条件**:
```dart
collection('bills')
  .where('businessDate', isEqualTo: businessDate)
  .where('status', whereIn: ['open', 'settling'])
```

**条件**:
- `businessDate`: 現在の営業日（`_getBusinessDate()` で計算）
- `status`: `'open'` または `'settling'`

---

### 会計完了タブ（`_loadSettledBills()`）

**クエリ条件**:
```dart
collection('bills')
  .where('businessDate', isEqualTo: businessDate)
  .where('status', isEqualTo: 'settled')
  .orderBy('ops.accountingCompletedAt', descending: true)
```

**条件**:
- `businessDate`: 現在の営業日（`_getBusinessDate()` で計算）
- `status`: `'settled'`（会計完了）
- `orderBy`: `ops.accountingCompletedAt` 降順（**必須フィールド**）

---

## 原因の検討

### 1. 営業日（`businessDate`）の不一致

**原因**:
- `_getBusinessDate()` で計算した営業日と、`bills` ドキュメントの `businessDate` が一致しない
- 店舗締め時間（`STORE_CLOSE_HOUR`）の設定が想定と異なる

**確認方法**:
- Dart の `debugPrint` で営業日を確認:
  ```dart
  debugPrint('[_loadSettledBills] 検索営業日: $businessDate');
  ```
- Firestore Console で `bills` ドキュメントの `businessDate` フィールドを確認

**必要なログ**:
- `[_loadSettledBills] 検索営業日: YYYY-MM-DD` （135行目）
- Firestore Console: `bills/{billId}` の `businessDate` フィールド

---

### 2. `status` が `'settled'` になっていない

**原因**:
- `completeAccountingV2` が実行されていない
- `completeAccountingV2` が失敗している
- `status` の更新が完了していない

**確認方法**:
- Firestore Console で `bills/{billId}` の `status` フィールドを確認
- Cloud Functions のログで `completeAccountingV2` の実行結果を確認

**必要なログ**:
- Firestore Console: `bills/{billId}` の `status` フィールド
- Cloud Functions ログ: `completeAccountingV2` の実行ログ
  ```bash
  firebase functions:log --only completeAccountingV2
  ```

---

### 3. `ops.accountingCompletedAt` が設定されていない

**原因**:
- `completeAccountingV2` が `ops.accountingCompletedAt` を更新していない
- `orderBy` で使用しているため、このフィールドがないとクエリが失敗する可能性がある

**確認方法**:
- Firestore Console で `bills/{billId}/ops.accountingCompletedAt` を確認
- Dart の `debugPrint` で取得したドキュメントの `ops.accountingCompletedAt` を確認

**必要なログ**:
- Firestore Console: `bills/{billId}` の `ops.accountingCompletedAt` フィールド
- Dart ログ: `[_loadSettledBills] ops.accountingCompletedAt: ...` （154行目）

**注意**: `orderBy('ops.accountingCompletedAt', descending: true)` を使用しているため、このフィールドが存在しないドキュメントはクエリ結果に含まれない可能性があります。

---

### 4. Firestore インデックスが不足している

**原因**:
- `businessDate`, `status`, `ops.accountingCompletedAt` の複合インデックスが存在しない

**確認方法**:
- Firestore Console の「インデックス」タブで、以下のインデックスが存在するか確認:
  ```
  Collection: bills
  Fields:
    - businessDate (Ascending)
    - status (Ascending)
    - ops.accountingCompletedAt (Descending)
  ```

**必要なログ**:
- Firestore Console: 「インデックス」タブでインデックスの状態を確認
- クエリエラーログ: Dart の `debugPrint` でエラーを確認（182-184行目）

---

### 5. `bills.onSettle` トリガが発火していない

**原因**:
- `status` の更新が `bills.onSettle` トリガを発火していない
- トリガの発火条件が満たされていない:
  - `before.status !== 'settled'` かつ `after.status === 'settled'`
- `ENABLE_SETTLEMENT_AGGREGATOR` が `'true'` に設定されていない

**確認方法**:
- Cloud Functions のログで `billsOnSettle` の実行ログを確認
- `ENABLE_SETTLEMENT_AGGREGATOR` 環境変数を確認

**必要なログ**:
- Cloud Functions ログ: `billsOnSettle` の実行ログ
  ```bash
  firebase functions:log --only billsOnSettle
  ```
- 環境変数: `ENABLE_SETTLEMENT_AGGREGATOR` が `'true'` に設定されているか確認

---

### 6. `analyticsMonthly` が更新されていない

**原因**:
- `bills.onSettle` トリガが `enqueueSettlement` を呼び出していない
- `ENABLE_SETTLEMENT_AGGREGATOR` が `'true'` に設定されていない
- `processBillAnalyticsAtomically` が実行されていない、または失敗している

**確認方法**:
- Firestore Console で `analyticsMonthly/{month}` ドキュメントを確認
- `aggregationMarkers/{billId}` が作成されているか確認
- Cloud Functions のログで `enqueueSettlement` の実行ログを確認

**必要なログ**:
- Cloud Functions ログ: `billsOnSettle` → `enqueueSettlement` の実行ログ
- Firestore Console: `analyticsMonthly/{month}/aggregationMarkers/{billId}` の存在確認

---

## 診断手順（推奨）

### ステップ1: Dart アプリのログを確認

**確認箇所**: `lib/Accounting/accountingPage.dart`

1. **営業日の確認**:
   - `debugPrint('[_loadSettledBills] 検索営業日: $businessDate')` の出力を確認（135行目）

2. **取得件数の確認**:
   - `debugPrint('[_loadSettledBills] 取得件数: ${querySnapshot.docs.length}')` の出力を確認（144行目）

3. **取得データの確認**:
   - `debugPrint('[_loadSettledBills] ドキュメントID: ${doc.id}')` の出力を確認（149行目）
   - `debugPrint('[_loadSettledBills] businessDate: ${data['businessDate']}')` の出力を確認（150行目）
   - `debugPrint('[_loadSettledBills] status: ${data['status']}')` の出力を確認（151行目）
   - `debugPrint('[_loadSettledBills] ops.accountingCompletedAt: ${data['ops']?['accountingCompletedAt']}')` の出力を確認（154行目）

4. **エラーの確認**:
   - `debugPrint('[_loadSettledBills] エラー: $e')` の出力を確認（183行目）

---

### ステップ2: Firestore Console でデータを確認

**確認箇所**: Firestore Console

1. **`bills` ドキュメントの確認**:
   - `bills/{billId}` を開く
   - `businessDate` フィールドの値を確認
   - `status` フィールドの値を確認（`'settled'` であることを確認）
   - `ops.accountingCompletedAt` フィールドの値を確認（存在することを確認）

2. **営業日の確認**:
   - 複数の `bills` ドキュメントの `businessDate` を確認
   - Dart アプリの `_getBusinessDate()` で計算した営業日と一致するか確認

---

### ステップ3: Cloud Functions のログを確認

**確認箇所**: Cloud Functions ログ

1. **`completeAccountingV2` の実行ログ**:
   ```bash
   firebase functions:log --only completeAccountingV2
   ```
   - `status` が `'settled'` に更新されているか確認
   - `ops.accountingCompletedAt` が設定されているか確認

2. **`billsOnSettle` トリガの実行ログ**:
   ```bash
   firebase functions:log --only billsOnSettle
   ```
   - トリガが発火しているか確認
   - `enqueueSettlement` が呼び出されているか確認（`ENABLE_SETTLEMENT_AGGREGATOR === 'true'` の場合）

---

### ステップ4: 環境変数の確認

**確認箇所**: Firebase Console / Google Cloud Console

1. **`ENABLE_SETTLEMENT_AGGREGATOR` 環境変数**:
   - Google Cloud Console → Cloud Functions → `billsOnSettle` → 「編集」
   - 「Runtime environment variables」セクションで `ENABLE_SETTLEMENT_AGGREGATOR` が `'true'` に設定されているか確認

---

## よくある問題と解決方法

### 問題1: クエリ結果が0件になる

**原因**: `businessDate` または `status` が一致しない

**解決方法**:
1. Firestore Console で `bills` ドキュメントの `businessDate` と `status` を確認
2. Dart アプリの `_getBusinessDate()` で計算した営業日と比較
3. 必要に応じて `businessDate` を修正

---

### 問題2: クエリエラーが発生する

**原因**: Firestore インデックスが不足している

**解決方法**:
1. Firestore Console の「インデックス」タブでインデックスの状態を確認
2. `firestore.indexes.json` に以下のインデックスを追加:
   ```json
   {
     "collectionGroup": "bills",
     "queryScope": "COLLECTION",
     "fields": [
       {
         "fieldPath": "businessDate",
         "order": "ASCENDING"
       },
       {
         "fieldPath": "status",
         "order": "ASCENDING"
       },
       {
         "fieldPath": "ops.accountingCompletedAt",
         "order": "DESCENDING"
       }
     ]
   }
   ```
3. インデックスをデプロイ: `firebase deploy --only firestore:indexes`

---

### 問題3: `ops.accountingCompletedAt` が設定されていない

**原因**: `completeAccountingV2` が `ops.accountingCompletedAt` を更新していない

**解決方法**:
1. Cloud Functions のログで `completeAccountingV2` の実行結果を確認
2. `functions/src/callables/accounting.ts` の `completeAccountingV2` を確認（550行目）:
   ```typescript
   'ops.accountingCompletedAt': admin.firestore.FieldValue.serverTimestamp(),
   ```

---

### 問題4: `analyticsMonthly` が更新されない

**原因**: `ENABLE_SETTLEMENT_AGGREGATOR` が `'true'` に設定されていない、または `enqueueSettlement` が失敗している

**解決方法**:
1. `ENABLE_SETTLEMENT_AGGREGATOR` 環境変数を `'true'` に設定
2. Cloud Functions のログで `billsOnSettle` → `enqueueSettlement` の実行ログを確認
3. `processBillAnalyticsAtomically` の実行ログを確認

---

## 確認すべきログの優先順位

### 最優先（まず確認すべき）

1. **Dart アプリのログ**:
   - `[_loadSettledBills] 検索営業日: YYYY-MM-DD`
   - `[_loadSettledBills] 取得件数: N`
   - `[_loadSettledBills] エラー: ...`

2. **Firestore Console**:
   - `bills/{billId}` の `businessDate` フィールド
   - `bills/{billId}` の `status` フィールド
   - `bills/{billId}` の `ops.accountingCompletedAt` フィールド

---

### 次に確認（問題が特定できない場合）

3. **Cloud Functions ログ**:
   - `completeAccountingV2` の実行ログ
   - `billsOnSettle` トリガの実行ログ

4. **環境変数**:
   - `ENABLE_SETTLEMENT_AGGREGATOR` の設定値

---

## ログの見方

### Dart アプリのログ（Flutter DevTools / コンソール）

```
[_loadSettledBills] 検索営業日: 2025-01-15
[_loadSettledBills] 取得件数: 0  // ← 0件の場合は、businessDate または status が一致していない可能性
[_loadSettledBills] エラー: ...  // ← エラーがある場合は、インデックス不足の可能性
```

### Cloud Functions ログ

```bash
# completeAccountingV2 の実行ログ
firebase functions:log --only completeAccountingV2

# billsOnSettle トリガの実行ログ
firebase functions:log --only billsOnSettle
```

### Firestore Console

1. **データ確認**:
   - 「データ」タブ → `bills` コレクション → `{billId}` を開く
   - `businessDate`, `status`, `ops.accountingCompletedAt` を確認

2. **インデックス確認**:
   - 「インデックス」タブ → 「複合」タブ
   - `businessDate + status + ops.accountingCompletedAt` のインデックスを確認

---

## 次のステップ

上記の確認を行っても問題が解決しない場合は、以下を実施してください：

1. 具体的なエラーメッセージを共有
2. Dart アプリのログ（`debugPrint` の出力）を共有
3. Firestore Console の `bills` ドキュメントの内容を共有（個人情報は除く）
4. Cloud Functions のログを共有
