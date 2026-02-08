# 改修実装チェックリスト（コード改修は別工程）

## 概要

本ドキュメントは、営業日判定・開閉店自動化の改修実装時に確認すべきチェックリストです。コード改修は別工程で行いますが、本チェックリストに基づいて実装を進めてください。

## 用語統一

- 本ドキュメントでは`businessDateKey`（`YYYY-MM-DD`形式）を正として使用
- Firestoreフィールド名が`businessDate`の場合は「フィールド名」として括弧書きで説明する

---

## UI（Dart）チェックリスト

### 1. 当日ページは state doc 購読で currentBusinessDateKey を取得しているか

#### 対象ファイル

- ✅ `lib/Accounting/accountingPage.dart`
  - **現状**: `_getBusinessDate()`で営業日を計算（60-72行目）
  - **課題**: `GlobalConstants.STORE_CLOSE_HOUR`を直接使用
  - **対応方針**: `storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得

- ✅ `lib/user_actions/order_history_popup.dart`
  - **現状**: `_getBusinessDate()`で営業日を計算（39-49行目）
  - **課題**: `GlobalConstants.STORE_CLOSE_HOUR`を直接使用
  - **対応方針**: `storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得

- ✅ `lib/user_actions/tournament_history_popup.dart`
  - **現状**: `_getBusinessDate()`で営業日を計算（39-49行目）
  - **課題**: `GlobalConstants.STORE_CLOSE_HOUR`を直接使用
  - **対応方針**: `storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得

- ✅ `lib/OrderView/OrderManagement/order_management_page.dart`
  - **現状**: `DateFormat('yyyyMMdd').format(DateTime.now())`で日付を生成（175行目）
  - **課題**: カレンダー日付を使用（営業日ではない）
  - **対応方針**: `storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得し、`YYYYMMDD`形式に変換

#### チェック項目

- [ ] `storeMeta/currentBusinessDay`をsnapshot購読している
- [ ] `currentBusinessDateKey`をクエリ条件として使用している
- [ ] `DateTime.now()` / `DateFormat('yyyyMMdd')` / `STORE_CLOSE_HOUR`等により暦日ベースで「当日キー」を作っていない

---

### 2. 当日ページで暦日（now/format）からbusinessDateKeyを生成していないか

#### 対象ファイル

上記「1. 当日ページは state doc 購読で currentBusinessDateKey を取得しているか」と同じファイル

#### チェック項目

- [ ] `DateTime.now()`から直接`businessDateKey`を生成していない
- [ ] `DateFormat('yyyyMMdd').format(DateTime.now())`から直接`businessDateKey`を生成していない
- [ ] `GlobalConstants.STORE_CLOSE_HOUR`を直接使用して`businessDateKey`を計算していない

---

### 3. タブ/プルダウンの翌日・期間表示は currentBusinessDateKey を起点に営業日キー列を生成しているか

#### 対象ファイル

- ✅ `lib/Accounting/accountingPage.dart`
  - **現状**: タブあり（未会計・会計完了）、当日のみ表示
  - **課題**: 翌日・期間表示機能は現状なし
  - **対応方針**: 将来的に追加する場合は、`currentBusinessDateKey`を起点に営業日キー列を生成

- ✅ `lib/Accounting/accountingHistoryPage.dart`
  - **現状**: 日付選択あり（`_selectedDate`を使用）。ユーザーが選択するのは`DateTime`だが、クエリには`YYYY-MM-DD`形式の文字列として使用
  - **課題**: カレンダー日付ベースの選択
  - **対応方針**: 選択値に応じて分岐
    - (A) 選択 = dateKey（営業日文字列 `YYYY-MM-DD`）→ そのままクエリ（`calcBusinessDate`不要）
    - (B) 選択 = timestamp（日時）→ `calcBusinessDate`を使用（OK/NONE/AMBIGUOUS対応）

