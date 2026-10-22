# 02_changeSpec

## 1. 目的

Step03 では、bill の **会計後差分** を `bills/{billId}/settlementCycles/{cycleNo}/adjustments/{adjustmentId}` として保存し、4 パターンの adjustment 作成・opposite-direction 内部相殺・parent 反映を新経路で実装する。

旧 `bills/{billId}/events` 経路 (`postEventAdjustment` / `billsEventsOnCreate` / `updateAccounting` 等) はこのステップでは **触らない**。新経路と旧経路は並行して存在し、UI 切替は Step06 主責務とする。

## 2. スコープ

### 2.1 対象（新規実装）

- `bills/{billId}/settlementCycles/{cycleNo}/adjustments/{adjustmentId}` への保存
- 4 パターンの adjustment 作成
  - `decrease_refund_pending`
  - `decrease_refunded`
  - `increase_collection_pending`
  - `increase_collected`
- `lines[]` の必須化と整合検証
  - `sum(lines[].amountInclDelta) = adjustmentAmountIncl`
  - `tournament` line の `targetId` / `operationType` 必須
  - `qtyDelta` / `amountInclDelta` の符号一致
- `requiredActionRemainingIncl` 初期値の決定
- opposite-direction 内部相殺
- parent 反映
  - `currentSummary.claimTotalIncl / netSalesIncl` 更新
  - `postSettlementState.totalAdjustmentsIncl / requiredActionType / requiredActionIncl / lastRecordType` 更新
  - `status` を `post_settlement_pending` または `settled` に切り替え
- `settlementCycles/{cycleNo}.nextSequenceNo` の採番と increment
- immediate パターンの **同一トランザクション cashAction 作成（最小 shape）**
- 新規 callable `createPostSettlementAdjustment` の internal API 完成
- Step03 配下の docs / trace / check / handoff 整備

### 2.2 非対象（後続へ送る）

- cashAction の later パターン（`cashActions` 単独作成）
- cashAction の field 拡張・full validation・`cashflowBusinessDate` 運用ロジック → Step04 主責務
- `reopen` 実行・`cancelled_by_reopen` 遷移 → Step05 主責務
- UI 接続（`postAccountingAdjustmentDialog` 等の差し替え） → Step06 主責務
- `analyticsMonthly` への line 配賦本接続 → Step07 主責務
- `supersededByAdjustmentId` の運用本実装（訂正フロー） → 後続 step
- 旧経路 (`postEventAdjustment` / `billsEventsOnCreate` 等) の削除 / 改修
- migration / backfill

## 3. 変更対象

### 3.1 データ構造

#### 追加 collection

```text
bills/{billId}
└─ settlementCycles/{cycleNo}
   ├─ cycle親doc                        ... Step02 で導入済み（nextSequenceNo を Step03 で消費）
   ├─ baselineSnapshot/{snapshot}      ... Step02 で導入済み
   ├─ adjustments/{adjustmentId}       ... Step03 で新規追加
   └─ cashActions/{cashActionId}       ... Step03 で immediate 用最小 writer のみ追加
```

#### `adjustments/{adjustmentId}` doc 構造（Step03 で書く field）

```typescript
{
  sequenceNo: number,                                 // cycle.nextSequenceNo から採番
  adjustmentType:
    | 'decrease_refund_pending'
    | 'decrease_refunded'
    | 'increase_collection_pending'
    | 'increase_collected',
  adjustmentDirection: 'decrease' | 'increase',
  adjustmentAmountIncl: number,                       // 正の値（方向は adjustmentDirection で表現）
  cashActionTypeAtCreation: 'none' | 'refund' | 'collection',
  cashActionHandledAtCreation: boolean,
  adjustmentState:
    | 'effective'
    | 'completed_by_cash_action'
    | 'completed_by_offset'
    | 'cancelled_by_reopen',                          // Step03 では cancelled_by_reopen を書かない（値域だけ定義）
  requiredActionRemainingIncl: number,                // 0 以上
  createdAt: Timestamp,
  createdBy: string | null,
  note: string,
  lines: Array<AdjustmentLine>,
  supersededByAdjustmentId: string | null,            // Step03 では null 固定
}
```

