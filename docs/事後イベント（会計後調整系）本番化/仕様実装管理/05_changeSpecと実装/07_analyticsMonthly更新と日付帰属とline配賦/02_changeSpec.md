# 02_changeSpec

[01_現状確認と影響範囲.md](./01_現状確認と影響範囲.md) で整理した AsIs を踏まえ、Step07 の変更内容を確定する。

## 1. ゴール

仕様書 [04_仕様書/07_analyticsMonthly更新と日付帰属とline配賦.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/04_仕様書/07_analyticsMonthly更新と日付帰属とline配賦.md) §10 / §11 / §13〜§16 を本番化する。

具体的には次の 3 経路で `analyticsMonthly` を **`bill.businessDate` ベース** で更新できるようにする。

1. **adjustment 作成時**: `lines[]` から売上差分を 5 sub-collection に反映
2. **cashAction 実行時**: collection の場合のみ `paymentTotals` を増やす
3. **reopen 時**: 旧 cycle の baseline / adjustment / collection cashAction の analytics 寄与を rollback し、resettle 時に再反映できるようにする

## 2. ユーザー確定事項（[01_現状確認と影響範囲.md §5](./01_現状確認と影響範囲.md#5-設計上の論点) の論点回答）

| 論点 | 決定事項 |
|---|---|
| 論点1 (reopen rollback) | **rollback-and-resettle**: reopen 時に旧 cycle の baseline / adjustment / collection cashAction を analytics から rollback し、settle marker を `{billId}_cycle{cycleNo}_settle` 単位にすることで resettle 時に再反映を実現 |
| 論点2 (tx strategy) | **separate-tx**: bills 側 transaction が成功した後で別 transaction で analytics を更新。bills 失敗時は analytics は触らない。analytics 失敗時は bills は既に書かれている → log のみ、callable response は success |
| 論点3 (feature flag) | **same-flag**: 既存の `storeConfig.features?.settlementAggregatorEnabled` を使い、flag が無効な store では adjustment / cashAction / reopen rollback も analytics 更新を skip |
| 論点4 (helper strategy) | **new-helpers**: 新規 `applyAdjustmentToAnalytics` / `applyCashActionToAnalytics` / `applyReopenRollbackToAnalytics` を追加。既存 `addToMonthlyIndex` / `addToDailySummary` 等には touch しない。dead に近い `enqueueEvent` 経路は使わない |
| 論点5 (test strategy) | **comprehensive**: pure 関数 unit + applyXxx Emulator integration + 既存 callable spec 拡張 + 既存 settle 経路 (`billsOnSettle`) regression 確認 |

## 3. 4 パターン matrix（仕様書 §11）と Step07 の責務マッピング

| パターン | adjustment doc | analytics adjustment 反映 | analytics cashAction 反映 | analytics paymentTotals |
|---|---|---|---|---|
| 減額 + 返金済 | `decrease_refunded` | する (sales -) | する（refund: no-op） | 触らない |
| 減額 + 返金前 | `decrease_refund_pending` | する (sales -) | （後続 refund: no-op） | 触らない |
| 増額 + 追加徴収済 | `increase_collected` | する (sales +) | する（collection: paymentTotals +） | この時点で増える |
| 増額 + 追加徴収前 | `increase_collection_pending` | する (sales +) | （後続 collection: paymentTotals +） | 回収完了時に増える |

implementation 上、4 パターン全部で **adjustment 作成時に売上差分反映**は同じ。**cashAction 反映**は collection のみ paymentTotals に effect。

## 4. データモデル変更点

### 4.1 `analyticsMonthly` 既存 field（変更なし）

仕様書 §17 / §19（current-scope ではスコープ外とする future 機能）で「新規 field 追加なし」と明示されている。下記の既存 field のみを使う:

- `analyticsMonthly/{month}` top-level: `grossSales` / `itemsSales` / `extraCostSales` / `sideGameChipSales` / `tournamentsSales` / `dailySales.{businessDate}` / `paymentTotals.{method}` / `orderCount` (※ adjustment では increment しない)
- `analyticsMonthly/{month}/days/{businessDate}`: 上記 5 sales fields + `byCategory.{items|extraCost|sideGameChip|tournaments}` + `byPaymentMethod.{method}`
- `analyticsMonthly/{month}/byCategory/summary`: `totals.{items|extraCost|sideGameChip|tournaments}` （`itemSales.{menuItemId}.qty/sales/name/category` は product-level なので Step07 では touch しない）
- `analyticsMonthly/{month}/byUser/{userId}`: 上記 5 sales fields + `dailySales.{businessDate}` + `paymentTotals.{method}` + `pokerName` （※ adjustment では `orderCount` increment しない、`pokerName` は touch しない）
- `analyticsMonthly/{month}/byTemplateTournaments/{templateKey}`: `daily.{businessDate}.{entryCount|entrySales|reentryCount|reentrySales|addonCount|addonSales}` + `totals.{...}` + `templateName`

### 4.2 `aggregationMarkers` の key 命名

| 用途 | marker docId |
|---|---|
| settle 時 (current settle) | **`{billId}_cycle{cycleNo}_settle`** （new: 既存の `{billId}` から変更） |
| settle 時 (legacy 互換) | **`{billId}`** （legacy）: 既存 marker は migration なしで保持、reopen rollback 時に legacy も検出する |
| adjustment 反映 | `adj_{adjustmentId}` |
| cashAction 反映 | `cash_{cashActionId}` |
| reopen rollback | rollback 自体には marker なし（rollback は冪等な inverse increment + marker 削除で実現） |

### 4.3 settle marker 変更の backward compatibility

- 既存の `{billId}` marker doc は **削除しない**。reopen 時の rollback 処理で次の順で marker を確認・削除:
  1. `{billId}_cycle{cycleNo}_settle` (new)
  2. `{billId}` (legacy fallback)
- 新規 settle 経路 (`processBillAnalyticsAtomically`) では `{billId}_cycle{cycleNo}_settle` で marker を作成
- すでに `{billId}` legacy marker が存在する bill が初回 reopen される場合、 `{billId}` を rollback 対象として処理し、新 cycle settle 時には `{billId}_cycle{newCycleNo}_settle` を作成

## 5. 実装方針

### 5.1 全体構造

新規追加するヘルパは次の 2 層構造とする。

| 層 | 責務 | テスト方針 |
|---|---|---|
| **pure delta builder** | adjustment / cashAction を入力に increment object（sign 込み）を計算 | unit test |
| **atomic applier** | tx 内で marker check + READ phase + WRITE phase（5 sub-collection 各 increment）+ marker create | Emulator integration test |

`processBillAnalyticsAtomically`（既存）の構造を踏襲する。

### 5.2 新規 service ファイル

#### 5.2.1 `functions/src/domains/analytics/services/aggregator/adjustmentDelta.ts`

```ts
export interface AnalyticsCategoryAggregate {
  items: number;
  extraCost: number;
  sideGameChip: number;
  tournaments: number;
}

export interface AnalyticsTournamentTemplateAggregate {
  templateKey: string;
  templateName: string;
  entryCount: number;
  entrySales: number;
  reentryCount: number;
  reentrySales: number;
  addonCount: number;
  addonSales: number;
  totalSales: number;
}

export interface AdjustmentAnalyticsDelta {
  grossSales: number;
  byCategory: AnalyticsCategoryAggregate;
  byTemplateTournaments: AnalyticsTournamentTemplateAggregate[];
  userId: string | null;
}

export function buildAdjustmentAnalyticsDelta(input: {
  lines: AdjustmentLine[];
  billUserId?: string | null;
}): AdjustmentAnalyticsDelta;
```

仕様書 §13 / §14 / §15 / §16 を厳格に実装。各 line の `amountInclDelta` / `qtyDelta` を集計し、`targetCategory` で `byCategory` に振り分け、`tournament` の `operationType` で `byTemplateTournaments` に振り分ける。

`amountInclDelta` の符号はそのまま使う（仕様書 §13 / §18-1 「sum(lines[].amountInclDelta) = adjustment.adjustmentAmountIncl」+ direction で sign が決まる）ため、追加で sign 反転しない。

#### 5.2.2 `functions/src/domains/analytics/services/aggregator/cashActionDelta.ts`

```ts
export interface CashActionAnalyticsDelta {
  byPaymentMethod: Record<string, number>; // increment 量
}

export function buildCashActionAnalyticsDelta(input: {
  cashActionType: 'collection' | 'refund';
  methodBreakdown: { method: string; amountIncl: number }[];
}): CashActionAnalyticsDelta;
```

仕様書 §11 / §8.4: collection の場合のみ `methodBreakdown[].amountIncl` を `byPaymentMethod` に集計し、refund では空 object を返す。

