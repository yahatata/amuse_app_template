# storeMeta/schedulerConfig による設定の詳細

本フォルダには、Firestore `storeMeta/schedulerConfig` で管理する scheduler 設定の運用時説明書を格納する。

phaseC 以降、scheduler は以下の構成で運用される。

- 監視 scheduler: `schedulerSupervisor`（毎日 03:00 JST）
- 実行経路: `schedulerSupervisor` が Cloud Tasks を作成し、`scheduled-job-*` の Task Queue Function が実処理を実行
- 実行ログ: `schedulerDispatchLogs` / `schedulerExecutionLogsByCloudTask`
- 再計画: `enqueueTournamentTasksReplanRequests`（tournament 用）

## 横断資料

| ドキュメント | 内容 |
|--------------|------|
| [scheduler_supervisor_jobs.md](./scheduler_supervisor_jobs.md) | `schedulerConfig` 項目、job デフォルト、監視・復旧観点 |
| [../中央管理アプリ連携.md](../中央管理アプリ連携.md) | `storeMeta/*` を中央管理アプリへ同期する対象と運用 |
| [設定の不具合時の対応](../../設定の不具合時の対応.md) | 共通の切り戻し・調査方針 |

## 取得失敗時の挙動（実装概要）

- 読み取り元: `functions/src/shared/config/schedulerConfigLoader.ts`
- `storeMeta/schedulerConfig` 未存在時: `schedulerConfigDefaults.ts` の値にフォールバック
- 読み取り失敗時（リトライ後も失敗）: 同上でフォールバック
- 一部フィールド欠落/不正値: フィールド単位でデフォルト補完

## 運用上の注意

- `jobs.<jobKey>` の ON/OFF・時刻変更は、次回 `schedulerSupervisor` 実行時から反映される。
- `jobs.<jobKey>` や `planningHorizonDays` を変更したあとは、中央管理アプリ `設定 > 店舗 Config 同期` の再実行が必要。
- `jobKey` 追加時はコード側の `SCHEDULED_JOB_QUEUE_BY_KEY` 更新が必須。設定だけ追加しても実行されない。
- `enqueueTournamentTasksReplanRequests` は tournament 専用。ほか job 用には流用しない。
