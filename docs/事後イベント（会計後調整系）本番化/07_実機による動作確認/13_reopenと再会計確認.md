# 13_reopenと再会計確認

## 1. 対応範囲

- Step05 `reopenと再会計`

## 2. このファイルの役割

このファイルでは、**新実装の reopen と resettle** を確認する。

ここでも重要な注意点がある。現在のコードベースには reopen の導線が 2 系統ある。

1. 新実装の current-scope 本線
   - `会計管理` の当日営業日 `会計完了` カード
   - `reopenAccountedBill`
   - `settlementCycles` を進める
   - old cycle を close し new cycle を open する
2. 旧来の互換導線
   - `updateAccounting` → `postEventReopen`
   - `/events`
   - `status='in_progress'` 系の旧 world

[会計管理画面](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/lib/Accounting/accountingPage.dart) の当日営業日 `会計完了` カードにある `会計前に戻す` が、現時点の新本線 UI である。

一方、[会計後調整画面](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/lib/Accounting/postAccountingAdjustmentsPage.dart) の `会計前に戻す` は、現時点では **旧導線** を使っている。

したがって、**Step05 の完了確認として必要なのは `会計後操作` 画面から `reopenAccountedBill` を通す確認**である。

## 3. 参照元

- [04\_仕様書/05_reopenと再会計.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/04_仕様書/05_reopenと再会計.md)
- [Step05 実機確認手順](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_changeSpecと実装/05_reopenと再会計/08_実機確認手順.md)
- 実装:
  - [reopenAccountedBill.ts callable](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/functions/src/domains/bills/callables/reopenAccountedBill.ts)
  - [reopenAccountedBill.ts repo](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/functions/src/domains/bills/repos/reopenAccountedBill.ts)
  - [accountingPage.dart](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/lib/Accounting/accountingPage.dart)
  - [postAccountingReopenDialog.dart](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/lib/Accounting/postAccountingReopenDialog.dart)

## 4. 事前準備

- `B-04A`: 純粋な settled bill
- `B-04B`: post_settlement_pending bill
- `B-04C`: reopened 後に resettle まで確認する bill
- 当日の `storeMeta.currentBusinessDateKey` と bill `businessDate` を一致させる

## 5. 確認シナリオ

### シナリオ A: 互換導線の現状確認

#### どこから入るか

- `会計後調整` 画面の `会計前に戻す`

#### 何をするか

1. settled bill を表示する
2. `会計前に戻す` ダイアログを開く

#### 期待されるアプリ上の状態

- reopen ダイアログ自体は開く
- ただし内部では `updateAccounting` / `postEventReopen` を使う互換導線である

#### このシナリオの完了判定

- 旧導線の存在を認識できれば OK
- Step05 完了判定には使わない

---

### シナリオ B: settled bill から新 reopen を実行

#### どこから入るか

- `terminalHome` → `会計管理` → `会計完了`

#### 何をするか

1. settled bill `B-04A` を用意する
2. 一覧で該当 card の `会計前に戻す` を押す
3. 強確認ダイアログで「戻す」を入力し、必要なら理由メモを入れて実行する
4. 完了ダイアログと Firestore を確認する

#### Firestore で確認する場所

- `bills/{billId}`
- `settlementCycles/1`
- `settlementCycles/2`
- `activeStays/{userId}`

#### 期待される Firestore 状態

`bills/{billId}`:

- `status = open`
- `currentSummary` が初期化される
- `postSettlementState.requiredActionType = none`
- `reopenSummary.hasReopenHistory = true`
- `reopenSummary.reopenCount = 1`
- `reopenSummary.currentSettlementCycle = 2`
- `reopenSummary.latestSettledCycle = 1`

`settlementCycles/1`:

- `cycleState = reopened`
- `closedReason = reopen`
- `closedAt` が入る

`settlementCycles/2`:

- `cycleState = open`
- `openedReason = reopen`
- `openedFromCycleNo = 1`
- `nextSequenceNo = 1`
- `baselineSnapshot/snapshot` はまだ存在しない

`activeStays/{userId}`:

- `billId = reopened billId`
- `isActive = true`
- reopen 後に在店中ユーザー一覧 / 未会計一覧へ復帰できる

#### このシナリオの完了判定

- old cycle を閉じ、新 cycle を開けている
- reopen 後 bill が「会計中」ではなく「未会計」に戻っている

---

### シナリオ C: post_settlement_pending bill から reopen

#### どこから入るか

- `terminalHome` → `会計管理` → `会計完了`

#### 何をするか

1. `post_settlement_pending` bill `B-04B` を用意する
2. 一覧で該当 card の `会計前に戻す` を押す
3. cycle1 配下に effective adjustment を残した状態で `会計前に戻す` を実行する

#### Firestore で確認する場所

- `adjustments/*`
- `bills/{billId}`
- `settlementCycles/1`
- `settlementCycles/2`

#### 期待される Firestore 状態

- effective adjustment が `cancelled_by_reopen` になる
- `requiredActionRemainingIncl` は履歴として残る
- completed 済み adjustment は変わらない
- parent `postSettlementState` は reset される
- new cycle 2 が作られる

#### このシナリオの完了判定

- pending を current に持ち越さず、旧 cycle 側で閉じ込めている

---

### シナリオ D: 旧 cycle の immutable history

#### どこから入るか

- reopen 前後の Firestore 比較

#### 何をするか

1. reopen 前に cycle1 の
   - `baselineSnapshot/snapshot`
   - completed adjustment
   - cashActions
     を控える
2. reopen 実行後に再比較する

#### 期待される Firestore 状態

- `baselineSnapshot/snapshot` は不変
- completed adjustment は不変
- cashActions は不変
- immutable history が守られる

#### このシナリオの完了判定

- reopen が履歴破壊を起こしていない

---

### シナリオ E: hard precondition / permission / idempotency

#### どこから入るか

- `reopenAccountedBill` callable 直接実行

#### 補足

- 通常の reopen 成功経路は `会計後操作` から確認する
- このシナリオだけは、権限・営業日・idempotencyKey を明示制御するため callable 直接実行で行う

#### 何をするか

1. 当日営業日でない bill で reopen
2. settle 前 bill で reopen
3. 権限なしで reopen
4. 同 idempotencyKey で 2 回 reopen

#### 期待される結果

- 当日営業日でない bill は弾かれる
- 未 settle bill は弾かれる
- 権限なしは弾かれる
- 冪等再送では副作用が重複しない

#### このシナリオの完了判定

- reopen の guard が想定どおり動く

---

### シナリオ F: reopen 後の再会計

#### どこから入るか

- reopen 済み bill `B-04C`

#### 何をするか

1. reopen 後、未会計一覧から通常会計を開く
2. settle 完了後、cycle2 を確認する

#### Firestore で確認する場所

- `bills/{billId}`
- `settlementCycles/2`
- `settlementCycles/2/baselineSnapshot/snapshot`

#### 期待される Firestore 状態

- `status = settled`
- `reopenSummary.latestSettledCycle = 2`
- `settlementCycles/2.cycleState = settled`
- `baselineSnapshot/snapshot` が作成される

#### このシナリオの完了判定

- reopen 後に新 cycle で通常 settle できる

## 6. このファイル全体の完了判定

このファイルは、次がすべて満たされたら完了とする。

1. 旧 reopen 導線と新 reopen 導線の違いを確認した
2. settled / pending からの reopen を確認した
3. immutable history を確認した
4. guard / permission / idempotency を確認した
5. reopen 後の resettle を確認した

## 7. 実施結果記録欄

- 実施日:
- 実施者:
- 対象環境:
- billId:
- 結果:
- 補足:
