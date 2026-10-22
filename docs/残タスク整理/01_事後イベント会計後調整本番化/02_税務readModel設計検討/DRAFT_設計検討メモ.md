# 【検討中】税務 read model 設計メモ

> **このファイルは設計検討用の作業メモです。**  
> 全設計事項が確定しました。次のアクションは「確定版ファイルの作成」です。  
> 確定版を作成したらこのファイルはアーカイブ扱いとします。

---

## 前提：このファイルで扱う範囲

今回実装するのは以下の2コレクションです。

- `reportingEntries` — 会計イベントの証跡を1件ずつ積む
- `reportingMonthly` — reportingEntries を月単位で集計した帳簿

`cashflowMonthly` はカード後日入金の追跡が未実装のため今回は対象外。  
既存の `analyticsMonthly` は運用ダッシュボード用途のまま据え置き。

**最終目的：**  
商品カテゴリと支払手段の任意の組み合わせで売上を切り分けて表示・集計できること。  
（例：「グループA に分類したカテゴリの現金売上合計」「グループB に分類したカテゴリのカード売上合計」）  
税率のシステム計算は行わない。グループの定義は store 側が設定する。

---

## 1. 日付帰属の方針（確定）

### 基本方針

`reportingMonthly` の月次帰属は **`settledAt` 基準をデフォルト** とします。  
`analyticsMonthly`（`businessDate` 基準）との違いを持たせ、「実際に処理が確定した月」を表します。  
`originBusinessDate`（元の営業日）はすべてのエントリに参照用フィールドとして保持します。

### イベントごとのデフォルト日付

| イベント | デフォルト日付 | 参照として保持 |
|---|---|---|
| 通常 settle | `settledAt` | `originBusinessDate` |
| 未会計の翌日以降会計（carryover） | `settledAt`（会計した日） | `originBusinessDate`（入店した営業日） |
| 会計後調整（adjustment 作成） | `adjustmentCreatedAt` | `originBusinessDate` |
| 即時 cashAction | `cashActionCreatedAt` | `originBusinessDate` |
| 後続 cashAction | `cashActionCreatedAt` | `originBusinessDate` |
| reopen rollback | `reopenExecutedAt` | 元 cycle の `settledAt` |
| reopen 後の再会計 | `settledAt` | `originBusinessDate` |

> **注:** reopen は当日営業日の bill にしか実行できない制約があるため、rollback エントリの月と settle の月は常に同一になります。そのため `reopenRollback` の帰属日設定は不要であり、設計から除外しています。

---

## 2. storeMeta の設定ドキュメント構成（確定）

storeMeta に以下の2ドキュメントを新設します。

### `storeMeta/taxReportingBehavior`

処理ルールに関する設定。基本的に初期設定後は変更しません。

```
dateRule: {
  settle:              "settledAt"（デフォルト） | "businessDate"
  adjustment:          "adjustmentDate"（デフォルト） | "originalBillDate"
  immediateCashAction: "cashActionDate"（デフォルト） | "adjustmentDate"
  laterCashAction:     "cashActionDate"（デフォルト） | "originalBillDate"
  resettle:            "settledAt"（デフォルト） | "businessDate"
}
revenueRecognition: {
  basis:                    "accrual"（デフォルト） | "cash"
  pendingAdjustmentTiming:  "onCashAction"（確定）
}
reopenPolicy: {
  reportingTreatment: "reverseInOriginalMonth"（確定）
}
granularity: {
  reportingEntry: "lineLevel"（確定）
}
```

**各設定値の挙動:**

