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

## 2026-04-03

### 実施（J-001 / J-002 の設計確定反映）

- J-001（`step3_taskSyncNeeded.spec.ts`）:
  - template 変更時の挙動を実装準拠へ更新。
  - 期待値を `schedulePlanVersion: 5 -> 6` へ修正。
  - `schedulePlanUpdatedAt` も更新される前提に修正（固定値一致から「更新済み」検証へ変更）。
- J-002（analytics 新スキーマ統一）:
  - `functions/src/domains/analytics/services/aggregator/types.ts`
  - `functions/src/domains/analytics/services/aggregator/delta.ts`
  - `functions/src/domains/analytics/services/aggregator/writer.ts`
  - `functions/__tests__/analytics/aggregator.spec.ts`
  を更新し、`sales.grossIncl` 系ではなく `grossSales` / `itemsSales` / `sideGameChipSales` / `paymentTotals.*` 前提へ統一。

### 実施（検証）

- 対象テスト（Emulator付き）:
  - `firebase emulators:exec --only firestore "cd functions && npm test -- --runInBand __tests__/tournament_createTournament/step3_taskSyncNeeded.spec.ts __tests__/analytics/aggregator.spec.ts"`
  - 結果: **PASS（2 suite / 7 tests）**
- Functions 全体再検証（Emulator付き）:
  - `firebase emulators:exec --only firestore "cd functions && npm test -- --runInBand --json --outputFile=/tmp/functions-jest-results-after-j001-j002.json"`
  - 結果: `1 failed / 105 passed / 1 skipped (suite)`、`1 failed / 975 passed / 3 skipped (test)`
  - 残件: `__tests__/tournament_createTournament/step5_enqueueAfterCreate.spec.ts`（J-003）

### ドキュメント反映

- `phaseG_要修正事項一覧.md` で J-001/J-002 を修正完了へ移動。
- `phaseG_自動検証結果.md` に 2026-04-03 再検証結果を追記。

### 実施（J-003 / J-004 / J-005 のクローズ）

- ユーザー判断により、J-003/J-005 は phaseG スコープ外としてクローズ。
- J-004 は不要テスト削除の方針で対応:
  - `test/widget_test.dart` を削除。
- 再検証:
  - `flutter test` -> 成功
  - `flutter analyze` -> `1024 issues found`（J-005 はスコープ外クローズ）
- ドキュメント更新:
  - `phaseG_要修正事項一覧.md` を「J-001〜J-005 対応後」へ更新し、未対応項目なしを明記。

### 実施（LIFF ミニアプリ `load failed` 調査・修正）

- 症状:
  - LINE ミニアプリ（staff/user）で `LIFF初期化に失敗しました / load failed` が発生。
- 原因:
  - `public/staff/index.html` と `public/user/index.html` で
    `https://us-central1-${projectId}.cloudfunctions.net` を固定利用していた。
  - callable の `getFunctions(window.Firebase.app)` もリージョン未指定で、`us-central1` 既定へ向く経路が残っていた。
  - 一方で対象 Functions は `asia-northeast1` にのみ存在するため、HTTP/callable 呼び出しが 404/Not Found になっていた。
- 修正:
  - `public/staff/config.js` / `public/user/config.js` / `public/user/config.sample.js` に
    `functionsRegion: "asia-northeast1"` を追加。
  - `public/staff/index.html` / `public/user/index.html` で
    `functionsUrl` を `https://${functionsRegion}-${projectId}.cloudfunctions.net` 生成に変更。
  - 同2ファイルで callable 呼び出しを
    `getFunctions(..., window.FunctionsRegion || "asia-northeast1")` に統一。
- 再確認（静的）:
  - `rg -n "us-central1|getFunctions\(app\)|getFunctions\(window\.Firebase\.app\)" public/staff/index.html public/user/index.html`
  - 結果: 未修正ヒットなし（`us-central1` 直書きなし / リージョン未指定 `getFunctions` なし）。

### 実施（公開反映確認）

- `firebase deploy --only hosting` を実行し、`amuse-app-template` へデプロイ成功。
- 公開URL確認:
  - `https://amuse-app-template.web.app/staff/index.html`
  - `https://amuse-app-template.web.app/user/index.html`
  - `https://amuse-app-template.web.app/staff/config.js`
  - `https://amuse-app-template.web.app/user/config.js`
- 上記実体レスポンスで `functionsRegion: "asia-northeast1"` および
  `getFunctions(..., window.FunctionsRegion || "asia-northeast1")` が反映済みであることを確認。
