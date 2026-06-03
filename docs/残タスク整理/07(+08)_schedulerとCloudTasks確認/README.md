# scheduler と Cloud Tasks 確認（07 + 08 統合）

## このタスクの要点

店舗の日次・週次運用は、`schedulerSupervisor` → Cloud Tasks / Task Queue → 各 handler という 1 本のパイプラインで動いている。  
コードと仕組みは存在するが、**本番で「各 job が完了まで動いている」と言い切れる再検証**と、**不要・重複・旧版の整理**、**ログ・検知・ルールの統一**が残っている。

旧 `07_scheduler確認` と `08_cloudTasks確認` は本フォルダに統合した。

## 何を達成するか（合意済み）

1. **動作確認**: `schedulerConfig` で enabled な各 job が、enqueue から **処理完了まで** 動くことを確認する
2. **きれい化**: 不要・重複・旧版（新方式に置き換わった queue / scheduler / task 経路）を洗い出し、整理する
3. **ログ統一**: GCP未実行検知で整備した 11 handler を除き、到達・完了ログを同方針に揃える。scheduler 層のログ責務を handler 層と分けて明確化する
4. **検知**: job 完了までをクリア条件とした未実行・失敗の見方を決める
5. **ルール化**: 今後追加する scheduler / Cloud Tasks 経路に上記方針が反映される `.cursor/rules` を整備する

## 12（給与確認タスクキュー方針）との切り分け

| 本タスク（07+08） | `12_給与確認タスクキュー方針` |
|-------------------|------------------------------|
| `payrollNotificationScheduler` → `processPayrollNotifications` を **他 job と同様**に動作・ログ・検知可能な状態に保つ | 通知機能を **本当に必要か**、**中身の調整が必要か** を検討し、必要なら修正する |
| enabled なら完了まで PASS 対象 | 採用 / 簡略化 / 見送りの **業務判断** |

## ドキュメント構成

| ファイル | 内容 |
|----------|------|
| [01_目的.md](./01_目的.md) | 背景・完了の定義・スコープ |
| [02_仕様整理.md](./02_仕様整理.md) | 確定方針と未決事項 |
| [03_やること整理.md](./03_やること整理.md) | Phase 別の作業一覧 |
| [04_期待状態一覧.md](./04_期待状態一覧.md) | queue / job / producer-consumer の正本 |
| [05_検証計画.md](./05_検証計画.md) | job 完了までの PASS 条件と確認手順 |
| [06_ログと検知方針.md](./06_ログと検知方針.md) | 3 層ログ・検知・ルール化方針 |
| [07_進め方.md](./07_進め方.md) | **Phase 順序・確認しながら都度修正・Phase 1a/1b 分割** |
| [08_Phase0_実環境diff.md](./08_Phase0_実環境diff.md) | Phase 0 成果物（GCP 突合・8日ログ・skip 突合） |
| [09_Phase3_実施結果.md](./09_Phase3_実施結果.md) | Phase 3 成果物（job 完了確認） |
| [10_Phase4_実施結果.md](./10_Phase4_実施結果.md) | Phase 4 成果物（ログ統一） |
| [11_Phase5_6_クローズと中央管理アプリへの引き継ぎ.md](./11_Phase5_6_クローズと中央管理アプリへの引き継ぎ.md) | 検知の管理アプリ移管 |
| [12_Phase7_中央管理アプリによる運用確認.md](./12_Phase7_中央管理アプリによる運用確認.md) | Phase 7 全体計画 |
| [Phase7_2026-06-04_実行手順書.md](../../../amuse-admin/docs/運用時資料/Phase7_2026-06-04_実行手順書.md) | **6/4 当日: @ 指定する実行手順** |
| [13_Phase7_実施結果.md](./13_Phase7_実施結果.md) | Phase 7 確認ログ |

## 関連タスク

- `06_config整理とデフォルト方針` — `schedulerConfig` / loader の fallback
- `09_不要function整理` — legacy function と queue 残骸の照合
- `12_給与確認タスクキュー方針` — 給与通知の業務採用判断（本タスク完了後）
- `docs/タスク実行復旧_20260407/` — 2026-04-07 復旧の As-Is / 実施結果
- `docs/エラーログ運用/GCP未実行検知/` — logOpsInfo(start) の要件・changeSpec

## パイプライン概要

```
Cloud Scheduler（03:00 JST）
  → schedulerSupervisor
    → schedulerDispatchLogs（Firestore）
      → scheduled-job-* / HTTP Cloud Tasks / Firebase Task Queue
        → executeScheduledJobTask 等の handler
          → 業務処理完了（logOpsSuccess または仕様どおりの skip）
```
