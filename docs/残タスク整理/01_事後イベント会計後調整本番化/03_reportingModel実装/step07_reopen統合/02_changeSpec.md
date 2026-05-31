# Step 07: reopen 統合 — changeSpec

## 変更対象

- `functions/src/domains/bills/repos/reopenAccountedBill.ts`

## 変更概要

reopen（会計取消）時に、元の settle/resettle entry を反転した `reopen_rollback` エントリを作成し、
reportingMonthly からも差し引く。

## 変更内容

### 1. import 追加

```typescript
import { buildReopenRollbackEntry } from "../../reporting/services/entryBuilder";
import { writeReportingEntry } from "../../reporting/services/entryWriter";
import { applyEntryToReportingMonthly } from "../../reporting/services/monthlyUpdater";
import type { ReportingEntry } from "../../reporting/types";
```

### 2. `reportingEnabled` フラグ追加

### 3. reporting rollback ブロック追加

条件: `!reused && reportingEnabled && analyticsRollbackCapture`

処理:
1. 元の settle entry を Firestore から読み取り（`{billId}_settle_{oldCycleNo}` → `{billId}_resettle_{oldCycleNo}` の順で探索）
2. 見つかった場合、`buildReopenRollbackEntry()` で反転 entry を作成
3. `writeReportingEntry()` → `applyEntryToReportingMonthly()` で書き込み
4. 失敗時は `logOpsError`（operation: `writeReportingRollback`）

### 4. logOpsSuccess に `reportingRollbackApplied` / `reportingEnabled` を追加

## 設計判断

- 元の settle entry が `reportingEntries` に存在しない場合（feature flag が後から有効化された場合など）は rollback をスキップする
- `reopenExecutedAt` には `Timestamp.now()` を使用（transaction 後に実行されるため）
- rollback entry の `reportingMonth` は元の settle entry の `reportingMonth` を継承する（`reverseInOriginalMonth` ポリシー）
