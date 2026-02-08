# Phase5: 自動開閉店（補助機能） - 認定処理 人間向け概要

## 概要

Phase5では、自動開閉店の補助機能として、週次Plannerによる閉店認定・開店認定タスクの投入と、認定処理のHTTP Functionsを実装します。破壊的操作は一切行わず、認定結果のみをstate docに記録します。

**重要**: 詳細仕様は[自動開閉店（補助）機能 仕様書](../automatic_store_assessment_spec.md)を参照してください。

## 目的

- 閉店時間を過ぎているのに閉店処理を実施せず、翌営業日の業務を開始してしまう事故を防止
- 営業中に勝手に閉店処理が走る事故を防止（自動処理は破壊的操作を行わない）

## 実装内容

### 1. 週次Planner（Cloud Scheduler）

- **ファイル**: `functions/src/scheduler/weeklyPlanner.ts`（新規作成）
- **実行タイミング**: 週1回（日曜20:00 JST）
- **処理内容**:
  - `businessHoursMonthlyMap`から翌週（月〜日）分の営業時間を取得（月跨ぎの場合は複数のドキュメントを取得、同一monthIdはキャッシュ）
  - 各日の「閉店認定」「開店認定」タスクをCloud Tasksに投入
  - 閉店認定: 閉店時間 + バッファ（デフォルト: 120分（2時間））
  - 開店認定: 開店時間の30分前
  - `openMinute`/`closeMinute`は`intendedBusinessDateKey`（営業日）に紐づく時刻定義
  - `closeMinute > 1440`の時は翌日へ繰り越すルールを維持
- **冪等性**: `task.name`を`tasksClient.taskPath(...)`で固定し、`createTask`で`AlreadyExists`（`error.code === 6`）は成功扱いにして冪等化する
- **URL設定**: `CLOSE_ASSESSMENT_URL`、`OPEN_ASSESSMENT_URL`を環境変数から取得（既存の`CONTROL_HOOK_URL`パターンに合わせる）

### 2. 閉店認定処理（HTTP Functions）

- **ファイル**: `functions/src/tasks/closeAssessmentTask.ts`（新規作成）
- **処理内容**:
  - 閉店時間超過の確認
  - ブロッカーの検出（`needs_manual_close`または`needs_manual_close_suppressed`の場合、`activeStays where isActive == true limit 1`で存在確認、存在すれば`activeStaysNotEmpty`を追加）
  - 認定結果のstate docへの記録
- **認定結果**:
  - `needs_manual_close`: 閉店時間超過、手動閉店が必要
  - `needs_manual_close_suppressed`: manualOverrideにより抑制された
  - `already_closed`: 既に閉店済み
  - `next_day_started`: 次営業日が開始している
  - `skipped`: スキップ（許容範囲外など）

### 3. 開店認定処理（HTTP Functions）

- **ファイル**: `functions/src/tasks/openAssessmentTask.ts`（新規作成）
- **処理内容**:
  - 前回の閉店処理が正常に完了しているか確認（storeMetaのみで判定、ドキュメント走査なし）
  - `businessHoursMonthlyMap`参照や「前営業日＝前日」計算は行わない
  - `lastClosedBusinessDateKey`と`intendedBusinessDateKey`の厳密整合は Phase5 では要求しない
  - 認定結果のstate docへの記録
- **認定結果**:
  - `ready_to_open`: 開店条件を満たしている
  - `needs_manual_open`: 手動開店が必要
  - `already_running`: 既に営業中
  - `skipped`: スキップ（許容範囲外など）

### 4. State Docの初期化更新

- **ファイル**: `functions/src/storeManagement/createInitialStateDocCallable.ts`（既存、更新）
- **更新内容**: 新規フィールド（`closeAssessment`, `openAssessment`, `manualOverride`）の初期化を追加

## 主要な特徴

### 1. 破壊的操作を行わない

- 自動処理は破壊的操作（reset/cleanup/migrate/state更新）を行わない
- 認定結果のみをstate docに記録

### 2. 冪等性保証

- **作成時冪等**: `task.name`を`tasksClient.taskPath(...)`で固定し、`createTask`で`AlreadyExists`（`error.code === 6`）は成功扱いにして冪等化する
- **実行時冪等**: トランザクション内で`idempotencyKey`をチェックし、既に同じキーで更新済みの場合はno-op

### 3. businessDateKeyの検証

- **許容範囲検証**: `serverNowJst`の暦日を`D`とし、`intendedBusinessDateKey`が許容範囲内か確認
  - 閉店認定: `D`または`D-1`
  - 開店認定: `D`または`D+1`

### 4. コスト削減

- **openAssessmentの前回閉店完了チェック**: `storeMeta/currentBusinessDay`のフィールドのみで判定（ドキュメント走査をしない）
- **businessHoursMonthlyMapの取得**: 月跨ぎの場合は複数のドキュメントを取得するが、同一monthIdはキャッシュしてFirestore読み取り回数を抑える

### 5. 認証/IAM

- **OIDCトークン認証**: Cloud TasksからHTTP Functionsを呼び出す際、OIDCトークンを必須とする
- **サービスアカウント**: `TASKS_INVOKER_SA`に`roles/run.invoker`を付与（既存の`TASKS_INVOKER_SA`を使用）
- **HTTP Functionsの設定**: Cloud Runの標準機能でOIDCトークンの検証が行われるため、`invoker: 'private'`の設定は不要
- **公開URL禁止**: `allUsers`公開はしない方針

## Phase6での実装予定

Phase6では、以下の機能を4ステップに分けて実装予定です：

- **Phase6 Step1**: **UIでstoreMetaをsnapshot購読する仕様の実装**（複数ページ、共通実装、AppBar内に日付表示）
- **Phase6 Step2 (Phase7)**: **閉店処理の具体処理の作成**（未会計billsの処理、ユーザー判断を挟む場所の検討、UI表示）
- **Phase6 Step3 (Phase8)**: **閉店処理の一括操作の実装**（日付ボタンからの開閉店操作、ターミナル関数経由、エラーハンドリング）
- **Phase6 Step4 (Phase9)**: **storeMeta監視ページでの自動開閉店時の挙動・表示の実装**（UI強警告、各状態に応じた挙動・表示）

詳細は各ステップの実装計画を参照してください：
- [Phase6 Step1 実装計画](../phase6/step1/implementation_plan.md)
- [Phase6 Step2 実装計画](../phase6/step2/implementation_plan.md)
- [Phase6 Step3 実装計画](../phase6/step3/implementation_plan.md)
- [Phase6 Step4 実装計画](../phase6/step4/implementation_plan.md)

## 参照資料

- [自動開閉店（補助）機能 仕様書](../automatic_store_assessment_spec.md)
- [Phase5: 実装詳細仕様書](./changeSpec_implementation.md)
- [Step0: 最終仕様](../step0_final_spec.md)
- [Step3: state docと自動開閉店の設計](../step3_state_doc_and_scheduling.md)
