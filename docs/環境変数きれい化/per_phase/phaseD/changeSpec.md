# phaseD changeSpec（Secret Manager 移行）

作成日: 2026-04-01  
ステータス: ステップ1〜3完了（レビュー依頼前）

## 1. 対象仕様書と対象章

### 1.1 Secret Manager To-Be（phaseD担当範囲）

- `docs/環境変数きれい化/仕様書/Secret_Manager_ToBe_詳細仕様.md`
  - 1〜10
  - 12〜15

### 1.2 コード固定 To-Be（phaseD接続範囲）

- `docs/環境変数きれい化/仕様書/コード固定_ToBe_詳細仕様.md`
  - 5.2 既存 downstream task
  - 7 既存環境変数からの置き換え対応

### 1.3 進め方・フェーズ対応

- `docs/環境変数きれい化/進め方_仕様詳細化とフェーズ設計フロー.md`
- `docs/環境変数きれい化/フェーズ設計_詳細仕様対応表.md`
- `docs/環境変数きれい化/per_phase/phaseC/phaseC_完了サマリとphaseD引き継ぎ.md`

## 2. As-Is確認結果

### 2.1 Secret Manager 基盤が未実装

- `functions/src/shared/secrets/` が未存在。
- `@google-cloud/secret-manager` 依存が `functions/package.json` に未追加。
- Secret 取得共通関数・型・Promiseキャッシュが未実装。

### 2.2 line-config 対象が env / defineString 依存

- `functions/src/domains/webhook/services/lineRichMenu.ts`
  - `process.env.LINE_CHANNEL_ACCESS_TOKEN`
  - `defineString('STAFF_RICHMENU_ID')`
  - `defineString('USER_RICHMENU_ID')`
- `functions/src/domains/webhook/services/lineMessaging.ts`
  - `process.env.LINE_CHANNEL_ACCESS_TOKEN`
- `functions/src/domains/webhook/callables/lineWebhook.ts`
  - `process.env.LINE_CHANNEL_ACCESS_TOKEN`

### 2.3 task-endpoints 対象が getEnv 依存

- `functions/src/domains/tournament_createTournament/services/tasks.ts`
  - `getEnv('CONTROL_HOOK_URL')`
- `functions/src/domains/storeMeta/scheduler/weeklyPlanner.ts`
  - `getEnv('CLOSE_ASSESSMENT_URL')`
  - `getEnv('OPEN_ASSESSMENT_URL')`
- `functions/src/domains/storeMeta/callables/continueBusinessTerminal.ts`
  - `getEnv('CLOSE_ASSESSMENT_URL')`

補足:

- `getEnv()` 呼び出しは上記3ファイルのみ（`shared/firebase/env.ts` 以外）。

### 2.4 business-secrets 対象が process.env 依存

- `functions/src/domains/user/services/qrCodeUtils.ts`
  - `process.env.QR_SECRET_KEY`
- `functions/src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts`
  - `process.env['UNCLOCKED_ATTENDANCE_EDIT_PASSWORD']`
- `functions/src/domains/storeMeta/callables/verifyUnclockedAttendanceEditPassword.ts`
  - `process.env['UNCLOCKED_ATTENDANCE_EDIT_PASSWORD']`

### 2.5 qrCodeUtils の同期APIが呼び出し側に広く依存

- `generateQRData` / `verifyQRData` は現状同期関数。
- 呼び出し側（`createUserAccount` / `createStaffAccount` / `createStaffByApp` / `generateQRCode` / `verifyQRCode` / `processVisitByQR`）で同期前提。
- Secret Manager 参照を導入する場合、`qrCodeUtils` の非同期化と呼び出し側追従が必要。

### 2.6 テスト現状

- Secret Manager 共通層の専用テストが未作成。
- `phase0A_config_migration.spec.ts` は `LINE_CHANNEL_ACCESS_TOKEN` / `QR_SECRET_KEY` の env 直接参照を前提としており、phaseD方針と衝突。
- `step7_deprecatedRemoval.spec.ts` は `tasks.ts` が `getEnv('CONTROL_HOOK_URL')` を参照する前提で、phaseD後に更新が必要。

