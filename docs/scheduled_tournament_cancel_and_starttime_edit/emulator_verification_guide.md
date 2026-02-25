# Emulator 検証ガイド（cancel / restore / startAt編集）

本ガイドは次の 3 観点を確認するための手順。

- キャンセル後に定期生成で再生成されない
- 復旧条件 `now < regEndAt` が守られる
- 開始時刻編集後に `task/version` が整合する

## 0. 事前準備

### 0.1 Firestore Emulator 起動

```bash
cd /Users/yahatayuusei/Documents/GitHub/amuse_app_template
firebase emulators:start --only firestore
```

### 0.2 回帰テスト（実行済み・再実行可）

```bash
cd /Users/yahatayuusei/Documents/GitHub/amuse_app_template/functions
npm run test -- __tests__/tournament_createTournament/step3_taskSyncNeeded.spec.ts __tests__/tournament_createTournament/step4_enqueueCore.spec.ts __tests__/tournament_createTournament/step6_controlHook.spec.ts
```

期待:
- 3 suite pass
- Firestore Emulator 未起動時は一部テストがスキップ警告になる

## 1. 検証A: キャンセル後に再生成されない

### 1.1 準備
1. アプリから定期予定を 1 件作成する（`createTournamentRecurrence`）
2. 生成された `scheduledTournaments` の対象 1 件をメモする
   - `recurrenceId`
   - `businessDate`
   - `status`（初期は `scheduled`）

### 1.2 キャンセル
1. カレンダー画面で対象トーナメントを開く
2. ダイアログでキャンセルを実行
3. Firestore で対象 doc を確認
   - `status == "cancelled"`
   - `taskSyncNeeded == false`

### 1.3 定期生成を再実行
1. 定期生成 callable を実行（`generateRecurringTournaments`）
2. Firestore で同一キーを確認
   - キー: `recurrenceId + businessDate + storeId + tenantId`
   - 同一営業日の新規 doc が増えていないこと

期待:
- キャンセル済み開催日は復活しない

## 2. 検証B: 復旧条件 `now < regEndAt`

### 2.1 復旧可能ケース
1. `regEndAt` が未来の `cancelled` トーナメントを用意
2. カレンダーダイアログで復旧
3. Firestore を確認
   - `status == "scheduled"`
   - `taskSyncNeeded == true`
   - `schedulePlanVersion` が +1

### 2.2 復旧不可ケース
1. `regEndAt` が現在以前の `cancelled` トーナメントを用意
2. 復旧操作を実行

期待:
- 復旧不可エラー（`regEndAt を過ぎているため復旧できません`）
- Firestore の `status` は `cancelled` のまま

## 3. 検証C: 開始時刻編集後の task/version 整合

### 3.1 開始時刻編集
1. `scheduled` のトーナメントを選択
2. カレンダーダイアログで開始時刻を編集
3. Firestore で対象 doc を確認
   - `startAt` が変更されている
   - `regEndAt` が再計算されている
   - `businessDate` が再計算されている（必要時）
   - `schedulePlanVersion` が +1
   - `schedulePlanUpdatedAt` 更新
   - `taskSyncNeeded == true`
   - `taskSyncReason` に `startAtChangedByCalendarEdit`

### 3.2 enqueue 整合
1. `enqueueTournamentTasks` callable を実行
2. `scheduledTournaments/{id}/taskIndex/*` を確認
   - 新しい `planVersion/planHash` で更新される
3. （任意）古い task payload が来ても `controlHook` で no-op になることをログで確認

期待:
- 新スケジュールのみ有効化される
- 旧計画タスクは no-op で無害化される

## 4. 画面確認（追加）

### 4.1 定期編集画面
- 2日前以前のトーナメントが表示されない
- `cancelled` は「キャンセル済み」表示かつ選択不可
- 開始時刻修正済みに赤字注記が表示される

### 4.2 スケジュール一覧画面
- `cancelled` が表示されない

## 5. トラブルシュート
- `AMBIGUOUS` エラー時は `selectedBusinessDateKey` 選択で再試行
- `failed-precondition` は status 条件違反の可能性が高い
  - 開始時刻編集は `scheduled` のみ
  - 復旧は `cancelled` かつ `now < regEndAt` のみ
