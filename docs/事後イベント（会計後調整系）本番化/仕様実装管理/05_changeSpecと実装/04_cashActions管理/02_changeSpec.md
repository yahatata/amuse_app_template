# 02_changeSpec

## 1. 目的

Step04 では、bill の **会計後実入出金** を `bills/{billId}/settlementCycles/{cycleNo}/cashActions/{cashActionId}` として保存する **本実装** を行う。

具体的には:

- later パターン用の新 callable 2 本（`recordPostSettlementRefund` / `recordPostSettlementCollection`）を追加し、adjustment 既存の bill に対して後続 cashAction で remaining を解消できるようにする
- multi method `methodBreakdown[]` / multi adjustment `allocations[]` をサポートする
- `cashflowBusinessDate` を `calcBusinessDate(executedAt)` ベースで導出し、AMBIGUOUS / NONE のときは `bill.businessDate` を borrow するロジックを実装する
- adjustment の `requiredActionRemainingIncl` 減算と `completed_by_cash_action` 遷移を仕様書 §10 どおりに実装する
- parent doc の cashAction 由来 field 反映（`currentSummary.refundedTotalIncl/receivedTotalIncl`、`postSettlementState.totalRefundedIncl/totalCollectedIncl`、`requiredActionType/requiredActionIncl`、`lastRecordType = 'cash_action'`）を本格実装する
- Step03 で先行実装した immediate cashAction 経路（`createPostSettlementAdjustment` 内）も Step04 仕様に**統合**し、`lastRecordType = 'cash_action'` を含めて仕様書 04 §12.3 完全準拠にする

旧 `bills/{billId}/events` 経路（`postEventRefund` / `postEventAdjustment` / `billsEventsOnCreate` 等）は Step04 でも触らない。並存方針は Step01〜Step03 と同じ。

## 2. スコープ

### 2.1 対象（新規実装）

#### 2.1.1 新 callable

- `recordPostSettlementRefund`: 会計後の later 返金 cashAction 作成
- `recordPostSettlementCollection`: 会計後の later 徴収 cashAction 作成

両 callable は内部で共通 repo（`recordPostSettlementCashAction`）に委譲する。`cashActionType` は callable レベルで固定。

#### 2.1.2 services 拡張

- `services/cashActions.ts`
  - `buildCashActionDoc(...)` の追加（multi method / multi allocation 対応の汎用 builder）
  - `validateMethodBreakdown(...)`（複数 method の amountIncl 合計検証 + method 文字列検証）
  - `validateAllocations(...)`（仕様書 §9.4 / §15 の整合検証 + over-allocation 検出 + 異 cycle 混在禁止）
  - `applyAllocationsToAdjustments(...)`（仕様書 §10 の adjustment patch 計算）
  - 既存 `buildImmediateCashActionDoc` は内部で `buildCashActionDoc` に委譲（後方互換）

- `services/parentSummary.ts`
  - `buildPostSettlementStateAfterCashAction({...})` 追加
  - `buildCurrentSummaryAfterCashAction({...})` 追加
  - `deriveStatusAfterCashAction({...})` 追加（`adjustment` 派生と同じ shape を返すが、内部で `lastRecordType = 'cash_action'` 固定）

- `services/cashActions.ts` または独立 helper
  - `resolveCashflowBusinessDate(...)`: 仕様書 04 §6 の `cashflowBusinessDate` 解決ロジック

#### 2.1.3 repo 新設

- `repos/recordPostSettlementCashAction.ts`
  - transaction 内で:
    1. idempotency 既存検知
    2. bill / cycle / 対象 adjustment doc を read
    3. status precondition 検証（`post_settlement_pending` のみ許可。`settled` で remaining なしの場合は弾く）
    4. allocations の整合検証（§9.4 / §15）
    5. methodBreakdown の整合検証（§8）
    6. cashflowBusinessDate 解決（input 優先 → `calcBusinessDate` → AMBIGUOUS/NONE で `bill.businessDate`）
    7. `nextSequenceNo` から sequenceNo を採番
    8. `buildCashActionDoc`
    9. `applyAllocationsToAdjustments` で adjustment patch を計算
    10. parent 反映材料を集計
    11. 全 write を transaction で実行
    12. idempotency doc に `result` を保存
  - レスポンス shape は `createPostSettlementAdjustment` と類似（diagnostics.reused 等含む）

