# 実機確認で見えた reopen 後 activeStay 復帰と未会計戻し

## 背景

Step13 実機確認で、`reopenAccountedBill` 成功後に bill 自体は `status=open` / `currentSettlementCycle=2` へ正しく遷移した一方で、次の差分が見えた。

1. `activeStays/{userId}.isActive` が `true` に戻らず、在店中ユーザー一覧や通常オーダー導線に復帰できない
2. UI 上は reopen 成功後にそのまま通常会計画面へ進める動きになっているが、業務意図としては「会計中へ戻す」ではなく「未会計へ戻す」で十分
3. reopen 後に再会計へ進む場合も、まず active 状態の復帰と未会計一覧への復帰が正であり、自動遷移は不要

## 修正方針

### 1. backend: activeStays を reopen 時に復帰する

`reopenAccountedBill` transaction 内で `activeStays/{userId}` を upsert し、最低限次を保証する。

- `billId` = 対象 billId
- `uid` = bill.party.userId
- `pokerName` = bill.party.pokerName
- `isActive = true`
- `startedAt` は既存値があれば保持、なければ `serverTimestamp()` を入れる

これにより reopen 後の bill は「当日営業日の未会計 bill」かつ「在店中ユーザー」に戻る。

### 2. frontend: reopen 後は通常会計画面へ自動遷移しない

`会計管理 > 会計完了 > 会計前に戻す` の成功後は、次のシンプルな動きにする。

1. 成功ダイアログを閉じる
2. 一覧を再読込する
3. Snackbar 等で「未会計に戻しました」と通知する

「このまま通常会計を開きますか？」は廃止する。

### 3. 実機確認の期待値更新

reopen 成功後の期待値に次を追加する。

- `activeStays/{userId}.isActive = true`
- reopen 後の bill は `会計管理` の未会計一覧に現れる
- `会計管理` の reopen は「会計中へ戻す」ではなく「未会計へ戻す」として扱う

## 影響範囲

- `functions/src/domains/bills/repos/reopenAccountedBill.ts`
- `lib/Accounting/accountingPage.dart`
- Step13 実機確認 doc

## 注意点

- reopen 後に自動で `startAccounting` は呼ばない
- `ops.accountingStartedAt/CompletedAt` は過去会計の履歴として残してよい。未会計判定は `status=open` と `activeStays` 復帰で扱う
- `settlementCycles/2` は reopen 直後は `open` / `baselineSnapshot` なしのまま維持する
