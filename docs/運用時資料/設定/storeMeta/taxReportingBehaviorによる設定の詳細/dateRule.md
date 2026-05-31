# dateRule と reopenPolicy の詳細

## 1. 先に押さえるべきこと

実装上、`storeMeta/taxReportingBehavior` は「settle / cashAction / reopen の3項目だけ」を持つ単純な設定ではありません。実際には次の構造です。

- `dateRule.settle`
- `dateRule.adjustment`
- `dateRule.immediateCashAction`
- `dateRule.laterCashAction`
- `dateRule.resettle`
- `reopenPolicy.reportingTreatment`

この資料では、運用で特に重要な次の3テーマに絞って説明します。

- settle 時の reportingMonth 帰属
- cashAction 時の eventAt / reportingMonth 帰属
- reopen 時の逆符号エントリの月帰属

## 2. `dateRule.settle`

### 設定の説明

通常の settle 時に、`reportingEntries` の `reportingMonth` を何基準で決めるかを制御します。

### 許容値と意味

| 値 | 意味 |
|---|---|
| `settledAt` | 会計完了時刻の月へ帰属させる |
| `businessDate` | 伝票の営業日文字列 (`businessDate`) の月へ帰属させる |

### デフォルト値

- `settledAt`

### 変更した場合の影響

- `settledAt` のままなら、日付をまたいで会計した場合でも実際の会計完了月へ入ります。
- `businessDate` に変えると、営業日基準で前月へ戻すような運用ができます。
- 変更後は既存 `reportingMonthly/{YYYYMM}` と整合しなくなるため、対象月以降で `rebuildReportingMonthlyCallable` が必要です。

## 3. `dateRule.immediateCashAction` / `dateRule.laterCashAction`

### 設定の説明

実装上、cashAction は1項目ではなく、即時精算と後続精算で分かれています。

- `dateRule.immediateCashAction`: `decrease_refunded` / `increase_collected` のように adjustment 作成時に同時に作られる cashAction
- `dateRule.laterCashAction`: `recordPostSettlementCollection` / `recordPostSettlementRefund` で後から記録される cashAction

### 許容値と意味

#### `dateRule.immediateCashAction`

| 値 | 意味 |
|---|---|
| `cashActionDate` | 即時精算を記録した時刻の月へ帰属させる |
| `adjustmentDate` | adjustment 作成時刻基準で扱う |

#### `dateRule.laterCashAction`

| 値 | 意味 |
|---|---|
| `cashActionDate` | 後続徴収 / 後続返金を記録した時刻の月へ帰属させる |
| `originalBillDate` | 元伝票の `businessDate` の月へ帰属させる |

### デフォルト値

- `dateRule.immediateCashAction = cashActionDate`
- `dateRule.laterCashAction = cashActionDate`

### 変更した場合の影響

- 即時精算を `cashActionDate` 基準にしておくと、実際に操作した月へそのまま入ります。
- 後続精算を `originalBillDate` にすると、翌月に返金・徴収しても元売上月へ寄せる設計になります。
- どちらを変えても `buildCashActionEntry` の `reportingMonth` 計算が変わるため、既存月次を再構築する必要があります。

## 4. `reopenPolicy.reportingTreatment`

### 設定の説明

reopen 時に作る逆符号 reporting entry を、どの月へ戻すかを決めます。

### 許容値と意味

| 値 | 意味 |
|---|---|
| `reverseInOriginalMonth` | 元の settle entry が入っていた月へ逆符号で戻す |

### デフォルト値

- `reverseInOriginalMonth`

### 変更した場合の影響

- 現行実装では `reverseInOriginalMonth` のみを採用しています。
- reopen による取り消しが別月ではなく元月へ戻るため、税務集計上の月内整合を保ちやすい設計です。
- ここを将来拡張して別ルールを入れる場合は、`buildReopenRollbackEntry` と月次再構築方針を一緒に見直す必要があります。

## 5. 参考: 関連する既定値

| フィールド | デフォルト |
|---|---|
| `dateRule.settle` | `settledAt` |
| `dateRule.adjustment` | `adjustmentDate` |
| `dateRule.immediateCashAction` | `cashActionDate` |
| `dateRule.laterCashAction` | `cashActionDate` |
| `dateRule.resettle` | `settledAt` |
| `revenueRecognition.pendingAdjustmentTiming` | `onCashAction` |
| `reopenPolicy.reportingTreatment` | `reverseInOriginalMonth` |

## 6. 運用上の注意

1. analytics と reporting は基準日が違います。analytics は `businessDate`、reporting はこの設定の影響を受けます。
2. `dateRule` を変更した直後は、旧月次と新規 entry の基準が混ざるため、必ず `rebuildReportingMonthlyCallable` を実行してください。
3. 後続徴収・後続返金の月帰属を変える場合は、経理運用との合意なしに変更しないでください。