- ✅ `lib/Accounting/postAccountingAdjustmentsPage.dart`
  - **現状**: タブと日付選択あり（`_selectedDate`を使用）。ユーザーが選択するのは`DateTime`だが、クエリには`YYYY-MM-DD`形式の文字列として使用
  - **課題**: カレンダー日付ベースの選択
  - **対応方針**: 選択値に応じて分岐
    - (A) 選択 = dateKey（営業日文字列 `YYYY-MM-DD`）→ そのままクエリ（`calcBusinessDate`不要）
    - (B) 選択 = timestamp（日時）→ `calcBusinessDate`を使用（OK/NONE/AMBIGUOUS対応）

- ✅ `lib/OrderView/OrderManagement/order_management_page.dart`
  - **現状**: 当日と前日を複数クエリ（175-176行目）
  - **課題**: `DateTime.now().subtract(const Duration(days: 1))`で前日を計算（カレンダー日付ベース）
  - **対応方針**: `currentBusinessDateKey`を起点に、前日を計算（営業日キー列を生成、休業日考慮は今回はしない）

#### チェック項目

- [ ] `currentBusinessDateKey`を起点に営業日キー列（dateKey列、暦日加算）を生成している
- [ ] 単純な「日付+1」は使用していない（`DateTime.add(Duration(days: 1))`は暦日の繰り上がり処理のため使用可）
- [ ] 月末/年末の繰り上がりが正しく処理されている
- [ ] 休業日（`isClosed`）のスキップは行っていない（前日/翌日は暦日ベース）

---

### 4. month-end等の繰り上がりが DateTime 加算で正しく処理されているか

#### 対象ファイル

上記「3. タブ/プルダウンの翌日・期間表示は currentBusinessDateKey を起点に営業日キー列を生成しているか」と同じファイル

#### チェック項目

- [ ] `DateTime.add(Duration(days: 1))`を使用して暦日の繰り上がりを正しく処理している
- [ ] `YYYY-MM-DD`形式に整形して`businessDateKey`を生成している
- [ ] 月末/年末の繰り上がりが正しく処理されている

---

### 5. 期間表示のクエリがパターンA（range）かB（whereIn分割/複数クエリ）か明記されているか

#### 対象ファイル

- ✅ `lib/Accounting/accountingPage.dart`
  - **現状**: `whereIn`を使用（`['open', 'settling']`）※これはステータス絞り込み用の`whereIn`であり、期間表示とは別軸
  - **クエリ戦略**: `businessDate`は`isEqualTo`で単一営業日を指定。期間表示を追加する場合は、`businessDate`フィールドに対してパターンA（range）またはパターンB（whereIn分割/複数クエリ）を選択
  - **対応方針**: 期間表示を追加する場合は、`businessDate`フィールドに対してパターンA（range）またはパターンB（whereIn分割/複数クエリ）を選択

- ✅ `lib/Accounting/accountingHistoryPage.dart`
  - **現状**: `whereIn`を使用（`['settled', 'partially_refunded', 'refunded', 'voided']`）※これはステータス絞り込み用の`whereIn`であり、期間表示とは別軸
  - **クエリ戦略**: `businessDate`は`isEqualTo`で単一営業日を指定。期間表示を追加する場合は、`businessDate`フィールドに対してパターンA（range）またはパターンB（whereIn分割/複数クエリ）を選択
  - **対応方針**: 期間表示を追加する場合は、`businessDate`フィールドに対してパターンA（range）またはパターンB（whereIn分割/複数クエリ）を選択

- ✅ `lib/Accounting/postAccountingAdjustmentsPage.dart`
  - **現状**: `whereIn`を使用（`['settled', 'partially_refunded', 'refunded']`）※これはステータス絞り込み用の`whereIn`であり、期間表示とは別軸
  - **クエリ戦略**: `businessDate`は`isEqualTo`で単一営業日を指定。期間表示を追加する場合は、`businessDate`フィールドに対してパターンA（range）またはパターンB（whereIn分割/複数クエリ）を選択
  - **対応方針**: 期間表示を追加する場合は、`businessDate`フィールドに対してパターンA（range）またはパターンB（whereIn分割/複数クエリ）を選択

- ✅ `lib/OrderView/OrderManagement/order_management_page.dart`
  - **現状**: 複数クエリ（当日と前日）
  - **クエリ戦略**: パターンB（複数クエリ）
  - **対応方針**: `currentBusinessDateKey`を起点に、前日を計算して複数クエリ（休業日考慮は今回はしない）

