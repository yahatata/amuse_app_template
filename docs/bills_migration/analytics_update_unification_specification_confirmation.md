# Analytics Monthly 更新仕様の確認

_作成日: 2025-12-20 (JST)_

## ユーザー質問

> この設計に変更することで、billsは会計完了とともにanalyticsMonthlyに蓄積され取りこぼしのみをmigrateSettledBillsForBusinessDay.tsにて拾える仕様になりますか？

## 回答: **はい、この設計で仕様が満たされます** ✅

ただし、以下の前提条件と注意点があります。

---

## 1. 会計完了と同時に蓄積される仕組み

### 1.1 トリガーの発火条件

**`bills.onSettle` トリガ**（`functions/src/triggers/bills.onSettle.ts`）:
```typescript
export const billsOnSettle = onDocumentUpdated('bills/{billId}', async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();
  
  // before.status !== 'settled' && after.status === 'settled' の場合に発火
  if (beforeData.status !== 'settled' && afterData.status === 'settled') {
    // ... snapshot 更新 ...
    
    // enqueueSettlement を環境変数で制御
    if (process.env.ENABLE_SETTLEMENT_AGGREGATOR === 'true') {
      const { enqueueSettlement } = await import('../analytics/aggregator');
      await enqueueSettlement(billDoc);  // ✅ 会計完了時に即座に呼び出される
    }
  }
});
```

**確認ポイント**:
- ✅ `bills` ドキュメントの `status` が `settled` になったタイミングで発火
- ✅ `ENABLE_SETTLEMENT_AGGREGATOR === 'true'` の場合、`enqueueSettlement` が呼び出される
- ✅ 会計完了と同時に `analyticsMonthly` を更新する

### 1.2 `enqueueSettlement` の処理（設計変更後）

**変更後の `enqueueSettlement`**:
```typescript
export async function enqueueSettlement(bill: BillDoc): Promise<void> {
  const businessDate = bill.businessDate;
  const monthKey = businessDate.substring(0, 7);
  const db = getFirestore();

  // 共通関数で旧スキーマ更新（トランザクション内で marker チェック・作成）
  const { processBillAnalyticsAtomically } = await import('../updateAnalyticsForBill');
  await processBillAnalyticsAtomically(db, {
    month: monthKey,
    businessDate,
    billId: bill.billId,
    billData: bill,
  });
}
```

**確認ポイント**:
- ✅ `processBillAnalyticsAtomically` を呼び出すだけの薄い実装
- ✅ トランザクション内で `analyticsMonthly` を更新
- ✅ トランザクション内で marker を作成（欠損防止）

### 1.3 結論: 会計完了と同時に蓄積される ✅

**フロー**:
1. 会計完了 → `bills.status` が `settled` に変更
2. `bills.onSettle` トリガが発火
3. `enqueueSettlement` が呼び出される（`ENABLE_SETTLEMENT_AGGREGATOR === 'true'` の場合）
4. `processBillAnalyticsAtomically` が実行され、`analyticsMonthly` を更新
5. marker が作成される（トランザクション内）

**結果**: ✅ **会計完了と同時に `analyticsMonthly` に蓄積される**

---

## 2. 取りこぼしを拾える仕組み

### 2.1 `migrateSettledBillsForBusinessDay` の処理（設計変更後）

**変更後の `migrateSettledBillsForBusinessDay`**:
```typescript
// 前営業日の bills をクエリで取得
const billsQuery = await db.collection('bills')
  .where('status', '==', 'settled')
  .where('businessDate', '==', businessDate)
  .get();

for (const billDoc of billsQuery.docs) {
  const billId = billDoc.id;
  const billData = billDoc.data();

  // オプション: 早期スキップ（パフォーマンス向上）
  const markerRef = db.collection('analyticsMonthly').doc(month)
    .collection('aggregationMarkers').doc(billId);
  const markerDoc = await markerRef.get();
  if (markerDoc.exists) {
    skippedCount++;
    continue;  // ✅ 既に処理済み（enqueueSettlement で更新済み）→ スキップ
  }

  // 共通関数で analytics 更新
  await processBillAnalyticsAtomically(db, {
    month,
    businessDate,
    billId,
    billData,
  });  // ✅ marker が存在しない（取りこぼし）場合のみ更新
}
```

**確認ポイント**:
- ✅ 前営業日の `bills` をクエリで取得
- ✅ marker が存在する場合（`enqueueSettlement` で更新済み）はスキップ
- ✅ marker が存在しない場合（取りこぼし）のみ `processBillAnalyticsAtomically` を実行

### 2.2 `processBillAnalyticsAtomically` 内の marker チェック

**`processBillAnalyticsAtomically` の処理**:
```typescript
await db.runTransaction(async (tx) => {
  // 1. marker チェック（存在するなら早期 return）
  const markerDoc = await tx.get(markerRef);
  if (markerDoc.exists) {
    return;  // ✅ 既に処理済み → no-op（二重計上を防止）
  }

  // 2. analytics 更新
  await addToMonthlyIndex(...);
  // ...

  // 3. marker 作成（トランザクション内で必ず実施）
  tx.set(markerRef, {...});
});
```

**確認ポイント**:
- ✅ トランザクション内で marker をチェック
- ✅ marker が存在する場合、早期 return（二重計上を防止）
- ✅ marker が存在しない場合のみ、analytics を更新して marker を作成

