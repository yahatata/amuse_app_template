# Analytics Monthly 更新ログ出力実装ドキュメント

_作成日: 2025-12-20 (JST)_

## 概要

`enqueueSettlement` と `migrateSettledBillsForBusinessDay.ts` による `analyticsMonthly` の更新内容を詳細にログ出力する機能を実装しました。

## 実装内容

### 1. `processBillAnalyticsAtomically` 関数（`functions/src/analytics/updateAnalyticsForBill.ts`）

**追加したログ**:
- marker が既に存在する場合のスキップログ
- analytics 更新開始のログ
- marker 作成のログ
- analytics 更新完了のログ

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

### 2. `addToMonthlyIndex` 関数（`functions/src/analytics/addToMonthlyIndex.ts`）

**追加したログ**:
- コレクション: `analyticsMonthly`
- ドキュメントID: `{month}`
- 更新フィールド:
  - `itemsSales`, `sideGameChipSales`, `extraCostSales`, `tournamentsSales`
  - `grossSales`, `orderCount`
  - `dailySales.{businessDate}`
  - `paymentTotals.{method}`（各支払い方法別）
  - `updatedAt`

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
    "sideGameChipSales": "increment(500)",
    "extraCostSales": "increment(1000)",
    "tournamentsSales": "increment(2500)",
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

### 3. `addToDailySummary` 関数（`functions/src/analytics/addToDailySummary.ts`）

**追加したログ**:
- コレクション: `analyticsMonthly`
- サブコレクション: `days`
- ドキュメントID: `{month}/{businessDate}`
- 更新フィールド:
  - `itemsSales`, `sideGameChipSales`, `extraCostSales`, `tournamentsSales`
  - `grossSales`, `orderCount`
  - `byCategory.{category}`（各カテゴリ別）
  - `byPaymentMethod.{method}`（各支払い方法別）
  - `updatedAt`

**ログ出力例**:
```json
{
  "severity": "INFO",
  "message": "addToDailySummary: updating analyticsMonthly days",
  "collection": "analyticsMonthly",
  "subcollection": "days",
  "documentId": "2026-01/2026-01-19",
  "isNewDocument": false,
  "updatedFields": {
    "itemsSales": "increment(1000)",
    "grossSales": "increment(5000)",
    "orderCount": "increment(1)",
    "byCategory": {
      "byCategory.items": "increment(1000)",
      "byCategory.tournaments": "increment(2500)"
    },
    "byPaymentMethod": {
      "byPaymentMethod.cash": "increment(3000)",
      "byPaymentMethod.credit_card": "increment(2000)"
    },
    "updatedAt": "serverTimestamp()"
  }
}
```

---

### 4. `addToByCategory` 関数（`functions/src/analytics/addToByCategory.ts`）

**追加したログ**:
- コレクション: `analyticsMonthly`
- サブコレクション: `byCategory`
- ドキュメントID: `{month}/summary`
- 更新フィールド:
  - `totals.{category}`（各カテゴリ別の合計金額）
  - `orderCounts.{category}`（各カテゴリ別の注文数）
  - `itemSales.{menuItemId}.qty`（各メニューアイテム別の数量）
  - `itemSales.{menuItemId}.sales`（各メニューアイテム別の売上）
  - `itemSales.{menuItemId}.name`（各メニューアイテム名）
  - `itemSales.{menuItemId}.category`（各メニューアイテムのカテゴリ）
  - `updatedAt`

