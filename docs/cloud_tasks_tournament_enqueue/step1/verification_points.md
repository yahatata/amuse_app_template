# Step 1 確認観点

## 確認観点一覧

| # | 観点 | 担当 | 方法 |
|---|------|------|------|
| 1 | createScheduledTournament から enqueue 呼び出し・import が削除されている | コード確認 | ソースコードを読み、`enqueueStartTask` / `enqueueRegistTask` が存在しないこと |
| 2 | createTournamentRecurrence から enqueue 呼び出し・import が削除されている | コード確認 | 同上 |
| 3 | generateRecurringTournamentsCore から enqueue 呼び出し・import・getEnv が削除されている | コード確認 | 同上。`recurringTaskOptions` も削除されていること |
| 4 | tasks.ts は変更されていない | コード確認 | git diff 等で変更がないこと |
| 5 | ビルドが成功する | 自動（CI/手動） | `npm run build` |
| 6 | enqueue 呼び出しの削除が回帰しないことを担保する | 自動テスト | ソースに `enqueueStartTask` / `enqueueRegistTask` が含まれないことをアサート |
| 7 | 単発作成が scheduledTournament を正常に作成する | 手動 / 統合テスト | createScheduledTournament を呼び出し、Firestore にドキュメントが作成されること |
| 8 | 定期作成が scheduledTournament を正常に作成する | 手動 / 統合テスト | createTournamentRecurrence を呼び出し、複数ドキュメントが作成されること |
| 9 | 定期生成が scheduledTournament を正常に生成する | 手動 / 統合テスト | generateRecurringTournaments を呼び出し、ドキュメントが生成されること |
| 10 | Cloud Tasks が投入されないこと | 手動 | 上記実行後、キューにタスクが増えていないこと（エミュレーター・本番の監視で確認） |

---

## 担当別の実施可否

| 担当 | 実施可能な観点 |
|------|----------------|
| AI（コード確認・テスト作成・実行） | 1〜6、必要に応じて 7〜9 の統合テスト作成 |
| 人間 | 7〜10 の手動確認、全体レビュー |

---

## 本ステップで実施する確認

- **コード確認**：1〜4
- **ビルド**：5
- **回帰テスト**：6（テストファイル作成・実行）
- **エミュレーター**：統合テスト実行時は起動が必要。回帰テストのみの場合は不要
