# I3_会計管理UI導線と営業状態別アクセス設計_AsIs

参照元: [../01_改修項目再編.md](../01_改修項目再編.md)

## 1. 論点一覧

### 1.1 現状認識済みの問題点

- `F2`: 事後イベント UI が会計管理の会計完了タブに統合されていない
- `F12`: 会計後キャンセルが通常導線に乗っていない
- `F15`: 閉店中は会計管理が使えず、事後イベントと相性が悪い
- `G4`: 旧 `RefundProcessingDialog` が現行 `processRefund` と非互換

### 1.2 コード調査で追加発見した問題点

- ターミナルホームの `会計後調整（テスト）` は `optionKeys: null` で、会計権限のない端末にも表示されうる
- `PostAccountingAdjustmentsPage` 自体に端末権限チェックがない
- `PostAccountingAdjustmentsPage` には `_canCancel()` があるのに、伝票カードにキャンセルボタンが配置されていない
- `PostAccountingAdjustmentsPage` の `all` フィルタは `voided` を含まないため、キャンセル済み bill はこの画面からも消える
- `AccountingPage` 会計完了カードには旧 `AccountingEditDialog` / 旧 `AccountingCancelDialog` が残っており、新事後イベント導線と二重化している
- `AccountingCancelDialog` の「返金も同時に実行」は UI 上だけ存在し、`cancelAccounting` Callable では `includeRefund` / `refundAmount` を解釈しない
- `PostAccountingAdjustmentsPage` は閉店中の初期日付に「カレンダー今日」を使うため、実際に見たい営業日とずれることがある

## 2. 対象コード

| 区分 | パス | 現在の役割 |
|------|------|------------|
| ターミナル導線 | `lib/Home/terminalHomePage.dart` | メニュー表示、遷移制御 |
| 会計管理画面 | `lib/Accounting/accountingPage.dart` | 会計管理の本番導線 |
| 事後イベント専用画面 | `lib/Accounting/postAccountingAdjustmentsPage.dart` | 事後イベントの別画面導線 |
| 旧返金ダイアログ | `lib/Accounting/refundProcessingDialog.dart` | 旧 payload の返金 UI |
| 旧会計キャンセルダイアログ | `lib/Accounting/accountingCancelDialog.dart` | pre-settlement `cancelAccounting` 呼び出し |
| pre-settlement cancel Callable | `functions/src/domains/bills/callables/cancelAccounting.ts` | 会計開始取り消し API |
| 強警告ゲート | `lib/utils/store_strong_warning_ui.dart` | store management 端末の全面ゲート |

## 3. 現挙動

### 3.1 ターミナル導線は本番導線とテスト導線が並立している

- `terminalHomePage` には `会計管理` と `会計後調整（テスト）` が別ボタンで共存している
- `会計管理` は `optionKeys: [accounting]`
- `会計後調整（テスト）` は `optionKeys: null` で権限 UI 制御がない

### 3.2 会計管理画面は閉店中に本文全体を止める

- `AccountingPage` は `storeMeta/currentBusinessDay.status != running` または `currentBusinessDateKey == null` なら本文全体を `閉店中` 表示に差し替える
- このとき未会計/会計完了タブも一覧読込も止まる

### 3.3 強警告は store management 端末で全面ゲートになる

- `StoreStrongWarningOverlay` は `isStoreManagement == true` のとき `StrongWarningGate` を `Positioned.fill` で重ねる
- ゲートは `canPop: false` で、画面本体を操作できない

### 3.4 事後イベント専用画面は今も「テストタブ前提」の構成

- `PostAccountingAdjustmentsPage` は 5 タブ構成で、`伝票一覧` に加えて `返金テスト` / `調整テスト` / `キャンセルテスト` / `再開テスト` を持つ
- 伝票カード上の操作ボタンは `返金` / `減額` / `追加徴収` / `会計前に戻す` だけで、キャンセルボタンがない
- `_canCancel()` は定義されているが、カード UI では使われていない

### 3.5 キャンセル済み伝票は事後イベント画面からも見えなくなる

- `PostAccountingAdjustmentsPage` の `all` は `whereIn(['settled', 'partially_refunded', 'refunded'])`
- `voided` はステータス表示関数にあるが、クエリに含まれない
- そのためキャンセル済み伝票は一覧から落ちる

### 3.6 会計完了カードには旧ボタンが残っている

