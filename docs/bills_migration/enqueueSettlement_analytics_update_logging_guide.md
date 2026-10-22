# enqueueSettlement による analyticsMonthly 更新確認ガイド

_作成日: 2025-12-20 (JST)_

## 概要

`enqueueSettlement` によって `analyticsMonthly` がどのように更新されたかを確認する方法をまとめます。
コード修正なしで確認可能です。

---

## 確認するログ（優先順位順）

### 1. Cloud Functions ログ（最優先）

#### `billsOnSettle` トリガのログ

**実行コマンド**:
```bash
firebase functions:log --only billsOnSettle
```

**確認すべきログ**:

1. **トリガの発火確認**:
   ```
   billsOnSettle triggered {
     billId: "aaf56292-6a84-4d9b-97f9-da0fdfab08ce",
     beforeStatus: "settling",
     afterStatus: "settled"
   }
   ```

2. **スナップショット更新確認**:
   ```
   billsOnSettle: snapshot updated {
     billId: "aaf56292-6a84-4d9b-97f9-da0fdfab08ce",
     contentHash: "abc12345"
   }
   ```

3. **`enqueueSettlement` 実行確認**:
   ```
   Settlement aggregated: aaf56292-6a84-4d9b-97f9-da0fdfab08ce, month: 2026-01
   ```
   **注意**: このログは `enqueueSettlement` 関数内の `console.log` で出力されます（38行目）

4. **エラー確認**:
   ```
   billsOnSettle failed {
     billId: "aaf56292-6a84-4d9b-97f9-da0fdfab08ce",
     code: "エラーメッセージ"
   }
   ```

---

#### `ENABLE_SETTLEMENT_AGGREGATOR` 環境変数の確認

**確認方法**:
```bash
# Google Cloud Console で確認
# または
firebase functions:config:get
```

**確認内容**:
- `ENABLE_SETTLEMENT_AGGREGATOR` が `'true'` に設定されているか
- `'false'` の場合、`enqueueSettlement` は実行されない

**ログでの確認**:
- `billsOnSettle` のログで `enqueueSettlement` が実行されていない場合、環境変数が `'false'` の可能性がある
- `billsOnSettle: snapshot updated` のログはあるが、`Settlement aggregated` のログがない場合、環境変数が `'false'` の可能性がある

---

### 2. Firestore Console での直接確認

#### `analyticsMonthly` コレクションの確認

**確認箇所**:
- `analyticsMonthly/{month}` ドキュメント（例: `analyticsMonthly/2026-01`）
- `analyticsMonthly/{month}/days/{businessDate}` ドキュメント（例: `analyticsMonthly/2026-01/days/2026-01-19`）
- `analyticsMonthly/{month}/byCategory/summary` ドキュメント
- `analyticsMonthly/{month}/byUser/{userId}` ドキュメント（該当する場合）
- `analyticsMonthly/{month}/byTemplateTournaments/{templateId}` ドキュメント（該当する場合）

**確認内容**:
1. **更新前後の値の変化**:
   - `grossSales`, `itemsSales`, `orderCount` などの値が増加しているか
   - `dailySales.{businessDate}` が更新されているか
   - `byPaymentMethod` の値が更新されているか

2. **更新タイムスタンプ**:
   - `updatedAt` フィールドが最近更新されているか

---

#### `aggregationMarkers` サブコレクションの確認

**確認箇所**:
- `analyticsMonthly/{month}/aggregationMarkers/{billId}` ドキュメント

**確認内容**:
1. **マーカーの存在確認**:
   - `billId` に対応するマーカーが存在するか
   - `processedAt` フィールドが設定されているか

2. **重複処理の確認**:
   - マーカーが存在する場合、`enqueueSettlement` はスキップされる（`processBillAnalyticsAtomically` 内で早期 return）

**注意**: マーカーが存在しない場合、`enqueueSettlement` が実行されていない、または処理が失敗している可能性がある

---

### 3. Google Cloud Console でのログ確認

**確認方法**:
1. Google Cloud Console → 「ログ」→ 「Cloud Functions」
2. 関数名: `billsOnSettle` でフィルタ
3. 時間範囲を指定してログを検索

**確認すべきログ**:
- `billsOnSettle triggered` のログ
- `billsOnSettle: snapshot updated` のログ
- `Settlement aggregated` のログ（`enqueueSettlement` の実行ログ）
- `billsOnSettle failed` のログ（エラーがある場合）

