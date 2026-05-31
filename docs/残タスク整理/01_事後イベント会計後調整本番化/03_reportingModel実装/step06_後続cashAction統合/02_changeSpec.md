# Step 06: 後続 cashAction 統合 — changeSpec

## 変更対象

- `functions/src/domains/bills/repos/recordPostSettlementCashAction.ts`

## 変更概要

後続 cashAction（later パターン）の記録時に reporting entry を書き込む。
allocation 対象 adjustments の lines を transaction 内で capture し、transaction 外で reporting に書き込む。

## 変更内容

### 1. import 追加

```typescript
import { loadTaxReportingBehavior } from '../../reporting/config/taxReportingBehaviorLoader';
import { buildCashActionEntry } from '../../reporting/services/entryBuilder';
import { writeReportingEntry } from '../../reporting/services/entryWriter';
import { applyEntryToReportingMonthly } from '../../reporting/services/monthlyUpdater';
```

### 2. `reportingEnabled` フラグ追加

### 3. `ReportingCaptureFromTx` インターフェース追加

transaction 内で capture するデータ:
- `billBusinessDate`
- `cashActionDoc`
- `cashActionId`
- `cycleNo`
- `adjustmentLines: Array<{ targetCategory, amountInclDelta }>`
- `linkedAdjustmentId`（allocations が 1 件の場合は adjustmentId、それ以外は null）

### 4. transaction 内での capture

- `allocationAdjustmentSnaps` から adjustment の `lines` を抽出
- `targetCategory` と `amountInclDelta` のみを reporting 用に保存

### 5. reporting 書き込みブロック追加

条件: `!reused && reportingEnabled && reportingCapture` かつ `billBusinessDate` が空でない

処理:
1. `loadTaxReportingBehavior()` で税務設定を取得
2. `methodBreakdown` 配列を `Record<string, number>` に変換
3. `buildCashActionEntry()` → `writeReportingEntry()` → `applyEntryToReportingMonthly()`
4. `isImmediate: false` を設定
5. 失敗時は `logOpsError` のみ

### 6. logOpsSuccess に `reportingApplied` / `reportingEnabled` を追加

## 注意点

- transaction 内で allocationAdjustmentSnaps は既に read されているため、追加の Firestore read は不要
- `linkedAdjustmentId` は allocation が 1 件の場合のみ設定（複数 allocation の場合は null）
