# Step 04: billsOnSettle 統合 — changeSpec

## 変更対象

- `functions/src/domains/bills/triggers/billsOnSettle.ts`

## 変更概要

billsOnSettle トリガに reporting 書き込みを統合する。
既存の analytics enqueue パターンに倣い、トランザクション完了後・feature flag 制御下で reporting entry を作成する。

## 変更内容

### 1. import 追加

```typescript
import { loadTaxReportingBehavior } from '../../reporting/config/taxReportingBehaviorLoader';
import { buildSettleEntry } from '../../reporting/services/entryBuilder';
import { writeReportingEntry } from '../../reporting/services/entryWriter';
import { applyEntryToReportingMonthly } from '../../reporting/services/monthlyUpdater';
```

### 2. bill 再読み込みのリファクタ

- `updatedBillDoc` の読み込みを analytics ブロックの外に移動し、analytics と reporting の両方で共有する
- `updatedBillData` を `null` ガード付きで取得

### 3. reporting 書き込みブロック追加

条件: `storeConfig.features?.reportingAggregatorEnabled === true && updatedBillData`

処理:
1. `loadTaxReportingBehavior()` で税務設定を取得
2. `updatedBillData.categoryBreakdown` を reporting 形式に変換
   - `sideGameChips` → `sideGameChip` のキー変換を含む
3. `paymentTotals` と `paymentMethodsByCategory` を取得
4. `currentSettlementCycle > 1` なら `resettle`、それ以外は `settle`
5. `buildSettleEntry()` → `writeReportingEntry()` → `applyEntryToReportingMonthly()`
6. 失敗時は `logOpsError` のみ（トリガ自体は成功扱い）

### 4. logOpsSuccess に `reportingApplied` を追加

## 冪等性

- `writeReportingEntry` は `create()` を使用しており、ALREADY_EXISTS は冪等スキップ
- `applyEntryToReportingMonthly` は `aggregationMarkers` で冪等性を担保

## エラー方針

- reporting 書き込み失敗時は `logOpsError` を記録し、トリガ全体は正常終了する
- analytics 同様、ベストエフォート方針