---

## ログの見方

### 正常な実行フロー

1. **トリガの発火**:
   ```
   billsOnSettle triggered {
     billId: "aaf56292-6a84-4d9b-97f9-da0fdfab08ce",
     beforeStatus: "settling",
     afterStatus: "settled"
   }
   ```

2. **スナップショット更新**:
   ```
   billsOnSettle: snapshot updated {
     billId: "aaf56292-6a84-4d9b-97f9-da0fdfab08ce",
     contentHash: "abc12345"
   }
   ```

3. **`enqueueSettlement` 実行**（`ENABLE_SETTLEMENT_AGGREGATOR === 'true'` の場合）:
   ```
   Settlement aggregated: aaf56292-6a84-4d9b-97f9-da0fdfab08ce, month: 2026-01
   ```

4. **`analyticsMonthly` 更新確認**（Firestore Console）:
   - `analyticsMonthly/2026-01` の `grossSales`, `orderCount` が増加
   - `analyticsMonthly/2026-01/days/2026-01-19` が更新
   - `analyticsMonthly/2026-01/aggregationMarkers/aaf56292-6a84-4d9b-97f9-da0fdfab08ce` が作成

---

### 異常な実行フロー

#### ケース1: `ENABLE_SETTLEMENT_AGGREGATOR === 'false'`

**ログ**:
- `billsOnSettle triggered` ✅
- `billsOnSettle: snapshot updated` ✅
- `Settlement aggregated` ❌（出力されない）

**対応**:
- `ENABLE_SETTLEMENT_AGGREGATOR` を `'true'` に設定

---

#### ケース2: `enqueueSettlement` が失敗している

**ログ**:
- `billsOnSettle triggered` ✅
- `billsOnSettle: snapshot updated` ✅
- `Settlement aggregated` ❌（出力されない）
- `billsOnSettle failed` ✅（エラーログが出力される）

**対応**:
- エラーログを確認し、原因を特定
- `processBillAnalyticsAtomically` 内のトランザクションエラーの可能性

---

#### ケース3: マーカーが既に存在する（重複処理のスキップ）

**ログ**:
- `billsOnSettle triggered` ✅
- `billsOnSettle: snapshot updated` ✅
- `Settlement aggregated` ✅（出力されるが、`processBillAnalyticsAtomically` 内で早期 return）

**Firestore Console**:
- `analyticsMonthly/{month}/aggregationMarkers/{billId}` が既に存在
- `analyticsMonthly` の値は変更されない（既に処理済みのため）

**注意**: これは正常な動作です（冪等性の保証）

---

## 確認手順（推奨）

### ステップ1: 環境変数の確認

```bash
# Google Cloud Console で確認
# または
firebase functions:config:get
```

- `ENABLE_SETTLEMENT_AGGREGATOR` が `'true'` に設定されているか確認

---

### ステップ2: Cloud Functions ログの確認

```bash
firebase functions:log --only billsOnSettle
```

**確認内容**:
1. `billsOnSettle triggered` のログが出力されているか
2. `billsOnSettle: snapshot updated` のログが出力されているか
3. `Settlement aggregated` のログが出力されているか
4. `billsOnSettle failed` のログがないか

---

### ステップ3: Firestore Console での確認

1. **`bills` コレクション**:
   - `bills/{billId}` の `status` が `'settled'` であることを確認

2. **`analyticsMonthly` コレクション**:
   - `analyticsMonthly/{month}` の `grossSales`, `orderCount` が更新されているか確認
   - `analyticsMonthly/{month}/days/{businessDate}` が更新されているか確認

3. **`aggregationMarkers` サブコレクション**:
   - `analyticsMonthly/{month}/aggregationMarkers/{billId}` が存在するか確認
   - `processedAt` フィールドが設定されているか確認

---

## 現在のログ出力箇所（コード修正なしで確認可能）

### 1. `billsOnSettle` トリガ（`functions/src/triggers/bills.onSettle.ts`）

**ログ出力箇所**:
- **65行目**: `logger.info('billsOnSettle triggered', { billId, beforeStatus, afterStatus })`
- **135行目**: `logger.info('billsOnSettle: contentHash matches, skipping update', { billId, contentHash })`
- **170行目**: `logger.info('billsOnSettle: snapshot updated', { billId, contentHash })`
- **201行目**: `logger.error('billsOnSettle failed', { billId, code })`

