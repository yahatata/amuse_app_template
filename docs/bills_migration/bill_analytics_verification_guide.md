# Bill Analytics 蓄積確認ガイド

_作成日: 2025-12-20 (JST)_

## 対象 Bill データ

- **billId**: `7553e1da-5bc9-47d5-80b6-1857b44f8a1b`
- **businessDate**: `2026-01-20`
- **status**: `settled`
- **closedAt**: `2026年1月20日 10:34:09 UTC+9`

## 期待される更新内容

### 1. `analyticsMonthly/2026-01` の更新

**更新フィールド**:
- `itemsSales`: `increment(1000)`
- `sideGameChipSales`: `increment(5000)`
- `extraCostSales`: `increment(1000)`
- `tournamentsSales`: `increment(6000)`
- `grossSales`: `increment(13000)` (1000 + 5000 + 1000 + 6000)
- `orderCount`: `increment(1)`
- `dailySales.2026-01-20`: `increment(13000)`
- `paymentTotals.cash`: `increment(8000)`
- `paymentTotals.pointA`: `increment(4000)`
- `paymentTotals.sideGameChip`: `increment(1000)`
- `updatedAt`: `serverTimestamp()`

---

### 2. `analyticsMonthly/2026-01/days/2026-01-20` の更新

**更新フィールド**:
- `itemsSales`: `increment(1000)`
- `sideGameChipSales`: `increment(5000)`
- `extraCostSales`: `increment(1000)`
- `tournamentsSales`: `increment(6000)`
- `grossSales`: `increment(13000)`
- `orderCount`: `increment(1)`
- `byCategory.items`: `increment(1000)`
- `byCategory.extraCost`: `increment(1000)`
- `byCategory.sideGameChip`: `increment(5000)`
- `byCategory.tournaments`: `increment(6000)`
- `byPaymentMethod.cash`: `increment(8000)`
- `byPaymentMethod.pointA`: `increment(4000)`
- `byPaymentMethod.sideGameChip`: `increment(1000)`
- `updatedAt`: `serverTimestamp()`

---

### 3. `analyticsMonthly/2026-01/byCategory/summary` の更新

**更新フィールド**:
- `totals.items`: `increment(1000)`
- `totals.extraCost`: `increment(1000)`
- `totals.sideGameChip`: `increment(5000)`
- `totals.tournaments`: `increment(6000)`
- `orderCounts.items`: `increment(1)`
- `orderCounts.extraCost`: `increment(1)`
- `orderCounts.sideGameChip`: `increment(1)`
- `orderCounts.tournaments`: `increment(1)`
- `itemSales.s5zd9X7t5jePPBeDeUH4.qty`: `increment(1)`
- `itemSales.s5zd9X7t5jePPBeDeUH4.sales`: `increment(1000)`
- `itemSales.s5zd9X7t5jePPBeDeUH4.name`: `"ピザ"`
- `itemSales.s5zd9X7t5jePPBeDeUH4.category`: `"フード"`
- `updatedAt`: `serverTimestamp()`

---

### 4. `analyticsMonthly/2026-01/byUser/jxxltCr1PoShWJQeSB0F8TYGjlw1` の更新

**更新フィールド**:
- `grossSales`: `increment(13000)`
- `itemsSales`: `increment(1000)`
- `extraCostSales`: `increment(1000)`
- `sideGameChipSales`: `increment(5000)`
- `tournamentsSales`: `increment(6000)`
- `orderCount`: `increment(1)`
- `dailySales.2026-01-20`: `increment(13000)`
- `paymentTotals.cash`: `increment(8000)`
- `paymentTotals.pointA`: `increment(4000)`
- `paymentTotals.sideGameChip`: `increment(1000)`
- `pokerName`: `"やはた"`（値があるため更新）
- `updatedAt`: `serverTimestamp()`

---

### 5. `analyticsMonthly/2026-01/byTemplateTournaments/elSrtZZ7JTrshytJuMv2` の更新