**ログ出力例**:
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
      "totals.tournaments": "increment(2500)"
    },
    "orderCounts": {
      "orderCounts.items": "increment(1)",
      "orderCounts.tournaments": "increment(1)"
    },
    "itemSales": {
      "itemSales.menu001": {
        "qty": "increment(2)",
        "sales": "increment(1000)",
        "name": "ビール",
        "category": "アルコール"
      }
    },
    "updatedAt": "serverTimestamp()"
  }
}
```

---

### 5. `addToByUser` 関数（`functions/src/analytics/addToByUser.ts`）

**追加したログ**:
- コレクション: `analyticsMonthly`
- サブコレクション: `byUser`
- ドキュメントID: `{month}/{userId}`
- 更新フィールド:
  - `grossSales`, `itemsSales`, `extraCostSales`, `sideGameChipSales`, `tournamentsSales`
  - `orderCount`
  - `dailySales.{businessDate}`
  - `paymentTotals.{method}`（各支払い方法別）
  - `pokerName`（値がある場合のみ）
  - `updatedAt`

**ログ出力例**:
```json
{
  "severity": "INFO",
  "message": "addToByUser: updating analyticsMonthly byUser",
  "collection": "analyticsMonthly",
  "subcollection": "byUser",
  "documentId": "2026-01/V9LWk5eIzQgNtK2yIS5YVORW9g73",
  "userId": "V9LWk5eIzQgNtK2yIS5YVORW9g73",
  "pokerName": "yahata",
  "isNewDocument": false,
  "updatedFields": {
    "grossSales": "increment(5000)",
    "itemsSales": "increment(1000)",
    "orderCount": "increment(1)",
    "dailySales.2026-01-19": "increment(5000)",
    "paymentTotals": {
      "paymentTotals.cash": "increment(3000)",
      "paymentTotals.credit_card": "increment(2000)"
    },
    "pokerName": "yahata",
    "updatedAt": "serverTimestamp()"
  }
}
```

---

### 6. `addToByTemplateTournaments` 関数（`functions/src/analytics/addToByTemplateTournaments.ts`）

**追加したログ**:
- コレクション: `analyticsMonthly`
- サブコレクション: `byTemplateTournaments`
- ドキュメントID: `{month}/{templateKey}`
- 更新フィールド:
  - `templateName`
  - `daily.{businessDate}.entryCount`（エントリー数）
  - `daily.{businessDate}.entrySales`（エントリー売上）
  - `daily.{businessDate}.reentryCount`（再エントリー数）
  - `daily.{businessDate}.reentrySales`（再エントリー売上）
  - `daily.{businessDate}.addonCount`（アドオン数）
  - `daily.{businessDate}.addonSales`（アドオン売上）
  - `daily.{businessDate}.totalTournamentSales`（トーナメント総売上）
  - `totals.entryCount`, `totals.entrySales`, `totals.reentryCount`, `totals.reentrySales`, `totals.addonCount`, `totals.addonSales`, `totals.totalTournamentSales`
  - `updatedAt`

**ログ出力例**:
```json
{
  "severity": "INFO",
  "message": "addToByTemplateTournaments: updating analyticsMonthly byTemplateTournaments",
  "collection": "analyticsMonthly",
  "subcollection": "byTemplateTournaments",
  "documentId": "2026-01/template001",
  "templateKey": "template001",
  "templateName": "トーナメントA",
  "isNewDocument": false,
  "updatedFields": {
    "templateName": "トーナメントA",
    "daily": {
      "daily.2026-01-19.entryCount": "increment(10)",
      "daily.2026-01-19.entrySales": "increment(2500)",
      "daily.2026-01-19.totalTournamentSales": "increment(2500)"
    },
    "totals": {
      "totals.entryCount": "increment(10)",
      "totals.entrySales": "increment(2500)",
      "totals.totalTournamentSales": "increment(2500)"
    },
    "updatedAt": "serverTimestamp()"
  }
}
```

---

### 7. `enqueueSettlement` 関数（`functions/src/analytics/aggregator/index.ts`）

**追加したログ**:
- analytics 更新開始のログ
- analytics 更新完了のログ

**ログ出力例**:
```json
{
  "severity": "INFO",
  "message": "enqueueSettlement: starting analytics update",
  "billId": "aaf56292-6a84-4d9b-97f9-da0fdfab08ce",
  "month": "2026-01",
  "businessDate": "2026-01-19"
}
```

---

### 8. `migrateSettledBillsForBusinessDay` 関数（`functions/src/analytics/migrateSettledBillsForBusinessDay.ts`）

**追加したログ**:
- 各 bill の analytics 更新開始のログ
- 各 bill の analytics 更新完了のログ

**ログ出力例**:
```json
{
  "severity": "INFO",
  "message": "migrateSettledBillsForBusinessDay: starting analytics update",
  "billId": "aaf56292-6a84-4d9b-97f9-da0fdfab08ce",
  "month": "2026-01",
  "businessDate": "2026-01-19"
}
```

---

## ログの確認方法

### 1. Cloud Functions ログ（推奨）

```bash
# billsOnSettle トリガのログ
firebase functions:log --only billsOnSettle

# migrateSettledBillsForBusinessDay のログ
firebase functions:log --only migrateSettledBillsForBusinessDay
```

### 2. Google Cloud Console

1. Google Cloud Console → 「ログ」→ 「Cloud Functions」
2. 関数名でフィルタ: `billsOnSettle` または `migrateSettledBillsForBusinessDay`
3. 時間範囲を指定してログを検索

---

## ログ出力の特徴

1. **詳細な更新内容**: どのコレクション（サブコレクション）のどのフィールドがどのように更新されたかを明示
2. **increment値の表示**: `FieldValue.increment()` で更新される値も明示（例: `increment(1000)`）
3. **新規ドキュメント作成の判別**: `isNewDocument` フィールドで新規作成か更新かを判別
4. **構造化ログ**: JSON形式で出力されるため、検索・フィルタが容易

---

## 注意事項

1. **ログのボリューム**: 1つの bill 処理で複数のログが出力されるため、大量の bill を処理する場合はログが多くなる可能性がある
2. **パフォーマンス**: ログ出力によるパフォーマンスへの影響は最小限だが、大量のログが生成される場合のストレージコストに注意
3. **個人情報**: ログには `pokerName` などの個人情報が含まれる可能性があるため、ログの取り扱いに注意

---

## 次のステップ

1. ログ出力が正常に動作することを確認
2. Google Cloud Console でログを確認し、更新内容が正しく記録されているか検証
3. 必要に応じて、ログ出力のレベルや内容を調整
