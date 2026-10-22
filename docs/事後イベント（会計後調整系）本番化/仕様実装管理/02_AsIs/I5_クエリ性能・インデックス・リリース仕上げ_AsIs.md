# I5_クエリ性能・インデックス・リリース仕上げ_AsIs

参照元: [../01_改修項目再編.md](../01_改修項目再編.md)

## 1. 論点一覧

### 1.1 現状認識済みの問題点

- `F13`: Firestore インデックス未整備により、一覧ソートが暫定運用になっている

### 1.2 コード調査で追加発見した問題点

- `AccountingPage` の一覧読込は bill ごとに `sideGameChips` サブコレクションを別読込しており、件数増加時に N+1 クエリになる
- `PostAccountingAdjustmentsPage` もページングなしで当日対象 bill をまとめて取得する
- `AccountingPage` / `PostAccountingAdjustmentsPage` とも一覧件数の上限や分割ロードがない

## 2. 対象コード

| 区分 | パス | 現在の役割 |
|------|------|------------|
| 事後イベント一覧 | `lib/Accounting/postAccountingAdjustmentsPage.dart` | `businessDate` + `status` で一覧取得、クライアントソート |
| 会計管理一覧 | `lib/Accounting/accountingPage.dart` | 未会計/会計完了 bill 読込 |

## 3. 現挙動

### 3.1 事後イベント一覧は `orderBy` を外してクライアントソートしている

- `PostAccountingAdjustmentsPage` は `businessDate` と `status` で query したあと、`updatedAt` 降順をクライアント側でソートする
- コメント上も「インデックス作成後に orderBy を復帰」とされている

### 3.2 会計完了一覧は `orderBy('ops.accountingCompletedAt')` 前提

- `AccountingPage._loadSettledBills()` は `businessDate`, `status == settled`, `orderBy('ops.accountingCompletedAt', descending: true)` を使う
- 複合インデックスが不足していれば query 失敗になる

### 3.3 `AccountingPage` は一覧構築時に bill ごとにサブコレクション追加読込を行う

- `_loadActiveBills()` は取得した各 bill について `_fetchSideGameChipPurchaseSummary()` を呼ぶ
- `_loadSettledBills()` も同様に各 bill ごとに `sideGameChips` を追加読込する
- bill 件数が `N` 件なら、一覧 query に加えて `N` 回のサブコレクション read が増える

### 3.4 一覧は全件読込で、ページングや limit がない

- `PostAccountingAdjustmentsPage` の query に `limit()` はない
- `AccountingPage` の active/settled query にも `limit()` はない
- 営業日内件数が増えるほど、初回描画までの read 数と待ち時間が増える

## 4. 制約

- 事後イベント一覧の並び順はサーバ保証ではなく、`updatedAt` の存在/型に依存したクライアント整列
- 会計管理一覧は sideGame チップ表示のために正規サマリ未使用で、追加 read に依存する
- 一覧取得は全件前提で、運用件数増加時の上限設計がない

## 5. 不具合再現条件

### 5.1 事後イベント一覧のソートがサーバ保証されない

1. 同日の bill を複数件用意し、`updatedAt` の欠損または差が小さい状態を作る
2. `PostAccountingAdjustmentsPage` を開く
3. 並びはクライアントソート結果に依存し、サーバ側 index/orderBy で固定されない

### 5.2 会計完了一覧がインデックス不足で失敗する

1. `businessDate` + `status` + `ops.accountingCompletedAt` の複合インデックスがない環境を用意する
2. `AccountingPage` 会計完了タブを開く
3. `_loadSettledBills()` の query がインデックスエラーで失敗する

### 5.3 bill 件数増加で `AccountingPage` の一覧が重くなる

1. 同一営業日に bill を多数作成する
2. `AccountingPage` を開く
3. bill 一覧 query に加えて bill ごとの `_fetchSideGameChipPurchaseSummary()` が走り、待ち時間と read 数が増える

## 6. Step3 以降で必ず判断が必要な点

- `PostAccountingAdjustmentsPage` の最終ソートキーを何にするか
- `AccountingPage` / `PostAccountingAdjustmentsPage` で必要な複合インデックス定義
- sideGame チップ表示を親 doc 正規サマリに寄せて N+1 を消すか
- 一覧に `limit`, ページング, 日付範囲制限を入れるか

