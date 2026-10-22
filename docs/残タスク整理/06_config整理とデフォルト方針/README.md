# config整理とデフォルト方針

## このタスクの要点

`storeMeta/config` の読み取りとデフォルト補完の仕組み自体は、すでにかなり実装されています。  
ただし「読み取れなかったとき、本当にデフォルトでよいのか」は設定種類ごとに再整理が必要です。

## 現状整理

- Functions 側に `getStoreConfig()` があり、`storeMeta/config` 未存在や読み取り失敗時に defaults へフォールバックします。
- Flutter 側にも `StoreConfigService` があり、未存在時は defaults、読み取りエラー時は最後の成功値維持という考え方があります。
- `requiredStaffByTimeSlot` や `schedulerConfig`、`payrollConfig` は別 doc / 別 loader に分かれています。
- 一部 loader / helper には、ロギング差し込みが不自然で可読性が落ちている箇所も見つかっています。

## いま言える状態評価

- 実装: 既にある
- 整理不足: 高い
- 最大の論点: 設定ごとの fallback 方針が一律すぎる可能性

## このタスクの本質

このタスクは「config ファイルをきれいにする」だけではありません。  
本質は、設定の読み取り失敗時にどこまで自動継続してよいかを、金額・権限・運用重要度ごとに分けることです。

## 関連が強いタスク

- `07(+08)_schedulerとCloudTasks確認`
- `11_requiredStaffByTimeSlot方針`
- `12_給与確認タスクキュー方針`
