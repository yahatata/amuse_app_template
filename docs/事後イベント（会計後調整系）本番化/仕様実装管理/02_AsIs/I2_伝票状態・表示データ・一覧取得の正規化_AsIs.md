# I2_伝票状態・表示データ・一覧取得の正規化_AsIs

参照元: [../01_改修項目再編.md](../01_改修項目再編.md)

## 1. 論点一覧

### 1.1 現状認識済みの問題点

- `F1`: 未会計タブの修正ダイアログでフード/ドリンクが表示されない
- `F4`: 返金/追加徴収後に会計完了タブから状況が見えない
- `F7`: サイドゲームチップ内訳が 0 / 空に見える
- `F8`: 「会計前に戻す」後の `in_progress` 伝票が未会計タブに出ない

### 1.2 コード調査で追加発見した問題点

- 会計完了カードの `修正` ボタンは旧 `AccountingEditDialog` に接続されており、`accountingStartedAt` がマップにないため、settled 伝票を「会計前扱い」で `updateActiveBill` に送って失敗する
- 事後イベントダイアログは成功後すぐ親 doc を再読込するが、親 doc 更新は別 Trigger なので、更新結果が一時的に反映されないタイミングがありうる
- `updateActiveBill` のサイドゲームチップ編集は `chipQty = floor(price / 10)` の固定換算で、店舗設定の `sideGameChipRate` を参照していない

## 2. 対象コード

| 区分 | パス | 現在の役割 |
|------|------|------------|
| 会計管理画面 | `lib/Accounting/accountingPage.dart` | 未会計/会計完了一覧の read model と各ボタン導線 |
| 修正ダイアログ | `lib/Accounting/accountingEditDialog.dart` | 旧配列前提の編集 UI |
| 会計前修正 Callable | `functions/src/domains/bills/callables/updateActiveBill.ts` | サブコレクション編集 |
| 事後イベント Trigger | `functions/src/domains/bills/triggers/billsEventsOnCreate.ts` | 親 `bills` への差分適用 |

## 3. 現挙動

### 3.1 未会計タブの修正は親 doc の旧配列を初期表示に使う

- `AccountingEditDialog` は `widget.bill['extraCost']`, `widget.bill['tournaments']`, `widget.bill['items']`, `widget.bill['sideGameChip']` を初期表示に使う
- しかし `_loadActiveBills` が組み立てる一覧マップには `items`, `extraCost`, `tournaments`, `sideGameChip` が入っていない
- 実データは `/bills/{billId}/items`, `/extras`, `/sideGameChips`, `/tournaments` サブコレクションにある

### 3.2 会計完了タブは `status == settled` だけを読み、返金系 status を落とす

- `_loadSettledBills` は `status == 'settled'` のみを取得する
- `partially_refunded` / `refunded` / `voided` / `in_progress` は会計完了タブに出ない
- そのため、返金や再開後の bill は `AccountingPage` 側から見えなくなる

### 3.3 一覧表示ごとにデータ源がずれている

- `_buildBillBreakdown`, `_showCategoryDetail`, `_calculateCategoryTotal` は `bill['items']`, `bill['sideGameChip']` 等の旧配列を使う
- 一方 `_showCategoryBreakdownDialog` はサブコレクションを直接読む
- 支払方法表示 `_buildPaymentMethodsByAmount` では `paymentsSummary.byMethod` と `_fetchSideGameChipPurchaseSummary()` の結果を混在利用している

### 3.4 再開 (`reopen`) 後は `in_progress` になるが、未会計タブのクエリに含まれない

- `billsEventsOnCreate` は `reopen` 適用時に `status = in_progress` に更新する
- `_loadActiveBills` は `status in ['open', 'settling']` しか読まない
- `updateActiveBill` や `placeOrder` は `in_progress` を許可しているため、サーバ側では扱えるが UI 一覧から消える

### 3.5 会計完了カードの `修正` は現状ほぼ失敗導線

