# 07_analyticsMonthly更新と日付帰属とline配賦 README

## 1. このステップの役割

このフォルダは、対応する仕様書 `../../04_仕様書/07_analyticsMonthly更新と日付帰属とline配賦.md` を入力として、07_analyticsMonthly更新と日付帰属とline配賦 に関する changeSpec / 実装 / 確認を一貫して管理するための作業フォルダである。

## 1.5 05直下 README の参照ルール

- このステップを進める時は、必ず `../README.md` をあわせて参照する。
- 進め方の正本、参照優先順位、標準の実施順、完了条件、current-scope 外の扱いは `../README.md` を優先する。
- この README はステップ固有の入口であり、全体ルールを単独で代替しない。

## 2. このステップで扱うもの

- 対応する仕様書 `07_analyticsMonthly更新と日付帰属とline配賦.md` に書かれた current-scope
- post-settlement adjustment の `lines[]` から `analyticsMonthly` に増分反映する pure delta builder + atomic applier の追加
- post-settlement cashAction の collection に対する `paymentTotals` 反映の追加（refund は仕様書 §8.4 通り no-op）
- settle 時 marker docId の cycle 化（`{billId}` → `{billId}_cycle{cycleNo}_settle`）
- reopen 時の rollback applier 追加（baseline + adjustments + collection cashActions の負号適用）
- 既存 callable / trigger（`createPostSettlementAdjustment` / `recordPostSettlementCashAction` / `reopenAccountedBill` / `billsOnSettle`）への analytics 連携の組み込み
- feature flag は既存 `storeConfig.features?.settlementAggregatorEnabled` を流用

## 3. このステップで扱わないもの

- 旧 events 経路（`enqueueEvent` / `buildEventDelta` / `appendEventLog`）の analytics 反映停止 → 後続 step（旧経路統廃合と同時）
- nightly 再集計バッチの実装 → 別 step（運用整備）
- `analyticsMonthly` の field schema 統一（`entrySalesIncl` vs `entrySales` 等の suffix 差） → 後続 step（schema migration 必要）
- legacy settle marker `{billId}` の deprecation → 後続 step
- migration / backfill → 行わない（未リリース前提）
- Flutter 側の `analyticsMonthly` 表示画面 → 別画面（既存集計画面は touch なし）

## 4. 対応する changeSpec 名

- 推奨 changeSpec 名: `CS07_analyticsMonthly更新と日付帰属とline配賦`

## 5. 読み順

1. `README.md`（このファイル）
2. `01_現状確認と影響範囲.md`
3. `02_changeSpec.md`
4. `03_仕様書トレース確認.md`
5. `04_確認観点と確認方法.md`
6. `05_実装サマリ.md`
7. `06_確認結果サマリ.md`
8. `07_後続ステップへの伝達事項.md`
9. `08_実機確認手順.md`

## 5.5 テスト失敗時の再試行ルール

- Functions test が emulator 依存で失敗した場合は、Firebase Emulator を再起動してから再実行する。
- 再起動後も失敗する場合に限り、実装不備・テスト不備・環境依存のどれかを切り分けて `06_確認結果サマリ.md` に残す。
- emulator integration test を独立 project で動かす場合、`testEnv = initializeTestEnvironment({ projectId })` の `projectId` と admin SDK の `admin.initializeApp({ projectId })` を **同じ値**にする（`testEnv.clearFirestore()` の対象 project と admin write 先を一致させるため）。

## 5.6 完了前の再点検

- このステップを完了扱いにする前に、`../README.md` の標準手順と完了条件を満たしているかを再点検する。
- あわせて、対応する `../../04_仕様書/07_analyticsMonthly更新と日付帰属とline配賦.md` の current-scope が、実装・テスト・確認結果・後続伝達へ漏れなく反映されているかを確認する。
- 最後に `08_実機確認手順.md` を更新し、実機で何をしてどこがどうなっていれば完了と言えるかを明確にする。

## 6. 完了条件

- `02_changeSpec.md` が完成している
- 仕様書の項目が `03_仕様書トレース確認.md` で追跡できている（current-scope 全項目「完了」）
- 実装とテスト更新が終わっている:
  - pure delta builder unit test 全 pass
  - atomic applier emulator integration test 全 pass（applyAdjustmentToAnalytics / applyCashActionToAnalytics / applyReopenRollbackToAnalytics）
  - 既存 callable spec で `analyticsApplied` が反映されることを emulator log で確認
  - `bills.onSettle.spec.ts` で settle marker key cycle 化のリグレッションがないことを確認
- Functions の既存 test に Step07 起因のリグレッションが発生していない（baseline と同じ既存 fail のみ）
- `cd functions && npm run build && npm run lint` が 0 errors
- 確認結果が `06_確認結果サマリ.md` に反映されている
- 後続への伝達事項が `07_後続ステップへの伝達事項.md` に残っている
- テスト失敗時に必要な再試行確認まで済んでいる、または不要と判断できている
- `08_実機確認手順.md` に、実機での確認方法と完了判定が整理されている
- `../README.md` の進め方と対応仕様書の両面から再点検し、残タスクなしと判断できている