#### 2.1.4 repo 拡張

- `repos/createPostSettlementAdjustment.ts` の immediate 経路
  - `services/cashActions.ts` の **新** `buildCashActionDoc` を使うように差し替え（最小 builder で動かしていた部分を共通化）
  - cashflowBusinessDate 解決を **新** `resolveCashflowBusinessDate` に委譲
  - `lastRecordType` を `'adjustment'` から `'cash_action'` に書き換える条件を実装:
    - immediate cashAction が作られた場合のみ `'cash_action'`
    - cashAction が作られず adjustment のみの場合は `'adjustment'` のまま
  - parent 反映で `buildPostSettlementStateAfterCashAction` / `buildCurrentSummaryAfterCashAction` を併用するよう調整

### 2.2 非対象（後続へ送る）

- 旧経路 (`postEventRefund` / `postEventAdjustment` / `billsEventsOnCreate` / `processRefund` / `updateAccounting`) の改修・廃止
- UI 接続（旧 callable から新 callable への差し替え） → **Step06 主責務**
- `analyticsMonthly` への `paymentTotals` / `cashflow` 反映 → **Step07 主責務**
- `getRefundHistory` の本実装 → **Step06 主責務**
- `cancelled_by_reopen` 遷移 → **Step05 主責務**（cashAction 側でも reopen 時は `cancelled_by_reopen` にしないことを念のため確認）
- card 後日入金 / fee の厳密管理 → future
- 自社/他社 point treatment → future
- migration / backfill → 行わない

## 3. 変更対象

### 3.1 データ構造

#### 3.1.1 既存利用

```text
bills/{billId}
└─ settlementCycles/{cycleNo}
   ├─ cycle親doc                        ... Step02 で導入済み（nextSequenceNo を Step04 でも消費）
   ├─ baselineSnapshot/{snapshot}      ... Step02 で導入済み
   ├─ adjustments/{adjustmentId}       ... Step03 で導入済み（Step04 で remaining/state を update）
   └─ cashActions/{cashActionId}       ... Step03 で immediate writer のみ。Step04 で本格化
```

#### 3.1.2 `cashActions/{cashActionId}` doc shape（Step04 で書く field）

```typescript
{
  sequenceNo: number,                                 // cycle.nextSequenceNo から採番
  cashActionType: 'refund' | 'collection',
  amountIncl: number,                                 // > 0、sum(methodBreakdown) と sum(allocations) と一致
  executedAt: Timestamp,                              // server now を採用
  executedBy: string | null,
  cashflowBusinessDate: string,                       // input 優先 → calcBusinessDate → bill.businessDate fallback
  methodBreakdown: Array<{
    method: string,                                   // current-scope: cash / credit_card / electronic_money / qr / bank_transfer 等
    amountIncl: number,                               // > 0
  }>,
  allocations: Array<{
    adjustmentId: string,                             // 同一 cycle の adjustment id
    amountIncl: number,                               // > 0、対象 adjustment の remaining 以下
  }>,
  note: string,
}
```

#### 3.1.3 既存 adjustment doc に書く差分（Step04 で patch する field）

仕様書 §10:

- `requiredActionRemainingIncl`: `-= sum(該当 adjustment への allocation.amountIncl)`
- `adjustmentState`: 0 になった adjustment は `completed_by_cash_action`、残るものは `effective` のまま

#### 3.1.4 parent 親 doc 反映 field

仕様書 §12 の通り、refund / collection で別:

- 共通:
  - `postSettlementState.lastRecordType = 'cash_action'`
  - `postSettlementState.lastRecordAt = executedAt`
  - `postSettlementState.lastRecordId = cashActionId`
  - `postSettlementState.requiredActionType / requiredActionIncl` を再計算（adjustment 適用後の `summarizeRemainingByDirection` 結果から）
  - `postSettlementState.hasPostSettlementActivity = true`
  - `status`: 未解消なしで `settled`、残れば `post_settlement_pending`
  - `updatedAt`: server timestamp
