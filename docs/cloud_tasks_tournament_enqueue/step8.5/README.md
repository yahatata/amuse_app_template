# Step 8.5: 安全性向上

Step 8 はスキップするが、以下の安全性向上のみ実施する。

## 実施内容

1. **enqueueCore 既存データ混入ガード**：タスク種別共通の必須フィールド（startAt, storeId, tenantId）が揃っていない doc を即スキップ。blindStructure は closeRegistration のみ実質必須（processTournament 内でスキップ）。構造化ログ（tournamentId, reason）を出力
2. **controlHook taskIndex 不在観測強化**：logger.info → logger.warn に変更。実行されないタスクの検知性を向上
3. **Scheduler 有効化手順のドキュメント化**：`scheduler_enable_procedure.md` に手順を固定

## 詳細

- `changeSpec.md`：変更仕様
- `scheduler_enable_procedure.md`：ENQUEUE_SCHEDULER_ENABLED の有効化手順
- `implementation_summary.md`：実装サマリ