- `AccountingPage` の会計完了カードには `修正` と `キャンセル` の 2 ボタンがある
- `修正` は旧 `AccountingEditDialog`
- `キャンセル` は旧 `AccountingCancelDialog`
- 新事後イベント用の `返金` / `調整` / `再開` / `会計後キャンセル` は会計完了カードにない

### 3.7 旧ダイアログの実態

- `RefundProcessingDialog` は `refundAmount`, `refundReason`, `refundMethod` を送る旧 payload で `processRefund` を呼ぶ
- `AccountingCancelDialog` は `cancelAccounting` を呼ぶが、サーバは pre-settlement `open` / `in_progress` / `settling` しか許可しない
- `AccountingCancelDialog` は `includeRefund` / `refundAmount` を送るが、`cancelAccounting` の Zod スキーマは `billId`, `reason` しか受け取らない

### 3.8 閉店中の初期日付が営業日基準ではない

- `PostAccountingAdjustmentsPage._initializeSelectedDate()` は閉店中に `DateFormat('yyyy-MM-dd').format(DateTime.now())` を使う
- `lastClosedBusinessDateKey` などは見ないため、閉店直後/日跨ぎでは bill の `businessDate` とずれることがある

## 4. 制約

- 本番導線 (`AccountingPage`) とテスト導線 (`PostAccountingAdjustmentsPage`) が並存し、責務分担が未整理
- 閉店中は `AccountingPage` を使えず、事後イベントは別画面頼み
- 強警告ゲートは画面単位で全面ブロックするため、個別機能のみ例外許可する構造になっていない
- 旧ダイアログ群は `bills` + `postEvent*` 設計と整合していない
- `PostAccountingAdjustmentsPage` にページ自身の権限ガードがない

## 5. 不具合再現条件

### 5.1 会計権限のない端末でも「会計後調整（テスト）」が見える

1. `accounting` オプションを持たない端末でターミナルホームを開く
2. `会計後調整（テスト）` は `optionKeys: null` のため表示候補に残る
3. UI 導線としては権限整合が崩れる

### 5.2 閉店中に会計管理から事後イベントへ入れない

1. `storeMeta/currentBusinessDay.status != running` の状態で `会計管理` を開く
2. `AccountingPage` 本文が `閉店中` 表示だけになる
3. 会計完了済み伝票の返金/調整もこの画面から実行できない

### 5.3 強警告時に store management 端末では画面操作自体が止まる

1. `StoreStrongWarningOverlay` が強警告ありを返す状態にする
2. store management 端末で対象画面を開く
3. `StrongWarningGate` が全面に重なり、配下画面の操作ができない

### 5.4 事後イベント画面の一覧からキャンセルができない

1. `PostAccountingAdjustmentsPage` の伝票一覧を開く
2. `refund` / `adjustment` / `reopen` のボタンはある
3. `cancel` は `_canCancel()` があってもボタンがないため、一覧導線では実行できない

### 5.5 キャンセル済み bill が一覧から消える

1. `PostAccountingCancelDialog` などで bill を `voided` にする
2. 一覧を再読込する
3. クエリが `voided` を含まないため、キャンセル済み伝票が見えなくなる

### 5.6 会計完了カードの `キャンセル` が失敗する、または UI の説明と実際が一致しない

1. `AccountingPage` 会計完了カードの `キャンセル` を押す
2. `AccountingCancelDialog` で `返金も同時に実行する` を選ぶ
3. 実際には `cancelAccounting` が呼ばれ、pre-settlement 以外を拒否する
4. さらに `includeRefund` / `refundAmount` はサーバ未使用なので、説明どおりの動きにならない

### 5.7 事後イベント画面を閉店中に開くと、最初の表示日がずれる

1. 閉店中かつ実際に見たい伝票の `businessDate` が「今日のカレンダー日付」と異なる状態にする
2. `PostAccountingAdjustmentsPage` を開く
3. 初期日付が `DateTime.now()` ベースになり、対象 bill が最初は出ない

## 6. Step3 以降で必ず判断が必要な点

- 事後イベントは `AccountingPage` 会計完了タブへ統合するか、別画面として残すか
- 閉店中でも許可する操作の範囲
- 強警告時に会計後調整だけ例外許可するか
- 旧 `AccountingEditDialog` / `RefundProcessingDialog` / `AccountingCancelDialog` を廃止するか
- `voided` bill をどこで閲覧可能にするか
- 画面レベルの権限ガードをどこに置くか