- refund:
  - `currentSummary.refundedTotalIncl += amountIncl`
  - `postSettlementState.totalRefundedIncl += amountIncl`
- collection:
  - `currentSummary.receivedTotalIncl += amountIncl`
  - `postSettlementState.totalCollectedIncl += amountIncl`

`paymentTotals` / `paymentsSummary` は **触らない**（Step07 主責務）。

#### 3.1.5 idempotency doc

- パス: `bills/{billId}/idempotency/recordPostSettlementCashAction:{idempotencyKey}`
- field: `requestHash` / `createdAt` / `expiresAt` / `result`
- `result` shape: cashActionId / cashActionType / amountIncl / cycleNo / sequenceNo / 解消した adjustment 一覧 / parent status

### 3.2 処理（新規）

#### 3.2.1 `services/cashActions.ts`（拡張）

純粋関数。Firestore に書かない。

##### 3.2.1.1 `buildCashActionDoc(input)`

```typescript
function buildCashActionDoc(input: {
  sequenceNo: number;
  cashActionType: 'refund' | 'collection';
  amountIncl: number;
  executedAt: unknown;
  executedBy: string | null;
  cashflowBusinessDate: string;
  methodBreakdown: Array<{ method: string; amountIncl: number }>;
  allocations: Array<{ adjustmentId: string; amountIncl: number }>;
  note?: string;
}): CashActionDoc;
```

検証:

- `amountIncl > 0` finite number
- `cashActionType in {'refund','collection'}`
- `cashflowBusinessDate` non-empty string
- `methodBreakdown.length >= 1`、各 method 非空文字、各 amountIncl > 0、`sum === amountIncl`
- `allocations.length >= 1`、各 adjustmentId 非空、各 amountIncl > 0、`sum === amountIncl`
- `note` は string、未指定なら空文字

##### 3.2.1.2 `validateMethodBreakdown(input)`

- 単独 helper として export し、`buildCashActionDoc` 内でも呼ぶ
- multi method の amount 合計検証

##### 3.2.1.3 `validateAllocations(input)`

```typescript
function validateAllocations(input: {
  allocations: Array<{ adjustmentId: string; amountIncl: number }>;
  cashActionAmountIncl: number;
  existingAdjustments: Array<{
    adjustmentId: string;
    cycleNo: number;
    adjustmentState: AdjustmentState;
    requiredActionRemainingIncl: number;
    adjustmentDirection: AdjustmentDirection;
  }>;
  expectedCycleNo: number;
  expectedDirection: AdjustmentDirection;  // refund→decrease, collection→increase
}): void;
```

検証（仕様書 §9.4 / §15）:

- `allocations.length >= 1`
- `sum === cashActionAmountIncl`
- 各 allocation 先 adjustment が `existingAdjustments` に存在する
- 全 allocation の対象 adjustment が `expectedCycleNo` に属する（異 cycle 混在禁止）
- 全 allocation の対象 adjustment が `expectedDirection` を持つ（refund cashAction は decrease 系 adjustment にのみ allocate 可、collection cashAction は increase 系のみ）
- 全 allocation の対象 adjustment が `adjustmentState === 'effective'` かつ `requiredActionRemainingIncl > 0`
- 各 allocation `amountIncl <= 対象 adjustment の remaining`（over-allocation 禁止）
- 同一 cashAction で同じ adjustmentId に複数 allocate しない（重複検出）

##### 3.2.1.4 `applyAllocationsToAdjustments(input)`

```typescript
function applyAllocationsToAdjustments(input: {
  allocations: Array<{ adjustmentId: string; amountIncl: number }>;
  existingAdjustments: Array<{
    adjustmentId: string;
    requiredActionRemainingIncl: number;
    adjustmentState: AdjustmentState;
    adjustmentDirection: AdjustmentDirection;
  }>;
}): {
  patches: Map<string, { requiredActionRemainingIncl: number; adjustmentState?: 'completed_by_cash_action' }>;
  adjustmentsAfterUpdate: Array<{...}>;
};
```

