# 02_changeSpec

## 1. 目的

Step02 では、bill の会計確定版の土台として `settlementCycles/{cycleNo}` と `baselineSnapshot` を導入し、通常会計の create / settle パスで仕様書どおりの cycle 構造を保存できるようにする。

## 2. スコープ

### 2.1 対象

- bill 作成時に `settlementCycles/1` を `open` 状態で生成する
- settle 時に current cycle を `settled` に更新する
- settle 時に `baselineSummary` を cycle 親 doc に保存する
- settle 時に `baselineSnapshot/snapshot` 単一 doc を保存する
- baseline line 配列を既存 live subcollections から生成する
- root snapshot 群との互換 dual-write を維持する
- Step02 docs / trace / check / handoff を整備する

### 2.2 非対象

- adjustment 作成と `sequenceNo` 消費
- cashAction 作成と allocation 更新
- actual reopen runtime
- migration / backfill
- UI / analytics の本接続変更

## 3. 変更対象

### 3.1 データ構造

追加 / 利用する構造:

```text
bills/{billId}
└─ settlementCycles/{cycleNo}
   ├─ cycle親doc
   └─ baselineSnapshot/{snapshot}
```

重要ルール:

- baselineSnapshot は collection `baselineSnapshot` 配下の固定 doc id `snapshot` を使う
- bill 作成時は `settlementCycles/1` のみ作り、baseline はまだ作らない
- settle 時に current cycle へ `baselineSummary` と `baselineSnapshot/snapshot` を保存する

### 3.2 処理

- `createBillWithActiveStay`
  - `settlementCycles/1` を初期 open 状態で作成する
- `billsOnSettle`
  - root snapshot 群更新に加えて cycle parent と baselineSnapshot を保存する
  - current cycle doc が存在しない場合も on-demand で作成できるようにする
- `snapshots.ts`
  - baseline line 配列の builder を追加する
- `settlementCycles.ts`
  - cycle / baseline helper を追加する

### 3.3 テスト

- `createBillWithActiveStay.spec.ts`
  - `settlementCycles/1` が初期 open 状態で作られることを確認する
- `bills.onSettle.spec.ts`
  - current cycle settled 化
  - `baselineSummary` 保存
  - `baselineSnapshot/snapshot` 保存
  - 通常 settle で cycle が増えないこと
  を確認する

## 4. AsIs -> ToBe

| 項目 | AsIs | ToBe |
|---|---|---|
| bill 作成時 cycle | なし | `settlementCycles/1` を `open` で作成 |
| settle 時 cycle doc | なし | current cycle を `settled` に更新 |
| baseline summary | root summary のみ | root summary 維持 + cycle 親 doc に `baselineSummary` 保存 |
| baseline full snapshot | なし | `baselineSnapshot/snapshot` へ 1 doc 保存 |
| baseline 明細配列 | なし | `items[] / extras[] / tournaments[] / sideGameChips[]` を保存 |
| reopen 境界 | 曖昧 | Step02 は土台整備、actual reopen は Step05 |

## 5. 実装方針

### 5.1 実装順

1. cycle / baseline helper 追加
2. baseline line builder 追加
3. bill 作成時 cycle 1 生成
4. settle 時 cycle / baseline 保存
5. テスト更新
6. Emulator 下で確認
7. docs と handoff 更新

### 5.2 更新責務の境界

- Step02 は create / settle パスの cycle 基盤だけを扱う
- `reopen` で cycle を進める責務は Step05 に残す
- `baselineSummary` と `baselineSnapshot` の利用側接続は Step07 へ送る

### 5.3 後方互換の扱い

- root 直下の `amounts` / `categoryBreakdown` / `itemsSnapshot` / `tournamentsSnapshot` / `paymentTotals` / `paymentsSummary` は削除しない
- current-scope では dual-write を維持し、既存参照先を壊さない
- migration / backfill は行わない

### 5.4 欠損 cycle doc への防御

current-scope では migration を行わないため、settle 時に current cycle doc が欠損しているケースに対しては `billsOnSettle` 側で on-demand 作成を許容する。

## 6. リスクと注意点

- `baselineSnapshot/snapshot` の保存先 path は Step03-07 の前提になるため、途中で変えない
- settle 時に cycle doc を上書きしすぎると Step05 の reopen 連携で壊れやすいので、patch は仕様書の最小 field に留める
- baseline line 配列は analytics 用 summary と別物なので、root snapshot 互換と混同しない
- `reopen` 実行そのものを Step02 で扱い始めると scope が崩れるため、ここでは明示的に非対象とする

## 7. 実施チェック

- [x] 仕様書と整合している
- [x] 現状確認を踏まえている
- [x] テスト方針に接続できている
- [x] create / settle パスの current-scope に閉じている
- [x] actual reopen を Step05 に切り分けている
