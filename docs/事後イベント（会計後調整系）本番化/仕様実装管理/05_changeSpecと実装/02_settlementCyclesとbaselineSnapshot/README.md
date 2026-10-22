# 02_settlementCyclesとbaselineSnapshot README

## 1. このステップの役割

このフォルダは、対応する仕様書 [02_settlementCyclesとbaselineSnapshot.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/04_仕様書/02_settlementCyclesとbaselineSnapshot.md) を入力として、Step02 に関する changeSpec / 実装 / 確認を一貫して管理するための作業フォルダである。

Step02 の current-scope は、通常会計の create / settle パスで `settlementCycles` と `baselineSnapshot` の土台を実装することである。actual reopen runtime は Step05 の主責務であり、このステップでは扱わない。

## 1.5 05直下 README の参照ルール

- このステップを進める時は、必ず [../README.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_changeSpecと実装/README.md) をあわせて参照する。
- 進め方の正本、参照優先順位、標準の実施順、完了条件、current-scope 外の扱いは root README を優先する。
- この README はステップ固有の入口であり、全体ルールを単独で代替しない。

## 2. このステップで扱うもの

- bill 作成時の `settlementCycles/1` 初期生成
- settle 時の current cycle settled 化
- `baselineSummary` の保存
- `baselineSnapshot/snapshot` 単一 doc の保存
- baseline line 配列の最小 shape 生成
- root snapshot 群との互換 dual-write

## 3. このステップで扱わないもの

- adjustment の作成 / 保存
- cashAction の作成 / 保存
- actual reopen runtime
- analytics 接続本体
- migration / backfill

## 4. 対応する changeSpec 名

- `CS02_settlementCyclesとbaselineSnapshot`

## 5. 読み順

1. `README.md`
2. `01_現状確認と影響範囲.md`
3. `02_changeSpec.md`
4. `03_仕様書トレース確認.md`
5. `04_確認観点と確認方法.md`
6. `05_実装サマリ.md`
7. `06_確認結果サマリ.md`
8. `07_後続ステップへの伝達事項.md`
9. `08_実機確認手順.md`

## 5.5 テスト失敗時の再試行ルール

- エミュレータ依存のテストが失敗した時は、まず Firebase Emulator を再起動してから再実行する。
- Jest 実行コマンドは `npm --prefix functions test -- ...` を優先し、workspace 外の Jest を拾う `npx jest` は避ける。
- 再起動後も失敗する場合に限り、実装不備・テスト不備・環境依存のどれかを切り分けて `06_確認結果サマリ.md` に残す。

## 5.6 完了前の再点検

- このステップを完了扱いにする前に、[../README.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/05_changeSpecと実装/README.md) の標準手順と完了条件を満たしているかを再点検する。
- あわせて、対応する仕様書 [02_settlementCyclesとbaselineSnapshot.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/04_仕様書/02_settlementCyclesとbaselineSnapshot.md) の current-scope が、実装・テスト・確認結果・後続伝達へ漏れなく反映されているかを確認する。
- 最後に `08_実機確認手順.md` を更新し、実機で何をしてどこがどうなっていれば完了と言えるかを明確にする。

## 6. 完了条件

- `02_changeSpec.md` が completed 状態になっている
- `03_仕様書トレース確認.md` で Step02 対象が `完了` または `後続` に整理されている
- create / settle パスの実装とテスト更新が終わっている
- エミュレータ再試行込みの確認結果が `06_確認結果サマリ.md` に反映されている
- Step03 / Step05 / Step07 への handoff が `07_後続ステップへの伝達事項.md` に残っている
- `08_実機確認手順.md` に、実機での確認方法と完了判定が整理されている
- root README の進め方と Step02 仕様書の両面から見て残タスクなしと判断できている