## 3. 新規作成するファイル

- `functions/src/shared/secrets/types.ts`
  - `LineConfig` / `TaskEndpoints` / `BusinessSecrets` 型定義。
- `functions/src/shared/secrets/secretManager.ts`
  - Secret Manager SDK 直利用の共通取得層。
  - Promiseキャッシュ、required key検証、`warmupSecrets()` を実装。
- `functions/__tests__/shared/secrets/secretManager.spec.ts`
  - 取得・キャッシュ・失敗時nullリセット・required key検証のテスト。
- `docs/環境変数きれい化/per_phase/phaseD/phaseD_log.md`
  - phaseD作業ログ。

## 4. 修正するファイル

### 4.1 依存関係

- `functions/package.json`
  - `@google-cloud/secret-manager` 追加。

### 4.2 line-config 参照先の置き換え

- `functions/src/domains/webhook/services/lineRichMenu.ts`
- `functions/src/domains/webhook/services/lineMessaging.ts`
- `functions/src/domains/webhook/callables/lineWebhook.ts`

### 4.3 task-endpoints 参照先の置き換え

- `functions/src/domains/tournament_createTournament/services/tasks.ts`
- `functions/src/domains/storeMeta/scheduler/weeklyPlanner.ts`
- `functions/src/domains/storeMeta/callables/continueBusinessTerminal.ts`

### 4.4 business-secrets 参照先の置き換え

- `functions/src/domains/user/services/qrCodeUtils.ts`
- `functions/src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts`
- `functions/src/domains/storeMeta/callables/verifyUnclockedAttendanceEditPassword.ts`

### 4.5 qrCodeUtils 非同期化に伴う呼び出し側追従

- `functions/src/domains/user/callables/createUserAccount.ts`
- `functions/src/domains/staff/callables/createStaffAccount.ts`
- `functions/src/domains/staff/callables/createStaffByApp.ts`
- `functions/src/domains/user/callables/generateQRCode.ts`
- `functions/src/domains/user/callables/verifyQRCode.ts`
- `functions/src/domains/user/callables/processVisitByQR.ts`

### 4.6 テスト更新

- `functions/__tests__/config_migration/phase0A_config_migration.spec.ts`
  - env前提から secretManager モック前提へ更新。
- `functions/__tests__/tournament_createTournament/step7_deprecatedRemoval.spec.ts`
  - `getEnv('CONTROL_HOOK_URL')` 前提を `getTaskEndpoints()` 前提へ更新。

### 4.7 環境変数テンプレート

- `functions/.env.amuse-app-template`
  - phaseDで Secret Manager へ移行したキーを削除。
  - 対象: `LINE_CHANNEL_ACCESS_TOKEN` / `STAFF_RICHMENU_ID` / `USER_RICHMENU_ID` /
    `CONTROL_HOOK_URL` / `CLOSE_ASSESSMENT_URL` / `OPEN_ASSESSMENT_URL` /
    `QR_SECRET_KEY` / `UNCLOCKED_ATTENDANCE_EDIT_PASSWORD`。

## 5. 移動するファイル

- なし

## 6. 実装方針

### 6.1 共通 Secret 取得モジュール

- `secretManager.ts` に以下を実装する。
  - `getLineConfig()`
  - `getTaskEndpoints()`
  - `getBusinessSecrets()`
  - `warmupSecrets()`（初期は `line-config` のみ）
- `fetchSecretJson<T>` は `getRequiredProjectId()` と
  `projects/{projectId}/secrets/{secretName}/versions/latest` を使う。
- required key 欠落時は fail-fast。
- Promise キャッシュは失敗時に `null` リセットし再試行可能にする。

### 6.2 line-config 置き換え

- `defineString('STAFF_RICHMENU_ID')` / `defineString('USER_RICHMENU_ID')` を廃止。
- `process.env.LINE_CHANNEL_ACCESS_TOKEN` 直読みを廃止。
- `await getLineConfig()` に統一。

### 6.3 task-endpoints 置き換え

- `getEnv('CONTROL_HOOK_URL')` / `getEnv('CLOSE_ASSESSMENT_URL')` / `getEnv('OPEN_ASSESSMENT_URL')` を廃止。
- `await getTaskEndpoints()` 経由へ統一。
- queue / region / invoker SA 計算は現状のコード固定方針を維持する。

