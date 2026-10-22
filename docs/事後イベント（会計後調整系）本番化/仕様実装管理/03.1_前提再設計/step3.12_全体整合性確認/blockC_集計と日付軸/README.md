# Block C README

## このブロックの役割

このブロックでは、`analyticsMonthly`、日付軸、adjustment line 粒度を確認する。

対象:

- `analyticsMonthly` の current-scope 役割
- 売上日 / adjustment 確定日 / cashflow 実行日
- `adjustments.lines[]` の粒度
- 現行実装から派生する支払手段 source

## 読む順番

1. [01_決定事項総覧.md](./01_決定事項総覧.md)
2. [02_03との差分ハイライト.md](./02_03との差分ハイライト.md)
3. [03_代表シナリオ.md](./03_代表シナリオ.md)
4. [04_確認チェックリスト.md](./04_確認チェックリスト.md)

## 判断の主眼

- `analyticsMonthly` を運用 read model として割り切る方針でよいか
- 3つの日付軸の分離でよいか
- line 粒度が current-scope として十分か
- strict な税務・会計 read model を future に逃がす方針でよいか

## 2026-05-09 時点の判断結果

- GO
- 確定事項:
  - `analyticsMonthly` は current-scope では運用ダッシュボード用 read model とする
  - 日付軸は `bill.businessDate` / `adjustment.createdAt` / `cashAction.executedAt` の 3 軸で分ける
  - 支払手段 source は現行 `bills` 実装から派生できる範囲に限定する
  - `adjustments.lines[]` は必須とし、current-scope の粒度は既存 analytics 軸に必要十分な範囲に固定する
  - strict な税務・会計 read model や card 後日入金、point treatment の厳密化は current-scope ではスコープ外とし、future 機能として扱う