**確認方法**:
```bash
firebase functions:log --only billsOnSettle
```

---

### 2. `enqueueSettlement` 関数（`functions/src/analytics/aggregator/index.ts`）

**ログ出力箇所**:
- **31行目**: `logger.info('enqueueSettlement: starting analytics update', { billId, month, businessDate })`
- **43行目**: `logger.info('enqueueSettlement: analytics update completed', { billId, month, businessDate })`

**確認方法**:
```bash
firebase functions:log --only billsOnSettle
# または
# Google Cloud Console → ログ → Cloud Functions → billsOnSettle
```

**ログ内容**:
- analytics 更新開始のログ（`billId`, `month`, `businessDate`）
- analytics 更新完了のログ（`billId`, `month`, `businessDate`）

**注意**: `enqueueSettlement` のログは `billsOnSettle` トリガのログに含まれるため、`billsOnSettle` のログを確認すれば `enqueueSettlement` の実行ログも確認できます

---

### 3. `processBillAnalyticsAtomically` 関数（`functions/src/analytics/updateAnalyticsForBill.ts`）

**ログ出力箇所**:
- **68行目**: `logger.info('processBillAnalyticsAtomically: marker already exists, skipping', { billId, month, businessDate, markerPath })`
- **73行目**: `logger.info('processBillAnalyticsAtomically: starting analytics update', { billId, month, businessDate })`
- **114行目**: `logger.info('processBillAnalyticsAtomically: marker created', { billId, month, businessDate, markerPath })`
- **118行目**: `logger.info('processBillAnalyticsAtomically: analytics update completed', { billId, month, businessDate })`

**確認方法**:
```bash
firebase functions:log --only billsOnSettle
# または
firebase functions:log --only migrateSettledBillsForBusinessDay
```

**ログ内容**:
- marker が既に存在する場合（重複処理のスキップ）のログ
- analytics 更新開始のログ
- marker 作成のログ
- analytics 更新完了のログ

---

### 4. `addTo*` 関数（`functions/src/analytics/addTo*.ts`）

**ログ出力箇所**:
- **`addToMonthlyIndex`** (69行目): `logger.info('addToMonthlyIndex: updating analyticsMonthly', { collection, documentId, isNewDocument, updatedFields })`
- **`addToDailySummary`** (65行目): `logger.info('addToDailySummary: updating analyticsMonthly days', { collection, subcollection, documentId, isNewDocument, updatedFields })`
- **`addToByCategory`** (83行目): `logger.info('addToByCategory: updating analyticsMonthly byCategory', { collection, subcollection, documentId, isNewDocument, updatedFields })`
- **`addToByUser`** (82行目): `logger.info('addToByUser: updating analyticsMonthly byUser', { collection, subcollection, documentId, userId, pokerName, isNewDocument, updatedFields })`
- **`addToByTemplateTournaments`** (113行目): `logger.info('addToByTemplateTournaments: updating analyticsMonthly byTemplateTournaments', { collection, subcollection, documentId, templateKey, templateName, isNewDocument, updatedFields })`

**確認方法**:
```bash
firebase functions:log --only billsOnSettle
# または
firebase functions:log --only migrateSettledBillsForBusinessDay
```

**ログ内容**:
各関数で更新されるコレクション（サブコレクション）、ドキュメントID、更新フィールドの詳細（increment値など）が出力されます。

**ログ出力例**:
```json
{
  "severity": "INFO",
  "message": "addToMonthlyIndex: updating analyticsMonthly",
  "collection": "analyticsMonthly",
  "documentId": "2026-01",
  "isNewDocument": false,
  "updatedFields": {
    "itemsSales": "increment(1000)",
    "grossSales": "increment(5000)",
    "orderCount": "increment(1)",
    "dailySales.2026-01-19": "increment(5000)",
    "paymentTotals": {
      "cash": "increment(3000)",
      "credit_card": "increment(2000)"
    }
  }
}
```

---

## ログ出力の詳細（コード修正済み）

### 1. `processBillAnalyticsAtomically` の詳細な実行ログ

**現在の状態**:
- ✅ ログ出力あり