#### `AdjustmentLine` 構造

```typescript
{
  lineNo: number,                                     // 1-based
  targetCategory: 'item' | 'extra' | 'tournament' | 'sideGameChip',
  targetId: string | null,                            // tournament は必須、それ以外は任意
  targetName: string,
  operationType:
    | 'sale'                                          // item 用
    | 'extra'                                         // extra 用
    | 'chip'                                          // sideGameChip 用
    | 'entry' | 'reentry' | 'addon',                  // tournament 用
  qtyDelta: number,                                   // 方向と符号一致
  amountInclDelta: number,                            // 方向と符号一致、合計 = adjustmentAmountIncl
  note: string,
}
```

#### `cashActions/{cashActionId}` 最小 shape（Step03 で書く範囲、Step04 で field 拡張）

```typescript
{
  sequenceNo: number,                                 // cycle.nextSequenceNo の次の値（adjustment と同一カウンタ）
  cashActionType: 'refund' | 'collection',
  amountIncl: number,
  executedAt: Timestamp,                              // adjustment.createdAt と同じ Timestamp を採用
  executedBy: string | null,
  cashflowBusinessDate: string,                       // bill.businessDate を借用（Step04 で本格ロジック化）
  methodBreakdown: Array<{ method: string; amountIncl: number }>,  // 引数 method を 1 件のみ載せる最小 shape
  allocations: Array<{ adjustmentId: string; amountIncl: number }>,// 1 件（同一 transaction で作る adjustment 自身）
  note: string,
}
```

#### parent 親 doc に追加で書く field

- `currentSummary.claimTotalIncl`
- `currentSummary.netSalesIncl`
- `postSettlementState.hasPostSettlementActivity = true`
- `postSettlementState.totalAdjustmentsIncl`
- `postSettlementState.requiredActionType`
- `postSettlementState.requiredActionIncl`
- `postSettlementState.lastRecordType = 'adjustment'`（immediate パターンでも `adjustment` で書く。cashAction の lastRecordType=`cash_action` は Step04 主責務とする）
- `postSettlementState.lastRecordAt`
- `postSettlementState.lastRecordId`
- `status`: remaining が残れば `post_settlement_pending`、なければ `settled`
- `updatedAt`: server timestamp

immediate パターンで cashAction も同時に作る場合は、cashAction 由来の field（`currentSummary.refundedTotalIncl` / `currentSummary.receivedTotalIncl` / `postSettlementState.totalRefundedIncl` / `postSettlementState.totalCollectedIncl`）も同一トランザクションで更新する。これは Step04 仕様書 §12 の責務だが、Step03 で immediate を実装する以上、parent への反映までを実装する必要がある。`lastRecordType` は **`adjustment`** で固定する（Step04 で later cashAction を実装するときに `cash_action` を上書きする想定）。

### 3.2 処理（新規）

#### `services/adjustments.ts`（新規）

純粋関数の集まり。Firestore に直接書かない。

- `validateAdjustmentInput(input)`
  - 4 パターン分岐の `cashActionTypeAtCreation` / `cashActionHandledAtCreation` / `adjustmentDirection` の整合
  - `adjustmentAmountIncl > 0`
- `validateLines(lines, direction, totalAmountIncl)`
  - `lines.length >= 1`
  - `sum(amountInclDelta) === ±totalAmountIncl`
  - 符号一致
  - tournament line の `targetId` / `operationType` 必須
  - 各 line の `targetCategory` / `operationType` の組み合わせ妥当性
- `buildAdjustmentDoc(input)`
  - 仕様書 §7 の必須 field を全部詰めた doc を返す
- `applyOppositeDirectionOffset({ existingAdjustments, newAdjustment })`
  - sequenceNo 昇順で opposite-direction adjustment を見つけ、`requiredActionRemainingIncl` を相殺
  - 0 になった adjustment は `completed_by_offset` に遷移するパッチを返す
  - 戻り値: `{ patches: Map<adjustmentId, partial>, newAdjustmentRemaining, newAdjustmentState }`