| 設定キー | 値 | 挙動 |
|---|---|---|
| `dateRule.settle` | `settledAt`（デフォルト） | 会計完了のタイムスタンプで月を決める |
| `dateRule.settle` | `businessDate` | 伝票の営業日で月を決める（analyticsMonthly と同一になる） |
| `dateRule.adjustment` | `adjustmentDate`（デフォルト） | adjustment 作成日時で月を決める |
| `dateRule.adjustment` | `originalBillDate` | 元の伝票 businessDate で月を決める |
| `dateRule.laterCashAction` | `cashActionDate`（デフォルト） | cashAction 実行日時で月を決める |
| `dateRule.laterCashAction` | `originalBillDate` | 元の伝票 businessDate で月を決める |
| `revenueRecognition.pendingAdjustmentTiming` | `onCashAction` | 実際に cashAction が実行されたときにのみ reportingEntries を書く |
| `reopenPolicy.reportingTreatment` | `reverseInOriginalMonth` | reopen rollback エントリを同月内の負値で記録する |
| `granularity.reportingEntry` | `lineLevel` | adjustment の明細行ごとに categoryBreakdown を構築する |

### `storeMeta/reportingGroupConfig`

商品カテゴリの集計グループ定義。UI での表示グループをここで設定します。  
税率はシステムで管理しません。グループの定義は store 側が自由に設定します。

```
groups: [
  {
    key:          "group_a"
    label:        "通常商品"（表示名）
    categoryKeys: ["items", "tournaments", "extraCost"]
  },
  {
    key:          "group_b"
    label:        "ゲームチップ"
    categoryKeys: ["sideGameChip"]
  }
]
```

- グループは任意の数を定義できる
- 同じ `categoryKey` を複数のグループに含めることもできる
- **どのグループにも属さない `categoryKey` は `"other"` として自動集約する**

**UIの使い方:**  
UI が `reportingGroupConfig.groups` を読み、選択されたグループの `categoryKeys` と  
指定された支払手段に対応する `categoryPaymentMatrix` のキーを合算して表示する。

例：「グループA の現金売上」= `categoryPaymentMatrix["items_cash"] + categoryPaymentMatrix["tournaments_cash"] + categoryPaymentMatrix["extraCost_cash"]`

---

## 3. reportingEntries の field 構成（確定）

### 3-1. 共通 field

```
entryId
entryType         settle | cashAction | reopen_rollback | resettle
                  ※ pending adjustment は onCashAction 方式のため adjustment 単体では書かない
billId
cycleNo
reportingMonth    yyyyMM（dateRule に従って決定）
eventAt           イベント発生時刻
originBusinessDate 元の営業日（参照用）
linkedAdjustmentId  （cashAction に対応する調整がある場合）
linkedCashActionId  （cashAction エントリの場合）
```

### 3-2. 金額の切り分け構造（3層・確定）

**粒度: lineLevel（adjustment の明細行単位）**  
「グループ × 支払手段の組み合わせ集計」を正確に実現するために必要。

**① categoryBreakdown（カテゴリ別売上内訳）**

```
categoryBreakdown: {
  "{categoryKey}": { amountIncl: N }
  "other":         { amountIncl: N }  // グループ未定義カテゴリの合算
}
```

**② paymentBreakdown（支払手段別内訳）**

```
paymentBreakdown: {
  "{paymentMethodKey}": N
}
```

**③ categoryPaymentMatrix（カテゴリ × 支払手段の掛け合わせ）**

settle 時は `paymentMethodsByCategory`（`meta.paymentMethodsByCategory` または `draftAccountingInput.paymentMethodsByCategory`）から構築します（確認済み・保存されている）。

```
categoryPaymentMatrix: {
  "{categoryKey}_{paymentMethodKey}": N
  "other_{paymentMethodKey}":         N  // 未分類カテゴリ分
}
```

### 3-3. エントリ種別ごとの記録可能範囲（確定）

| entryType | categoryBreakdown | paymentBreakdown | categoryPaymentMatrix |
|---|---|---|---|
| settle | ○ | ○ | ○ |
| cashAction（即時・後続） | ○（linked adjustment の lines から） | ○ | ○ |
| reopen_rollback | ○（元 cycle 分を負で） | ○（元 cycle 分を負で） | ○（負値） |
| resettle | ○ | ○ | ○ |