#### 5.2.3 `functions/src/domains/analytics/services/applyAdjustmentToAnalytics.ts`

```ts
export interface ProcessAdjustmentAnalyticsParams {
  monthKey: string;          // bill.businessDate.substring(0, 7)
  businessDate: string;       // bill.businessDate
  billId: string;
  adjustmentId: string;
  delta: AdjustmentAnalyticsDelta;
}

export async function processAdjustmentAnalyticsAtomically(
  db: FirebaseFirestore.Firestore,
  params: ProcessAdjustmentAnalyticsParams
): Promise<void>;
```

`processBillAnalyticsAtomically` パターン:
1. tx 内で marker (`adj_{adjustmentId}`) を check、存在すれば early return
2. 5 sub-collection を tx.get で事前読み取り
3. 各 sub-collection を increment 更新（line 合計を直接 increment、`grossSales / itemsSales / 等` の sign は delta から）
4. marker `adj_{adjustmentId}` を tx.create

注意: tournament line の `byTemplateTournaments` は `daily.{businessDate}.entryCount/entrySales/...` を increment（既存 `addToByTemplateTournaments` の path 構造を踏襲）。

#### 5.2.4 `functions/src/domains/analytics/services/applyCashActionToAnalytics.ts`

```ts
export interface ProcessCashActionAnalyticsParams {
  monthKey: string;          // bill.businessDate.substring(0, 7)
  businessDate: string;       // bill.businessDate（cashflowBusinessDate ではない）
  billId: string;
  cashActionId: string;
  cashActionType: 'collection' | 'refund';
  delta: CashActionAnalyticsDelta;
  billUserId?: string | null;
}

export async function processCashActionAnalyticsAtomically(
  db: FirebaseFirestore.Firestore,
  params: ProcessCashActionAnalyticsParams
): Promise<void>;
```

1. `cashActionType === 'refund'` なら early return（仕様書 §11 / §8.4）
2. tx 内で marker (`cash_{cashActionId}`) check
3. `analyticsMonthly/{month}.paymentTotals.{method}` += amountIncl
4. `days/{businessDate}.byPaymentMethod.{method}` += amountIncl
5. `byUser/{userId}.paymentTotals.{method}` += amountIncl（userId あり時のみ）
6. marker `cash_{cashActionId}` を tx.create

注意: `byCategory` / `byTemplateTournaments` は cashAction では更新しない（売上差分は既に adjustment 側で反映済み）。

#### 5.2.5 `functions/src/domains/analytics/services/applyReopenRollbackToAnalytics.ts`

```ts
export interface ReopenRollbackInput {
  billId: string;
  prevCycleNo: number;
  bill: { businessDate: string; party?: { userId?: string } };
  prevBaselineDelta: AdjustmentAnalyticsDelta | null; // 旧 cycle baseline 寄与（rollback inverse の元）
  prevAdjustmentDeltas: { adjustmentId: string; delta: AdjustmentAnalyticsDelta }[];
  prevCollectionCashActionDeltas: { cashActionId: string; delta: CashActionAnalyticsDelta }[];
}

export async function applyReopenRollbackToAnalyticsAtomically(
  db: FirebaseFirestore.Firestore,
  input: ReopenRollbackInput
): Promise<void>;
```

1. tx 内で次の marker をすべて削除（存在する分のみ）:
   - settle: `{billId}_cycle{prevCycleNo}_settle` または legacy `{billId}`
   - adjustment 群: `adj_{adjustmentId}` 各
   - collection cashAction 群: `cash_{cashActionId}` 各
2. 各 delta を **inverse increment** で 5 sub-collection に書き戻す
3. rollback 自体は idempotent（marker 削除で「rollback 済み」を示す）

reopen rollback は別 transaction で実行する（separate-tx 方針）。reopen 自体の bills 側 transaction が成功した後に呼ぶ。

### 5.3 既存 repo の修正

#### 5.3.1 `functions/src/domains/bills/repos/createPostSettlementAdjustment.ts`

bills 側 transaction（adjustment doc / cashAction doc / parent doc / idempotency 書き込み）が成功した後で:

```ts
if (storeConfig.features?.settlementAggregatorEnabled) {
  try {
    const delta = buildAdjustmentAnalyticsDelta({
      lines: adjustmentDoc.lines,
      billUserId: bill.party?.userId ?? null,
    });
    await processAdjustmentAnalyticsAtomically(db, {
      monthKey: bill.businessDate.substring(0, 7),
      businessDate: bill.businessDate,
      billId,
      adjustmentId,
      delta,
    });

    // immediate cashAction（decrease_refunded / increase_collected）の場合は cashAction 反映も呼ぶ
    if (cashActionDoc !== null && cashActionDoc.cashActionType === 'collection') {
      const cashDelta = buildCashActionAnalyticsDelta({
        cashActionType: cashActionDoc.cashActionType,
        methodBreakdown: cashActionDoc.methodBreakdown,
      });
      await processCashActionAnalyticsAtomically(db, {
        monthKey: bill.businessDate.substring(0, 7),
        businessDate: bill.businessDate,
        billId,
        cashActionId,
        cashActionType: cashActionDoc.cashActionType,
        delta: cashDelta,
        billUserId: bill.party?.userId ?? null,
      });
    }
  } catch (analyticsError) {
    logOpsError({ ... });
    // bills は既に書かれているため、callable response は success
  }
}
```

#### 5.3.2 `functions/src/domains/bills/repos/recordPostSettlementCashAction.ts`

bills 側 transaction 成功後:

```ts
if (storeConfig.features?.settlementAggregatorEnabled && cashActionType === 'collection') {
  try {
    const cashDelta = buildCashActionAnalyticsDelta({
      cashActionType: 'collection',
      methodBreakdown,
    });
    await processCashActionAnalyticsAtomically(db, {
      monthKey: bill.businessDate.substring(0, 7),
      businessDate: bill.businessDate,
      billId,
      cashActionId,
      cashActionType: 'collection',
      delta: cashDelta,
      billUserId: bill.party?.userId ?? null,
    });
  } catch (analyticsError) {
    logOpsError({ ... });
  }
}
```

#### 5.3.3 `functions/src/domains/bills/repos/reopenAccountedBill.ts`

bills 側 transaction 成功後:

```ts
if (storeConfig.features?.settlementAggregatorEnabled) {
  try {
    // 旧 cycle baseline / adjustment / collection cashAction の delta を組み立てる
    // baseline は bill から派生、adjustment は cycle 配下の effective 群、cashAction は cycle 配下の completed_by_cash_action collection 群
    const rollbackInput = await buildReopenRollbackInputFromCycle(db, billId, prevCycleNo);
    await applyReopenRollbackToAnalyticsAtomically(db, rollbackInput);
  } catch (analyticsError) {
    logOpsError({ ... });
  }
}
```

#### 5.3.4 `functions/src/domains/analytics/services/updateAnalyticsForBill.ts`

`processBillAnalyticsAtomically` の marker key を `{billId}` から `{billId}_cycle{cycleNo}_settle` に変更:

```ts
// before
const markerRef = monthlyRef.collection('aggregationMarkers').doc(billId);

// after
const cycleNo = params.cycleNo ?? 1; // legacy 呼び出しは cycle 1 とみなす
const markerRef = monthlyRef.collection('aggregationMarkers').doc(`${billId}_cycle${cycleNo}_settle`);
```

`params` に `cycleNo` を追加。`enqueueSettlement` から渡せるようにする。

#### 5.3.5 `functions/src/domains/bills/triggers/billsOnSettle.ts`

`enqueueSettlement` 呼び出し時に `cycleNo` を bill から取得して渡す:

```ts
await enqueueSettlement({ ...billDoc, cycleNo: billDoc.reopenSummary?.currentSettlementCycle ?? 1 });
```

`BillDoc` 型に `cycleNo?: number` を追加。

#### 5.3.6 `functions/src/domains/analytics/services/aggregator/index.ts`

`enqueueSettlement` を `cycleNo` 受け取り対応:

```ts
export async function enqueueSettlement(bill: BillDoc): Promise<void> {
  // ...
  await processBillAnalyticsAtomically(db, {
    month: monthKey,
    businessDate,
    billId: bill.billId,
    cycleNo: bill.cycleNo ?? 1, // legacy 互換
    billData: bill,
  });
}
```

### 5.4 reopen rollback delta の組み立て

`buildReopenRollbackInputFromCycle` は次の手順で reopen 直前の旧 cycle 状態を読み取る:

1. `bills/{billId}/settlementCycles/{prevCycleNo}/baselineSnapshot/{BASELINE_SNAPSHOT_DOC_ID}` を読み取り baseline category breakdown / paymentTotals を再構成
2. `bills/{billId}/settlementCycles/{prevCycleNo}/adjustments` の `adjustmentState IN ('effective', 'completed_by_cash_action', 'completed_by_offset')` を取得（`cancelled_by_reopen` は今回処理対象なので除外）
3. `bills/{billId}/settlementCycles/{prevCycleNo}/cashActions` の `cashActionType === 'collection'` を取得（refund は元々 paymentTotals 触らない）

各 doc から delta を再生成し、`applyReopenRollbackToAnalyticsAtomically` に渡す。

注意: rollback は **inverse increment**。delta の符号を反転して increment する形で実装。

### 5.5 既存 callable に追加するエラー処理

analytics 更新失敗は既存 `logOpsError` を使い、callable response は `success: true` を返す（bills が成功している以上、callable contract は成功扱い）。

```ts
} catch (analyticsError) {
  logOpsError({
    operation: 'create_post_settlement_adjustment_analytics_apply',
    severity: 'medium',
    errorKey: 'BILLS_ANALYTICS_ADJUSTMENT_APPLY_FAILED',
    fallbackHandled: true,
    error: analyticsError as Error,
    context: { billId, adjustmentId, monthKey: bill.businessDate.substring(0, 7) },
  });
}
```

`cloud-functions-error-logging.mdc` § 1〜§3 に従う。

### 5.6 feature flag (`settlementAggregatorEnabled`) 制御

すべての analytics 反映は flag 真の場合のみ実行する。flag が無効な store では従来どおり analyticsMonthly は更新されない（後続 step で全 store ON 化する想定）。

## 6. 仕様書条項のマッピング

| 仕様書条項 | Step07 実装 |
|---|---|
| §5 役割（運用ダッシュボード read model） | 既存挙動維持、SoT は触らない |
| §6 3 つの日付軸 | adjustment 反映は `bill.businessDate`、cashAction 反映も `bill.businessDate`（cashflowBusinessDate は cashAction doc 内で audit 用） |
| §7.1 売上系日付 | 全部 `bill.businessDate` ベース |
| §8.1 / §8.3 / §8.4 paymentTotals | collection で増、refund で触らず |
| §9 支払手段 source | 既存 `calculatePaymentTotals` を踏襲（settle 経路）。Step07 では cashAction の `methodBreakdown` を直接使う |
| §10.1 settle / resettle | settle marker を `{billId}_cycle{cycleNo}_settle` に変更し、reopen 後の resettle で再反映可能化 |
| §10.2 adjustment 作成時 売上差分 | 5.3.1 で実装 |
| §10.3 cashAction 実行時 cashflow + paymentTotals | 5.3.2 で実装、collection のみ |
| §11 4 パターン matrix | 5.3.1 + 5.3.2 で網羅。immediate cashAction は同 callable 内、後続は cashAction callable |
| §12 lines[] 必須 / 4 category | adjustment service は既に Step03 で実装済み（line-less 不可） |
| §13 byCategory 配賦 | 5.2.3 / 5.3.1 で実装 |
| §14.1 top-level 配賦 | 5.2.3 / 5.3.1 で実装 |
| §14.2 days bucket は `bill.businessDate` 軸 | 5.2.3 / 5.3.1 で実装、`adjustment.createdAt` は使わない |
| §15 byUser | userId 有時のみ |
| §16 byTemplateTournaments | tournament line のみ、operationType 別、template key |
| §17 future 機能（ledger / cashflowMonthly / 等） | スコープ外。Step07 では新規 field / collection 追加なし |
| §18 整合条件 | 5.2.1 で各 invariant を guard |
| §19 不可条件 | analyticsMonthly を SoT にしない、card 後日入金混ぜない、product-level 追加しない |

## 7. 影響範囲の境界

### 7.1 変更しないもの

- `analyticsMonthly` の既存 schema / fields（新規追加なし）
- `processBillAnalyticsAtomically` の core ロジック（marker key のみ変更）
- 既存 `addToMonthlyIndex` / `addToDailySummary` / `addToByCategory` / `addToByUser` / `addToByTemplateTournaments`（settle 経路で再利用、Step07 では touch しない）
- `enqueueEvent` / `applyMonthlyDailyDelta` / `buildEventDelta` / `buildSettlementDelta`（dead に近い経路、Step07 では使わない）
- `storeMeta/applyCloseSnapshot.ts`
- Flutter UI 側

### 7.2 変更するもの