- ✅ `lib/Accounting/accountingEditDialog.dart`
  - **現状**: `isGreaterThanOrEqualTo`と`isLessThan`で範囲クエリ（`scheduledTournaments`、93-94行目）
  - **クエリ戦略**: パターンA（range）
  - **対応方針**: 営業日ベースの表示に変更する場合は、`businessDate`でフィルタリング

#### チェック項目

- [ ] 期間表示のクエリ戦略（パターンA/B）が明記されている
- [ ] パターンA（range）の場合: `businessDate`フィールドで範囲クエリ（`where('businessDate', '>=', startKey).where('businessDate', '<=', endKey)`）
- [ ] パターンB（whereIn分割/複数クエリ）の場合: `businessDate`フィールドに対して`whereIn`を使用し、`whereIn`制約（最大10要素）に注意
- [ ] ステータス絞り込み用の`whereIn`（例: `['open', 'settling']`）と期間表示用の`whereIn`を混同していない

---

### 6. 日付選択（カレンダー）等で任意日時の営業日が必要な画面があるなら、calcBusinessDate（±30分、NONE/AMBIGUOUS）を使う方針を追記

#### 対象ファイル

- ✅ `lib/Accounting/accountingHistoryPage.dart`
  - **現状**: 日付選択あり（`_selectedDate`を使用）。ユーザーが選択するのは`DateTime`だが、クエリには`YYYY-MM-DD`形式の文字列として使用（49行目）
  - **課題**: カレンダー日付ベースの選択
  - **対応方針**: 選択値に応じて分岐
    - (A) 選択 = dateKey（営業日文字列 `YYYY-MM-DD`）→ そのままクエリ（`calcBusinessDate`不要）
    - (B) 選択 = timestamp（日時）→ `calcBusinessDate`を使用（OK/NONE/AMBIGUOUS対応）
  - **AMBIGUOUS/NONE対応**: (B)の場合のみ必要

- ✅ `lib/Accounting/postAccountingAdjustmentsPage.dart`
  - **現状**: 日付選択あり（`_selectedDate`を使用）。ユーザーが選択するのは`DateTime`だが、クエリには`YYYY-MM-DD`形式の文字列として使用（60行目）
  - **課題**: カレンダー日付ベースの選択
  - **対応方針**: 選択値に応じて分岐
    - (A) 選択 = dateKey（営業日文字列 `YYYY-MM-DD`）→ そのままクエリ（`calcBusinessDate`不要）
    - (B) 選択 = timestamp（日時）→ `calcBusinessDate`を使用（OK/NONE/AMBIGUOUS対応）
  - **AMBIGUOUS/NONE対応**: (B)の場合のみ必要

- ✅ `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart`
  - **現状**: `startAt`でフィルタリング
  - **課題**: 営業日ベースの表示に変更する場合は`businessDate`でフィルタリングが必要
  - **対応方針**: 営業日ベースの表示に変更する場合は、`calcBusinessDate`を使用して`businessDate`を計算
  - **AMBIGUOUS/NONE対応**: 必要（`startAt`から`businessDate`を計算する際に`AMBIGUOUS`/`NONE`が返される可能性がある）

- ✅ `lib/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart`
  - **現状**: `startAt`で範囲クエリ（46-51行目）
  - **課題**: カレンダー表示で営業日ベースの表示に変更する場合、`businessDate`でフィルタリングが必要
  - **対応方針**: 営業日ベースの表示に変更する場合は、`calcBusinessDate`を使用して`businessDate`を計算
  - **AMBIGUOUS/NONE対応**: 必要（`startAt`から`businessDate`を計算する際に`AMBIGUOUS`/`NONE`が返される可能性がある）

- ✅ `lib/tournament/pages/tournament_select_page.dart`
  - **現状**: `startAt`でソート（93-95行目）
  - **課題**: 営業日ベースの表示に変更する場合は`businessDate`でフィルタリングが必要
  - **対応方針**: 営業日ベースの表示に変更する場合は、`calcBusinessDate`を使用して`businessDate`を計算
  - **AMBIGUOUS/NONE対応**: 必要（`startAt`から`businessDate`を計算する際に`AMBIGUOUS`/`NONE`が返される可能性がある）

#### チェック項目

- [ ] 選択UIが何を返すかをコード確認している
- [ ] (A) 選択 = dateKey の場合: そのままクエリしている（`calcBusinessDate`不要）
- [ ] (B) 選択 = timestamp の場合: `calcBusinessDate`を使用している
- [ ] (B) の場合のみ: `AMBIGUOUS`時の候補選択ダイアログを実装している
- [ ] (B) の場合のみ: `NONE`時のエラーダイアログを実装している

---

## Functions（TS）チェックリスト

### 1. 現在時刻の格納：getCurrentBusinessDateKeyOrThrow() を使用するか

#### 対象ファイル

- ✅ `functions/src/helpers/billsApi/createBillWithActiveStay.ts`
  - **現状**: `calcBusinessDate(now)`で営業日を計算（98行目）
  - **課題**: 現在時刻の格納時は`getCurrentBusinessDateKeyOrThrow()`を使用すべき
  - **対応方針**: `getCurrentBusinessDateKeyOrThrow()`を使用（実装予定）

#### チェック項目

- [ ] 現在時刻の格納時に`getCurrentBusinessDateKeyOrThrow()`を使用している
- [ ] `calcBusinessDate`を直接使用していない（予定・任意日時のみ`calcBusinessDate`を使用）

---

### 2. 予定/任意日時：calcBusinessDate（hours参照＋±30分＋OK/NONE/AMBIGUOUS）か

#### 対象ファイル

- ✅ `functions/src/helpers/billsApi/calcBusinessDate.ts`
  - **現状**: `getStoreCloseHour()`から営業時間を取得（28行目）
  - **課題**: `businessHoursMonthlyMap`を参照するように変更が必要
  - **対応方針**: 
    - `businessHoursMonthlyMap`の`days`マップから該当日のデータを取得（キーは日付の文字列）
    - `isClosed: true`の場合は`NONE`を返す
    - `openMinute`/`closeMinute`を分単位から時刻に変換
    - ±30分バッファ、OK/NONE/AMBIGUOUS対応
    - **月跨ぎ対応**: 1日の場合は前月分のドキュメントも確認、28-31日の場合は次月のドキュメントも確認

- ✅ `functions/src/itemOrder/placeOrderByUser.ts`
  - **現状**: `bill.businessDate`から取得（121行目）
  - **課題**: 新規に営業日を計算する場合は`calcBusinessDate`を使用
  - **対応方針**: 予定・任意日時の場合は`calcBusinessDate`を使用

- ✅ `functions/src/attendance/createClockInRecord.ts`
  - **現状**: `date`フィールドをカレンダー日付で格納（59-70行目）
  - **課題**: `clockIn`から`calcBusinessDate`を使用して`businessDate`を計算
  - **対応方針**: `calcBusinessDate`を使用して`businessDate`を計算

- ✅ `functions/src/attendance/createManualClockInRecord.ts`
  - **現状**: `date`フィールドをカレンダー日付で格納（59-70行目）
  - **課題**: `clockIn`から`calcBusinessDate`を使用して`businessDate`を計算
  - **対応方針**: `calcBusinessDate`を使用して`businessDate`を計算

- ⚠️ `functions/src/attendance/createAttendanceCorrectionRequest.ts`
  - **現状**: `date`フィールドをカレンダー日付で格納（61-79行目）
  - **課題**: 修正対象の出勤記録の`clockIn`から`calcBusinessDate`を使用して`businessDate`を計算
  - **対応方針**: ⚠️ **保留**（検討中）- attendanceのあるべき姿として、営業日関係なしに実際の日時を格納しておくだけで問題ないのではという検討をしているため

- ✅ `functions/src/callables/createScheduledTournament.ts`
  - **現状**: `startAt`から営業日を計算していない（107-140行目）
  - **課題**: `startAt`から`calcBusinessDate`を使用して`businessDate`を計算
  - **対応方針**: `calcBusinessDate`を使用して`businessDate`を計算（AMBIGUOUS/NONE対応が必要）

#### チェック項目