### 2.3 結論: 取りこぼしを拾える ✅

**フロー**:
1. 夜間バッチ（`migrateSettledBillsForBusinessDay`）が前営業日の `bills` をクエリで取得
2. 各 `billId` について marker をチェック
3. **marker が存在する場合**（`enqueueSettlement` で更新済み）:
   - スキップ（早期スキップ）または `processBillAnalyticsAtomically` 内で早期 return
4. **marker が存在しない場合**（取りこぼし）:
   - `processBillAnalyticsAtomically` が実行され、`analyticsMonthly` を更新
   - marker が作成される

**結果**: ✅ **取りこぼしを拾える**

---

## 3. 前提条件と注意点

### 3.1 前提条件

1. **`ENABLE_SETTLEMENT_AGGREGATOR === 'true'` が設定されていること**
   - 環境変数が `'true'` でない場合、`enqueueSettlement` が呼び出されない
   - この場合、全ての `bills` が `migrateSettledBillsForBusinessDay` で処理される

2. **`bills.onSettle` トリガが正常に動作していること**
   - トリガのエラーは再スローされないため、失敗時は手動で再処理が必要

### 3.2 注意点

1. **トリガのエラー処理**
   ```typescript
   catch (error) {
     logger.error('billsOnSettle failed', {...});
     // ⚠️ トリガのエラーは再スローしない（Firestore の仕様）
     // エラーはログに記録し、必要に応じて手動で再処理する
   }
   ```
   - `bills.onSettle` が失敗した場合、`enqueueSettlement` が呼び出されない
   - この場合、夜間バッチ（`migrateSettledBillsForBusinessDay`）で拾う必要がある

2. **取りこぼしの発生タイミング**
   - `ENABLE_SETTLEMENT_AGGREGATOR === 'false'` の場合、全てが取りこぼしになる
   - `bills.onSettle` が失敗した場合、その `billId` が取りこぼしになる
   - `processBillAnalyticsAtomically` が失敗した場合（再試行が失敗した場合）、取りこぼしになる

3. **夜間バッチの実行タイミング**
   - `migrateSettledBillsForBusinessDay` は夜間バッチで実行される（手動実行も可能）
   - 前営業日の `bills` を処理するため、会計完了から最大で約24時間後まで遅延する可能性がある

---

## 4. 仕様のまとめ

### 4.1 正常ケース

1. **会計完了時**:
   - `bills.onSettle` トリガが発火
   - `enqueueSettlement` が呼び出される
   - `processBillAnalyticsAtomically` が実行され、`analyticsMonthly` を更新
   - marker が作成される

2. **夜間バッチ実行時**:
   - `migrateSettledBillsForBusinessDay` が前営業日の `bills` をクエリで取得
   - marker が存在する場合（`enqueueSettlement` で更新済み）はスキップ
   - marker が存在しない場合（取りこぼし）のみ更新

### 4.2 異常ケース（取りこぼし）

1. **`ENABLE_SETTLEMENT_AGGREGATOR === 'false'` の場合**:
   - `enqueueSettlement` が呼び出されない
   - 全ての `bills` が夜間バッチで処理される（取りこぼし扱い）

2. **`bills.onSettle` が失敗した場合**:
   - `enqueueSettlement` が呼び出されない
   - 該当の `billId` が夜間バッチで処理される（取りこぼし扱い）

3. **`processBillAnalyticsAtomically` が失敗した場合**:
   - Cloud Functions の再試行が失敗した場合、取りこぼしになる
   - 夜間バッチで処理される（取りこぼし扱い）

---

## 5. 結論

### ✅ 仕様は満たされます

1. **会計完了と同時に蓄積される**: ✅
   - `bills.onSettle` トリガから `enqueueSettlement` が呼び出される
   - `processBillAnalyticsAtomically` が実行され、`analyticsMonthly` を更新
   - marker が作成される（トランザクション内）

2. **取りこぼしを拾える**: ✅
   - 夜間バッチ（`migrateSettledBillsForBusinessDay`）が前営業日の `bills` をクエリで取得
   - marker が存在しない場合（取りこぼし）のみ更新
   - marker が存在する場合（`enqueueSettlement` で更新済み）はスキップ（二重計上を防止）

### ⚠️ 前提条件

- `ENABLE_SETTLEMENT_AGGREGATOR === 'true'` が設定されていること
- `bills.onSettle` トリガが正常に動作していること

### ⚠️ 注意点

- `bills.onSettle` が失敗した場合、手動で再処理が必要（または夜間バッチで拾う）
- 夜間バッチの実行タイミングにより、取りこぼしの処理が最大で約24時間遅延する可能性がある

---

## 6. 補足: marker の役割

**marker（`aggregationMarkers/{billId}`）の役割**:
- ✅ 処理済みであることを記録（二重計上を防止）
- ✅ トランザクション内で作成されるため、欠損防止
- ✅ `enqueueSettlement` と `migrateSettledBillsForBusinessDay` の両方で参照される

**marker の存在チェック**:
- `enqueueSettlement` → `processBillAnalyticsAtomically` 内でチェック（トランザクション内）
- `migrateSettledBillsForBusinessDay` → トランザクション外で早期スキップ、トランザクション内で再チェック

**結果**: marker により、二重計上と欠損の両方を防止できる ✅
