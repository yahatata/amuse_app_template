# Step 2 実装サマリ

## 1. 実装内容の詳細

### 1.1 changeSpec の修正（taskIndex ルール）

| 種別 | 内容 |
|------|------|
| **修正** | taskIndex の Firestore ルールを `allow read: if true` から `allow read: if false` に変更 |
| **理由** | taskIndex は内部台帳であり、クライアント公開の要件がない。予定時刻・内部状態（failed 等）の露出、仕様変更時のルール保守負債、想定外クライアント参照を避けるため |

### 1.2 createScheduledTournament.ts

| 種別 | 内容 |
|------|------|
| **追加** | `scheduledTournamentData` に 4 フィールドを追加（`createdAt`, `updatedAt` の後、`snapshot` の前） |
| **追加フィールド** | `schedulePlanVersion: 1`, `schedulePlanUpdatedAt: Timestamp.fromDate(now)`, `taskSyncNeeded: true`, `taskSyncReason: ['created']` |

### 1.3 createTournamentRecurrence.ts

| 種別 | 内容 |
|------|------|
| **追加** | `createScheduledTournamentFromRecurrence` 内の `scheduledTournamentData` に上記と同様の 4 フィールドを追加 |

### 1.4 generateRecurringTournamentsCore.ts

| 種別 | 内容 |
|------|------|
| **追加** | 同上 |

### 1.5 firestore.rules

| 種別 | 内容 |
|------|------|
| **追加** | `scheduledTournaments/{tournamentId}` の match ブロック内に `taskIndex` サブコレクションのルールを追加 |
| **ルール** | `allow read: if false`, `allow write: if false`（クライアント非公開。Cloud Functions は Admin SDK でアクセス） |

### 1.6 テスト拡張

| 種別 | 内容 |
|------|------|
| **追加** | step1_emulator_verification.spec.ts の単発作成テストに、作成された scheduledTournament の schedulePlanVersion, taskSyncNeeded, taskSyncReason, schedulePlanUpdatedAt のアサートを追加 |

---

## 2. 実施したテストの詳細

### 2.1 ビルド

| テスト | 観点 | 実行コマンド | 結果 |
|--------|------|--------------|------|
| TypeScript ビルド | 型エラー・構文エラーがないこと | `cd functions && npm run build` | PASS |

### 2.2 Step 1 回帰テスト

| テスト | 結果 |
|--------|------|
| step1_no_enqueue_regression.spec.ts | 5/5 PASS |

### 2.3 Emulator 統合テスト

| テスト | 結果 |
|--------|------|
| step1_emulator_verification.spec.ts | 3/3 PASS |
| - 単発作成1件 → scheduledTournament が作成される（+ Step 2 フィールドのアサート） | PASS |
| - 定期作成1回 → scheduledTournament が作成される | PASS |
| - 定期生成1回 → scheduledTournament が増える | PASS |

---

## 3. 確認観点と結果（verification_points 対応）

| # | 観点 | 結果 |
|---|------|------|
| 1 | createScheduledTournament.ts に 4 フィールド追加 | ✅ |
| 2 | createTournamentRecurrence.ts に 4 フィールド追加 | ✅ |
| 3 | generateRecurringTournamentsCore.ts に 4 フィールド追加 | ✅ |
| 4 | firestore.rules に taskIndex（read: false, write: false）追加 | ✅ |
| 5 | npm run build 成功 | ✅ |
| 6 | step1_no_enqueue_regression.spec.ts パス | ✅ |
| 7 | step1_emulator_verification.spec.ts パス | ✅ |
| 8 | 単発作成時の管理フィールド検証（Emulator テストでアサート） | ✅ |
| 9 | firestore:rules デプロイ | 未実施（任意） |
| 10 | 既存ロジックの変更なし | ✅（追加フィールドのみ） |

---

## 4. 既存機能への影響

- **変更なし**：既存フィールド・処理フローには一切変更を加えていない
- **追加のみ**：scheduledTournamentData へのフィールド追加はスプレッド（`...scheduledTournamentData`）でトランザクションに含まれるため、既存の finalScheduledTournamentData の上書き（startAt, regEndAt）も従来どおり動作

---

## 5. 次のステップ

- Step 3：scheduledTournament 編集処理への version/taskSync 対応
