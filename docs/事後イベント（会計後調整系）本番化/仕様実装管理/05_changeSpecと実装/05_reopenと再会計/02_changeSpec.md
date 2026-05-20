# 02_changeSpec

## 1. このファイルの役割

Step05（reopen と再会計）で行う変更を、仕様書 [04_仕様書/05_reopenと再会計.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/04_仕様書/05_reopenと再会計.md) と上流の [11_事後イベントの機能と業務パターン.md §6〜§10](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03.1_前提再設計/step3.11_未決論点の再決定/11_事後イベントの機能と業務パターン.md) を踏まえて、changeSpec として確定する。

## 2. 変更目的

会計済み（`settled` / `post_settlement_pending`）の bill を、当日営業日内に限り未会計 (`open`) に戻し、再会計を可能にする入口を本実装する。Step02 で導入した `settlementCycles` 基盤と Step03 で導入した `cancelled_by_reopen` 状態を、Step05 で初めて実運用する。

## 3. スコープ / 非対象

### 3.1 スコープ

- 新 callable `reopenAccountedBill` の追加
- 新 repo `reopenAccountedBill` の追加（cycle 切替トランザクション）
- `services/parentSummary.ts` に `buildParentDocPatchForReopen` を追加
- `services/settlementCycles.ts` に `buildReopenedCycleDocPatch` を追加
- `services/adjustments.ts` に `buildAdjustmentCancelledByReopenPatch` を追加
- 新 cycle (`cycleNo = oldCycleNo + 1`) を `cycleState='open'` で生成（baselineSnapshot は作らない）
- 旧 cycle 配下の effective adjustments を `cancelled_by_reopen` に遷移
- 親 doc を `status='open'` 等に再初期化、`reopenSummary` を更新
- 当日営業日（`storeMeta.currentBusinessDateKey`）チェック
- unit / Emulator integration / リグレッション test
- ドキュメント整備

### 3.2 非対象

- 旧経路 (`postEventReopen` callable / `billsEventsOnCreate` trigger) の touch / 廃止 → Step06
- UI 切替（旧 callable から新 callable への差替え） → Step06
- `analyticsMonthly` の rollback / resettle 反映 → Step07
- 当日以外の bill に対する reopen（current-scope 外、上流で禁止）
- migration / backfill（未リリース前提）
- `closeSummary` / `requireSpecialAttention` 等の補助 field reset（仕様書記述外、touch しない）

## 4. 主要決定事項（ユーザー確認済）

### 4.1 callable 名 → `reopenAccountedBill`

- 旧 callable `postEventReopen`（events 経路）と差別化
- 「会計済みを再開する」用途を明示

### 4.2 status 許可範囲 → 仕様書通り

- `settled` / `post_settlement_pending` のみ許可
- `post_settlement_resolved` は許可しない（仕様書 §6 通り）
- `open` / `in_progress` / `settling` / `voided` 等は弾く

### 4.3 親 doc reset 範囲 → 仕様書 §7.3 記述項目のみ

- `status` / `currentSummary` / `postSettlementState` の必要項目 / `reopenSummary` のみを更新
- `requireSpecialAttention` / `closeSummary` 等は touch しない
- 加えて、**当日営業日制約**を上流ルール §7（11_事後イベントの機能と業務パターン.md）から取り入れて precondition に追加

### 4.4 idempotency / 完了済 adjustment / zero-yen の扱い → 推奨案

- idempotency キーは `reopenAccountedBill:{billId}:{idempotencyKey}` を `bills/{billId}/idempotency` に保存（adjustment / cashAction と同一スキーム）
- 完了済 adjustment (`completed_by_cash_action` / `completed_by_offset`) と cashActions は touch しない（履歴として保持）
- `latestSettledCycle = 0` の bill は `failed-precondition` で拒否

## 5. 設計詳細

### 5.1 callable: `reopenAccountedBill`

#### 5.1.1 入力（zod schema）