仕様書 §10:

- 各 allocation について `requiredActionRemainingIncl -= amountIncl`
- 0 になった adjustment は `adjustmentState = 'completed_by_cash_action'`
- 残った adjustment は `effective` のまま
- 戻り値の `patches` は transaction の update に渡す

##### 3.2.1.5 `resolveCashflowBusinessDate(input)`

```typescript
async function resolveCashflowBusinessDate(input: {
  inputBusinessDate?: string | null;
  executedAt: Date;
  billBusinessDate: string;
}): Promise<string>;
```

ロジック:

1. `inputBusinessDate` が non-empty string → そのまま採用
2. 1 でない場合 `calcBusinessDate(executedAt)` を呼ぶ
3. `calcBusinessDate` が AMBIGUOUS / NONE / 例外を返した場合 → `billBusinessDate` を borrow
4. `billBusinessDate` も空なら `Error('cashflowBusinessDate cannot be resolved')` を投げる

注意: `calcBusinessDate` の戻り値 shape は既存実装に従い、文字列が取れる場合は採用、`AMBIGUOUS` / `NONE` のフラグなら fallback。

##### 3.2.1.6 `buildImmediateCashActionDoc` の扱い

Step03 で書いた既存関数を **後方互換のため残す**。内部では新 `buildCashActionDoc` に委譲する。Step03 のテストはそのまま通る前提。

#### 3.2.2 `services/parentSummary.ts`（拡張）

- `buildPostSettlementStateAfterCashAction({...})` 追加
  - `lastRecordType = 'cash_action'`
  - `totalRefundedIncl` / `totalCollectedIncl` を増やす
  - `summarizedRemaining` から `requiredActionType` / `requiredActionIncl` を再派生
- `buildCurrentSummaryAfterCashAction({...})` 追加
  - refund なら `refundedTotalIncl += amountIncl`
  - collection なら `receivedTotalIncl += amountIncl`
  - `claimTotalIncl` / `netSalesIncl` は触らない（cashAction は売上を変えない）
- `deriveStatusAfterCashAction({...})` 追加（実体は `deriveStatusAfterAdjustment` と同じだが、責務分離のため別関数）

#### 3.2.3 `repos/recordPostSettlementCashAction.ts`（新規）

```typescript
export async function recordPostSettlementCashAction(
  request: RecordPostSettlementCashActionRequest
): Promise<RecordPostSettlementCashActionResponse>;
```

input:

```typescript
interface RecordPostSettlementCashActionRequest {
  billId: string;
  idempotencyKey: string;
  cashActionType: 'refund' | 'collection';
  amountIncl: number;
  executedBy: string | null;
  methodBreakdown: Array<{ method: string; amountIncl: number }>;
  allocations: Array<{ adjustmentId: string; amountIncl: number }>;
  cashflowBusinessDate?: string;
  note?: string;
}
```

transaction:

1. `idempotency/recordPostSettlementCashAction:{key}` を read
2. `bills/{billId}` を read（status / currentSettlementCycle / postSettlementState / currentSummary / businessDate）
3. status precondition 検証
   - `post_settlement_pending` または `settled` のみ許可
4. `bills/{billId}/settlementCycles/{currentSettlementCycle}` を read（nextSequenceNo）
5. allocation 先 adjustments を read
   - 仕様書 §15「異 cycle 混在禁止」のため、対象 adjustments は **必ず current cycle 配下** とする
   - 各 adjustment doc を `tx.get` で read
6. `validateMethodBreakdown` / `validateAllocations` 実行
7. `resolveCashflowBusinessDate` で businessDate 解決
8. `buildCashActionDoc` で doc 組立
9. `applyAllocationsToAdjustments` で adjustment patch 計算
10. `summarizeRemainingByDirection` で remaining 集計（patch 反映後の状態で）
11. `assertSingleSidedRemaining` で不変則検証
12. `buildPostSettlementStateAfterCashAction` / `buildCurrentSummaryAfterCashAction` / `deriveStatusAfterCashAction` で parent 反映材料計算
13. write:
   - `cashActions/{cashActionId}` set
   - `adjustments/{adjustmentId}` update（patches）
   - `cycle.nextSequenceNo += 1`
   - `bills/{billId}` update（status / currentSummary / postSettlementState / updatedAt）
   - `idempotency/...` set（result 含む）

