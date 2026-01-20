# Analytics更新内容の詳細比較

_最終更新: 2025-12-20 (JST)_

## 目的

`migrateSettledBillsForBusinessDay.ts` と `enqueueSettlement` で更新される `analyticsMonthly` の内容を詳細に比較し、`migrateSettledBillsForBusinessDay.ts` の形式に寄せる場合の問題点を整理する。

---

## 1. `migrateSettledBillsForBusinessDay.ts` の更新内容（旧スキーマ）

### 1.1 `analyticsMonthly/{YYYY-MM}`（月次ドキュメント）

**更新関数**: `addToMonthlyIndex()`

**更新フィールド**:
```typescript
{
  itemsSales: FieldValue.increment(categoryAmounts.get('items')),
  sideGameChipSales: FieldValue.increment(categoryAmounts.get('sideGameChip')),
  extraCostSales: FieldValue.increment(categoryAmounts.get('extraCost')),
  tournamentsSales: FieldValue.increment(categoryAmounts.get('tournaments')),
  grossSales: FieldValue.increment(grossSales),  // カテゴリ合計
  orderCount: FieldValue.increment(1),
  dailySales.{businessDate}: FieldValue.increment(grossSales),  // 日別売上（ネスト）
  paymentTotals.{method}: FieldValue.increment(amount),  // 支払方法別
  updatedAt: FieldValue.serverTimestamp()
}
```

**データソース**:
- `categoryAmounts`: `calculateCategoryAmounts()` で `billData.categoryBreakdown` から計算
- `grossSales`: カテゴリ合計（`categoryBreakdown.items + extraCost + sideGameChips + tournaments`）
- `paymentTotals`: `distributePaymentMethods()` で `billData.paymentTotals` から計算

---

### 1.2 `analyticsMonthly/{YYYY-MM}/days/{YYYY-MM-DD}`（日次ドキュメント）

**更新関数**: `addToDailySummary()`

**更新フィールド**:
```typescript
{
  itemsSales: FieldValue.increment(categoryAmounts.get('items')),
  sideGameChipSales: FieldValue.increment(categoryAmounts.get('sideGameChip')),
  extraCostSales: FieldValue.increment(categoryAmounts.get('extraCost')),
  tournamentsSales: FieldValue.increment(categoryAmounts.get('tournaments')),
  grossSales: FieldValue.increment(grossSales),
  orderCount: FieldValue.increment(1),
  byCategory.{category}: FieldValue.increment(amount),  // カテゴリ別（ネスト）
  byPaymentMethod.{method}: FieldValue.increment(amount),  // 支払方法別（ネスト）
  updatedAt: FieldValue.serverTimestamp()
}
```

**データソース**: 月次ドキュメントと同じ

---

### 1.3 `analyticsMonthly/{YYYY-MM}/byCategory/summary`（カテゴリ別サマリ）

**更新関数**: `addToByCategory()`

**更新フィールド**:
```typescript
{
  totals.{category}: FieldValue.increment(amount),  // items, extraCost, sideGameChip, tournaments
  orderCounts.{category}: FieldValue.increment(1),
  itemSales.{menuItemId}.qty: FieldValue.increment(qty),
  itemSales.{menuItemId}.sales: FieldValue.increment(salesIncl),
  itemSales.{menuItemId}.name: name,  // 文字列上書き
  itemSales.{menuItemId}.category: category,  // 文字列上書き
  itemSales._others.qty: FieldValue.increment(qty),  // 圧縮時の「その他」
  itemSales._others.sales: FieldValue.increment(salesIncl),
  updatedAt: FieldValue.serverTimestamp()
}
```

**データソース**:
- `categoryAmounts`: `calculateCategoryAmounts()` で `billData.categoryBreakdown` から計算
- `itemSales`: `billData.itemsSnapshot` から商品別に集計

---

### 1.4 `analyticsMonthly/{YYYY-MM}/byTemplateTournaments/{templateKey}`（トーナメント別）

**更新関数**: `addToByTemplateTournaments()`

