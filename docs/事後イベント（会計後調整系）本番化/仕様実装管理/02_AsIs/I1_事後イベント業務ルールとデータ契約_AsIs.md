# I1_事後イベント業務ルールとデータ契約_AsIs

参照元: [../01_改修項目再編.md](../01_改修項目再編.md)

## 1. 論点一覧

### 1.1 現状認識済みの問題点

- `F3`: 返金/追加徴収の支払内訳、現金/ポイントの扱い、ダッシュボードに渡す粒度が未整理
- `F5`: 追加徴収と「実際に受け取った記録」/ 未収が分離されていない
- `F6`: 減額可能範囲が利用者に見えず、不安定に見える
- `F11`: `selectedBusinessDateKey` が UI から送られても Callable で受け取られない
- `F14`: 返金時のポイント/ユーザー残高返還がスコープ外
- `G8`: 金額を伴わない注記のみイベントが存在しない

### 1.2 コード調査で追加発見した問題点

- 返金 `method` が自由文字列で、UI では `cash` / `bank_transfer` / `other` を送るが、既存の支払手段体系 `cash` / `credit_card` / `electronic_money` / `pointA` / `pointB` / `sideGameChip` と一致していない
- `selectedBusinessDateKey` の曖昧営業日再試行 UI は返金/調整ダイアログにしかなく、キャンセル/再開は再試行ヘルパだけあって実際には候補選択 UI がない
- Callable は `/events` 作成時点で成功を返し、親 `bills` の更新は別 Trigger に委ねているため、API 契約が「即時反映」ではなく「イベント受理 + 後続反映」になっている

## 2. 対象コード

| 区分 | パス | 現在の役割 |
|------|------|------------|
| 返金 Callable | `functions/src/domains/bills/callables/refundProcessing.ts` | `processRefund`, `getRefundHistory` |
| 事後調整 Callable | `functions/src/domains/bills/callables/updateAccounting.ts` | adjustment / cancel / reopen の入口 |
| 返金 Repo | `functions/src/domains/bills/repos/postEventRefund.ts` | refund event 作成、暫定レスポンス返却 |
| 調整 Repo | `functions/src/domains/bills/repos/postEventAdjustment.ts` | adjustment event 作成、暫定レスポンス返却 |
| キャンセル Repo | `functions/src/domains/bills/repos/postEventCancel.ts` | cancel event 作成 |
| 再開 Repo | `functions/src/domains/bills/repos/postEventReopen.ts` | reopen event 作成 |
| 返金 UI | `lib/Accounting/postAccountingRefundDialog.dart` | 新形式 refund 呼び出し |
| 調整 UI | `lib/Accounting/postAccountingAdjustmentDialog.dart` | 新形式 adjustment 呼び出し |
| キャンセル UI | `lib/Accounting/postAccountingCancelDialog.dart` | 新形式 cancel 呼び出し |
| 再開 UI | `lib/Accounting/postAccountingReopenDialog.dart` | 新形式 reopen 呼び出し |

## 3. 現挙動

### 3.1 返金イベントのデータ契約

- `processRefund` は `billId`, `idempotencyKey`, `eventPayload.amountIncl`, `eventPayload.reason?`, `eventPayload.method?` だけを受ける
- `postEventRefund` は post-settlement の `settled` / `partially_refunded` / `refunded` のみ許可する
- 返金イベントには `refund.amountIncl` と `refund.method` は入るが、`paymentsSummary.byMethod` は更新しない
- UI の返金方法は `cash` / `bank_transfer` / `other` で、既存の支払手段体系とは別系統

### 3.2 追加徴収/減額イベントのデータ契約

- `updateAccounting` の `eventType=adjustment` は `sign` と `amountIncl` を必須とする
- `postEventAdjustment` は `postEvents.totalAdjustmentsIncl` と `paymentsSummary.balanceDueIncl` を増減させる
- 追加徴収しても `paidTotalIncl` を増やす処理はなく、「実際に受領した」のか「未収が増えた」のかは区別されない
- 減額可能範囲は `grandTotalRounded - paidTotalIncl - totalRefundedIncl + totalAdjustmentsIncl` と `netSalesIncl >= 0` の組み合わせで決まる

### 3.3 キャンセル/再開イベントのデータ契約

