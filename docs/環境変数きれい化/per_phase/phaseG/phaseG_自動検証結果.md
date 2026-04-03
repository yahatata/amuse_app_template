# phaseG 自動検証結果（step2）

作成日: 2026-04-02  
対象: `docs/環境変数きれい化/per_phase/phaseG/changeSpec.md` の step2

## 1. 実行方針

- コード修正は行わず、現状を自動検証で可視化する。
- リージョン整合（`asia-northeast1`）と回帰影響（Functions/Flutter）を確認する。

## 2. 検証結果サマリ

- `functions/src` のリージョン直書き残存: なし（`us-central1` 0件）
- `setGlobalOptions` 定義: `functions/src/index.ts` の 1 箇所のみ
- Functions build/lint: 成功
- Functions test（Firestore Emulator 起動付き）: 失敗
  - 107 suite 中: 95 pass / 11 fail / 1 skip
  - 979 tests 中: 950 pass / 26 fail / 3 skip
- Flutter test: 失敗（`test/widget_test.dart` の Firebase 初期化エラー）
- Flutter analyze: 失敗（`1024 issues found`）
- GCP 外部状態（Functions/Queue/Scheduler/Secret/IAM）: `asia-northeast1` 前提で整合

判定: **要修正事項あり（コード修正は未実施）**

## 3. 実行コマンドと結果

### 3.1 静的チェック

- `rg -n "us-central1|us-centrall" functions/src`
  - 結果: 該当なし
- `rg -n "setGlobalOptions\\(" functions/src`
  - 結果: `functions/src/index.ts:18:setGlobalOptions({ region: "asia-northeast1" });`
- `rg -n "workflow_dispatch|project_id|workload_identity_provider|service_account|firebase deploy --only functions" .github/workflows/deploy-functions.yml`
  - 結果: 必須項目を確認（workflow_dispatch / project_id / WIF / functions deploy）

### 3.2 Functions build/lint

- `cd functions && npm run build`
  - 結果: 成功
- `cd functions && npm run lint`
  - 結果: 成功

### 3.3 Functions test（Emulator 起動・停止を含む）

- 実行コマンド:
  - `firebase emulators:exec --only firestore "cd functions && npm test -- --runInBand --json --outputFile=/tmp/functions-jest-results.json"`
- Emulator 挙動:
  - 起動確認: `Starting emulators: firestore`
  - 停止確認: `Shutting down emulators`
- テスト結果:
  - `Test Suites: 11 failed, 1 skipped, 95 passed, 106 of 107 total`
  - `Tests: 26 failed, 3 skipped, 950 passed, 979 total`
  - JSON 出力: `/tmp/functions-jest-results.json`

### 3.4 Flutter 回帰

- `flutter test`
  - 結果: 失敗
  - 主因: `test/widget_test.dart` 実行時に `[core/no-app] No Firebase App '[DEFAULT]' has been created`
- `flutter analyze`
  - 結果: 失敗
  - 出力末尾: `1024 issues found.`

### 3.5 GCP 外部状態確認

対象プロジェクト: `amuse-app-template`

- Functions 数
  - `us-central1=0`
  - `asia-northeast1=169`
- Cloud Tasks Queue 数
  - `us-central1=0`
  - `asia-northeast1=11`（全て `RUNNING`）
- Cloud Scheduler Job 数
  - `us-central1=0`
  - `asia-northeast1=1`（`firebase-schedule-schedulerSupervisor-asia-northeast1`, `ENABLED`）
- Secret `task-endpoints`
  - `controlHookUrl`: `https://controlhookhttp-iigzogr4ca-an.a.run.app`
  - `closeAssessmentUrl`: `https://closeassessmenttask-iigzogr4ca-an.a.run.app`
  - `openAssessmentUrl`: `https://openassessmenttask-iigzogr4ca-an.a.run.app`
  - 3URLとも Functions 実体URL（`asia-northeast1`）と一致
- 実行SA Secret 参照権限
  - 実行SA: `767044015900-compute@developer.gserviceaccount.com`
  - `line-config`: secretAccessor あり
  - `task-endpoints`: secretAccessor あり
  - `business-secrets`: secretAccessor あり
  - 欠落: なし

## 4. 補足（この時点で未実施）

- step2 では修正を適用しない方針のため、失敗項目の修正は未着手。
- 要修正事項の詳細は `phaseG_要修正事項一覧.md` に記録。
- 実機確認が必要な項目は `phaseG_実機確認依頼.md` に分離。

## 5. 追補（step3: 安全修正後の再検証）

実施日: 2026-04-02  
方針: 仕様書から安全に確定できる修正のみ適用し、全体再検証を実施。

### 5.1 再検証コマンド

- `firebase emulators:exec --only firestore "cd functions && npm test -- --runInBand --json --outputFile=/tmp/functions-jest-results-after-safe-fixes.json"`
- `flutter test`
- `flutter analyze`

### 5.2 再検証結果

- Functions test:
  - `Test Suites: 3 failed, 1 skipped, 103 passed, 106 of 107 total`
  - `Tests: 3 failed, 3 skipped, 973 passed, 979 total`
  - 失敗は `step3_taskSyncNeeded.spec.ts` / `analytics/aggregator.spec.ts` / `step5_enqueueAfterCreate.spec.ts` の3件に集約
- Flutter test:
  - 失敗（`test/widget_test.dart` の `[core/no-app]`）
- Flutter analyze:
  - 失敗（`1024 issues found`）

### 5.3 判定

- 安全修正で解消できる失敗は解消済み（11 suite fail -> 3 suite fail）。
- 残件は仕様・設計判断を要するため、ユーザー判断待ちとして `phaseG_要修正事項一覧.md` に切り分け済み。

## 6. 追補（2026-04-03: J-001/J-002 反映後の再検証）

実施日: 2026-04-03  
方針: ユーザー判断に基づき、J-001/J-002 を実装・テスト反映して再検証。

### 6.1 実行コマンド

- 対象テスト:
  - `firebase emulators:exec --only firestore "cd functions && npm test -- --runInBand __tests__/tournament_createTournament/step3_taskSyncNeeded.spec.ts __tests__/analytics/aggregator.spec.ts"`
- Functions 全体:
  - `firebase emulators:exec --only firestore "cd functions && npm test -- --runInBand --json --outputFile=/tmp/functions-jest-results-after-j001-j002.json"`

### 6.2 結果

- 対象テスト:
  - `2 passed / 0 failed (suite)`、`7 passed / 0 failed (test)`
- Functions 全体:
  - `1 failed / 105 passed / 1 skipped (suite)`
  - `1 failed / 975 passed / 3 skipped (test)`
  - 失敗は `step5_enqueueAfterCreate.spec.ts` のみ（J-003）
  - JSON 出力: `/tmp/functions-jest-results-after-j001-j002.json`

### 6.3 判定

- J-001 / J-002 は解消済み。
- 現在の Functions テスト残件は J-003 のみ。

## 7. 追補（2026-04-03: J-003/J-004/J-005 方針確定後）

実施日: 2026-04-03  
方針:
- J-003: スコープ外クローズ（別ブランチで改修中）
- J-004: 不要テスト削除でクローズ
- J-005: スコープ外クローズ（既存負債対応は別トラック）

### 7.1 実施内容

- `test/widget_test.dart` を削除。
- `flutter test` を再実行。
- `flutter analyze` を再実行（現状値の確認のみ）。

### 7.2 結果

- `flutter test`: 成功
- `flutter analyze`: `1024 issues found`

### 7.3 判定

- phaseG の J-003〜J-005 は、ユーザー判断に沿ってクローズ済み。