### 6.4 business-secrets 置き換え

- `process.env.QR_SECRET_KEY` と
  `process.env['UNCLOCKED_ATTENDANCE_EDIT_PASSWORD']` を廃止。
- `await getBusinessSecrets()` へ統一。

### 6.5 qrCodeUtils 非同期化

- `generateQRData` / `verifyQRData` / 内部の token 生成を非同期化する。
- 呼び出し側 callables を `await` 対応へ更新し、挙動は現行仕様を維持する。
- `parseQRData` は同期のまま維持する。

### 6.6 defineString 廃止の担保

- `functions/src` から `defineString('STAFF_RICHMENU_ID')` /
  `defineString('USER_RICHMENU_ID')` を除去する。
- 機密値・プロジェクト差分値で `defineString` 新規導入をしない。

## 7. 必要テストの検討（実施予定）

### 7.1 新規ユニットテスト

- `__tests__/shared/secrets/secretManager.spec.ts`
  - Secret取得成功
  - 同一インスタンス内キャッシュ
  - 取得失敗時の null リセット
  - required key 欠落 fail-fast
  - エラーメッセージに secret 値を含まないこと

### 7.2 既存テスト更新

- `__tests__/config_migration/phase0A_config_migration.spec.ts`
  - line/qr の secret 取得失敗時挙動を新実装に合わせる。
- `__tests__/tournament_createTournament/step7_deprecatedRemoval.spec.ts`
  - URL取得の検証を `getTaskEndpoints()` 前提に更新。

### 7.3 回帰・ビルド確認

- `npm run build`
- `npm run lint`
- `npm test -- __tests__/shared/secrets/secretManager.spec.ts --runInBand`
- `npm test -- __tests__/config_migration/phase0A_config_migration.spec.ts --runInBand`
- `npm test -- __tests__/tournament_createTournament/step7_deprecatedRemoval.spec.ts --runInBand`
- `npm test -- __tests__/scheduler/*.spec.ts --runInBand`（phaseC回帰）

## 8. 外部操作

phaseD実装では、以下はユーザー操作（GCP）を要する。

1. Secret 作成/更新
   - `line-config`
   - `task-endpoints`
   - `business-secrets`
2. Functions 実行SAへの権限付与
   - `roles/secretmanager.secretAccessor`
3. Secret 値投入後の最終確認（対象プロジェクトで latest 参照できること）

補足:

- CLI で実行可能な範囲（コード修正・テスト）はエージェント側で実施する。
- 実 Secret 値の投入はユーザー側で実施する。

## 9. リスク

- `qrCodeUtils` の非同期化で、呼び出し側の `await` 漏れがあると実行時不整合が起きる。
- Secret 未作成の環境で起動すると fail-fast で関数が失敗する。
- `warmupSecrets()` の扱いを誤ると初期化時エラーが見えづらくなる。
- 既存テストの env 前提を更新しないと CI が不安定になる。

## 10. ロールバック方法

1. `shared/secrets/*` を削除し、既存 env 参照へ戻す。
2. `lineRichMenu.ts` / `lineMessaging.ts` / `lineWebhook.ts` を env/defineString 前提へ戻す。
3. URL 取得3箇所を `getEnv` へ戻す。
4. business-secrets 対象3箇所を `process.env` へ戻す。
5. `qrCodeUtils` と呼び出し側の async 化を取り消す。
6. `phase0A_config_migration.spec.ts` / `step7_deprecatedRemoval.spec.ts` を旧前提へ戻す。
7. build/lint/対象テストで復旧確認する。

## 11. 完了条件（phaseDでこのchangeSpecが満たすべき状態）

- Secret 取得が `shared/secrets/secretManager.ts` に統一される。
- `line-config` / `task-endpoints` / `business-secrets` の参照がコードへ反映される。
- 対象 env / defineString 依存が除去される。
- `qrCodeUtils` 非同期化と呼び出し側追従が完了する。
- `.env.amuse-app-template` から移行対象キーが削除される。
- build/lint/対象テストが通過する。