```ts
const RequestSchema = z.object({
  billId: z.string().min(1, 'billId は必須です'),
  idempotencyKey: z.string().min(1).optional(),
  clientNonce: z.string().min(1).optional(),
  reason: z.string().nullable().optional(), // 任意の reopen 理由
});
```

`idempotencyKey` 解決順:

1. 入力で `idempotencyKey` が指定されていればそれを採用
2. それ以外なら `{billId}:reopenAccountedBill:{clientNonce ?? randomUUID()}` を内部生成

`requestHash` は callable / repo の入力としては取らず、repo 内で `{billId, idempotencyKey, reason, reopenedBy}` から SHA-256 で computed。idempotency 突合時にこの hash を比較する（client が hash を生成する責務はない）。

#### 5.1.2 認証 / 権限

- `auth.uid` 必須（unauthenticated を弾く）
- device 権限チェック（`isActive(device.status)`）
- 会計権限相当（`accounting` service と同一の検査）

#### 5.1.3 出力

```ts
{
  success: boolean, // 常に true（失敗時は throw HttpsError）
  billId: string,
  oldCycleNo: number,
  newCycleNo: number,
  reopenedAt: Timestamp,
  cancelledAdjustmentIds: string[], // 旧 cycle で cancelled_by_reopen 化した adjustmentId 一覧
  diagnostics?: { reused?: boolean }, // idempotent replay の場合のみ { reused: true }、それ以外 undefined
}
```

#### 5.1.4 エラー（HttpsError code → errorKey 内訳）

| HttpsError code | 発生条件 | repo の errorKey |
|---|---|---|
| `unauthenticated` | auth なし | （callable layer で throw、errorKey なし） |
| `permission-denied` | device 不在 / accounting 権限なし | （callable layer で throw、errorKey なし） |
| `invalid-argument` | zod validation 失敗 | （callable layer で throw、errorKey なし） |
| `failed-precondition` | bill 不在 | `ACCOUNTING_BILL_NOT_FOUND` |
| `failed-precondition` | status が `settled` / `post_settlement_pending` 以外 | `ACCOUNTING_INVALID_STATE` |
| `failed-precondition` | `bill.businessDate !== currentBusinessDateKey` | `BILLS_REOPEN_NOT_TODAY` |
| `failed-precondition` | `latestSettledCycle < 1` | `BILLS_REOPEN_NEVER_SETTLED` |
| `failed-precondition` | 旧 cycle 不在 | `ACCOUNTING_CYCLE_NOT_FOUND` |
| `failed-precondition` | `cycleState !== 'settled'` の cycle に対する reopen 試行 | `BILLS_REOPEN_CYCLE_STATE_INVALID` |
| `failed-precondition` | 同 idempotencyKey + 異 requestHash | `ACCOUNTING_IDEMPOTENCY_MISMATCH` |
| `internal` | その他 | （未指定） |

errorKey 命名方針:

- 既存 repo（`createPostSettlementAdjustment` / `recordPostSettlementCashAction` 等）と共有する条件（bill 不在 / status 不正 / cycle 不在 / idempotency 不一致）は `ACCOUNTING_*` を再利用
- Step05 固有の precondition（営業日 / 未会計 / cycle state） は `BILLS_REOPEN_*` を新設
- `mapFunctionCustomErrorToHttpsCode` で `ACCOUNTING_INVALID_STATE` / `BILLS_REOPEN_*` を `failed-precondition` に変換

### 5.2 repo: `reopenAccountedBill`

#### 5.2.1 transaction 開始前

1. `getCurrentBusinessDateKeyOrThrow()` で当日営業日 key を取得
   - storeMeta が `running` でない場合は `failed-precondition` 由来の error が伝搬する
   - これは reopen の precondition と整合（営業中でないと reopen 不可）

#### 5.2.2 transaction 内（順序保証）

1. **Idempotency check**
   - path: `bills/{billId}/idempotency/reopenAccountedBill:{idempotencyKey}`
   - 既存があれば、同 `requestHash` なら `result` を返却（reused=true）
   - 異 `requestHash` なら `failed-precondition`