- [ ] 予定/任意日時の格納時に`calcBusinessDate`を使用している
- [ ] `businessHoursMonthlyMap`の`days`マップから該当日のデータを正しく取得している
- [ ] `isClosed: true`の場合は`NONE`を返している
- [ ] `openMinute`（0-1440）を分単位から時刻に正しく変換している
- [ ] `closeMinute`（0-2880）を分単位から時刻に正しく変換している（`closeMinute > 1440`の場合は翌日に伸びることを考慮）
- [ ] ±30分拡張ウィンドウに時刻が含まれる営業日候補を列挙している
- [ ] 候補数0 → `NONE`、1 → `OK`、2以上 → `AMBIGUOUS`を返している
- [ ] **月跨ぎ対応**: 1日の場合は前月分のドキュメントも確認している
- [ ] **月跨ぎ対応**: 28-31日の場合は次月のドキュメントも確認している
- [ ] `AMBIGUOUS`/`NONE`時のエラーハンドリングを実装している

---

### 3. error/logs：open/close失敗時に logs が残るか

#### 対象ファイル

- ✅ `functions/src/callables/openStore.ts`（予定）
  - **対応方針**: 開店処理失敗時に`storeMeta/currentBusinessDay/logs`にログを記録

- ✅ `functions/src/callables/closeStore.ts`（予定）
  - **対応方針**: 閉店処理失敗時に`storeMeta/currentBusinessDay/logs`にログを記録

#### チェック項目

- [ ] 開店処理失敗時に`storeMeta/currentBusinessDay/logs`にログを記録している
- [ ] 閉店処理失敗時に`storeMeta/currentBusinessDay/logs`にログを記録している
- [ ] ログエントリに`type`、`businessDateKey`、`trigger`、`failedStep`、`errorCode`、`errorMessage`、`causeHint`、`createdAt`、`context`が含まれている
- [ ] `lastError`に`code`、`message`、`failedStep`、`at`（Timestamp）、`context`が含まれている（直近のエラー要約）

---

## Schedulingチェックリスト（Phase5: 自動開閉店（補助機能） - 認定処理）

**注意**: 詳細仕様は[自動開閉店（補助）機能 仕様書](./automatic_store_assessment_spec.md)を参照してください。

### 1. 週次Planner（cron固定、JST、ON/OFF）

#### 対象ファイル

- ✅ `functions/src/scheduler/weeklyPlanner.ts`（予定）
  - **対応方針**: Cloud Schedulerは週1回（例：日曜20:00 JST）だけ起動
  - **ON/OFF**: `globalConstant`のON/OFFで切替
  - **businessHoursMonthlyMapの参照**: `days`マップから該当日のデータを取得（キーは日付の文字列）
  - **scheduleTime**: 各日の「閉店認定」「開店認定」タスクの実行時刻（JST）
    - 閉店認定: 閉店時間 + バッファ（`TASK_CLOSE_OFFSET_MINUTES`、デフォルト: 120分（2時間））
    - 開店認定: 開店時間の30分前（`TASK_OPEN_OFFSET_MINUTES`、デフォルト: -30分）
    - 注意: このオフセットは「営業日判定用の±30分バッファ」とは別物

#### チェック項目

- [ ] Cloud Schedulerは週1回（例：日曜20:00 JST）だけ起動している
- [ ] `globalConstant`のON/OFFで切替可能
- [ ] 翌週（月〜日）分の「閉店認定」「開店認定」タスクをCloud Tasksに投入している
- [ ] `businessHoursMonthlyMap`の`days`マップから該当日のデータを正しく取得している
- [ ] `isClosed: true`の場合はタスクを投入していない
- [ ] 閉店認定タスクの`scheduleTime`は`closeMinute` + `TASK_CLOSE_OFFSET_MINUTES`で設定されている（デフォルト: 120分）
- [ ] 開店認定タスクの`scheduleTime`は`openMinute` - 30分で設定されている

---

### 2. 認定処理（HTTP Functions）

#### 対象ファイル

