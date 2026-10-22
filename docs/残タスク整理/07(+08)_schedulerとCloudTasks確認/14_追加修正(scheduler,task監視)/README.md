# 14: Scheduler / Task 監視 追加修正

Phase 7（中央管理アプリによる運用確認）で判明した **Scheduler / Task 監視 UI の責務混在・誤読問題** を解消するための追加修正。

## ドキュメント構成

| ファイル | 内容 |
|----------|------|
| [01_目的.md](./01_目的.md) | 背景・完了の定義・スコープ |
| [02_仕様書.md](./02_仕様書.md) | ToBe 仕様（完成版 v3・正本） |
| [03_修正計画書.md](./03_修正計画書.md) | Phase 順・changeSpec・テスト・実機確認 |

## 関連（既存）

- [04_期待状態一覧.md](../04_期待状態一覧.md) §10 — 実装後に更新対象
- [13_Phase7_実施結果.md](../13_Phase7_実施結果.md) — 6/4 確認で問題が顕在化
- `amuse-admin/docs/scheduler監視再設計仕様.md` — 旧 UI 設計（本 ToBe で supersede する部分あり）
- `amuse-admin/docs/運用時資料/定期実行タスク正常系定義.md` — 実装後に更新対象

## 実装リポジトリ

| リポジトリ | 主な変更 |
|-----------|----------|
| `amuse-admin` | Scheduler / Task 監視 UI、Config 同期 UI、同期 Cloud Function、firestore.rules |
| `amuse_app_template` | （任意 Phase）`executeScheduledJobTask` start ログへの schedulerParent 付与 |
