# Cloud Tasks確認

## このタスクの要点

Cloud Tasks は複数業務で使われており、仕組み自体は整っています。  
ただし過去に malformed task、サービスアカウント不一致、`default-store` 依存などの障害が確認されており、再点検が必要です。

## 現状整理

- tournament queue
- business-date-assessment queue
- scheduled-job 系 queue
- payroll notification 系 task

が存在します。

復旧 docs では、壊れた task を救済するより「今後正しい形式で投入されること」を優先する方針が書かれています。

## いま言える状態評価

- インフラ構成: ある
- 実運用の信頼度: まだ点検が必要
- リスク: 古い壊れた task が残っている可能性

## このタスクの本質

Cloud Tasks は「コードが正しい」だけでは足りません。  
queue、region、service account、payload 形式、retry、既存残骸まで含めて確認しないと、本番では事故になりやすいです。

## 関連が強いタスク

- `07_scheduler確認`
- `12_給与確認タスクキュー方針`