idempotency:

- 入力に `idempotencyKey` を要求し、`bills/{billId}/idempotency/recordPostSettlementCashAction:{key}` で既存検知
- `requestHash` 不一致時は `failed-precondition`
- `result` 保存型（Step03 と同パターン）

#### 3.2.4 `callables/recordPostSettlementRefund.ts`（新規）

- `onCall`、device 権限チェック
- input zod schema は `cashActionType` を受けない（callable 名で固定）
- repo に `cashActionType: 'refund'` を渡して委譲

#### 3.2.5 `callables/recordPostSettlementCollection.ts`（新規）

- 同上、`cashActionType: 'collection'` を渡す

#### 3.2.6 `repos/createPostSettlementAdjustment.ts` の immediate 拡張

- 既存 immediate 経路で:
  - `services/cashActions.ts` の **新** `buildCashActionDoc` を使うように差し替え（後方互換維持。最小 shape の `buildImmediateCashActionDoc` は内部委譲化済み）
  - `cashflowBusinessDate` を **新** `resolveCashflowBusinessDate` 経由にする
  - cashAction が作られた場合の `lastRecordType` を `'cash_action'` に書き換える（仕様書 04 §12.3 完全準拠）
  - `parentSummary` 派生は **新** `buildPostSettlementStateAfterCashAction` / `buildCurrentSummaryAfterCashAction` をベースにし、adjustment 派生 (`buildPostSettlementStateAfterAdjustment` / `buildCurrentSummaryAfterAdjustment`) は cashAction が作られないケースのみ使う
  - 結果として:
    - cashAction が作られた場合: `lastRecordType = 'cash_action'`、`refundedTotalIncl/receivedTotalIncl` を cashAction 由来で書く
    - cashAction が作られない場合（pending パターン、または offset で完全相殺）: 従来どおり `lastRecordType = 'adjustment'`

### 3.3 logging / dependency 登録

- `functions/src/domains/bills/index.ts`: 新 callable 2 本を export
- `functions/src/shared/logging/serviceByFunctionEntry.ts`: `recordPostSettlementRefund` / `recordPostSettlementCollection` を `accounting` service に登録
- `FunctionCustomError` の errorKey 整理:
  - `ACCOUNTING_CASH_ACTION_INVALID`
  - `ACCOUNTING_CASH_ACTION_OVER_ALLOCATION`
  - `ACCOUNTING_CASH_ACTION_INVALID_ALLOCATION_TARGET`
  - 既存の `ACCOUNTING_INVARIANT_VIOLATION` / `ACCOUNTING_BILL_NOT_FOUND` / `ACCOUNTING_CYCLE_NOT_FOUND` / `ACCOUNTING_INVALID_STATE` / `ACCOUNTING_IDEMPOTENCY_MISMATCH` を再利用

### 3.4 テスト

#### 3.4.1 unit テスト（新規）

- `cashActions.spec.ts`（既存を拡張）
  - `buildCashActionDoc` の multi method / multi allocation
  - `validateMethodBreakdown` の合計不一致 / method 文字列不正
  - `validateAllocations` の §9.4 / §15 全パターン
    - allocations 空
    - 合計不一致
    - 異 cycle 混在
    - 不正方向 (refund cashAction で increase 系 adjustment への allocate)
    - completed adjustment への allocate
    - over-allocation
    - 重複 allocation
  - `applyAllocationsToAdjustments` の patch 計算（部分減 / 0 化 / multi adjustment 同時減）
  - `resolveCashflowBusinessDate` の優先順位（input → calcBusinessDate → fallback）
  - `buildImmediateCashActionDoc` の後方互換性

- `parentSummary.cashAction.spec.ts`（新規）
  - `buildPostSettlementStateAfterCashAction` の refund / collection
  - `buildCurrentSummaryAfterCashAction`
  - `deriveStatusAfterCashAction`

