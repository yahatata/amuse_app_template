# step3.12_全体整合性確認

## 1. このフォルダの役割

このフォルダは、`step3.11` までで決めた内容を、利用者が理解し、論点ごとに GO / 保留 / 修正判断できるように再整理するための作業フォルダである。

この段階では、単に文書同士の文言一致を見るだけではなく、次を行う。

- `03.1` で何を最終判断候補として決めたのかを理解する
- その内容が `03_ToBe意思決定` に対してどこを上書きするのかを明確にする
- `02_AsIs` は何を残すべきかを明確にする
- 利用者が小さい粒度で GO を出せるようにする

## 2. フォルダごとの役割分担

### 2.1 `02_AsIs`

`02_AsIs` は、当時の現状記録であり、**原則として上書きしない**。

役割:

- 「当時どうなっていたか」を残す
- ToBe や 03.1 の判断根拠を後から追えるようにする

### 2.2 `03_ToBe意思決定`

`03_ToBe意思決定` は、旧 ToBe 判断メモである。

役割:

- 旧案や途中判断を残す
- ただし `03.1` で確定した論点については、**同期修正の対象**とする

### 2.3 `03.1_前提再設計`

`03.1` は、今回の再設計の主たる判断記録であり、**現在の正本**として扱う。

役割:

- current-scope の確定内容を保持する
- `03_ToBe意思決定` を上書きする基準になる
- `step3.14` で全体設計完成へ統合する元になる

## 3. このフォルダの使い方

このフォルダでは、論点を 3 ブロックに分けて確認する。

1. 業務と画面
2. 保存モデルと current state
3. 集計と日付軸

各ブロックについて、利用者はそのブロック配下のファイルだけを読めば判断できるように構成する。

### 各ブロックの基本ファイル

- `README.md`
  - そのブロックで何を判断するか
- `01_決定事項総覧.md`
  - current-scope での結論を平易にまとめたもの
- `02_03との差分ハイライト.md`
  - `03_ToBe意思決定` のどこが `03.1` と食い違うか
- `03_代表シナリオ.md`
  - 具体例ベースで挙動を確認する資料
- `04_確認チェックリスト.md`
  - 利用者が GO / 保留を判断するための確認項目

## 4. ブロック構成

### 4.1 Block A: 業務と画面

対象論点:

- [11_事後イベントの機能と業務パターン.md](../step3.11_未決論点の再決定/11_事後イベントの機能と業務パターン.md)
- [16_未会計一部未徴収会計後イベントの接続方針.md](../step3.11_未決論点の再決定/16_未会計一部未徴収会計後イベントの接続方針.md)

主な同期対象:

- [/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03_ToBe意思決定/I2_伝票状態・表示データ・一覧取得の正規化_ToBe意思決定.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03_ToBe意思決定/I2_伝票状態・表示データ・一覧取得の正規化_ToBe意思決定.md)
- [/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03_ToBe意思決定/I3_会計管理UI導線と営業状態別アクセス設計_ToBe意思決定.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03_ToBe意思決定/I3_会計管理UI導線と営業状態別アクセス設計_ToBe意思決定.md)

### 4.2 Block B: 保存モデルと current state

対象論点:

- [13_billsのSoTと保存モデル.md](../step3.11_未決論点の再決定/13_billsのSoTと保存モデル.md)
- [14_status_summary_pending管理.md](../step3.11_未決論点の再決定/14_status_summary_pending管理.md)
- [14.5_bills全体像とフィールド構成.md](../step3.11_未決論点の再決定/14.5_bills全体像とフィールド構成.md)
- [17_既存データ互換移行方針.md](../step3.11_未決論点の再決定/17_既存データ互換移行方針.md)

主な同期対象:

- [/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03_ToBe意思決定/I1_事後イベント業務ルールとデータ契約_ToBe意思決定.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03_ToBe意思決定/I1_事後イベント業務ルールとデータ契約_ToBe意思決定.md)
- [/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/README.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/README.md)

### 4.3 Block C: 集計と日付軸

対象論点:

- [12_analyticsMonthlyと入出金データの役割分担.md](../step3.11_未決論点の再決定/12_analyticsMonthlyと入出金データの役割分担.md)
- [15_売上日入出金日営業日の帰属ルール.md](../step3.11_未決論点の再決定/15_売上日入出金日営業日の帰属ルール.md)
- [18_売上差分明細の粒度と配賦ルール.md](../step3.11_未決論点の再決定/18_売上差分明細の粒度と配賦ルール.md)

主な同期対象:

- [/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03_ToBe意思決定/I4_分析・監査反映基盤_ToBe意思決定.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03_ToBe意思決定/I4_分析・監査反映基盤_ToBe意思決定.md)
- [/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03_ToBe意思決定/I5_クエリ性能・インデックス・リリース仕上げ_ToBe意思決定.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03_ToBe意思決定/I5_クエリ性能・インデックス・リリース仕上げ_ToBe意思決定.md)
- [/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_今後検討_税務会計read_model拡張.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_今後検討_税務会計read_model拡張.md)

## 5. 進め方

このフォルダを使う確認作業は、次の順で進める。

1. 利用者はブロックを 1 つ選ぶ
2. そのブロック配下の `README.md` から読み始める
3. `01` で current-scope の結論を理解する
4. `02` で `03` 側のどこを上書きする必要があるかを見る
5. `03` で具体例を使って挙動を確認する
6. `04` のチェックリストで GO / 保留 / 修正希望を判断する
7. GO が出たブロックだけ、`03_ToBe意思決定` 側を同期修正する

## 6. 現時点の全体評価

- `03.1/step3.11` 本体の中では、設計の幹は概ね整合している
- ただし `03_ToBe意思決定` 側には、旧 status / 旧 collection / 旧 query 前提がまだ残っている
- したがって、今やるべきことは大きな再設計ではなく、**理解をそろえながら、ブロックごとに `03` を同期していくこと**である

## 7. 現時点の進捗

- Block A: GO 済み
- Block B: GO 済み
- Block C: GO 済み

## 8. 補足

このフォルダの資料は、利用者が「理解して GO を出す」ための判断資料であり、ここだけを読めばそのブロックの判断ができることを目標にしている。
