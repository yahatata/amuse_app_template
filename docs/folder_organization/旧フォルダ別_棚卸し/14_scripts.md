# 旧フォルダ別棚卸し：scripts

## 1. 対象フォルダの概要

**functions/src/scripts** は、**夜間バッチ 3 本**（onSchedule 入口）と **初期化スクリプト 1 本**（CLI 手動実行・入口なし）の計 4 ファイル。nightlyRecalculateBalanceDue / nightlyReconciliationCheck / nightlyIntegrityCheck はルート index から export され、config/ops の getNightlyCronTriplet で cron を取得。createInitialStateDoc は npx ts-node/tsx で実行する storeMeta/currentBusinessDay の初期ドキュメント作成用で、ルート index からは export されていない。

## 2. 棚卸し表

| ①ファイル | ②種別 | ③入口(Yes/No) | ④export(Yes/No/不明) | ⑤主に触るデータ/コレクション | ⑥呼び出し元メモ（あれば） | ⑦移行先（ドメイン/フォルダ or shared/カテゴリ） | ⑧未使用候補 | ⑨備考 |
|-----------|--------|----------------|----------------------|-----------------------------|---------------------------|--------------------------------------------------|-------------|-------|
| ①nightlyRecalculateBalanceDue.ts | ②scheduler | ③Yes | ④Yes | ⑤bills（読・予定）, analyticsMonthly（書・予定）。現状はスケルトン実装で Firestore 未使用 | ⑥Cloud Scheduler が config/ops の recalc cron で実行。config/ops（getNightlyCronTriplet）を import | ⑦**domains/analytics/scheduler** | ⑧No | ⑨onSchedule。balanceDueIncl 再計算。04 の analytics＝集計・分析・レポートに該当 |
| ①nightlyReconciliationCheck.ts | ②scheduler | ③Yes | ④Yes | ⑤bills, todaysBills（読・比較予定）, reconciliationReports（書・予定）。現状はスケルトン | ⑥Cloud Scheduler が config/ops の reconcile cron で実行。config/ops を import | ⑦**domains/analytics/scheduler** または **domains/bills/scheduler** | ⑧No | ⑨onSchedule。デュアルライト差分チェック。レポート保存は集計側なので analytics を推奨 |
| ①nightlyIntegrityCheck.ts | ②scheduler | ③Yes | ④Yes | ⑤bills, activeStays, analyticsMonthly（読・検証予定）, integrityReports（書・予定）。現状はスケルトン | ⑥Cloud Scheduler が config/ops の integrity cron で実行。config/ops を import | ⑦**domains/analytics/scheduler** | ⑧No | ⑨onSchedule。データ整合性確認・レポート。複数コレクション横断だが結果をレポートとして扱うため analytics |
| ①createInitialStateDoc.ts | ②service | ③No | ④No | ⑤storeMeta/currentBusinessDay（書） | ⑥手動実行（npx ts-node/tsx）。リポジトリ内からは import されない | ⑦**domains/storeMeta**（実行スクリプトの配置は設計で決定。例: storeMeta/scripts や storeMeta/setup） | ⑧No | ⑨onSchedule/onCall なし。CLI 専用。初期状態ドキュメント作成。08 で「scripts フォルダを storeMeta に置くか」を記録可 |

## 3. 追加メモ

- **入口**：nightly* 3 本は **onSchedule** を含むため ③入口 Yes。種別は **scheduler**。createInitialStateDoc は Firebase Functions の入口ではなく CLI 実行のため ③No。種別は **service**（業務処理本体）または「初期化スクリプト」。
- **export**：ルート index は 3 本の nightly* を直接 export しているため、それらは ④Yes。createInitialStateDoc は index から export されていないため ④No。
- **移行先の理由**：夜間バッチ 3 本は、balanceDue 再計算（analyticsMonthly）、デュアルライト差分・整合性レポート（reconciliationReports / integrityReports）と、いずれも「集計・検証・レポート」に属する。04 の analytics＝集計・分析・レポートに含め、**domains/analytics/scheduler** に配置する。nightlyReconciliationCheck は bills と todaysBills の比較だが、出力がレポートであり analytics の責務として扱う。createInitialStateDoc は storeMeta/currentBusinessDay の初期化なので **domains/storeMeta**。配下に scripts や setup を設けるかは設計・08 で決定する。
- **config/ops 参照**：3 本の nightly* は getNightlyCronTriplet（07_config で shared/time 候補の config/ops）を参照。移行後も config の移行先（shared/time 等）への import パスを更新する。
- **未使用候補**：該当なし。createInitialStateDoc は手動実行用のため「未使用」ではなく「CLI 専用・入口なし」として扱う。

## 4. 次アクション

- **設計**：analytics ドメイン設計で夜間バッチ 3 本を **domains/analytics/scheduler** に移す方針を記載する。storeMeta ドメイン設計で createInitialStateDoc を **domains/storeMeta** 配下（scripts / setup 等）に移す方針を記載する。config/ops の移行先が決まったら、nightly* の import パスを更新する。
- **changeSpec**：scripts 移管時に、ルート index.ts の **import パス** を analytics/scheduler に更新する。createInitialStateDoc は index から export していないため、実行パス（npx で叩くパス）を移行先に合わせてドキュメント化する。
- **05_入口一覧**：移行先確定後、nightly* 3 本の配置を「analytics/scheduler」に更新する。createInitialStateDoc は入口ではないため 05 の対象外でよい。
- **未使用候補**：なし。createInitialStateDoc は運用で手動実行するスクリプトとして残す。
