> 概要: `ART-102_Function台帳.xlsx` の目的・管理対象・シート構成・列定義・更新ルールを定める説明資料
> 主な目的: Function 台帳の列定義・シート間の役割分担・更新ルールを明文化し、台帳を正しく読み書きするための参照資料とする
> 正本区分: sheet正本の説明用md
> 対象: 営業開始スコープに含まれる全 function（callable / trigger / schedule / app 起点処理）
> 更新区分: 変更時
> 参照元: `docs/残タスク_0623/02_実装定義整備/TSK-102_Function台帳作成/TSK-102_Function台帳作成_内容.md`; `docs/残タスク_0623/共通資料/02_用語・ステータス定義.md`
> 参照先: `ART-102_Function台帳.xlsx`; `ART-101_Config台帳_説明.md`; `ART-103_業務フロー一覧_説明.md`; `ART-201_統合ワークブック_説明.md`
> 対応する workbook 名: `ART-102_Function台帳.xlsx`
> 主シート名: `Function一覧`
> 1行の単位: `1 function = 1行`
> 主な列: `FN-ID` / `function種別` / `function名` / `営業開始必須` / `入力パラメータ` / `前提条件` / `主要更新コレクション` / `主要更新フィールド` / `エラー・例外の扱い` / `監査ログ` / `businessDate依存` / `idempotency` / `config依存（CFG-ID）` / `確認責任` / `実機必須理由` / `高リスク論点` / `備考`
> 更新時の注意点: FN-ID は採番後に変更しない。`確認責任` が変わる場合は TSK-201 担当者に連絡する。廃止 function は削除せず `現役区分` を変更する。

---

## 注意: 本資料は骨格のみ

本説明 md は TSK-102_Function台帳作成 の実施中に Excel 正本と整合した状態へ完成させる。

---

## 1. 位置づけ

`ART-102_Function台帳` は function 単位の契約情報（contract）の定義台帳である。  
次の内容を管理する:

- 各 function が何を受け取り何を更新するか
- 前提条件・権限・businessDate・idempotency はどう扱うか
- どこまでを自動テストで担保し、どこからを実機確認に回すか
- config との依存関係（CFG-ID との紐付け）
- 業務フローとの対応（FLOW-ID との紐付け）

---

## 2. 管理対象

### 登録する対象

- 営業開始スコープに含まれる callable / trigger / schedule / app 起点処理

### 登録しないもの

- 廃止済みの旧 function（現役区分で管理）
- 将来実装予定のみで現時点では存在しない function

---

## 3. シート構成

| シート名 | 役割 |
|---|---|
| `Function一覧` | 主シート。1 function = 1 行。Excel テーブル機能を使う |
| `Function-Flow対応表` | function（FN-ID）と業務フロー（FLOW-ID）の対応を持つ補助シート |
| `確認責任マッピング` | 各 function の確認方法と確認責任を整理する補助シート |

---

## 4. 主な列の定義

（TSK-102 実施中に Excel 正本と整合した内容へ更新すること）

| 列名 | 意味 | 型 / 候補値 |
|---|---|---|
| FN-ID | function 識別子（FN-xxx） | 文字列 |
| function種別 | callable / trigger / schedule / app起点 | 入力規則 |
| function名 | コード上の名称 | 文字列 |
| 営業開始必須 | 営業開始時点で必須か | TRUE / FALSE |
| 入力パラメータ | 受け取るパラメータの概要 | 文字列 |
| 前提条件 | 呼び出し前に満たすべき条件 | 文字列 |
| 主要更新コレクション | 書き込む Firestore コレクション | 文字列 |
| 主要更新フィールド | 書き込む主なフィールド | 文字列 |
| エラー・例外の扱い | エラー時の挙動・ログ | 文字列 |
| 監査ログ | 書き込む監査ログの種類 | 文字列 |
| businessDate依存 | businessDate を参照・生成するか | TRUE / FALSE |
| idempotency | 冪等性の扱い | 文字列 |
| config依存（CFG-ID） | 参照する CFG-ID | 文字列（`;` 区切り） |
| 確認責任 | 自動テスト / emulator / integration / 実機 / 人レビュー | 入力規則 |
| 実機必須理由 | 実機確認が必要な理由 | 文字列 |
| 高リスク論点 | 差し戻し先と内容 | 文字列 |
| 備考 | その他 | 文字列 |

---

## 5. 更新時のルール

- FN-ID は採番後に変更しない
- `確認責任` が変わる場合は ART-201 統合ワークブックの Function 挙動確認シートに影響する
- 廃止 function は行を削除せず `現役区分`（備考で補足）を変更する

---

## 6. 参照関係

| 参照先 | 用途 |
|---|---|
| ART-101_Config台帳 | CFG-ID で config 依存を参照 |
| ART-103_業務フロー一覧 | FLOW-ID との対応（Function-Flow対応表） |
| ART-201_統合ワークブック | Function挙動確認シートの根拠として使用 |