#### 3.4.2 Emulator 統合テスト（新規）

- `recordPostSettlementRefund.spec.ts`
  1. happy path: refund pending 1 件 → 全額 refund cashAction で完了
  2. multi method: 1000 を cash 600 + credit_card 400 で支払
  3. multi allocation: 2 件の refund pending を 1 cashAction で同時解消
  4. partial allocation: refund pending 1000 のうち 500 のみ refund
  5. over-allocation で `failed-precondition`
  6. allocations 空で `invalid-argument`（callable 段階）
  7. methodBreakdown 合計不一致で `failed-precondition`
  8. completed_by_offset 済 adjustment への allocate で `failed-precondition`
  9. collection 系 adjustment への refund cashAction allocate で `failed-precondition`
  10. status=open で `failed-precondition`
  11. idempotent replay
  12. permission denied (device inactive / no accounting option)
  13. cashflowBusinessDate 入力指定の優先
  14. parent 反映: `lastRecordType = 'cash_action'`、`refundedTotalIncl` / `totalRefundedIncl` 増、`status = settled`

- `recordPostSettlementCollection.spec.ts`（新規）
  - 上記の collection 版（必要最小限のケース。共通 repo を使うため refund 版でカバー済の検証は減らす）

#### 3.4.3 既存 Emulator テストの更新

- `createPostSettlementAdjustment.spec.ts`
  - immediate cashAction が作られたケースで `lastRecordType = 'cash_action'` を期待するように変更
  - cashflowBusinessDate の解決ロジックが Step04 で更新されることを反映（input 指定がない場合の挙動が `bill.businessDate` から `calcBusinessDate(executedAt)` ベースに変わるが、businessDate マップが定義されていないテスト環境では bill.businessDate fallback されるため、結果的には Step03 と同じ値が入るはず。マップ定義の有無に依存しないテストに調整）

#### 3.4.4 リグレッション

- 旧経路: `postEventRefund.spec.ts` / `refundProcessing.spec.ts` / `bills.events.onCreate.spec.ts` / `updateAccounting.spec.ts` / `postEventReopen.spec.ts` / `postEventCancel.spec.ts` を変更しない
- Step01 / Step02: `createBillWithActiveStay.spec.ts` / `bills.onSettle.spec.ts`
- Step03: `adjustments.spec.ts` / `parentSummary.adjustment.spec.ts` / `cashActions.spec.ts`（一部 immediate 経路は更新）

## 4. AsIs -> ToBe

| 項目 | AsIs（Step03 完了時点） | ToBe（Step04 完了時点） |
|---|---|---|
| later cashAction 経路 | なし | `recordPostSettlementRefund` / `recordPostSettlementCollection` callable |
| immediate cashAction shape | 最小 (method 1 件 / allocation 1 件) | 共通 `buildCashActionDoc` に統合（multi method / multi allocation 対応の上、immediate ケースでは現状と同じ単一 entry） |
| `methodBreakdown[]` | 1 件のみ | 複数 method 対応 |
| `allocations[]` | 新規 adjustment 1 件のみ | 複数 adjustment 対応、§9.4 / §15 全検証 |
| adjustment `requiredActionRemainingIncl` 減算 | immediate でのみ remaining=0 化 | later cashAction の allocations から減算、`completed_by_cash_action` 遷移 |
| `cashflowBusinessDate` | 入力 → bill.businessDate borrow のみ | 入力 → `calcBusinessDate(executedAt)` → AMBIGUOUS/NONE で bill.businessDate borrow |
| parent `lastRecordType` (immediate) | `'adjustment'` 固定 | cashAction 作成時のみ `'cash_action'`、それ以外は `'adjustment'` |
| parent `currentSummary.refundedTotalIncl` / `receivedTotalIncl` | adjustment 派生 helper でのみ | cashAction 派生 helper も追加、later 経路で使用 |
| parent `postSettlementState.totalRefundedIncl` / `totalCollectedIncl` | 同上 | 同上 |
| `paymentTotals` / `paymentsSummary` | 触らない | 触らない（Step07 主責務） |
| analyticsMonthly | 配線なし | 配線なし（Step07 主責務） |
| 旧経路 | 並存 | 並存（変更なし） |

