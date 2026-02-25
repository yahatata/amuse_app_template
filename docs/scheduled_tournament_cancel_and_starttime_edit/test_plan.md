# テスト計画

## 1. 単体観点（Functions）

### updateScheduledTournamentStatus
- `scheduled -> cancel` が成功し、`status=cancelled`, `taskSyncNeeded=false` になる
- `cancelled -> restore` が `now < regEndAt` で成功する
- `cancelled -> restore` が `now >= regEndAt` で失敗する
- `scheduled` 以外への cancel 要求は失敗する

### updateScheduledTournamentStartAt
- `scheduled` の開始時刻更新で `startAt/regEndAt/businessDate` が更新される
- 更新時に `schedulePlanVersion` が増分し、`taskSyncNeeded=true` になる
- `AMBIGUOUS` 時に `selectedBusinessDateKey` 未指定で失敗する

### 生成重複防止
- 同一 recurrence + businessDate に `cancelled` が存在する場合、再生成しない
- 同一 recurrence + businessDate に `scheduled` が存在する場合、再生成しない

## 2. 手動観点（Flutter）

### カレンダー画面
- トーナメント詳細ダイアログに「開始時刻編集」「キャンセル」「復旧」が条件どおり表示される
- キャンセル後にカード表示がキャンセル済み表現になる
- 復旧不可条件（`now >= regEndAt`）でボタン無効/エラー表示になる

### 定期編集画面
- 2日前以前のトーナメントが表示されない
- キャンセル済みが赤字表示かつ選択不可
- 時刻修正済みトーナメントに赤字注記が出る

### スケジュール一覧画面
- `cancelled` が一覧に表示されない

## 3. 回帰観点
- 単発作成、定期作成、定期自動生成の既存導線で作成が継続できる
- enqueue Scheduler / controlHook の既存遷移（scheduled -> running -> registered）が崩れない