- ✅ `functions/src/tasks/closeAssessmentTask.ts`（予定）
  - **対応方針**: Cloud TasksからHTTP Functionsを呼び出す際、OIDCトークン認証は必須
  - **処理内容**: 閉店時間超過の確認、ブロッカーの検出、認定結果のstate docへの記録
  - **冪等性**: `idempotencyKey`を使用（`close_assessment_${intendedBusinessDateKey}_${scheduledAt}`）

- ✅ `functions/src/tasks/openAssessmentTask.ts`（予定）
  - **対応方針**: Cloud TasksからHTTP Functionsを呼び出す際、OIDCトークン認証は必須
  - **処理内容**: 前回の閉店処理が正常に完了しているか確認（storeMetaのみで判定）、認定結果のstate docへの記録
  - **冪等性**: `idempotencyKey`を使用（`open_assessment_${intendedBusinessDateKey}_${scheduledAt}`）

#### チェック項目

- [ ] Task名は固定化されている（`close_assessment_YYYY-MM-DD`, `open_assessment_YYYY-MM-DD`）
- [ ] 閉店認定タスクの`scheduleTime`は`closeMinute` + `TASK_CLOSE_OFFSET_MINUTES`で設定されている（デフォルト: 120分）
- [ ] 開店認定タスクの`scheduleTime`は`openMinute` - 30分で設定されている
- [ ] 作成時冪等を実装している（Task名固定で二重作成を防ぐ、`AlreadyExists`は成功扱い）
- [ ] 実行時冪等を実装している（トランザクション内で`idempotencyKey`をチェックし、既に同じキーで更新済みの場合はno-op）
- [ ] Cloud TasksからHTTP Functionsを呼び出す際、OIDCトークン認証は必須（サービスアカウント`TASKS_INVOKER_SA`に`roles/run.invoker`を付与）
- [ ] `allUsers`公開はしていない
- [ ] 認定結果は`storeMeta/currentBusinessDay`の`closeAssessment`/`openAssessment`フィールドに記録されている
- [ ] 破壊的操作（reset/cleanup/migrate/state更新）は行っていない（認定のみ）

---

## テスト観点

### 1. 25:00問題の再発防止確認

#### テストケース

- [ ] 当日画面で`DateTime.now()`から直接`businessDateKey`を生成していない
- [ ] `storeMeta/currentBusinessDay`をsnapshot購読して`currentBusinessDateKey`を取得している
- [ ] 営業時間が日を跨ぐ場合（20:00-28:00）でも正しく動作する

---

### 2. closed時の動作確認

#### テストケース

- [ ] `status`が`closed`の場合、`currentBusinessDateKey`は`null`または`lastClosedBusinessDateKey`
- [ ] UIは`closed`状態を検知し、適切なメッセージを表示する
- [ ] 閉店中でも過去データの表示は可能

---

### 3. AMBIGUOUS、NONEの動作確認

#### テストケース

- [ ] `AMBIGUOUS`時に候補選択ダイアログが表示される
- [ ] `NONE`時にエラーダイアログが表示される
- [ ] ユーザーが選択した営業日が正しく使用される

---

### 4. 重複Tasks、再実行、手動/自動競合の確認

#### テストケース

- [ ] 作成時冪等: 同じ`taskName`でTaskを作成する際、既に存在する場合は`AlreadyExists`エラーが発生するが、これは成功扱い
- [ ] 実行時冪等: state docをトランザクションで見て既に目的状態ならno-op（再実行されても安全）
- [ ] 手動開店/閉店と自動開店/閉店が競合した場合、トランザクションにより一貫性が保証される
- [ ] エラー時の挙動が正しい（`status`が`error`、`lastError`にエラーメッセージが記録される）

---

## まとめ

本チェックリストに基づいて、実装を進めてください。コード改修は別工程で行いますが、本チェックリストに記載された「現状」「課題」「対応方針」を参考に実装してください。

---

## 参照資料

- [Step0: 最終仕様](./step0_final_spec.md)
- [Step1: コレクション分析](./step1_collection_analysis.md)
- [Step2: 取得・表示ファイルの洗い出し](./step2_query_display_files.md)
- [Step3: state docと自動開閉店の設計](./step3_state_doc_and_scheduling.md)
- [自動開閉店（補助）機能 仕様書](./automatic_store_assessment_spec.md)