## 5. 実装方針

### 5.1 実装順

1. `services/cashActions.ts` の純粋関数群拡張（unit test 先行）
2. `services/parentSummary.ts` の cashAction 派生 helper 追加（unit test 先行）
3. `services/cashActions.ts` の `resolveCashflowBusinessDate` 追加と calcBusinessDate 連携 unit test
4. `repos/recordPostSettlementCashAction.ts` の transaction 実装
5. `callables/recordPostSettlementRefund.ts` / `recordPostSettlementCollection.ts` の callable 実装
6. `index.ts` export と `serviceByFunctionEntry.ts` 登録
7. `repos/createPostSettlementAdjustment.ts` の immediate 経路統合（lastRecordType 切替含む）
8. Step03 の `createPostSettlementAdjustment.spec.ts` 更新（lastRecordType 期待値変更）
9. Emulator 統合テスト（refund / collection）
10. build / test を Emulator 下で実行
11. Step04 docs と handoff の更新

### 5.2 更新責務の境界

- Step04 は **新経路の追加 + Step03 immediate 経路の仕様準拠への統合** に閉じる
- 旧 `events` 経路は触らない
- analytics 接続は Step07 に送る
- UI 接続は Step06 に送る
- reopen 時の `cancelled_by_reopen` 遷移は Step05 に送る

### 5.3 後方互換の扱い

- `buildImmediateCashActionDoc` は API 互換を保ち、内部実装だけ `buildCashActionDoc` に委譲する
- Step03 で書いた immediate 経路のレスポンス shape (`createPostSettlementAdjustmentResponse`) は維持
- `createPostSettlementAdjustment.spec.ts` の immediate ケースで `lastRecordType` を期待する assertion は更新が必要（Step03 → Step04 の純粋な仕様準拠化）
- 旧 `processRefund` / `updateAccounting` を変更しない
- migration / backfill は行わない

### 5.4 transaction 設計

#### 5.4.1 `recordPostSettlementCashAction` の transaction 内 read 順

1. `bills/{billId}/idempotency/recordPostSettlementCashAction:{key}`
2. `bills/{billId}`（status / currentSettlementCycle / currentSummary / postSettlementState / businessDate）
3. `bills/{billId}/settlementCycles/{currentSettlementCycle}`（nextSequenceNo）
4. `bills/{billId}/settlementCycles/{currentSettlementCycle}/adjustments/{adjustmentId}` × 全 allocation 先（`tx.get` を allocations 個数分）

#### 5.4.2 read 後の write

- `cashActions/{cashActionId}` set（auto-id）
- 各 `adjustments/{adjustmentId}` update（patch）
- `settlementCycles/{currentSettlementCycle}` update（nextSequenceNo += 1）
- `bills/{billId}` update（status / currentSummary / postSettlementState / updatedAt）
- `idempotency/recordPostSettlementCashAction:{key}` set（result 含む）

#### 5.4.3 read 性能の注意

- allocations が大量（例 10 件以上）の場合、その数分 `tx.get` が走る
- current-scope では allocation 数の上限を設けない（仕様書に記載なし）
- ただし運用想定では multi allocation は 1 cashAction で 5 件程度が現実的
- パフォーマンス最適化は future（必要なら collection-level read で取り直す）

### 5.5 sequenceNo 採番ルール

- Step04 の later cashAction では `cycle.nextSequenceNo` から 1 件採番し、`cycle.nextSequenceNo += 1`
- adjustment と同一カウンタを共有（仕様書 §14）
- immediate パターン（Step03 統合済）は adjustment.sequenceNo + 1 を cashAction.sequenceNo として使い、`cycle.nextSequenceNo += 2` のまま

### 5.6 status precondition

- `recordPostSettlementCashAction` を呼べる bill status:
  - `post_settlement_pending`
  - `settled`（remaining なしの場合は弾かれるが、status だけでは弾かない）