- `postEventCancel` は `status == settled` かつ `paidTotalIncl == 0` かつ `totalRefundedIncl == 0` のときだけ許可する
- `postEventReopen` は `status == settled` のときだけ許可する
- したがって、部分返金済み/全額返金済みの伝票は再開できない
- cancel/reopen とも `selectedBusinessDateKey` を受ける型は Repo にあるが、Callable 側スキーマでは受け取らない

### 3.4 曖昧営業日 (`AMBIGUOUS`) の扱い

- `postEventRefund` / `postEventAdjustment` / `postEventCancel` / `postEventReopen` は内部では `calcBusinessDate()` を呼び、曖昧時は `selectedBusinessDateKey` を要求する
- しかし `processRefund` / `updateAccounting` の Zod スキーマには `selectedBusinessDateKey` がないため、UI が送っても Repo へ届かない
- 返金/調整ダイアログだけは候補選択ダイアログを持つが、キャンセル/再開ダイアログには候補選択 UI がない

### 3.5 ポイント/残高返還

- `refundProcessing.ts` のコメントどおり、`postEventRefund` はユーザー残高返還をスコープ外としている
- 現在の返金処理は bill 側イベント作成に留まり、`users` 側の `pointA` / `pointB` / `sideGameChip` 残高は更新しない

### 3.6 注記のみイベント

- event type は `refund` / `adjustment` / `cancel` / `reopen` のみ
- 金額 0 の「注記だけを残す」用途の event type や UI は存在しない

## 4. 制約

- 事後イベントは「親 doc を直接更新する API」ではなく、「`/events` を追加し、Trigger で親 doc を更新する」設計
- `method` は任意の文字列で、現時点では正規化も enum 制約もない
- adjustment は `payments` サブコレクションを書かないため、受領/未収の区別が bill 単体からは復元できない
- cancel/reopen は `settled` 以外を受け付けない
- `selectedBusinessDateKey` は Repo 型には存在するが、公開 Callable 契約では未公開
- ユーザー残高返還は別ワークフロー前提で、本 API 群だけでは完結しない

## 5. 不具合再現条件

### 5.1 `selectedBusinessDateKey` が届かず、曖昧営業日で失敗し続ける

1. `calcBusinessDate()` が `AMBIGUOUS` を返す時間帯に返金または調整を実行する
2. UI で営業日候補を選び直して再試行する
3. Callable が Zod で `selectedBusinessDateKey` を受け取らないため、再度同じエラーになる

### 5.2 「追加徴収したが受領したのか未収なのか分からない」

1. `updateAccounting(eventType=adjustment, sign=1)` で追加徴収を登録する
2. 親 doc を見ると `postEvents.totalAdjustmentsIncl` と `paymentsSummary.balanceDueIncl` は増える
3. `payments` や `paidTotalIncl` は増えないため、即時受領か未収計上かを区別できない

### 5.3 「追加した分だけ戻せない」ように見える

1. 会計完了済み bill に対して追加徴収を入れる
2. その後、減額を追加徴収額ぴったり以上で入れようとする
3. `netSalesIncl < 0` または `balanceDueIncl < 0` に当たると拒否されるが、UI 上は計算根拠が見えない

### 5.4 返金方法の値が他の支払手段体系と一致しない

1. `PostAccountingRefundDialog` または `RefundProcessingDialog` で `銀行振込` / `その他` を選んで返金する
2. event には `bank_transfer` / `other` が保存される
3. 既存の支払手段体系とは別軸の文字列が混在する

### 5.5 キャンセル/再開では曖昧営業日の候補選択 UI が出ない

1. 曖昧営業日時間帯にキャンセルまたは再開を実行する
2. `selectedBusinessDateKey` 再試行ヘルパは定義されているが、候補選択ダイアログ呼び出しがない
3. 利用者は候補選択できず、単に失敗メッセージだけを見る

## 6. Step3 以降で必ず判断が必要な点

- 返金方法を既存の支払手段 enum に合わせるか、事後イベント専用 enum を持つか
- adjustment を「帳簿調整」と「入金記録付き調整」に分けるか
- `selectedBusinessDateKey` を refund/adjustment/cancel/reopen のどこまで公開契約に含めるか
- ポイント/残高返還を同一トランザクションで扱うか、別 Callable に切るか
- 注記のみ event を新設するか

