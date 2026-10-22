# 06_要対応の会計画面と一覧取得 README

## 1. このステップの役割

このフォルダは、対応する仕様書 `../../04_仕様書/06_要対応の会計画面と一覧取得.md` を入力として、06_要対応の会計画面と一覧取得 に関する changeSpec / 実装 / 確認を一貫して管理するための作業フォルダである。

## 1.5 05直下 README の参照ルール

- このステップを進める時は、必ず `../README.md` をあわせて参照する。
- 進め方の正本、参照優先順位、標準の実施順、完了条件、current-scope 外の扱いは `../README.md` を優先する。
- この README はステップ固有の入口であり、全体ルールを単独で代替しない。

## 2. このステップで扱うもの

- 対応する仕様書 `06_要対応の会計画面と一覧取得.md` に書かれた current-scope（要対応一覧画面の本実装）
- 既存 `lib/Accounting/unsettledAccountingPage.dart` を `lib/Accounting/requireSpecialAttentionPage.dart` に rename + 全面刷新
- 共通 view model dataclass + 判定ロジック（`BillRequireAttentionViewModel` / `UserAttentionCounts`）
- 新 dialog 2 つ（`PostSettlementCollectionDialog` / `PostSettlementRefundDialog`）と `recordPostSettlement(Collection|Refund)` callable 接続
- `terminalHomePage.dart` のメニュー entry 改名（`未会計の会計` → `要対応の会計`）

## 3. このステップで扱わないもの

- 旧 dialog (`RefundProcessingDialog` / `postAccountingRefundDialog` 等) の touch / 廃止 → 後続 step
- 旧 callable (`processRefund` / `postEventAdjustment` / `postEventReopen` 等) の touch / 廃止 → 後続 step
- analyticsMonthly への寄与（事後 adjustment / cashAction の analytics 配賦） → Step07
- migration / backfill → 行わない（未リリース前提）
- 件数カウンター増設 → 行わない（client-side 集計）
- paging / 複数 adjustment への按分 UI → post-MVP

## 4. 対応する changeSpec 名

- 推奨 changeSpec 名: `CS06_要対応の会計画面と一覧取得`

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

- Flutter test が test ファイルを発見しない場合、ファイル名が `*_test.dart`（snake_case）規約に従っているか確認する。
- Functions test が emulator 依存で失敗した場合は、Firebase Emulator を再起動してから再実行する。
- 再起動後も失敗する場合に限り、実装不備・テスト不備・環境依存のどれかを切り分けて `06_確認結果サマリ.md` に残す。

## 5.6 完了前の再点検

- このステップを完了扱いにする前に、`../README.md` の標準手順と完了条件を満たしているかを再点検する。
- あわせて、対応する `../../04_仕様書/06_要対応の会計画面と一覧取得.md` の current-scope が、実装・テスト・確認結果・後続伝達へ漏れなく反映されているかを確認する。
- 最後に `08_実機確認手順.md` を更新し、実機で何をしてどこがどうなっていれば完了と言えるかを明確にする。

## 6. 完了条件

- `02_changeSpec.md` が完成している
- 仕様書の項目が `03_仕様書トレース確認.md` で追跡できている（current-scope 全項目「完了」）
- 実装とテスト更新が終わっている（Flutter unit / widget test が pass）
- Functions の既存 test に Step06 起因のリグレッションが発生していない
- 確認結果が `06_確認結果サマリ.md` に反映されている
- 後続への伝達事項が `07_後続ステップへの伝達事項.md` に残っている
- テスト失敗時に必要な再試行確認まで済んでいる、または不要と判断できている
- `08_実機確認手順.md` に、実機での確認方法と完了判定が整理されている
- `../README.md` の進め方と対応仕様書の両面から再点検し、残タスクなしと判断できている