**更新フィールド**:
- `templateName`: （tournamentsSnapshotから取得）
- `daily.2026-01-20.entryCount`: `increment(1)`
- `daily.2026-01-20.entrySales`: `increment(2000)`
- `daily.2026-01-20.reentryCount`: `increment(1)`
- `daily.2026-01-20.reentrySales`: `increment(2000)`
- `daily.2026-01-20.addonCount`: `increment(1)`
- `daily.2026-01-20.addonSales`: `increment(2000)`
- `daily.2026-01-20.totalTournamentSales`: `increment(6000)` (2000 + 2000 + 2000)
- `totals.entryCount`: `increment(1)`
- `totals.entrySales`: `increment(2000)`
- `totals.reentryCount`: `increment(1)`
- `totals.reentrySales`: `increment(2000)`
- `totals.addonCount`: `increment(1)`
- `totals.addonSales`: `increment(2000)`
- `totals.totalTournamentSales`: `increment(6000)`
- `updatedAt`: `serverTimestamp()`

---

### 6. `analyticsMonthly/2026-01/aggregationMarkers/7553e1da-5bc9-47d5-80b6-1857b44f8a1b` の作成

**フィールド**:
- `billId`: `"7553e1da-5bc9-47d5-80b6-1857b44f8a1b"`
- `businessDate`: `"2026-01-20"`
- `processedAt`: `serverTimestamp()`

---

## ログ確認方法

### 1. Cloud Functions ログで確認

```bash
# billsOnSettle トリガのログ（billId でフィルタ）
firebase functions:log --only billsOnSettle | grep "7553e1da-5bc9-47d5-80b6-1857b44f8a1b"

# または、Google Cloud Console で検索
# 検索クエリ: jsonPayload.billId="7553e1da-5bc9-47d5-80b6-1857b44f8a1b"
```

### 2. 確認すべきログ

#### `billsOnSettle` トリガの発火確認
```json
{
  "severity": "INFO",
  "message": "billsOnSettle triggered",
  "billId": "7553e1da-5bc9-47d5-80b6-1857b44f8a1b",
  "beforeStatus": "...",
  "afterStatus": "settled"
}
```

#### `enqueueSettlement` の実行確認
```json
{
  "severity": "INFO",
  "message": "enqueueSettlement: starting analytics update",
  "billId": "7553e1da-5bc9-47d5-80b6-1857b44f8a1b",
  "month": "2026-01",
  "businessDate": "2026-01-20"
}
```

#### `processBillAnalyticsAtomically` の実行確認
```json
{
  "severity": "INFO",
  "message": "processBillAnalyticsAtomically: starting analytics update",
  "billId": "7553e1da-5bc9-47d5-80b6-1857b44f8a1b",
  "month": "2026-01",
  "businessDate": "2026-01-20"
}
```

#### `addToMonthlyIndex` の更新内容確認
```json
{
  "severity": "INFO",
  "message": "addToMonthlyIndex: updating analyticsMonthly",
  "collection": "analyticsMonthly",
  "documentId": "2026-01",
  "isNewDocument": false,
  "updatedFields": {
    "itemsSales": "increment(1000)",
    "sideGameChipSales": "increment(5000)",
    "extraCostSales": "increment(1000)",
    "tournamentsSales": "increment(6000)",
    "grossSales": "increment(13000)",
    "orderCount": "increment(1)",
    "dailySales.2026-01-20": "increment(13000)",
    "paymentTotals": {
      "cash": "increment(8000)",
      "pointA": "increment(4000)",
      "sideGameChip": "increment(1000)"
    },
    "updatedAt": "serverTimestamp()"
  }
}
```

#### `addToDailySummary` の更新内容確認
```json
{
  "severity": "INFO",
  "message": "addToDailySummary: updating analyticsMonthly days",
  "collection": "analyticsMonthly",
  "subcollection": "days",
  "documentId": "2026-01/2026-01-20",
  "isNewDocument": false,
  "updatedFields": {
    "itemsSales": "increment(1000)",
    "sideGameChipSales": "increment(5000)",
    "extraCostSales": "increment(1000)",
    "tournamentsSales": "increment(6000)",
    "grossSales": "increment(13000)",
    "orderCount": "increment(1)",
    "byCategory": {
      "byCategory.items": "increment(1000)",
      "byCategory.extraCost": "increment(1000)",
      "byCategory.sideGameChip": "increment(5000)",
      "byCategory.tournaments": "increment(6000)"
    },
    "byPaymentMethod": {
      "byPaymentMethod.cash": "increment(8000)",
      "byPaymentMethod.pointA": "increment(4000)",
      "byPaymentMethod.sideGameChip": "increment(1000)"
    },
    "updatedAt": "serverTimestamp()"
  }
}
```

