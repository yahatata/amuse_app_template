# Phase5: 自動開閉店（補助機能） - 認定処理 確認チェックリスト

## 実装確認（コードベースでの確認）

### ✅ 実装済み確認項目

#### 1. グローバル定数の追加
- [x] `lib/globalConstant.dart`に`ENABLE_AUTO_OPEN_CLOSE`が追加されている
- [x] `lib/globalConstant.dart`に`TASK_CLOSE_OFFSET_MINUTES`が追加されている（デフォルト: 120）
- [x] `lib/globalConstant.dart`に`TASK_OPEN_OFFSET_MINUTES`が追加されている（デフォルト: -30）
- [x] `lib/globalConstant.dart`に`WEEKLY_PLANNER_CRON`が追加されている（デフォルト: `'0 20 * * 0'`）

#### 2. 週次Plannerの実装
- [x] `functions/src/scheduler/weeklyPlanner.ts`が作成されている
- [x] `onSchedule`を使用してCloud Schedulerを設定している（`schedule: '0 11 * * 0'`, `timeZone: 'UTC'`）
- [x] `ENABLE_AUTO_OPEN_CLOSE`の確認処理が実装されている
- [x] `businessHoursMonthlyMap`から翌週（月〜日）分の営業時間を取得する処理が実装されている
- [x] 月跨ぎの場合の複数ドキュメント取得とキャッシュ処理が実装されている
- [x] `days`キーの揺れ対応（`"1"`/`"01"`）が実装されている
- [x] `task.name`を`tasksClient.taskPath(...)`で固定している
- [x] `createTask`で`AlreadyExists`（`error.code === 6`）は成功扱いになっている
- [x] `closeMinute > 1440`の場合は翌日へ繰り越す処理が実装されている
- [x] JST基準で計算してからUTC epoch秒へ変換している
- [x] `PROJECT_ID`が未設定の場合は`throw new Error`でfail-fastしている

#### 3. 閉店認定処理の実装
- [x] `functions/src/tasks/closeAssessmentTask.ts`が作成されている
- [x] `onRequest`を使用してHTTP Functionsを設定している（`region: 'us-central1'`）
- [x] `idempotencyKey`の生成処理が実装されている（`close_assessment_${intendedBusinessDateKey}_${scheduledAt}`）
- [x] トランザクション内で冪等性チェックが実装されている
- [x] `businessDateKey`の許容範囲検証が実装されている（当日または前日）
- [x] 既に閉店済みか確認する処理が実装されている
- [x] 次営業日が開始しているか確認する処理が実装されている
- [x] `manualOverride`の確認処理が実装されている
- [x] 閉店時間超過の確認処理が実装されている
- [x] `blockers`の判定処理が実装されている（`needs_manual_close`または`needs_manual_close_suppressed`の場合、`activeStays where isActive == true limit 1`で存在確認）
- [x] 認定結果の更新処理がトランザクション内で実装されている

#### 4. 開店認定処理の実装
- [x] `functions/src/tasks/openAssessmentTask.ts`が作成されている
- [x] `onRequest`を使用してHTTP Functionsを設定している（`region: 'us-central1'`）
- [x] `idempotencyKey`の生成処理が実装されている（`open_assessment_${intendedBusinessDateKey}_${scheduledAt}`）
- [x] トランザクション内で冪等性チェックが実装されている
- [x] `businessDateKey`の許容範囲検証が実装されている（当日または翌日）
- [x] 既に営業中か確認する処理が実装されている
- [x] 営業中に別日付の開店が走ることを防止する処理が実装されている
- [x] 開店条件の確認処理が実装されている（`storeMeta`のみで判定、`businessHoursMonthlyMap`参照や「前営業日＝前日」計算は行わない）
- [x] `manualOverride`の確認処理が実装されている
- [x] 認定結果の更新処理がトランザクション内で実装されている

#### 5. State Docの初期化更新
- [x] `functions/src/storeManagement/createInitialStateDocCallable.ts`に新規フィールド（`closeAssessment`, `openAssessment`, `manualOverride`）の初期化が追加されている
- [x] 初期値は`null`に設定されている

#### 6. エクスポートの追加
- [x] `functions/src/index.ts`に`export * from "./scheduler/weeklyPlanner";`が追加されている
- [x] `functions/src/index.ts`に`export * from "./tasks/closeAssessmentTask";`が追加されている
- [x] `functions/src/index.ts`に`export * from "./tasks/openAssessmentTask";`が追加されている

#### 7. リンターエラーの確認
- [x] リンターエラーがないことを確認済み

## 手動確認が必要な項目

### 1. 環境変数の設定
- [ ] `ENABLE_AUTO_OPEN_CLOSE`が環境変数に設定されている（デフォルト: `true`）
- [ ] `TASK_CLOSE_OFFSET_MINUTES`が環境変数に設定されている（デフォルト: `120`）
- [ ] `TASK_OPEN_OFFSET_MINUTES`が環境変数に設定されている（デフォルト: `-30`）
- [ ] `CLOSE_ASSESSMENT_URL`が環境変数に設定されている（例: `https://${project}-${location}.cloudfunctions.net/closeAssessmentTask`）
- [ ] `OPEN_ASSESSMENT_URL`が環境変数に設定されている（例: `https://${project}-${location}.cloudfunctions.net/openAssessmentTask`）
- [ ] `TASKS_QUEUE`が環境変数に設定されている（既存の`TASKS_QUEUE`を使用）
- [ ] `TASKS_LOCATION`が環境変数に設定されている（既存の`TASKS_LOCATION`を使用、例: `us-central1`）
- [ ] `TASKS_INVOKER_SA`が環境変数に設定されている（既存の`TASKS_INVOKER_SA`を使用）

