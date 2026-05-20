# テーブルデバイス

## このタスクの要点

`table device` は、既存 docs 上ではかなり詳しい ToBe 仕様があります。  
しかし現行コードを見る限り、実装はまだほぼ始まっていません。

## 現状整理

- `docs/table_device/tobe_spec.md` は詳細です。
- ただし Flutter には `lib/tableDevice/` がありません。
- Functions にも専用ドメインがありません。
- `main.dart` に `table` role のルーティングがありません。
- device role 更新 callable は `admin` / `terminal` しか受けません。

## いま言える状態評価

- 仕様書: かなりある
- 実装: ほぼ未着手
- 判断の主戦場: 実装方法ではなく、今の spec をそのまま採用するか

## このタスクの本質

単に「卓に置く端末を作る」だけではありません。  
実際には次をどう切り分けるかの設計タスクです。

- terminal と table device を別 role にするか
- どの操作を卓専用に許すか
- トーナメント卓とサイドゲーム卓を同じ考え方で扱うか

## 関連が強いタスク

- `05_LIFFトーナメント参加導線`
- `10_UI綺麗化と権限別HOME再設計`