**更新フィールド**:
```typescript
{
  templateName: templateName,  // 文字列上書き
  daily.{businessDate}.entryCount: FieldValue.increment(entryCount),
  daily.{businessDate}.entrySales: FieldValue.increment(entrySales),
  daily.{businessDate}.reentryCount: FieldValue.increment(reentryCount),
  daily.{businessDate}.reentrySales: FieldValue.increment(reentrySales),
  daily.{businessDate}.addonCount: FieldValue.increment(addonCount),
  daily.{businessDate}.addonSales: FieldValue.increment(addonSales),
  daily.{businessDate}.totalTournamentSales: FieldValue.increment(totalTournamentSales),
  totals.entryCount: FieldValue.increment(entryCount),
  totals.entrySales: FieldValue.increment(entrySales),
  totals.reentryCount: FieldValue.increment(reentryCount),
  totals.reentrySales: FieldValue.increment(reentrySales),
  totals.addonCount: FieldValue.increment(addonCount),
  totals.addonSales: FieldValue.increment(addonSales),
  totals.totalTournamentSales: FieldValue.increment(totalTournamentSales),
  updatedAt: FieldValue.serverTimestamp()
}
```

**データソース**:
- `tournamentsSnapshot`: `billData.tournamentsSnapshot` から各テンプレートIDごとに処理

---

### 1.5 `analyticsMonthly/{YYYY-MM}/byUser/{userId}`（ユーザー別）

**更新関数**: `addToByUser()`

**更新フィールド**:
```typescript
{
  grossSales: FieldValue.increment(grossSales),
  itemsSales: FieldValue.increment(categoryAmounts.get('items')),
  extraCostSales: FieldValue.increment(categoryAmounts.get('extraCost')),
  sideGameChipSales: FieldValue.increment(categoryAmounts.get('sideGameChip')),
  tournamentsSales: FieldValue.increment(categoryAmounts.get('tournaments')),
  orderCount: FieldValue.increment(1),
  dailySales.{businessDate}: FieldValue.increment(grossSales),  // 日別売上（ネスト）
  paymentTotals.{method}: FieldValue.increment(amount),
  pokerName: pokerName,  // 文字列上書き（値があるときのみ）
  updatedAt: FieldValue.serverTimestamp()
}
```

**データソース**:
- `categoryAmounts`: `calculateCategoryAmounts()` で `billData.categoryBreakdown` から計算
- `paymentTotals`: `distributePaymentMethods()` で `billData.paymentTotals` から計算
- `pokerName`: `billData.party?.pokerName`

---

## 2. `enqueueSettlement` の更新内容（新スキーマ）

### 2.1 `analyticsMonthly/{YYYY-MM}`（月次ドキュメント）

**更新関数**: `applyMonthlyDailyDelta()`

**更新フィールド**:
```typescript
{
  'sales.grossIncl': FieldValue.increment(delta.sales.grossIncl),  // amounts.grandTotalRounded
  'sales.category.items': FieldValue.increment(delta.sales.category.items),
  'sales.category.extraCost': FieldValue.increment(delta.sales.category.extraCost),
  'sales.category.sideGameChips': FieldValue.increment(delta.sales.category.sideGameChips),
  'sales.category.tournaments': FieldValue.increment(delta.sales.category.tournaments),
  'events.totalRefundedIncl': FieldValue.increment(delta.events.totalRefundedIncl),  // 0（settlement時）
  'events.totalAdjustmentsIncl': FieldValue.increment(delta.events.totalAdjustmentsIncl),  // 0（settlement時）
  'events.unattributedRefundsIncl': FieldValue.increment(delta.events.unattributedRefundsIncl),  // 0（settlement時）
  'events.unattributedAdjustmentsIncl': FieldValue.increment(delta.events.unattributedAdjustmentsIncl),  // 0（settlement時）
  'cashflow.paymentTotals.{method}': FieldValue.increment(amount),
  'net.netSalesIncl': FieldValue.increment(delta.net.netSalesIncl),  // amounts.grandTotalRounded
  updatedAt: FieldValue.serverTimestamp()
}
```

**データソース**:
- `delta.sales.grossIncl`: `bill.amounts.grandTotalRounded`
- `delta.sales.category`: `bill.categoryBreakdown`
- `delta.cashflow.paymentTotals`: `bill.paymentTotals`
- `delta.net.netSalesIncl`: `bill.amounts.grandTotalRounded`

---

### 2.2 `analyticsMonthly/{YYYY-MM}/days/{YYYY-MM-DD}`（日次ドキュメント）

**更新関数**: `applyMonthlyDailyDelta()`

**更新フィールド**: 月次ドキュメントと同じ構造（`sales.*`, `events.*`, `cashflow.*`, `net.*`）