### 2. IAM権限の設定
- [ ] Cloud Run（HTTP Functions）側で、`roles/run.invoker`が`TASKS_INVOKER_SA`に付与されている
- [ ] `allUsers`公開はしていないことを確認

### 3. デプロイ後の動作確認
- [ ] Cloud Schedulerが週1回（日曜20:00 JST）に起動していることを確認
- [ ] `ENABLE_AUTO_OPEN_CLOSE`が`false`の場合はno-opになることを確認
- [ ] 翌週（月〜日）分の「閉店認定」「開店認定」タスクがCloud Tasksに投入されていることを確認
- [ ] 月跨ぎの場合、必要な月ドキュメントが複数取得されていることを確認
- [ ] 同一monthIdがキャッシュされてFirestore読み取り回数が抑えられていることを確認
- [ ] `isClosed: true`の場合はタスクが投入されていないことを確認
- [ ] 作成時冪等が実装されていることを確認（`AlreadyExists`エラーは成功扱い）
- [ ] `openMinute`/`closeMinute`の基準日が正しく設定されていることを確認（`intendedBusinessDateKey`の営業日に紐づく）
- [ ] `closeMinute > 1440`の時は翌日へ繰り越すルールが正しく動作していることを確認
- [ ] `openScheduleTime`/`closeScheduleTime`がJST基準で計算してからUTC epoch秒へ変換されていることを確認

### 4. 閉店認定処理の動作確認
- [ ] 冪等性保証が正しく動作していることを確認（同じ`idempotencyKey`で再実行しても安全）
- [ ] `businessDateKey`の許容範囲検証が正しく動作していることを確認（正常/異常の判定）
- [ ] 既に閉店済みの場合の処理が正しく動作していることを確認（`result: 'already_closed'`）
- [ ] 次営業日が開始している場合の処理が正しく動作していることを確認（`result: 'next_day_started'`）
- [ ] `manualOverride`が有効な場合の処理が正しく動作していることを確認（`result: 'needs_manual_close_suppressed'`）
- [ ] 閉店時間超過の場合の処理が正しく動作していることを確認（`result: 'needs_manual_close'`）
- [ ] `blockers`の判定が正しく動作していることを確認（`needs_manual_close`または`needs_manual_close_suppressed`の場合に`activeStays where isActive == true limit 1`で存在確認）

### 5. 開店認定処理の動作確認
- [ ] 冪等性保証が正しく動作していることを確認（同じ`idempotencyKey`で再実行しても安全）
- [ ] `businessDateKey`の許容範囲検証が正しく動作していることを確認（正常/異常の判定）
- [ ] 既に営業中の場合の処理が正しく動作していることを確認（`result: 'already_running'`）
- [ ] 営業中に別日付の開店が走ることを防止する処理が正しく動作していることを確認（`result: 'skipped'`、`blockers: ['already_running_different_date']`）
- [ ] 開店条件の確認が正しく動作していることを確認（`storeMeta`のみで判定、`businessHoursMonthlyMap`参照や「前営業日＝前日」計算は行わない）
- [ ] `lastClosedBusinessDateKey`と`intendedBusinessDateKey`の厳密整合は要求しないことを確認
- [ ] `manualOverride`が有効な場合の処理が正しく動作していることを確認（`lastSuppressedAt`と`suppressedByOverride`を設定）

### 6. 認証/IAMの動作確認
- [ ] OIDCトークン認証が正しく動作していることを確認
- [ ] サービスアカウントのみがHTTP Functionsを呼び出せることを確認
- [ ] `allUsers`公開はしていないことを確認
- [ ] Cloud Run側で`roles/run.invoker`が`TASKS_INVOKER_SA`に付与されていることを確認

### 7. State Docの確認
- [ ] `storeMeta/currentBusinessDay`に`closeAssessment`フィールドが正しく記録されていることを確認
- [ ] `storeMeta/currentBusinessDay`に`openAssessment`フィールドが正しく記録されていることを確認
- [ ] `storeMeta/currentBusinessDay`に`manualOverride`フィールドが正しく記録されていることを確認（初期値は`null`）

### 8. エラーハンドリングの確認
- [ ] エラー発生時に適切なエラーメッセージが返されることを確認
- [ ] トランザクション内でのエラーが適切に処理されていることを確認

## 確認方法

### 週次Plannerの確認
1. Cloud Schedulerのコンソールで`weeklyPlanner`が登録されていることを確認
2. 実行ログを確認して、翌週（月〜日）分のタスクが投入されていることを確認
3. Cloud Tasksのコンソールで、タスクが正しく作成されていることを確認

### 認定処理の確認
1. Cloud TasksからHTTP Functionsが呼び出されていることを確認（ログを確認）
2. `storeMeta/currentBusinessDay`の`closeAssessment`/`openAssessment`フィールドが正しく更新されていることを確認（Firestoreコンソールで確認）
3. 各種シナリオ（既に閉店済み、次営業日が開始している、閉店時間超過など）で正しく動作することを確認

### 認証/IAMの確認
1. Cloud Runのコンソールで、HTTP Functionsの認証設定を確認
2. `TASKS_INVOKER_SA`に`roles/run.invoker`が付与されていることを確認（IAMコンソールで確認）
3. 不正なリクエストが拒否されることを確認