#### `addToByCategory` の更新内容確認
```json
{
  "severity": "INFO",
  "message": "addToByCategory: updating analyticsMonthly byCategory",
  "collection": "analyticsMonthly",
  "subcollection": "byCategory",
  "documentId": "2026-01/summary",
  "isNewDocument": false,
  "updatedFields": {
    "totals": {
      "totals.items": "increment(1000)",
      "totals.extraCost": "increment(1000)",
      "totals.sideGameChip": "increment(5000)",
      "totals.tournaments": "increment(6000)"
    },
    "orderCounts": {
      "orderCounts.items": "increment(1)",
      "orderCounts.extraCost": "increment(1)",
      "orderCounts.sideGameChip": "increment(1)",
      "orderCounts.tournaments": "increment(1)"
    },
    "itemSales": {
      "itemSales.s5zd9X7t5jePPBeDeUH4": {
        "qty": "increment(1)",
        "sales": "increment(1000)",
        "name": "ピザ",
        "category": "フード"
      }
    },
    "updatedAt": "serverTimestamp()"
  }
}
```

#### `addToByUser` の更新内容確認
```json
{
  "severity": "INFO",
  "message": "addToByUser: updating analyticsMonthly byUser",
  "collection": "analyticsMonthly",
  "subcollection": "byUser",
  "documentId": "2026-01/jxxltCr1PoShWJQeSB0F8TYGjlw1",
  "userId": "jxxltCr1PoShWJQeSB0F8TYGjlw1",
  "pokerName": "やはた",
  "isNewDocument": false,
  "updatedFields": {
    "grossSales": "increment(13000)",
    "itemsSales": "increment(1000)",
    "extraCostSales": "increment(1000)",
    "sideGameChipSales": "increment(5000)",
    "tournamentsSales": "increment(6000)",
    "orderCount": "increment(1)",
    "dailySales.2026-01-20": "increment(13000)",
    "paymentTotals": {
      "paymentTotals.cash": "increment(8000)",
      "paymentTotals.pointA": "increment(4000)",
      "paymentTotals.sideGameChip": "increment(1000)"
    },
    "pokerName": "やはた",
    "updatedAt": "serverTimestamp()"
  }
}
```

#### `addToByTemplateTournaments` の更新内容確認
```json
{
  "severity": "INFO",
  "message": "addToByTemplateTournaments: updating analyticsMonthly byTemplateTournaments",
  "collection": "analyticsMonthly",
  "subcollection": "byTemplateTournaments",
  "documentId": "2026-01/elSrtZZ7JTrshytJuMv2",
  "templateKey": "elSrtZZ7JTrshytJuMv2",
  "templateName": "...",
  "isNewDocument": false,
  "updatedFields": {
    "templateName": "...",
    "daily": {
      "daily.2026-01-20.entryCount": "increment(1)",
      "daily.2026-01-20.entrySales": "increment(2000)",
      "daily.2026-01-20.reentryCount": "increment(1)",
      "daily.2026-01-20.reentrySales": "increment(2000)",
      "daily.2026-01-20.addonCount": "increment(1)",
      "daily.2026-01-20.addonSales": "increment(2000)",
      "daily.2026-01-20.totalTournamentSales": "increment(6000)"
    },
    "totals": {
      "totals.entryCount": "increment(1)",
      "totals.entrySales": "increment(2000)",
      "totals.reentryCount": "increment(1)",
      "totals.reentrySales": "increment(2000)",
      "totals.addonCount": "increment(1)",
      "totals.addonSales": "increment(2000)",
      "totals.totalTournamentSales": "increment(6000)"
    },
    "updatedAt": "serverTimestamp()"
  }
}
```

#### `processBillAnalyticsAtomically` の完了確認
```json
{
  "severity": "INFO",
  "message": "processBillAnalyticsAtomically: analytics update completed",
  "billId": "7553e1da-5bc9-47d5-80b6-1857b44f8a1b",
  "month": "2026-01",
  "businessDate": "2026-01-20"
}
```

#### `enqueueSettlement` の完了確認
```json
{
  "severity": "INFO",
  "message": "enqueueSettlement: analytics update completed",
  "billId": "7553e1da-5bc9-47d5-80b6-1857b44f8a1b",
  "month": "2026-01",
  "businessDate": "2026-01-20"
}
```

---

## Firestore Console での確認

### 1. `analyticsMonthly/2026-01` の確認

