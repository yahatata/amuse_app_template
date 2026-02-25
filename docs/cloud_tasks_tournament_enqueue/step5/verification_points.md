# Step 5 確認観点

changeSpec 7 に準拠した確認観点。

## 観点一覧

| # | 観点 | 期待結果 |
|---|------|----------|
| 1 | 単発作成後 | runEnqueueTournamentTasks が 1 回呼ばれる。失敗時もトーナメント作成は成功 |
| 2 | 定期作成後 | 複数トーナメント生成後、enqueue が 1 回のみ呼ばれる（step5 テストで呼び出し1箇所をアサート） |
| 3 | 定期生成後 | 全 recurrence 処理後、閾値以下なら enqueue が 1 回呼ばれる。閾値超えならスキップ |
| 4 | エラー分離 | enqueue 失敗時、作成処理は成功のまま。logger.error で構造化ログが記録される |
| 5 | 回帰 | Step 1 で削除した enqueueStartTask / enqueueRegistTask の呼び出しが復活していないこと |
| 6 | 循環参照 | enqueueTournamentTasksCore が createScheduledTournament 等を import していないこと |
| 7 | 依存方向 | tasks.ts が enqueueTournamentTasksCore を import していないこと |
| 8 | 対象絞り | createScheduledTournament / createTournamentRecurrence で storeId, tenantId を渡していること |
| 9 | 閾値 | generateRecurringTournamentsCore で ENQUEUE_AFTER_GENERATE_THRESHOLD を超えたら enqueue をスキップすること |