---

## 3. フィールドレベルの詳細比較

### 3.1 月次ドキュメントのフィールドマッピング

| 旧スキーマ（migrateSettledBillsForBusinessDay） | 新スキーマ（enqueueSettlement） | データソース |
| --- | --- | --- |
| `grossSales` | `sales.grossIncl` | 旧: カテゴリ合計 / 新: `amounts.grandTotalRounded` |
| `itemsSales` | `sales.category.items` | 両方: `categoryBreakdown.items` |
| `sideGameChipSales` | `sales.category.sideGameChips` | 両方: `categoryBreakdown.sideGameChips` |
| `extraCostSales` | `sales.category.extraCost` | 両方: `categoryBreakdown.extraCost` |
| `tournamentsSales` | `sales.category.tournaments` | 両方: `categoryBreakdown.tournaments` |
| `orderCount` | ❌ なし | 旧のみ |
| `dailySales.{businessDate}` | ❌ なし | 旧のみ（ネスト構造） |
| `paymentTotals.{method}` | `cashflow.paymentTotals.{method}` | 両方: `paymentTotals` |
| ❌ なし | `events.totalRefundedIncl` | 新のみ（事後イベント用） |
| ❌ なし | `events.totalAdjustmentsIncl` | 新のみ（事後イベント用） |
| ❌ なし | `net.netSalesIncl` | 新のみ |

**重要な差異**:
1. `grossSales` vs `sales.grossIncl`: 旧はカテゴリ合計、新は `grandTotalRounded`（サービス料・丸めを含む）
2. `orderCount`: 旧のみ存在（新にはない）
3. `dailySales.{businessDate}`: 旧のみ存在（ネスト構造）
4. `events.*`, `net.*`: 新のみ存在（事後イベント対応）

---

### 3.2 日次ドキュメントのフィールドマッピング

| 旧スキーマ | 新スキーマ | 備考 |
| --- | --- | --- |
| `grossSales` | `sales.grossIncl` | 同上 |
| `itemsSales` | `sales.category.items` | 同上 |
| `sideGameChipSales` | `sales.category.sideGameChips` | 同上 |
| `extraCostSales` | `sales.category.extraCost` | 同上 |
| `tournamentsSales` | `sales.category.tournaments` | 同上 |
| `orderCount` | ❌ なし | 旧のみ |
| `byCategory.{category}` | ❌ なし | 旧のみ（ネスト構造） |
| `byPaymentMethod.{method}` | `cashflow.paymentTotals.{method}` | 旧は `byPaymentMethod`, 新は `cashflow.paymentTotals` |

---

### 3.3 新スキーマに存在しないコレクション

| コレクション | 更新関数 | 更新内容 |
| --- | --- | --- |
| `analyticsMonthly/{YYYY-MM}/byCategory/summary` | `addToByCategory()` | `totals`, `orderCounts`, `itemSales` |
| `analyticsMonthly/{YYYY-MM}/byTemplateTournaments/{templateKey}` | `addToByTemplateTournaments()` | `daily`, `totals` |
| `analyticsMonthly/{YYYY-MM}/byUser/{userId}` | `addToByUser()` | `grossSales`, `itemsSales`, etc. |

**新スキーマではこれらのコレクションは更新されない**。

---

## 4. `migrateSettledBillsForBusinessDay.ts` の形式に寄せる場合の問題点

### 4.1 データ構造の差異

#### 問題1: `grossSales` vs `sales.grossIncl` の値の差異
- **旧スキーマ**: `grossSales` = カテゴリ合計（`items + extraCost + sideGameChips + tournaments`）
- **新スキーマ**: `sales.grossIncl` = `amounts.grandTotalRounded`（サービス料・丸めを含む）

**影響**:
- サービス料がある場合、`grandTotalRounded` > カテゴリ合計になる
- 既存UIで `grossSales` を表示している場合、値が一致しない

#### 問題2: `orderCount` が存在しない
- **旧スキーマ**: `orderCount` をカウント（伝票数を記録）
- **新スキーマ**: `orderCount` が存在しない

**影響**:
- 既存UIで `orderCount` を表示している場合、値が更新されない

#### 問題3: `dailySales.{businessDate}` が存在しない
- **旧スキーマ**: 月次Doc内に `dailySales.{businessDate}` というネスト構造で日別売上を保持
- **新スキーマ**: 日次Docは別コレクション（`days/{businessDate}`）で、月次Doc内には日別データを持たない

