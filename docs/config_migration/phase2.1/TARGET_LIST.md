# Phase2.1 検討対象一覧

Phase2.1 で再検討する `globalConstant.dart` の定数一覧。  
Phase3/4 で扱うと明確化されているもの（STORE_CLOSE_HOUR 関連）は除外。

---

## 検討進捗

| # | ID | 定数 | 決定 | 備考 |
|---|-----|------|------|------|
| 1 | B-01 | schemaVersion | 残す（globalConstant） | Bills スキーマ変更時の考慮事項を README に記載済み |
| 2 | B-02 | menuCategories | storeMeta/config へ移管 | 完了。運用時資料更新済み |
| 3 | B-03 | sideGameTypes | storeMeta/config へ移管 | 完了。運用時資料更新済み |
| 4 | B-04 | defaultPrizeRatio, prizeReceiverPercentage, prizeRoundingMethod, prizeRoundingUnit, prizeDistribution | storeMeta/config へ移管 | 完了。運用時資料更新済み |
| 5 | B-05 | pointTypes | Phase5 へ繰り延べ | 仕様決定・実装は phase5 で実施。phase5/README.md 参照 |
| 6 | B-07 | ADMIN_CREATED_SHIFT_ID | 残す（globalConstant） | 決定。globalConstant にコメント追記済み。B07/README を Done 化 |
| 7 | D-15 | WEEKLY_PLANNER_CRON, RECURRING_TOURNAMENT_*_CRON, RECURRING_TOURNAMENT_*_RUN_AT_DESCRIPTION, ENQUEUE_TOURNAMENT_TASKS_*_CRON, ENQUEUE_TOURNAMENT_TASKS_*_RUN_AT_DESCRIPTION | 完了（TS 環境変数化） | Dart はドキュメント用。TS は process.env で上書き可能。Cloud Logging で source 判別可。 |

---

## 参照箇所（実装時の確認用）

寄せ先変更時は以下を漏れなく修正する。

| 定数 | Dart 参照 | TS 参照 |
|------|-----------|---------|
| schemaVersion | grep 要確認 | grep 要確認 |
| menuCategories | grep 要確認 | grep 要確認 |
| sideGameTypes | grep 要確認 | grep 要確認 |
| トーナメント設定 | tournament 関連ページ | tournament 関連 callables |
| pointTypes | edit_tournament_template_page, create_tournament_template_page, prize_setup_page | createUserAccount.ts, createUserByApp.ts |
| ADMIN_CREATED_SHIFT_ID | shiftDateDialog.dart | helpers.ts, updateDayAssignments.ts |
| CRON 設定 | 未使用（参照用メモ） | weeklyPlanner.ts, GenerateRecurringTournamentsByScheduler.ts, EnqueueTournamentTasksByScheduler.ts |

※ 実施時に grep で全参照箇所を再確認すること。
