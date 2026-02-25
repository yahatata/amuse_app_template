# Step 1 Emulator 検証ガイド

Step 2 へ進む前の最低限の確認手順。短時間で完了する。

## 1. Firestore Emulator を起動

```bash
cd /Users/yahatayuusei/Documents/GitHub/amuse_app_template
firebase emulators:start --only firestore
```

別ターミナルで以下を実行。

## 2. 統合テストで自動検証（推奨）

```bash
cd functions
npm run test -- __tests__/tournament_createTournament/step1_emulator_verification.spec.ts
```

**検証内容**:
- 単発作成1件 → `scheduledTournaments` に1件作成される
- 定期作成1回（`createTournamentRecurrence`）→ `scheduledTournaments` が増える
- 定期生成1回（`generateRecurringTournaments`）→ `scheduledTournaments` が増える

**Cloud Tasks について**:
- Step 1 で `enqueueStartTask` / `enqueueRegistTask` の呼び出しを削除済み
- 本テストは Firestore のみ使用。Cloud Tasks はローカルで確認できないため、ログでの代替確認とする
- テスト通過 = トーナメント作成が成功し、enqueue 削除後のコードが正常動作することを示す

## 3. 手動確認（任意）

### 3.1 Emulator UI で scheduledTournament を確認

1. Emulator 起動時に表示される UI URL（例: http://localhost:4000）を開く
2. Firestore タブで `scheduledTournaments` コレクションを確認
3. テスト実行後、ドキュメントが作成されていることを確認

### 3.2 Cloud Tasks キュー増加の確認（本番/Staging 時）

- ローカル Emulator では Cloud Tasks をシミュレートしない
- 本番環境で確認する場合: GCP Console → Cloud Tasks → キュー一覧で、トーナメント作成前後でタスク数が増えないことを確認
- ログ代替: Functions のログに「Cloud Tasks 投入」「enqueueStartTask」等の出力が**出ない**ことを確認
