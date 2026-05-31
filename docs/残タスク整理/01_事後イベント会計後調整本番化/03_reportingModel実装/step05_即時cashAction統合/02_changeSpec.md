# Step 05: 即時 cashAction 統合 — changeSpec

## 変更対象

- `functions/src/domains/bills/repos/createPostSettlementAdjustment.ts`

## 変更概要

即時 cashAction（`decrease_refunded` / `increase_collected`）作成時に reporting entry を書き込む。
pending adjustment のみの場合は reporting entry を作成しない（`pendingAdjustmentTiming: 'onCashAction'`）。

## 変更内容

### 1. import 追加

```typescript
import { loadTaxReportingBehavior } from '../../reporting/config/taxReportingBehaviorLoader';
import { buildCashActionEntry } from '../../reporting/services/entryBuilder';
import { writeReportingEntry } from '../../reporting/services/entryWriter';
import { applyEntryToReportingMonthly } from '../../reporting/services/monthlyUpdater';
```

### 2. `reportingEnabled` フラグ追加

`analyticsEnabled` と同列で `storeConfig.features?.reportingAggregatorEnabled === true` を読み取る。

### 3. reporting 書き込みブロック追加

条件: `!reused && reportingEnabled && analyticsCapture` かつ `cashActionDoc` と `cashActionId` が存在

処理:
1. `loadTaxReportingBehavior()` で税務設定を取得
2. `analyticsCapture.adjustmentLines` を reporting 用 `{ targetCategory, amountInclDelta }` に変換
3. `cashActionDoc.methodBreakdown` (配列) を `Record<string, number>` に変換
4. `buildCashActionEntry()` → `writeReportingEntry()` → `applyEntryToReportingMonthly()`
5. `isImmediate: true` を設定
6. `linkedAdjustmentId` に `stored.adjustmentId` を設定
7. 失敗時は `logOpsError` のみ（callable 自体は成功）

### 4. logOpsSuccess に `reportingApplied` / `reportingEnabled` を追加

## 型変換

- `CashActionDoc.executedAt` は `unknown` 型のため `as Timestamp` でキャスト
- bills 側 `AdjustmentLine` → reporting 側 `AdjustmentLine` は `targetCategory` と `amountInclDelta` のみ抽出
- `CashActionMethodBreakdownEntry[]` → `Record<string, number>` は method をキーに amountIncl を合算
