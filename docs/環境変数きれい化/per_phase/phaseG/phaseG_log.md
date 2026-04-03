# phaseG 作業ログ

## 2026-04-02

### 実施（step1: 計画設計）

- phaseG `changeSpec.md` を新規作成。
- step2 自動検証の実行範囲、判定基準、成果物（自動検証結果/要修正事項/実機確認依頼）を定義。

### 実施（step2: 自動検証）

- 静的チェック:
  - `rg -n "us-central1|us-centrall" functions/src` -> 0件
  - `rg -n "setGlobalOptions\\(" functions/src` -> `functions/src/index.ts` の1件
  - `.github/workflows/deploy-functions.yml` の必須要素（`workflow_dispatch` / `project_id` / WIF / `firebase deploy --only functions`）を確認
- Functions:
  - `cd functions && npm run build` -> 成功
  - `cd functions && npm run lint` -> 成功
  - Firestore Emulator 起動付きで `npm test -- --runInBand` を実行（`firebase emulators:exec --only firestore ...`）
  - 結果: `11 failed / 95 passed / 1 skipped (26 failed tests)`
- Flutter:
  - `flutter test` -> 失敗（`[core/no-app] No Firebase App '[DEFAULT]' has been created`）
  - `flutter analyze` -> 失敗（`1024 issues found`）
- GCP 外部状態:
  - Functions: `us-central1=0`, `asia-northeast1=169`
  - Cloud Tasks: `us-central1=0`, `asia-northeast1=11 (RUNNING)`
  - Cloud Scheduler: `us-central1=0`, `asia-northeast1=1 (ENABLED)`
  - `task-endpoints` が `-an.a.run.app` の実体URLと一致
  - 実行SA（`767044015900-compute@developer.gserviceaccount.com`）に
    `line-config` / `task-endpoints` / `business-secrets` の `secretAccessor` 付与を確認

### 作成成果物（step2）

- `phaseG_自動検証結果.md`
- `phaseG_要修正事項一覧.md`（修正は未実施のまま記録）
- `phaseG_実機確認依頼.md`

### 実施（step3: 安全修正の適用と再検証）

- 安全修正（仕様断定可能なもの）を適用:
  - `calcBusinessDate` 旧戻り値互換修正（`businessDate` / `eventBusinessDate` 欠落対策）
  - `getUserOrderHistory` を `bills` ベース実装へ修正
  - close process テスト用モックの営業日解決を実装優先へ修正
  - 深夜労働分計算のタイムゾーン依存バグを修正
- Functions 全体再検証:
  - `firebase emulators:exec --only firestore "cd functions && npm test -- --runInBand --json --outputFile=/tmp/functions-jest-results-after-safe-fixes.json"`
  - 結果: `3 failed / 103 passed / 1 skipped (suite)`、`3 failed / 973 passed / 3 skipped (test)`
- Flutter 再検証:
  - `flutter test` -> 失敗（`test/widget_test.dart` の `[core/no-app]`）
  - `flutter analyze` -> 失敗（`1024 issues found`）
- ドキュメント更新:
  - `phaseG_要修正事項一覧.md` を「修正完了（S）」と「判断待ち（J）」へ再編成
  - `phaseG_自動検証結果.md` に step3 追補を追加
