# Block B README

## このブロックの役割

このブロックでは、`bills` の保存モデルと current state の設計を確認する。

対象:

- 親 doc
- `settlementCycles`
- `baselineSnapshot`
- `adjustments`
- `cashActions`
- `requiredActionRemainingIncl`
- `allocations`
- `currentSettlementCycle / latestSettledCycle`
- migration 不要方針

## 読む順番

1. [01_決定事項総覧.md](./01_決定事項総覧.md)
2. [02_03との差分ハイライト.md](./02_03との差分ハイライト.md)
3. [03_代表シナリオ.md](./03_代表シナリオ.md)
4. [04_確認チェックリスト.md](./04_確認チェックリスト.md)

## 判断の主眼

- 保存構造の三層分離でよいか
- parent summary の役割分担でよいか
- cycle / sequence の考え方でよいか
- `cashActions` を cycle 配下に置き `allocations` を必須にする方針でよいか

## 2026-05-09 時点の判断結果

- GO
- 確定事項:
  - `baselineSnapshot` は 1 doc で持つ
  - `cashActions` は cycle 配下に置く
  - `allocations[]` は必須
  - `requiredActionRemainingIncl` は adjustment 単位で持つ
  - unreleased 前提なので migration / backfill は current-scope では不要
