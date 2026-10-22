# requiredStaffByTimeSlot方針

## このタスクの要点

`requiredStaffByTimeSlot` は、完全未実装ではありません。  
専用ドキュメント・Functions 読み取り・Flutter 購読・テストまで存在します。  
ただし「本番でどこまで使うか」「この形で採用しきるか」はまだ再判断の余地があります。

## 現状整理

- `storeMeta/requiredStaffByTimeSlot` に分離済み
- Functions 側 helper が存在
- Flutter 側 service が存在
- docs に empty array の意味も書かれている
- 代表テストも存在する
- ただし Functions helper には、log 出力の入れ方が不自然な箇所があり、保守性の観点では手直し余地があります

## いま言える状態評価

- 技術実装: ある
- 本番採用判断: 未確定
- 論点: 機能の価値と運用のしやすさ

## このタスクの本質

このタスクは「動くかどうか」より、「現場で本当に使うか」「この粒度で十分か」を決めるタスクです。

## 関連が強いタスク

- `04_スタッフ退職処理`
- `06_config整理とデフォルト方針`