**確認できる項目**:
- marker のチェック結果（既に処理済みかどうか）
- analytics 更新開始/完了のログ
- marker 作成のログ

**ログ出力例**:
```json
{
  "severity": "INFO",
  "message": "processBillAnalyticsAtomically: starting analytics update",
  "billId": "aaf56292-6a84-4d9b-97f9-da0fdfab08ce",
  "month": "2026-01",
  "businessDate": "2026-01-19"
}
```

---

### 2. `addTo*` 関数の詳細な実行ログ

**現在の状態**:
- ✅ ログ出力あり

**確認できる項目**:
- 各関数の実行結果
- 更新されたフィールドの詳細（increment値など）
- コレクション（サブコレクション）とドキュメントID
- 新規ドキュメント作成かどうか

**ログ出力例**:
```json
{
  "severity": "INFO",
  "message": "addToMonthlyIndex: updating analyticsMonthly",
  "collection": "analyticsMonthly",
  "documentId": "2026-01",
  "isNewDocument": false,
  "updatedFields": {
    "itemsSales": "increment(1000)",
    "grossSales": "increment(5000)",
    "orderCount": "increment(1)",
    "dailySales.2026-01-19": "increment(5000)",
    "paymentTotals": {
      "cash": "increment(3000)",
      "credit_card": "increment(2000)"
    },
    "updatedAt": "serverTimestamp()"
  }
}
```

---

## まとめ

### 確認可能な項目（コード修正済み）

1. **`billsOnSettle` トリガの発火**: Cloud Functions ログ
2. **`enqueueSettlement` の実行**: Cloud Functions ログ（`enqueueSettlement: starting analytics update` / `enqueueSettlement: analytics update completed`）
3. **`processBillAnalyticsAtomically` の実行**: Cloud Functions ログ（`processBillAnalyticsAtomically: starting analytics update` / `processBillAnalyticsAtomically: analytics update completed`）
4. **`addTo*` 関数の実行**: Cloud Functions ログ（各関数の更新内容詳細）
5. **`analyticsMonthly` の更新**: ログで更新内容を確認（どのコレクション・フィールドがどのように更新されたか）
6. **`aggregationMarkers` の作成**: Cloud Functions ログ（`processBillAnalyticsAtomically: marker created`）
7. **環境変数の設定**: Google Cloud Console または `firebase functions:config:get`

---

### ログ出力の詳細

すべてのログは Google Cloud Console の Cloud Functions ログで確認できます。

**ログ出力される内容**:
- コレクション（サブコレクション）名
- ドキュメントID
- 更新されるフィールドと値（increment値など）
- 新規ドキュメント作成かどうか
- marker の作成/スキップ情報

**ログの確認方法**:
```bash
firebase functions:log --only billsOnSettle
firebase functions:log --only migrateSettledBillsForBusinessDay
```

---

## 推奨される確認方法

### 1. まず確認（最優先）

1. **環境変数の確認**:
   - `ENABLE_SETTLEMENT_AGGREGATOR` が `'true'` に設定されているか

2. **Cloud Functions ログの確認**:
   ```bash
   firebase functions:log --only billsOnSettle
   ```
   - `billsOnSettle triggered` のログ
   - `Settlement aggregated` のログ（`enqueueSettlement` の実行ログ）

3. **Firestore Console での確認**:
   - `analyticsMonthly/{month}` の更新
   - `analyticsMonthly/{month}/aggregationMarkers/{billId}` の存在

---

### 2. 次に確認（詳細な確認）

4. **`analyticsMonthly` の更新内容**:
   - `grossSales`, `orderCount` などの値の変化
   - `dailySales.{businessDate}` の更新
   - `byPaymentMethod` の更新

5. **エラーログの確認**:
   - `billsOnSettle failed` のログがないか

---

## 次のステップ

詳細なログを確認したい場合は、以下のコード修正が必要です：

1. **`processBillAnalyticsAtomically` にログ追加**:
   - marker のチェック結果
   - トランザクションの成功/失敗
   - 各 `addTo*` 関数の実行結果

2. **`addTo*` 関数にログ追加**:
   - 各関数の実行結果
   - 更新された値の詳細

ただし、現在のログ出力でも、`enqueueSettlement` の実行は確認でき、`analyticsMonthly` の更新も Firestore Console で確認できます。