- `_buildSettledBillCard` は `修正` ボタンで `AccountingEditDialog` を開く
- `_loadSettledBills` のマップには `accountingStartedAt` がないため、ダイアログ側 `_isBeforeAccounting = true` になる
- その結果、settled 伝票を `updateActiveBill` に送り、サーバ側 `status in {'open','in_progress'}` 制約で拒否される

### 3.6 事後イベント適用は eventual consistency

- `postEvent*` は event doc を作成して成功を返す
- 実際の親 doc 更新は `billsEventsOnCreate` が別タイミングで行う
- 各ダイアログの成功後処理は一覧再読込なので、Trigger 反映前に読めば旧状態が見える

### 3.7 サイドゲームチップ編集は固定レート換算

- `updateActiveBill` は `sideGameChip.price` から `chipQty = floor(price / 10)` を保存する
- 他の表示/支払分割/確認処理は `StoreConfig.sideGameChipRate` を参照する
- レート設定が 10 以外の店舗では、編集後データのチップ枚数が設定値と一致しない可能性がある

## 4. 制約

- `AccountingPage` の一覧マップは「カード表示に必要な最小項目」しか持っておらず、編集/詳細で再利用できる形になっていない
- 旧配列ベース表示とサブコレクションベース表示が混在している
- `reopen` 後の `in_progress` はサーバでは正規 status の一つだが、会計管理一覧では非対応
- 事後イベントの反映は同期 API ではなく非同期 Trigger 前提
- `updateActiveBill` のサイドゲームチップ枚数は設定レート非参照

## 5. 不具合再現条件

### 5.1 未会計修正でフード/ドリンクが空に見える

1. `/bills/{billId}/items` に注文がある未会計 bill を用意する
2. `AccountingPage` 未会計タブから `修正` を開く
3. `widget.bill['items']` が空のため、フード/ドリンク欄が空で初期表示される

### 5.2 返金後に会計完了タブから消える

1. `settled` bill に対して事後返金を実行する
2. Trigger により status が `partially_refunded` または `refunded` になる
3. `_loadSettledBills` は `status == settled` しか取得しないため、一覧から消える

### 5.3 再開後に未会計タブへ戻らない

1. `settled` bill に対して `reopen` を実行する
2. Trigger により status が `in_progress` になる
3. `_loadActiveBills` の `whereIn(['open','settling'])` に一致せず、未会計タブへ出ない

### 5.4 会計完了カードの `修正` が失敗する

1. `AccountingPage` 会計完了タブで任意の bill の `修正` を押す
2. `AccountingEditDialog` が `accountingStartedAt == null` と判定し、`updateActiveBill` を呼ぶ
3. サーバ側で `status == settled` が拒否され、修正失敗になる

### 5.5 事後イベント直後に一覧を更新しても旧状態が見える

1. `PostAccountingRefundDialog` または `PostAccountingAdjustmentDialog` で処理を成功させる
2. ダイアログの `onUpdated()` で即 `_loadBills()` または `_loadSettledBills()` が走る
3. `billsEventsOnCreate` 反映前だと、一覧に旧 status / 旧 `postEvents` が一瞬見える可能性がある

### 5.6 サイドゲームチップ編集後の枚数が設定とずれる

1. `sideGameChipRate != 10` の店舗設定を用意する
2. `AccountingEditDialog` からサイドゲームチップ金額を修正し `updateActiveBill` を実行する
3. サブコレクションには `floor(price / 10)` ベースの `chipQty` が保存され、設定レートと一致しない

## 6. Step3 以降で必ず判断が必要な点

- 一覧用 read model を親 doc 正規サマリに寄せるか、必要時にサブコレクション再取得するか
- `reopen` 後 status を `in_progress` のまま扱うか、会計管理上 `open` へ正規化するか
- 事後イベント後の UI は「Trigger 反映待ち」を明示するか、Callable 側で同期反映まで待つか
- サイドゲームチップ表示/編集で使う正規フィールドを `chipQty` / `amountIncl` に統一するか