- 業務上、`settled` 時には allocation 先 adjustment の remaining が 0 のはずなので、`validateAllocations` の `requiredActionRemainingIncl > 0` 制約で自動的に弾かれる

### 5.7 cashflowBusinessDate 解決の運用判断

- 採用案: 入力任意 → `calcBusinessDate(executedAt)` → AMBIGUOUS/NONE で `bill.businessDate` borrow
- 理由:
  - 仕様書 §6 で必須化されており、内部で必ず string 値を保証する
  - AMBIGUOUS/NONE で運用が止まらない
  - UTC 日付フォールバックは日付帰属を誤る恐れ
  - `bill.businessDate` borrow は「元会計日」の意味を保つ
  - 入力で明示指定する経路を残すことで運用上の柔軟性も確保

## 6. リスクと注意点

### 6.1 immediate 経路の lastRecordType 仕様変更

- Step03 で `'adjustment'` 固定だったものを Step04 で cashAction 作成時のみ `'cash_action'` に変える
- 既存テスト `createPostSettlementAdjustment.spec.ts` で `lastRecordType` を期待している assertion を更新する必要あり
- 業務ロジックとしては仕様書 04 §12.3 完全準拠なので問題ないが、回帰テストの差分を明確に追跡する

### 6.2 `cashflowBusinessDate` の AMBIGUOUS / NONE フォールバック

- `calcBusinessDate` の戻り値型を実装で確認する必要あり
- もし AMBIGUOUS / NONE が `null` や `undefined` 等の表現を取る場合、`resolveCashflowBusinessDate` でその扱いを実装する
- 既存 `postEventRefund` / `postEventAdjustment` の `eventBusinessDate` 解決ロジックを参考にする

### 6.3 over-allocation 検出のレース条件

- 同一 adjustment に対して 2 つの cashAction が同時に呼ばれる可能性
- transaction 内で `tx.get(adjustmentRef)` するため、片方の transaction が成功してもう片方は contention で retry → 最新の remaining で再評価される
- Firestore transaction の標準動作で対応可能

### 6.4 multi method の合計検証

- `sum(methodBreakdown[].amountIncl) === amountIncl` は厳密 `===` 判定（Step03 踏襲）
- 整数計算前提なので浮動小数の誤差は発生しない想定（金額は税込整数円）

### 6.5 旧経路との dual write

- Step04 でも UI を切り替えないため、新 callable は呼ばれない（テスト経由でのみ実行）
- 業務的には旧 `processRefund` が引き続き動く
- 仕様書 04 §1 の「実入出金の事実」を新経路で書き始めたい場合は Step06 で UI 切替

### 6.6 `paymentTotals` / `paymentsSummary` の整合

- Step04 で cashAction を作っても `paymentTotals` / `paymentsSummary` は更新しない
- 売上分析 read model としての `analyticsMonthly` 反映は Step07 主責務
- ただし Step04 完了時点で旧経路と新経路の `paymentsSummary.balanceDueIncl` 整合性は崩れない（旧 trigger は events の内容で計算、新 callable は触らない）

## 7. 実施チェック

- [x] 仕様書 [04_cashActions管理.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/04_仕様書/04_cashActions管理.md) と整合している
- [x] 現状確認 [01_現状確認と影響範囲.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_changeSpecと実装/04_cashActions管理/01_現状確認と影響範囲.md) を踏まえている
- [x] テスト方針に接続できている
- [x] 旧経路を触らない方針を明記している
- [x] Step03 immediate 経路を統合する境界を明記している
- [x] reopen 関連 (`cancelled_by_reopen`) を Step05 へ送る境界を明記している
- [x] UI 接続を Step06 へ、analytics を Step07 へ送る境界を明記している
- [x] callable 命名を `recordPostSettlementRefund` / `recordPostSettlementCollection` に確定（ユーザ確認済）
- [x] `lastRecordType` の immediate 仕様を `'cash_action'` 切替に確定（ユーザ確認済）
- [x] `cashflowBusinessDate` フォールバックを 入力 → calcBusinessDate → bill.businessDate borrow に確定