2. **Bill read**
   - `bills/{billId}` を read、未存在なら `not-found`
3. **Status precondition**
   - `bill.status` が `settled` / `post_settlement_pending` のいずれか
   - それ以外なら `failed-precondition`
4. **当日営業日 precondition**
   - `bill.businessDate === currentBusinessDateKey`
   - 不一致なら `failed-precondition`（具体的な error key: `BILLS_REOPEN_NOT_TODAY`）
5. **`latestSettledCycle` precondition**
   - `bill.reopenSummary.latestSettledCycle >= 1`
   - 0 なら `failed-precondition`（error key: `BILLS_REOPEN_NEVER_SETTLED`）
6. **Old cycle read**
   - `bills/{billId}/settlementCycles/{currentSettlementCycle}`
   - `cycleState` が `settled` でなければ整合性違反として `failed-precondition`
7. **Effective adjustments read**
   - `bills/{billId}/settlementCycles/{currentSettlementCycle}/adjustments` の中で `adjustmentState='effective'` 全件を read
8. **Old cycle patch**
   - `cycleState='reopened'`
   - `closedAt=now`
   - `closedReason='reopen'`
9. **Effective adjustments patch**
   - 各 doc に `adjustmentState='cancelled_by_reopen'`、`cancelledAt=now`、`cancelledBy=uid`、`cancelReason='reopen'`を patch
   - `requiredActionRemainingIncl` は touch しない（履歴として残す）
10. **Parent doc patch**
    - `status='open'`
    - `currentSummary` ← `buildInitialCurrentSummary()`（zero reset）
    - `postSettlementState` ← `buildInitialPostSettlementState()`（zero reset、`requiredActionType='none'`、`requiredActionIncl=0`）
    - `reopenSummary.hasReopenHistory=true`
    - `reopenSummary.reopenCount += 1`
    - `reopenSummary.currentSettlementCycle = oldCycleNo + 1`
    - `reopenSummary.lastReopenedAt = now`
    - `reopenSummary.lastReopenedBy = uid`
    - `reopenSummary.latestSettledCycle` は touch しない（据え置き）
11. **New cycle create**
    - path: `bills/{billId}/settlementCycles/{newCycleNo}`
    - doc: `buildInitialCycleDoc({ cycleNo: newCycleNo, openedAt: now, openedBy: uid, openedReason: 'reopen', openedFromCycleNo: oldCycleNo })`
    - **baselineSnapshot は作らない**（仕様書 §7.5 通り。再会計時に `billsOnSettle` trigger が作成）
12. **Idempotency set**
    - 上記 path に `requestHash` / `result` を保存

### 5.3 services 拡張

#### 5.3.1 `services/settlementCycles.ts`

新規 export:

```ts
export function buildReopenedCycleDocPatch(params: {
  closedAt: Timestamp;
}): {
  cycleState: 'reopened';
  closedAt: Timestamp;
  closedReason: 'reopen';
}
```

#### 5.3.2 `services/parentSummary.ts`

新規 export:

```ts
export function buildReopenSummaryAfterReopen(params: {
  existing: { hasReopenHistory: boolean; reopenCount: number; currentSettlementCycle: number; latestSettledCycle: number; lastReopenedAt: unknown; lastReopenedBy: unknown; lastResettledAt: unknown };
  oldCycleNo: number;
  reopenedAt: Timestamp;
  reopenedBy: string | null;
}): ReopenSummaryLike
```

- `latestSettledCycle` は据え置き
- `lastResettledAt` は据え置き
- `currentSettlementCycle = oldCycleNo + 1`

```ts
export function buildParentDocPatchForReopen(params: {
  existingReopenSummary: ReopenSummaryLike;
  oldCycleNo: number;
  reopenedAt: Timestamp;
  reopenedBy: string | null;
}): Record<string, unknown>
```

- 親 doc に書く dot-path patch を返す
- `status='open'`、`currentSummary`、`postSettlementState`、`reopenSummary` 関連 fields