- `processBillAnalyticsAtomically` の marker key（`{billId}` → `{billId}_cycle{cycleNo}_settle`）+ legacy 互換
- `enqueueSettlement` / `BillDoc` 型に `cycleNo` 追加
- `billsOnSettle.ts` で `cycleNo` を渡す
- `createPostSettlementAdjustment.ts` で analytics 反映呼び出し追加
- `recordPostSettlementCashAction.ts` で analytics 反映呼び出し追加
- `reopenAccountedBill.ts` で rollback 呼び出し追加

### 7.3 新規追加

- `aggregator/adjustmentDelta.ts`
- `aggregator/cashActionDelta.ts`
- `applyAdjustmentToAnalytics.ts`
- `applyCashActionToAnalytics.ts`
- `applyReopenRollbackToAnalytics.ts`
- `buildReopenRollbackInputFromCycle.ts`（reopen 用 delta builder）

### 7.4 テスト追加

- 新規 unit test:
  - `__tests__/analytics/adjustmentDelta.spec.ts`
  - `__tests__/analytics/cashActionDelta.spec.ts`
- 新規 Emulator integration test:
  - `__tests__/analytics/applyAdjustmentToAnalytics.spec.ts`
  - `__tests__/analytics/applyCashActionToAnalytics.spec.ts`
  - `__tests__/analytics/applyReopenRollbackToAnalytics.spec.ts`
- 既存 spec の拡張:
  - `__tests__/callables/createPostSettlementAdjustment.spec.ts`
  - `__tests__/callables/recordPostSettlementCashAction.spec.ts`
  - `__tests__/callables/reopenAccountedBill.spec.ts`

## 8. リスクと緩和策

| リスク | 緩和 |
|---|---|
| settle marker key 変更で既存 store の billId-only marker と衝突 | 新 settle 経路は `{billId}_cycle1_settle` で書く。legacy `{billId}` marker は共存可能。reopen rollback 時に両方を delete。settle 二重計上は新 marker が separate なので発生しない |
| reopen rollback で削除しきれない場合の二重計上 | rollback marker check は idempotent。失敗時は log のみ、retry は admin 操作で実施 |
| analytics 更新失敗で bills が success のまま運用に乗る | `logOpsError(severity: medium)` + ops dashboard で監視。データ整合は別途 reconcile script |
| 大量 line / 大量 adjustment / 大量 cashAction で transaction size 超過 | 通常運用では 1 adjustment あたり数件 line 程度。tx size を超える場合は `applyXxxAtomically` 内で分割（current scope では発生想定なし） |
| `buildReopenRollbackInputFromCycle` の cycle 配下読み取りが古いデータでスキーマ違反 | rollback 失敗時は log のみ。bills 側の reopen 自体は成功 |

## 9. 後方互換性チェック

- 既存 settle 経路（`{billId}` marker で書かれた既存 bill）: legacy `{billId}` marker が残り続ける限り、再 settle / reopen では rollback 対象として扱われる
- 既存 callable signature 変更なし（response shape 維持）
- Flutter 側変更なし
- `flag = false` 環境では analytics 更新を完全 skip → 既存挙動と一致

## 10. 実装順序

1. **Phase A**: pure delta builder (`adjustmentDelta.ts` / `cashActionDelta.ts`) + unit test
2. **Phase B**: atomic applier (`applyAdjustmentToAnalytics.ts` / `applyCashActionToAnalytics.ts`) + Emulator integration test
3. **Phase C**: settle marker key 変更 (`processBillAnalyticsAtomically` + `enqueueSettlement` + `BillDoc`型 + `billsOnSettle.ts`) + 既存 spec regression 確認
4. **Phase D**: callable 拡張 (`createPostSettlementAdjustment` / `recordPostSettlementCashAction`) + 既存 spec 拡張
5. **Phase E**: reopen rollback (`buildReopenRollbackInputFromCycle.ts` / `applyReopenRollbackToAnalytics.ts` + `reopenAccountedBill` 拡張) + 既存 spec 拡張
6. **Phase F**: ドキュメント (`03_仕様書トレース確認.md` / `04_確認観点と確認方法.md` / `05_実装サマリ.md` / `06_確認結果サマリ.md` / `07_後続ステップへの伝達事項.md` / `08_実機確認手順.md` / `README.md`) 作成 + `00_全体進行管理.md` 更新

各 Phase で `npm run build && npm run lint && firebase emulators:exec --only firestore --project test-step07 "cd functions && npm test -- --runInBand"` を実行して regression を回避する。