- `summarizeRemainingByDirection(adjustments)`
  - 全 adjustment を見て refund 側 remaining 合計 / collection 側 remaining 合計を返す
  - 仕様書 §16.3 の不変則検証用に使う

#### `services/cashActions.ts`（新規・最小）

- `buildImmediateCashActionDoc({ sequenceNo, cashActionType, amountIncl, allocationAdjustmentId, executedAt, executedBy, method, cashflowBusinessDate })`
  - 仕様書 04 §6 の必須 field を **最小限** で詰める
  - allocations は 1 件、methodBreakdown は 1 件
  - Step04 で field 拡張する前提

#### `services/parentSummary.ts`（既存に追加）

- `buildPostSettlementStateAfterAdjustment({ existingState, adjustmentDoc, summarizedRemaining, lastRecordId, lastRecordAt })`
  - `hasPostSettlementActivity = true`
  - `totalAdjustmentsIncl += signed amount`
  - `requiredActionType / requiredActionIncl` を `summarizedRemaining` から派生
  - `lastRecordType = 'adjustment'`
  - `lastRecordId = adjustmentId`
  - `lastRecordAt = adjustment.createdAt`
- `buildCurrentSummaryAfterAdjustment({ existingSummary, signedAmountDelta })`
  - `claimTotalIncl += signedAmountDelta`
  - `netSalesIncl += signedAmountDelta`
  - immediate refund パターンでは `refundedTotalIncl += amountIncl`、immediate collection パターンでは `receivedTotalIncl += amountIncl` を併せて足す
- `deriveStatusAfterAdjustment({ summarizedRemaining })`
  - remaining > 0 → `'post_settlement_pending'`
  - remaining = 0 → `'settled'`

#### `services/settlementCycles.ts`（既存に追加）

- `incrementCycleSequence(cycleData, count)` または transaction 内で `nextSequenceNo` を読み書きするためのキー定数のみ追加し、increment 自体は repo 側で transaction を使って行う方針とする
- 採番は repo 内で `tx.get(cycleRef)` → `tx.update(cycleRef, { nextSequenceNo: current + n })` の形で原子的に行う

#### `repos/createPostSettlementAdjustment.ts`（新規）

- transaction 内で:
  1. `bills/{billId}` を read（status / currentSettlementCycle / currentSummary / postSettlementState）
  2. `bills/{billId}/settlementCycles/{currentSettlementCycle}` を read（nextSequenceNo）
  3. status が `settled` または `post_settlement_pending` のみ許可
  4. 既存 adjustments を read（opposite offset 用）
  5. `validateAdjustmentInput` / `validateLines`
  6. `applyOppositeDirectionOffset`
  7. immediate パターンなら cashAction doc も組み立て
  8. `summarizeRemainingByDirection`（不変則 §16.3 の検証）
  9. `buildAdjustmentDoc` / `buildImmediateCashActionDoc`
  10. `buildPostSettlementStateAfterAdjustment` / `buildCurrentSummaryAfterAdjustment` / `deriveStatusAfterAdjustment`
  11. transaction で write
      - `adjustments/{adjustmentId}` set
      - `adjustments/{otherId}` patch（offset）
      - `cashActions/{cashActionId}` set（immediate のみ）
      - `settlementCycles/{cycleNo}` update（nextSequenceNo）
      - `bills/{billId}` update（parent summary / status / updatedAt）
- idempotency:
  - 入力に `idempotencyKey` を要求し、`bills/{billId}/idempotency/{billId}:adjustment:{idempotencyKey}` で既存検知（Step01 / Step02 と同型）

#### `callables/createPostSettlementAdjustment.ts`（新規）

- `onCall` で外部呼び出しを受ける。ユーザー権限チェック (`shared/devices`) を実施
- input zod schema で payload を検証
- repo に委譲し、`HttpsError` へエラー変換
- `logOpsSuccess` / `logOpsError` を `cloud-functions-error-logging` rule どおりに付ける
- `functions/src/index.ts` に export を追加し、`serviceByFunctionEntry.ts` に `service` 登録

### 3.3 テスト

