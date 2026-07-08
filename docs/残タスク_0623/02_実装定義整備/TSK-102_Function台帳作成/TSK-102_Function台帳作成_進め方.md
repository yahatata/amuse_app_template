> 概要: TSK-102 Function台帳作成の実施方法・段階・AI/人分担・done 条件を定める文書
> 主な目的: callable / trigger / schedule / app 起点処理を網羅的に洗い出し、contract 情報を整理して ART-102_Function台帳.xlsx を完成させる手順を固定する
> 正本区分: md正本
> 対象: TSK-102_Function台帳作成 の実施方法
> 更新区分: 変更時
> 参照元: `TSK-102_Function台帳作成_内容.md`; `docs/残タスク_0623/カテゴリC_FunctionContract確認/検討時叩き2.md`
> 参照先: `docs/業務管理資料/実装定義台帳/ART-102_Function台帳_説明.md`; `ART-102_Function台帳.xlsx`

---

## 1. この文書の役割

カテゴリ C 検討時叩き2 の「サブタスク」構成（C-1〜C-4）を実際の作業手順として具体化する。

---

## 2. 全体の進め方

| 段階 | 目的 | この段階で行うこと | 気をつけること |
|---|---|---|---|
| 1. 対象 function 棚卸し | 全 function の一覧を作る | callable / trigger / schedule / app 起点を列挙。営業開始対象と後続対象を分ける | 廃止済みや将来予定のみの function を混入させない |
| 2. contract 草案作成 | 各 function の contract を 1 行 1 function で整理 | 入力・前提条件・更新コレクション・更新フィールド・エラー・ログ・businessDate / idempotency / config 依存を埋める | 実装にない事実を断定しない。不明は `未確認` で残す |
| 3. 確認責任の切り分け | 各 function の確認方法を決める | 自動テスト十分 / emulator / integration / 実機必須 を判定。実機必須の理由を残す | 「自動テストで十分」と「実機で確認済み」を混同しない |
| 4. 高リスク論点整理 | 問題を前工程へ返す | 未決仕様（A）/ config・rules（B・TSK-101）/ 業務フロー受入（TSK-103）へ起票 | 差し戻し先を未確定のまま閉じない |
| 5. 正本反映 | ART-102.xlsx へ投入 | ChatGPT for Excel プロンプトで反映 | 構造変更と内容更新を同時依頼しない |
| 6. 説明 md 完成 | ART-102_Function台帳_説明.md を完成させる | 列定義・シート構成・更新ルールを埋める | Excel 正本と整合していることを確認する |

---

## 3. ART-102 Excel の想定シート構成

| シート名 | 役割 | 備考 |
|---|---|---|
| `Function一覧` | 主シート。1 function = 1 行 | Excel テーブル機能を使う |
| `Function-Flow対応表` | function と業務フロー（Flow ID）の対応を持つ補助シート | 独立資料にはしない |
| `確認責任マッピング` | 各 function の確認方法と確認責任を整理する補助シート | |

---

## 4. Function一覧の想定列

| 列名 | 内容 | 型・候補値 |
|---|---|---|
| FN-ID | function 識別子（FN-xxx） | 文字列 |
| function 種別 | callable / trigger / schedule / app起点 | 入力規則 |
| function 名 | コード上の名称 | 文字列 |
| 営業開始必須 | 営業開始時点で必須か | TRUE / FALSE |
| 入力パラメータ | 受け取るパラメータの概要 | 文字列 |
| 前提条件 | 呼び出し前に満たすべき条件 | 文字列 |
| 主要更新コレクション | 書き込む Firestore コレクション | 文字列 |
| 主要更新フィールド | 書き込む主なフィールド | 文字列 |
| エラー・例外の扱い | エラー時の挙動・ログ | 文字列 |
| 監査ログ | 書き込む監査ログの種類 | 文字列 |
| businessDate 依存 | businessDate を参照・生成するか | TRUE / FALSE |
| idempotency | 冪等性の扱い | 文字列 |
| config 依存 | 参照する CFG-ID | 文字列（複数なら `;` 区切り） |
| 確認責任 | 自動テスト / emulator / integration / 実機 / 人レビュー | 入力規則 |
| 実機必須理由 | 実機確認が必要な理由 | 文字列 |
| 高リスク論点 | 差し戻し先と内容 | 文字列 |
| 備考 | その他 | 文字列 |

---

## 5. done 条件と着手時再確認事項

done 条件:
- [ ] 営業開始対象の全 function が列挙されている
- [ ] contract 情報が全 function に埋まっている（不明は `未確認` で明示済み）
- [ ] 確認責任が切り分けられている
- [ ] 高リスク論点の差し戻し先が決まっている
- [ ] ART-102_Function台帳_説明.md と Excel 正本が整合している
- [ ] `ART-902_タスク管理台帳` のステータスが `完了` に更新されている

着手時に再確認すること:
- A タスクの未実装機能が追加・変更されていないか
- B タスクの config / rules 整理で contract 情報に影響する変更がないか
- TSK-103 との役割境界（function 単位の整理 vs 業務フロー単位の受入）が変わっていないか
