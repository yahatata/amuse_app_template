# phaseC ステップ8: 運用時資料の必要性判定

判定日: 2026-04-01

## 1. 判定結果

- phaseCの実装範囲について、**運用時資料の新規作成が必要**と判定。
- 理由:
  - `schedulerSupervisor` を本番経路へ接続し、旧 `onSchedule` から task 実行へ移行したため、設定・監視対象が実運用で変わる。
  - `schedulerDispatchLogs` / `schedulerExecutionLogsByCloudTask` / `enqueueTournamentTasksReplanRequests` の確認観点を運用資料として残す必要がある。

## 2. 新規作成した運用時資料

- `docs/運用時資料/設定/storeMeta/schedulerConfigによる設定の詳細/README.md`
- `docs/運用時資料/設定/storeMeta/schedulerConfigによる設定の詳細/scheduler_supervisor_jobs.md`

## 3. 反映した内容

- `storeMeta/schedulerConfig` の主要項目と役割
- job別デフォルト（`scheduleKind` / `runAtJst` / 補助項目）
- `schedulerSupervisor` と job task の関係
- 監視ログ（dispatch / execution）の確認観点
- tournament 再計画 request（`enqueueTournamentTasksReplanRequests`）の確認観点

## 4. 今回は未実施（次フェーズ以降で再判定）

- Secret Manager 実運用手順の更新（phaseDで扱う）
- GitHub Actions / WIF / リージョン移行の運用手順更新（phaseFで扱う）
