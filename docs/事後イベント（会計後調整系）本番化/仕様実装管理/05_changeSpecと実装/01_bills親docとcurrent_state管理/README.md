# 01_bills親docとcurrent_state管理 README

## 1. このステップの役割

このフォルダは、対応する仕様書 `../04_仕様書/01_bills親docとcurrent_state管理.md` を入力として、01_bills親docとcurrent_state管理 に関する changeSpec / 実装 / 確認を一貫して管理するための作業フォルダである。

## 1.5 05直下 README の参照ルール

- このステップを進める時は、必ず `../README.md` をあわせて参照する。
- 進め方の正本、参照優先順位、標準の実施順、完了条件、current-scope 外の扱いは `../README.md` を優先する。
- この README はステップ固有の入口であり、全体ルールを単独で代替しない。

## 2. このステップで扱うもの

- 親 doc の target field contract
- `status` の current-scope contract
- `settlementSnapshot`
- `currentSummary`
- `postSettlementState`
- `reopenSummary`
- `closeSummary`
- `ops`
- `draftAccountingInput`
- parent の `requiredActionType / requiredActionIncl / lastRecordType`

## 3. このステップで扱わないもの

- `settlementCycles` 配下の exact schema
- `baselineSnapshot` の full body
- `adjustments` / `cashActions` の明細 schema
- strict な税務・会計 read model 本実装
- analyticsMonthly の exact update formula

## 4. 対応する changeSpec 名

- 推奨 changeSpec 名: `CS01_bills親docとcurrent_state管理`

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

- エミュレータ依存のテストが失敗した時は、まず Firebase Emulator など必要なエミュレータを再起動してから再実行する。
- 再起動後も失敗する場合に限り、実装不備・テスト不備・環境依存のどれかを切り分けて `06_確認結果サマリ.md` に残す。

## 5.6 完了前の再点検

- このステップを完了扱いにする前に、`../README.md` の標準手順と完了条件を満たしているかを再点検する。
- あわせて、対応する `../04_仕様書/*.md` の current-scope が、実装・テスト・確認結果・後続伝達へ漏れなく反映されているかを確認する。
- 最後に `08_実機確認手順.md` を更新し、実機で何をしてどこがどうなっていれば完了と言えるかを明確にする。

## 6. 現時点の進行状況

- `01_現状確認と影響範囲.md`: 作成済み
- `02_changeSpec.md`: 作成済み
- `03_仕様書トレース確認.md`: 作成済み
- `04_確認観点と確認方法.md`: 作成済み
- 実コード実装: 完了
- テスト更新 / 実行: 完了
- `08_実機確認手順.md`: 作成済み

## 7. この時点で見えている重要論点

- 現行は `postEvents` / `closeSnapshot` / root summary が広く残っているため、Step01 は target 契約を導入しつつ旧 field を即時削除しない段階実装が前提になる。
- `status` の旧値 (`in_progress`, `partially_refunded`, `refunded`) は still referenced な箇所があり、Step01 だけで根絶せず後続 step と連携して整理する必要がある。
- UI と close process は parent field 契約の切替影響を強く受けるため、Step06 の前提をこのステップで壊さないようにする。

## 8. 次の具体アクション

1. 後続 step は `07_後続ステップへの伝達事項.md` を参照し、Step01 で導入した parent contract を前提に進める
2. 実機確認が必要な場合は `08_実機確認手順.md` を使って create / start / cancel / settle / close の代表導線を確認する
3. Step02 では `settlementCycles / baselineSnapshot` の exact schema を parent 契約へ接続する

## 9. 完了条件

- `02_changeSpec.md` が完成している
- 仕様書の項目が `03_仕様書トレース確認.md` で追跡できている
- 実装とテスト更新が終わっている
- 確認結果が `06_確認結果サマリ.md` に反映されている
- 後続への伝達事項が `07_後続ステップへの伝達事項.md` に残っている
- テスト失敗時に必要なエミュレータ再起動確認まで済んでいる、または不要と判断できている
- `08_実機確認手順.md` に、実機での確認方法と完了判定が整理されている
- `../README.md` の進め方と対応仕様書の両面から再点検し、残タスクなしと判断できている
