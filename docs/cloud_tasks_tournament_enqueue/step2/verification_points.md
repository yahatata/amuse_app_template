# Step 2 確認観点

## 1. 実装確認

| # | 観点 | 実施内容 | 担当 |
|---|------|----------|------|
| 1 | createScheduledTournament.ts | scheduledTournamentData に schedulePlanVersion, schedulePlanUpdatedAt, taskSyncNeeded, taskSyncReason が追加されていること | コード確認 |
| 2 | createTournamentRecurrence.ts | createScheduledTournamentFromRecurrence 内の scheduledTournamentData に同上 | コード確認 |
| 3 | generateRecurringTournamentsCore.ts | 同上 | コード確認 |
| 4 | firestore.rules | taskIndex サブコレクションに read: false, write: false が設定されていること | コード確認 |

## 2. ビルド・テスト

| # | 観点 | 実施内容 | 担当 |
|---|------|----------|------|
| 5 | TypeScript ビルド | `cd functions && npm run build` が成功すること | 自動 |
| 6 | Step 1 回帰テスト | step1_no_enqueue_regression.spec.ts がパスすること | 自動 |
| 7 | Emulator 統合テスト | step1_emulator_verification.spec.ts がパスすること（Firestore Emulator 起動後） | 自動 |

## 3. 作成データの検証

| # | 観点 | 実施内容 | 担当 |
|---|------|----------|------|
| 8 | 単発作成時のフィールド | 作成された scheduledTournament に schedulePlanVersion=1, taskSyncNeeded=true, taskSyncReason=['created'], schedulePlanUpdatedAt が含まれること | Emulator テストでアサート |

## 4. Firestore ルール

| # | 観点 | 実施内容 | 担当 |
|---|------|----------|------|
| 9 | ルールデプロイ | `firebase deploy --only firestore:rules` が成功すること | 手動（任意） |

## 5. 既存機能への影響

| # | 観点 | 実施内容 | 担当 |
|---|------|----------|------|
| 10 | 既存ロジックの変更なし | 追加フィールドのみ。既存フィールド・処理フローに変更がないこと | コード確認 |
