# scheduler確認

## このタスクの要点

`schedulerSupervisor` を中心にした scheduler の仕組みは、現行コード上に存在します。  
ただし「本当にちゃんと動いているか」は、2026-04-07 の復旧 docs でも追加確認が必要とされており、最終的な運用確認はまだ残っています。

## 現状整理

- `schedulerSupervisor` は毎日 03:00 JST の `onSchedule`
- `storeMeta/schedulerConfig` を読み、複数の scheduled job を Cloud Tasks へ投入する構成
- queue 名や jobKey もコード上で定義済み
- 復旧 docs では、supervisor 自体の成功ログは確認済み
- ただし `schedulerConfigLoader` まわりには、ロギング差し込みの整頓余地も見つかっています

## いま言える状態評価

- 設計: ある
- 実装: ある
- テスト: ある
- 本番安心度: 再検証が必要

## このタスクの本質

このタスクは「コードがあるか」ではなく、次を確認する作業です。

- 実デプロイの Cloud Scheduler job が正しいか
- 期待した日時に task が作られるか
- 作られた task が downstream で最後まで動くか

## 関連が強いタスク

- `08_cloudTasks確認`
- `12_給与確認タスクキュー方針`