#### unit テスト（新規）

- `adjustments.spec.ts`
  - 4 パターン分岐の `validateAdjustmentInput` 正常系・異常系
  - `validateLines`
    - `sum(amountInclDelta) !== adjustmentAmountIncl` で失敗
    - 符号不一致で失敗
    - tournament line の `targetId` / `operationType` 不足で失敗
  - `applyOppositeDirectionOffset`
    - 仕様書 §15.4 の例（refund 1000 後 collection 1500 → collection 残 500）
    - 完全相殺ケース
    - 同方向のみ存在で no-op
  - `summarizeRemainingByDirection`
    - 不変則 §16.3 検出（両残り > 0 検出）
- `cashActions.spec.ts`
  - `buildImmediateCashActionDoc` の最小 field 検証
- `parentSummary.spec.ts`（既存ファイルがあれば追記、なければ新規）
  - `buildPostSettlementStateAfterAdjustment` / `buildCurrentSummaryAfterAdjustment` / `deriveStatusAfterAdjustment`

#### Emulator 統合テスト（新規）

- `createPostSettlementAdjustment.spec.ts`
  1. `decrease_refund_pending`: adjustment doc 作成、parent `requiredActionType=refund`、`status=post_settlement_pending`、cycle.nextSequenceNo が 1 から 2 に
  2. `decrease_refunded`: adjustment + cashAction が同一 transaction で作成、adjustment.remaining=0、`status=settled`、cycle.nextSequenceNo が 1 から 3 に進む
  3. `increase_collection_pending`: `requiredActionType=collection`
  4. `increase_collected`: cashAction も作成され、`status=settled`
  5. opposite offset: refund pending 1000 + collection pending 1500 → collection 残 500、parent `requiredActionType=collection / requiredActionIncl=500`
  6. `lines[]` 不正で `failed-precondition` HttpsError
  7. idempotency replay で既存返却

## 4. AsIs -> ToBe

| 項目 | AsIs | ToBe |
|---|---|---|
| 保存先 | `bills/{billId}/events/{eventId}` | `bills/{billId}/settlementCycles/{cycleNo}/adjustments/{adjustmentId}` |
| field | `type` / `adjustment.{sign, amountIncl}` 程度 | 仕様書 §7 の必須 field 一式 |
| 4 パターン分岐 | `sign` (+1/-1) のみ | `adjustmentType` を 4 値から選ぶ |
| `lines[]` | なし | 必須、`sum = adjustmentAmountIncl`、tournament 詳細あり |
| `requiredActionRemainingIncl` | なし | adjustment ごとに保持、cashAction / offset で減らす |
| internal offset | なし | sequenceNo 順で opposite 相殺 |
| status | `partially_refunded` / `refunded` / `voided` / `in_progress` | 新経路では `post_settlement_pending` / `settled` |
| immediate cashAction | 別 callable で別 transaction | 同一 transaction で最小 shape を作る |
| parent 反映 | `postEvents.*` のみ | `currentSummary.*` / `postSettlementState.*` / `status` |

## 5. 実装方針

### 5.1 実装順

1. `services/adjustments.ts` の純粋関数群（unit test 先行）
2. `services/cashActions.ts` の最小 writer
3. `services/parentSummary.ts` の adjustment 派生 helper 追加
4. `services/settlementCycles.ts` の sequence 採番方針確定（transaction 内で行う前提）
5. `repos/createPostSettlementAdjustment.ts` の transaction 実装
6. `callables/createPostSettlementAdjustment.ts` の callable 実装と `index.ts` export
7. `serviceByFunctionEntry.ts` への登録
8. Emulator 統合テスト
9. build / test を Emulator 下で実行
10. Step03 docs と handoff の更新

### 5.2 更新責務の境界

- Step03 は **新経路の追加** に閉じる
- 旧 `events` 経路は触らない
- cashAction は immediate のみ最小 shape で書き、later パターン / field 拡張 / strict validation は Step04 へ送る
- `cancelled_by_reopen` への遷移ロジックは Step05 へ送る（Step03 では値域定義のみ）
- UI 接続は Step06 へ送る
- analytics 接続は Step07 へ送る

### 5.3 後方互換の扱い

- 旧 `postEventAdjustment` / `postEventRefund` / `billsEventsOnCreate` / `updateAccounting` は変更しない
- 旧 status 値は `billsEventsOnCreate` 経由で書かれ続ける
- 新 status `post_settlement_pending` は新経路でのみ書く
- 旧 `postEvents.*` フィールドは新経路では更新しない（互換のため残置）
- migration / backfill は行わない

### 5.4 transaction 設計

- 全ての書き込みは **1 つの transaction 内** で完結する
- read 順:
  1. `bills/{billId}/idempotency/{key}`（idempotency 既存検知）
  2. `bills/{billId}`（status / currentSettlementCycle / currentSummary / postSettlementState）
  3. `bills/{billId}/settlementCycles/{cycleNo}`（nextSequenceNo）
  4. `bills/{billId}/settlementCycles/{cycleNo}/adjustments`（既存全 adjustment、opposite offset 用）
- write は read 完了後にまとめて実施
- transaction 内で外部 SDK 呼び出しを行わない（全て pure function 経由）

### 5.5 sequenceNo 採番のルール

- adjustment 作成時に `nextSequenceNo` から取得し、+1 して書き戻す
- immediate パターンで cashAction も作る場合は、`adjustment.sequenceNo = current`、`cashAction.sequenceNo = current + 1`、`cycle.nextSequenceNo = current + 2`
- adjustment と cashAction は同一カウンタを共有する（仕様書 §17 / 04 §14）

## 6. リスクと注意点

### 6.1 旧経路と新経路の併存

- 同一 bill に対して旧 `events` と新 `adjustments` が両方書かれる可能性がある
- Step03 では UI を切り替えないので、本番運用が始まらない限り重複書き込みは発生しない想定
- 万一テスト用途で両方呼ばれた場合、旧 trigger は parent の `postEvents.*` を、新 callable は `currentSummary.*` / `postSettlementState.*` / `status` を更新するため、フィールドが衝突しないことが前提（=現状コードの fields は分離されている）

### 6.2 status の二重管理

- 新経路で `status = post_settlement_pending` を書いた直後に、旧経路の `processRefund` 等が呼ばれると `partially_refunded` 等で上書きされる可能性
- Step03 では UI が新経路を呼ばないため、業務的に発生しない想定
- 注意点として 07_後続伝達 に明記する

### 6.3 nextSequenceNo の競合

- 同時に複数 adjustment を作るレース条件は transaction で防ぐ
- 万が一 cycle doc が欠損していた場合は **invalid state** として `failed-precondition` を返す（Step02 で settle 時に on-demand 作成しているが、create path で必ず作っているため通常は欠損しない）

### 6.4 仕様書 §16.3 の不変則

- 「refund 側 remaining 合計 > 0 かつ collection 側 remaining 合計 > 0」が同時成立する状態は許可しない
- 内部相殺ロジックを正しく実装すれば自然と満たされるが、念のため transaction 内で `summarizeRemainingByDirection` を呼んで assertion する

### 6.5 immediate cashAction の最小 shape

- Step03 では `methodBreakdown` を引数 `method` 1 件で固定。複数 method の cashAction は Step04 で対応
- `cashflowBusinessDate` は `bill.businessDate` を借用し、`calcBusinessDate` の AMBIGUOUS / NONE 処理は Step04 で本格化する

## 7. 実施チェック

- [x] 仕様書（[03_adjustments管理.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/04_仕様書/03_adjustments管理.md)）と整合している
- [x] 現状確認 [01_現状確認と影響範囲.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_changeSpecと実装/03_adjustments管理/01_現状確認と影響範囲.md) を踏まえている
- [x] テスト方針に接続できている
- [x] 旧経路を触らない方針を明記している
- [x] immediate cashAction を Step04 へ受け流す境界を明記している
- [x] reopen 関連 (`cancelled_by_reopen`) を Step05 へ送る境界を明記している
- [x] UI 接続を Step06 へ、analytics を Step07 へ送る境界を明記している