- `itemsSales`: 1000増加しているか
- `sideGameChipSales`: 5000増加しているか
- `extraCostSales`: 1000増加しているか
- `tournamentsSales`: 6000増加しているか
- `grossSales`: 13000増加しているか
- `orderCount`: 1増加しているか
- `dailySales.2026-01-20`: 13000増加しているか
- `paymentTotals.cash`: 8000増加しているか
- `paymentTotals.pointA`: 4000増加しているか
- `paymentTotals.sideGameChip`: 1000増加しているか

### 2. `analyticsMonthly/2026-01/days/2026-01-20` の確認

- 上記と同様のフィールドが更新されているか
- `byCategory` フィールドが更新されているか
- `byPaymentMethod` フィールドが更新されているか

### 3. `analyticsMonthly/2026-01/byCategory/summary` の確認

- `totals` フィールドが更新されているか
- `orderCounts` フィールドが更新されているか
- `itemSales.s5zd9X7t5jePPBeDeUH4` が作成/更新されているか

### 4. `analyticsMonthly/2026-01/byUser/jxxltCr1PoShWJQeSB0F8TYGjlw1` の確認

- `grossSales`: 13000増加しているか
- `dailySales.2026-01-20`: 13000増加しているか
- `paymentTotals` が更新されているか
- `pokerName`: "やはた" に設定されているか

### 5. `analyticsMonthly/2026-01/byTemplateTournaments/elSrtZZ7JTrshytJuMv2` の確認

- `daily.2026-01-20.*` フィールドが更新されているか
- `totals.*` フィールドが更新されているか

### 6. `analyticsMonthly/2026-01/aggregationMarkers/7553e1da-5bc9-47d5-80b6-1857b44f8a1b` の確認

- マーカーが存在するか
- `billId`: "7553e1da-5bc9-47d5-80b6-1857b44f8a1b"
- `businessDate`: "2026-01-20"
- `processedAt`: タイムスタンプが設定されているか

---

## データ検証チェックリスト

- [ ] `billsOnSettle` トリガが発火したログがある
- [ ] `enqueueSettlement` が実行されたログがある
- [ ] `processBillAnalyticsAtomically` が実行されたログがある
- [ ] `addToMonthlyIndex` の更新ログがある（期待値と一致）
- [ ] `addToDailySummary` の更新ログがある（期待値と一致）
- [ ] `addToByCategory` の更新ログがある（期待値と一致）
- [ ] `addToByUser` の更新ログがある（期待値と一致）
- [ ] `addToByTemplateTournaments` の更新ログがある（期待値と一致）
- [ ] `aggregationMarkers` が作成されたログがある
- [ ] Firestore Console で `analyticsMonthly` の値が更新されている
- [ ] Firestore Console で `aggregationMarkers` が存在する

---

## 注意事項

1. **カテゴリ別金額の合計**: `categoryBreakdown` の合計（1000 + 1000 + 5000 + 6000 = 13000）が `amounts.grandTotalRounded`（13000）と一致していることを確認
2. **支払い方法別金額の合計**: `paymentMethodsByAmount` の合計（8000 + 4000 + 1000 = 13000）が `amounts.grandTotalRounded`（13000）と一致していることを確認
3. **トーナメント売上の合計**: `entrySalesIncl`（2000）+ `reentrySalesIncl`（2000）+ `addonSalesIncl`（2000）= 6000 が `categoryBreakdown.tournaments`（6000）と一致していることを確認
4. **マーカーの存在**: `aggregationMarkers` が存在する場合、重複処理はスキップされる（正常な動作）

---

## トラブルシューティング

### ログが出力されていない場合

1. `ENABLE_SETTLEMENT_AGGREGATOR` が `'true'` に設定されているか確認
2. `billsOnSettle` トリガが発火しているか確認（`status` が `'settled'` に変更されたか）
3. Cloud Functions のログレベルを確認

### ログは出力されているが、Firestore が更新されていない場合

1. トランザクションエラーが発生していないか確認
2. Firestore の権限を確認
3. マーカーが既に存在していて、重複処理がスキップされていないか確認

### 更新値が期待値と異なる場合

1. `categoryBreakdown` の計算が正しいか確認
2. `paymentTotals` の配賦が正しいか確認
3. `itemsSnapshot` や `tournamentsSnapshot` のデータが正しいか確認