**影響**:
- 既存UIが `dailySales.{businessDate}` を参照している場合、値が更新されない

#### 問題4: `byCategory`, `byTemplateTournaments`, `byUser` が存在しない
- **旧スキーマ**: 3つのサブコレクション（`byCategory`, `byTemplateTournaments`, `byUser`）を更新
- **新スキーマ**: これらは更新されない

**影響**:
- 既存UIがこれらのコレクションを参照している場合、値が更新されない
- カテゴリ別詳細、トーナメント別詳細、ユーザー別詳細が表示できない

---

### 4.2 事後イベント対応の欠如

#### 問題5: `events.*`, `net.*` が存在しない
- **旧スキーマ**: 返金・調整などの事後イベントを直接サポートしていない
- **新スキーマ**: `events.*`, `net.netSalesIncl` で事後イベントを追跡

**影響**:
- 返金・調整が発生した場合、旧スキーマでは正しく反映されない可能性がある
- ただし、`migrateSettledBillsForBusinessDay.ts` は nightly バッチなので、事後イベントも翌日には反映される可能性がある（`bills` の `postEvents.*` から計算できる）

---

### 4.3 実装上の問題

#### 問題6: リアルタイム更新の欠如
- **`enqueueSettlement`**: 会計確定時（`bills.onSettle` トリガ）に即座に更新
- **`migrateSettledBillsForBusinessDay.ts`**: nightly バッチで更新（遅延がある）

**影響**:
- リアルタイム性が必要な場合、旧スキーマでは対応できない

---

### 4.4 UI 依存関係

#### 問題7: 既存UIの依存関係
既存UI（Flutter）は以下のフィールドを参照している:
- `grossSales`, `itemsSales`, `sideGameChipSales`, `extraCostSales`, `tournamentsSales`
- `orderCount`
- `paymentTotals.{method}`
- `byCategory/summary`（カテゴリ別詳細）
- `byTemplateTournaments/{templateKey}`（トーナメント別詳細）
- `byUser/{userId}`（ユーザー別詳細）

**影響**:
- 新スキーマ（`sales.*`, `cashflow.*`, `net.*`）に変更すると、既存UIを全て変更する必要がある

---

## 5. `migrateSettledBillsForBusinessDay.ts` の形式に寄せる場合の推奨事項

### 5.1 `enqueueSettlement` を旧スキーマ形式に変更する場合

**必要な変更**:
1. **`applyMonthlyDailyDelta()` を削除または無効化**
2. **旧スキーマ更新関数を呼び出す**:
   - `addToMonthlyIndex()`: 月次Doc更新
   - `addToDailySummary()`: 日次Doc更新
   - `addToByCategory()`: カテゴリ別サマリ更新
   - `addToByTemplateTournaments()`: トーナメント別更新
   - `addToByUser()`: ユーザー別更新

