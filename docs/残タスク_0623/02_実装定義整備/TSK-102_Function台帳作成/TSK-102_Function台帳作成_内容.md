> 概要: `ART-102_Function台帳.xlsx` を作成するためのタスク。callable / trigger / schedule / app 起点処理を網羅的に整理し、function 単位の契約情報（contract）を正本化する
> 主な目的: 各 function の入力・前提条件・更新先・エラー・ログ・config 依存を明文化し、確認責任（自動テスト / 実機 / 人レビュー）を切り分ける
> 正本区分: md正本
> 対象: 営業開始スコープに含まれる全 function（callable / trigger / schedule / app 起点処理）
> 更新区分: 変更時
> 参照元: `docs/残タスク_0623/ART-900_全体再編方針.md`; `docs/残タスク_0623/共通/ART-901_タスク資料作成ルール.md`; `docs/残タスク_0623/カテゴリC_FunctionContract確認/検討時叩き2.md`
> 参照先: `docs/業務管理資料/実装定義台帳/ART-102_Function台帳_説明.md`; `TSK-103_業務フロー一覧作成`; `ART-201_統合ワークブック_テンプレ`
> TSK-ID: TSK-102
> タスク名: Function台帳作成
> 対応ART: ART-102
> 依存TSK: TSK-001; TSK-101
> 優先度: 高
> ステータス: 着手可待ち
> done 条件: (1) 営業開始対象の function が漏れなく列挙されている / (2) 各 function に contract 情報（入力・前提・更新先・エラー・ログ・config 依存）が埋まっている / (3) 確認責任が「自動テスト / 実機 / 人レビュー」に切り分けられている / (4) 高リスク論点の差し戻し先（ART-101 / TSK-103 等）が決まっている / (5) ART-102_Function台帳_説明.md と Excel 正本が整合している / (6) ART-902 ステータスが `完了` に更新されている

---

## 1. このタスクの役割

本タスクは `ART-102_Function台帳.xlsx` を作成するタスクである。  
旧 C カテゴリ（`カテゴリC_FunctionContract確認`）の検討時叩き2 の内容を引き継ぎ、ART フレームで完成させる。

このタスクで決めること:
- 営業開始対象 function の一覧（callable / trigger / schedule / app 起点処理）
- 各 function の contract 情報
- 確認責任の切り分け（自動テスト / 実機 / 人レビュー）
- 高リスク論点と差し戻し先の整理

このタスクで決めないこと:
- function の実装変更（B / A タスクへ差し戻す）
- 業務フロー単位の受入確認（TSK-103 へ委譲）
- 統合ワークブックの確認手順（ART-201 で定義）

---

## 2. 背景

カテゴリ C の検討時叩き2 に「このカテゴリで答える問い」「目標」「サブタスク」が整理されている。  
本タスクではこの内容を前提として Excel 台帳と説明 md を完成させる。

C タスクは B タスクの config / rules / secret 整理がある程度進んだ後に精度が上がる。  
着手タイミングは TSK-101 の進捗を見て判断する。

---

## 3. 対象範囲

| 対象 | 対象外 |
|---|---|
| callable function（onCall, https 起点） | 未決仕様の未実装機能（A へ差し戻し） |
| trigger function（Firestore / Pub/Sub 起点） | 純粋なコード定数 |
| schedule function（Cloud Scheduler 起点） | 廃止済みの旧 function |
| app 起点処理（クライアント直呼び等） | 将来実装予定のみの function |

---

## 4. 成果物

| 成果物 | 種別 | 状態 |
|---|---|---|
| `docs/業務管理資料/実装定義台帳/ART-102_Function台帳.xlsx` | sheet 正本 | 未作成（このタスクで作成） |
| `docs/業務管理資料/実装定義台帳/ART-102_Function台帳_説明.md` | 説明 md | 骨格のみ（このタスクで完成させる） |

---

## 5. AI と人の役割分担

| 作業 | AI | 人 |
|---|---|---|
| callable / trigger / schedule function の一覧作成 | 担当 | 漏れ確認・採否判断 |
| contract 情報（入力・前提・更新先・エラー・ログ）の草案 | 担当 | 解釈の最終承認 |
| config 依存・businessDate / idempotency の整理 | 担当 | 判断が必要な箇所の確定 |
| 確認責任の切り分け草案 | 担当 | 最終判断 |
| 高リスク論点・差し戻し先の整理 | 担当 | 優先順位の最終判断 |
| Excel 反映（ChatGPT for Excel） | プロンプト生成 | 実行 |

---

## 6. done 条件（詳細）

- [ ] 営業開始対象の全 function が列挙されている
- [ ] 各 function に contract 情報が埋まっている
- [ ] 確認責任（自動テスト / 実機 / 人レビュー）が function ごとに決まっている
- [ ] 高リスク論点の差し戻し先が決まっている
- [ ] ART-102_Function台帳_説明.md と Excel 正本が整合している
- [ ] `ART-902_タスク管理台帳` のステータスが `完了` に更新されている

---

## 7. 未決事項・注意点

| 項目 | 現時点の扱い |
|---|---|
| TSK-101 との着手順序 | TSK-101（config）が先。B config 整理の結果が contract 情報の精度に影響 |
| Function-Flow 対応表 | ART-102 workbook 内の補助シートとして持つ（独立資料にしない） |
| 差し戻し先の分類 | A（未決仕様）/ B（config/rules/secret）/ TSK-103（業務フロー受入） |