#### 5.3.3 `services/adjustments.ts`

新規 export:

```ts
export function buildAdjustmentCancelledByReopenPatch(params: {
  cancelledAt: Timestamp;
  cancelledBy: string | null;
}): {
  adjustmentState: 'cancelled_by_reopen';
  cancelledAt: Timestamp;
  cancelledBy: string | null;
  cancelReason: 'reopen';
}
```

- `requiredActionRemainingIncl` は touch しない（記録として残す）
- 既存 `adjustmentState='effective'` のみ呼び出し側でフィルタ済みであることを前提とするが、念のため不変則として残す

### 5.4 既存 trigger / callable への影響

#### 5.4.1 `billsOnSettle` trigger

- 既存実装は `reopenSummary.currentSettlementCycle` を参照して該当 cycle を settle するため、Step05 で reopen された後の再会計でもそのまま動作する
- 既存実装で `existingCycleData` を `merge: true` で update するため、Step05 で書いた `openedReason='reopen'` / `openedFromCycleNo=oldCycle` は保持される
- **Step05 ではコード変更しない**。Emulator integration test で挙動を確認

#### 5.4.2 `accounting` callable / `startAccounting` repo

- `startAccounting` は status=`open`/`in_progress` を許可
- reopen 後は `status='open'` に戻るため、再会計のための `startAccounting` → `accounting` は既存仕組みで動作
- **Step05 ではコード変更しない**

#### 5.4.3 `createPostSettlementAdjustment` / `recordPostSettlementCashAction`

- `currentSettlementCycle` を参照して書き込むため、reopen 後の新 cycle 配下に正しく書き込まれる
- `latestSettledCycle = oldCycle`（resettle 前）の状態では bill.status は `'open'` なので、これらの callable は `failed-precondition` で弾く（既存仕様）
- **Step05 ではコード変更しない**

#### 5.4.4 旧 reopen 経路 (`postEventReopen` / `billsEventsOnCreate`)

- Step05 では touch しない（併存維持）
- Step06 で UI 切替時に整理予定

### 5.5 Idempotency

- key: `reopenAccountedBill:{idempotencyKey}`
- path: `bills/{billId}/idempotency/{key}`
- TTL: 既存 adjustment / cashAction と同じく 48 時間
- 内容: `requestHash`、`result` (= callable レスポンス)、`createdAt`

### 5.6 ログ

- 成功: `logOpsSuccess({ functionEntry: 'reopenAccountedBill', context: { billId, oldCycleNo, newCycleNo, reused, reopenCount } })`
- 失敗: `logOpsError({ functionEntry: 'reopenAccountedBill', cause, context: { billId, currentStatus, businessDateMatch, ... } })`

### 5.7 `serviceByFunctionEntry` 登録

- `reopenAccountedBill` を `accounting` service に登録

## 6. 実装順

1. services 拡張（unit テスト先）
   - `services/settlementCycles.ts` `buildReopenedCycleDocPatch`
   - `services/parentSummary.ts` `buildReopenSummaryAfterReopen` / `buildParentDocPatchForReopen`
   - `services/adjustments.ts` `buildAdjustmentCancelledByReopenPatch`
   - 各 helper の unit test（spec ファイル新規）
2. repo 実装
   - `repos/reopenAccountedBill.ts`
3. callable 実装
   - `callables/reopenAccountedBill.ts`
4. export / logging 登録
   - `domains/bills/index.ts`
   - `shared/logging/serviceByFunctionEntry.ts`
5. Emulator 統合テスト
   - `__tests__/callables/reopenAccountedBill.spec.ts`（新規）
   - `__tests__/triggers/bills.onSettle.spec.ts`（補強: cycle > 1 で resettle するケース）
6. build / lint / 全テスト pass 確認
7. ドキュメント整備（03〜08）

## 7. データ変更

### 7.1 新規 collection / doc

- `bills/{billId}/settlementCycles/{newCycleNo}` （新 cycle、`cycleState='open'`）