3. **`enqueueSettlement` の実装を変更**:
```typescript
export async function enqueueSettlement(bill: BillDoc): Promise<void> {
  const businessDate = bill.businessDate;
  const monthKey = businessDate.substring(0, 7);

  // 冪等性チェック（既存のまま）
  const alreadyProcessed = await checkAndSetBillMarker(monthKey, bill.billId);
  if (alreadyProcessed) {
    return;
  }

  // 旧スキーマ更新関数を呼び出す
  const db = getFirestore();
  await db.runTransaction(async (transaction) => {
    // 既存のmarkerチェック（トランザクション内）
    const markerRef = db.collection('analyticsMonthly').doc(monthKey)
      .collection('aggregationMarkers').doc(bill.billId);
    const markerDocInTx = await transaction.get(markerRef);
    if (markerDocInTx.exists) {
      return; // 重複処理をスキップ
    }

    // 必要なドキュメントを事前読み取り
    const monthlyRef = db.collection('analyticsMonthly').doc(monthKey);
    const dailyRef = monthlyRef.collection('days').doc(businessDate);
    const byCategoryRef = monthlyRef.collection('byCategory').doc('summary');
    const userId = bill.party?.userId;
    const byUserRef = userId ? monthlyRef.collection('byUser').doc(userId) : null;

    // トーナメントテンプレート用の読み取り
    const tournamentsSnapshot = bill.tournamentsSnapshot || {};
    const templateRefs = [];
    for (const [templateKey] of Object.keys(tournamentsSnapshot)) {
      const templateRef = monthlyRef.collection('byTemplateTournaments').doc(templateKey);
      templateRefs.push(templateRef.get());
    }
    const templateDocs = await Promise.all(templateRefs);

    // 事前読み取り
    const [monthlyDoc, dailyDoc, byCategoryDoc, byUserDoc, ...templateDocsArray] = await Promise.all([
      monthlyRef.get(),
      dailyRef.get(),
      byCategoryRef.get(),
      byUserRef ? byUserRef.get() : Promise.resolve(undefined),
      ...templateRefs
    ]);

    // 旧スキーマ更新関数を呼び出す
    await addToMonthlyIndex(transaction, monthKey, bill, businessDate, monthlyDoc);
    await addToDailySummary(transaction, monthKey, businessDate, bill, dailyDoc);
    await addToByCategory(transaction, monthKey, bill, byCategoryDoc);
    await addToByTemplateTournaments(transaction, monthKey, businessDate, bill, templateDocsArray);
    if (byUserRef && byUserDoc) {
      await addToByUser(transaction, monthKey, businessDate, bill, byUserDoc);
    }

    // マーカー作成
    transaction.set(markerRef, {
      billId: bill.billId,
      businessDate,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}
```

---

### 5.2 注意点

#### 注意点1: `grossSales` と `grandTotalRounded` の差異
- **旧スキーマ**: `grossSales` = カテゴリ合計
- **`bills` スキーマ**: `grandTotalRounded` = サービス料・丸めを含む

**対応策**:
- `addToMonthlyIndex()` 内で `grossSales` を計算する際、`categoryBreakdown` の合計を使用する（現状の実装通り）
- `grandTotalRounded` は使用しない（サービス料・丸めは別途管理）

#### 注意点2: 事後イベント（返金・調整）の扱い
- **旧スキーマ**: 事後イベントを直接サポートしていない
- **対応策**: `migrateSettledBillsForBusinessDay.ts` で nightly バッチ実行時に、`bills.postEvents.*` から計算して `analyticsMonthly` を再計算する
- または、事後イベント発生時にも `addToMonthlyIndex()` などを呼び出す（ただし、返金は減算、調整は加算/減算）

#### 注意点3: トランザクションサイズ
- **旧スキーマ更新**: 5つの場所（月次、日次、カテゴリ、トーナメント、ユーザー）を更新
- **新スキーマ更新**: 2つの場所（月次、日次）のみ更新

**影響**:
- 旧スキーマ更新の方が書き込み数が多く、トランザクションサイズが大きくなる可能性がある
- ただし、既存の `migrateSettledBillsForBusinessDay.ts` で実績があるため、問題ないと思われる

---

## 6. 結論

### `migrateSettledBillsForBusinessDay.ts` の形式に寄せる場合の影響

**メリット**:
1. ✅ 既存UIを変更する必要がない
2. ✅ 既存の実装を再利用できる
3. ✅ 段階的な移行が不要（UI変更の工数を削減）

**デメリット・問題点**:
1. ⚠️ 新スキーマ（`sales.*`, `events.*`, `cashflow.*`, `net.*`）の導入が後回しになる
2. ⚠️ 事後イベント（返金・調整）の対応が制限される可能性がある
3. ⚠️ リアルタイム更新の実現が困難（nightly バッチ依存）
4. ⚠️ 将来的にUIを変更する際、新スキーマへの移行が必要になる

**推奨事項**:
- 短期的には `migrateSettledBillsForBusinessDay.ts` の形式に寄せることは可能
- ただし、長期的には新スキーマ（`sales.*`, `events.*`, `cashflow.*`, `net.*`）への移行を検討することを推奨
- 過渡期は両方のスキーマを更新する運用も可能（ただし、データ整合性の監視が必要）

---

## 7. 参照ドキュメント

- `docs/bills_migration/analytics_plan.md`: Analytics設計計画（新スキーマの詳細）
- `docs/bills_migration/ui_compatibility_plan.md`: UI互換アダプタ層設計
- `functions/src/analytics/migrateSettledBillsForBusinessDay.ts`: 旧スキーマ更新実装
- `functions/src/analytics/aggregator/index.ts`: 新スキーマ更新実装