---

## 4. reportingMonthly の field 構成（確定）

### 更新方式: incremental（確定）

`reportingEntries` の書き込みのたびに差分を加算・減算します。  
`analyticsMonthly` と同じ `aggregationMarkers` パターンで冪等性を保証します。

### 失敗時の保険（確定）

- **1層目（冪等性）:** `aggregationMarkers` パターンで二重計上を防ぐ
- **2層目（手動リカバリ）:** 指定月の `reportingMonthly` を `reportingEntries` から全件再集計する admin callable を用意する
- **3層目（整合性チェック）:** `analyticsMonthly` の同様のチェックと合わせて、月次で `reportingMonthly` 合計と `reportingEntries` 合計を比較する → `docs/残タスク整理/02_事後イベント会計後調整細かな修正` で別途管理

### field 構成

```
monthKey            yyyyMM
totalAmountIncl     全エントリの合計（税込）

categoryBreakdown: {
  "{categoryKey}": { amountIncl: N }
  "other":         { amountIncl: N }
}

paymentMethodBreakdown: {
  "{paymentMethodKey}": N
}

categoryPaymentMatrix: {
  "{categoryKey}_{paymentMethodKey}": N
  "other_{paymentMethodKey}":         N
}

lastUpdatedAt
```

---

## 5. Firestore コレクションパスとドキュメント ID（確定）

既存の `analyticsMonthly` と同じルートコレクション方式に揃えます。

### `reportingMonthly`

```
reportingMonthly/{monthKey}
reportingMonthly/{monthKey}/aggregationMarkers/{markerId}
```

- `monthKey` = `yyyyMM`（例: `202605`）
- `aggregationMarkers` サブコレクションで冪等性を管理（analyticsMonthly と同パターン）

### `reportingEntries`

```
reportingEntries/{entryId}
```

`entryId` の採番ルール（冪等性のため予測可能な ID を採用）:

| entryType | entryId の構成 |
|---|---|
| `settle` | `{billId}_settle_{cycleNo}` |
| `cashAction` | `{billId}_cashAction_{cashActionId}` |
| `reopen_rollback` | `{billId}_reopen_{cycleNo}` |
| `resettle` | `{billId}_resettle_{cycleNo}` |

予測可能な ID にすることで、同一イベントへの二重書き込みを「ドキュメントが既に存在するか」で検出できます。

---

## 6. 未処理 pending の管理（別タスク化）

`storeMeta/pendingActionsSummary` + サブコレクション `pendingItems` の実装は別タスクとします。  
仕様は `docs/未処理伝票サマリ管理/` を参照してください。

---

## 7. 前提事項の確認結果（確認済み）

| 項目 | 確認結果 |
|---|---|
| `bills` に `paymentMethodsByCategory` が保存されているか | 保存済み。`meta.paymentMethodsByCategory` と `draftAccountingInput.paymentMethodsByCategory` の両方に存在。カテゴリキー: `items` / `tournaments` / `sideGameChip` / `extraCost` |
| `menuItems` に `category` field が存在するか | 存在する。adjustment line の category 取得に使える |
| `menuItems` に `taxRate` field が存在するか | 存在しない。設計上も不要（税率はシステムで管理しない） |
| `storeMeta` に既存の `taxReporting` 系ネームスペースがないか | 存在しない。新規作成可能 |
| 既存 callable への影響範囲 | `billsOnSettle.ts` / `createPostSettlementAdjustment.ts` / `reopenAccountedBill.ts` / 後続 cashAction callable の4箇所 |

---

## 8. 次のアクション

- [ ] この DRAFT をもとに確定版の設計ファイルを作成する
- [ ] `storeMeta/taxReportingBehavior` と `storeMeta/reportingGroupConfig` の初期値を確定する（税理士確認後に設定値を入れる）
- [ ] 確定版をもとに実装を開始する