### 7.2 既存 doc 更新

- `bills/{billId}` （親 doc）
  - `status` `'settled' | 'post_settlement_pending'` → `'open'`
  - `currentSummary` → reset
  - `postSettlementState` → reset
  - `reopenSummary.hasReopenHistory`, `reopenCount`, `currentSettlementCycle`, `lastReopenedAt`, `lastReopenedBy` 更新
  - `reopenSummary.latestSettledCycle` / `lastResettledAt` は据え置き
  - **触らない field**: `requireSpecialAttention`、`closeSummary`、`updatedAt` (システム自動)、`amounts`、`itemsSnapshot` 等
- `bills/{billId}/settlementCycles/{oldCycleNo}` （旧 cycle）
  - `cycleState`: `'settled'` → `'reopened'`
  - `closedAt`: now
  - `closedReason`: `'reopen'`
  - **触らない field**: `baselineSummary`、`settledAt`、`settledBy`、`openedAt`、`openedBy`、`openedReason`、`openedFromCycleNo`、`baselineSnapshot` (immutable history)
- `bills/{billId}/settlementCycles/{oldCycleNo}/adjustments/{adjustmentId}` （effective のみ）
  - `adjustmentState`: `'effective'` → `'cancelled_by_reopen'`
  - `cancelledAt`: now
  - `cancelledBy`: uid
  - `cancelReason`: `'reopen'`
  - **触らない field**: `requiredActionRemainingIncl`、`adjustmentAmountIncl`、`lines[]`、`createdAt`、`createdBy`

### 7.3 不変な doc

- `bills/{billId}/settlementCycles/{oldCycleNo}/baselineSnapshot/snapshot`（旧 cycle baseline は immutable history）
- `bills/{billId}/settlementCycles/{oldCycleNo}/cashActions/*`（cashActions は不変、allocations[] / methodBreakdown[] 保持）
- `bills/{billId}/settlementCycles/{oldCycleNo}/adjustments/{完了済}/...`（completed_by_cash_action / completed_by_offset の adjustments は不変）
- `bills/{billId}/items / extras / sideGameChips / tournaments / payments`（live data は維持）

## 8. UI / API 変更

- 新 callable: `reopenAccountedBill`
- API 変更（client 影響）: なし（UI 切替は Step06）
- 旧 callable `postEventReopen` は併存（変更なし）

## 9. リスク

### 9.1 当日営業日チェックの偽陽性

- `getCurrentBusinessDateKeyOrThrow()` は `storeMeta.status === 'running'` 必須
- 営業時間外 / 閉店処理中の reopen は弾かれる → 想定通り

### 9.2 cycle > 1 での resettle 動作

- `billsOnSettle` trigger が新 cycle を正しく settle するか
- `merge: true` で existing cycle data を保持しつつ settle patch を適用するため OK
- Emulator test で end-to-end 確認

### 9.3 既存テストへの副作用

- 旧 `postEventReopen` テストは Step05 で変更しないため既存 pass を維持
- `bills.onSettle.spec.ts` は cycle > 1 ケースを追加するが、既存 cycle = 1 ケースは変えない

### 9.4 Race condition

- 同一 bill に対する複数 reopen 同時実行: idempotency で防ぐ
- reopen と adjustment / cashAction の競合: bill status check で defending

## 10. 後方互換性

- 旧 callable / trigger 未変更
- 既存 helper API 互換維持
- 新 callable / repo / helper はすべて新規追加

## 11. 完了条件

- 全 changeSpec 内容を `03_仕様書トレース確認.md` に展開し、「完了」状態にする
- build / lint / 新 unit / Emulator integration / 旧経路リグレッション / Step01〜04 リグレッション すべて pass
- `06_確認結果サマリ.md` で確認結果を残す
- `07_後続ステップへの伝達事項.md` で Step06 / Step07 への引き継ぎを残す
- `08_実機確認手順.md` で実機確認シナリオを残す
- `00_全体進行管理.md` の Step05 行を「完了」に更新
