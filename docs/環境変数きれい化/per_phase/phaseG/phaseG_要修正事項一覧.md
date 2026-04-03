# phaseG 要修正事項一覧（step3: 安全修正適用後）

作成日: 2026-04-02  
更新日: 2026-04-02  
方針: 仕様書から機械的に正誤判定できるもののみ先行修正し、設計判断が必要なものは明示的に分離する。

## 1. 最新集計（再検証後）

- Functions テスト（Firestore Emulator付き再実行）
  - 実行: `firebase emulators:exec --only firestore "cd functions && npm test -- --runInBand --json --outputFile=/tmp/functions-jest-results-after-safe-fixes.json"`
  - 結果: `3 failed / 103 passed / 1 skipped (suite)`、`3 failed / 973 passed / 3 skipped (test)`
  - 根拠: `/tmp/functions-jest-results-after-safe-fixes.json`
- Flutter
  - `flutter test`: 失敗（`test/widget_test.dart` の `[core/no-app]`）
  - `flutter analyze`: 失敗（`1024 issues found`）

## 2. 安全に修正完了した項目（エージェント単独で実施）

### S-001（旧 G-001 / G-008 / G-009）

- 概要:
  - `calcBusinessDate` の戻り値が旧形式（`string`）のとき、`businessDate` / `eventBusinessDate` が `undefined` になり得る不具合を解消。
- 修正内容:
  - 旧形式 `string` と新形式 `BusinessDateResult` の両方を許容。
  - `status: OK` なのに `businessDateKey` 欠落時は明示的にエラー化。
- 修正ファイル:
  - `functions/src/domains/tournament_createTournament/callables/updateScheduledTournamentStartAt.ts`
  - `functions/src/domains/bills/repos/postEventAdjustment.ts`
  - `functions/src/domains/bills/repos/postEventCancel.ts`
  - `functions/src/domains/bills/repos/postEventReopen.ts`
  - `functions/src/domains/bills/repos/postEventRefund.ts`
- 検証:
  - `cancel_restore_startAt.spec.ts`, `updateAccounting.spec.ts`, `refundProcessing.spec.ts` は PASS。

### S-002（旧 G-002）

- 概要:
  - `getUserOrderHistory` の実装がテスト期待（`bills` ベース）と不整合だったため、履歴取得仕様に合わせて再実装。
- 修正内容:
  - 参照元を `orders` ではなく `bills` に統一。
  - 対象 status を `settled` 系に限定。
  - 並び順を `orderDate` 降順（同値時 `id` 降順）に統一。
- 修正ファイル:
  - `functions/src/domains/itemOrder/callables/getUserOrderHistory.ts`
- 検証:
  - `getUserOrderHistory.spec.ts` は PASS。

### S-003（旧 G-004 / G-005）

- 概要:
  - close process 系テストで営業日キー解決モックが固定値を返し、状態ドキュメント起点の期待と衝突していた問題を是正。
- 修正内容:
  - `getCurrentBusinessDateKeyOrThrow` は実装優先で実行し、失敗時のみレガシーフォールバックに変更。
- 修正ファイル:
  - `functions/__tests__/helpers/mockStoreConfig.ts`
- 検証:
  - `close_process/step3.spec.ts`, `close_process/phase6_5_store_management_permission.spec.ts` は PASS。

### S-004（旧 G-006 / G-011）

- 概要:
  - 深夜労働分計算がローカルタイム依存で二重JST補正される問題を修正。
- 修正内容:
  - 分ループを JST 固定の時判定へ置換し、実行環境タイムゾーン依存を排除。
- 修正ファイル:
  - `functions/src/domains/attendance/helpers/nightWorkMinutes.ts`
- 検証:
  - `approveAttendanceCorrectionRequest.spec.ts`, `recalculateNightBreaks.spec.ts` は PASS。

## 3. ユーザー判断が必要な項目（仕様・設計の確定が必要）

### J-001（旧 G-003）

- 対象:
  - `functions/__tests__/tournament_createTournament/step3_taskSyncNeeded.spec.ts`
- 現象:
  - `schedulePlanVersion` の期待値 `5` に対して実値 `6`。
- 判断が必要な理由:
  - 「template変更時の version インクリメント回数」が仕様書だけでは一意に決められない。
- 判断ポイント:
  - 実装（`+1`が追加で発生）を正とするか、テスト期待（`5`）を正とするか。

### J-002（旧 G-007）

- 対象:
  - `functions/__tests__/analytics/aggregator.spec.ts`
- 現象:
  - テストは `monthlyDoc.data().sales.grossIncl` を期待するが、現実装は別スキーマ（`grossSales` 等）を更新。
- 判断が必要な理由:
  - analytics ドキュメント構造を旧互換に戻すか、新構造へテストを追従させるかは設計判断。
- 判断ポイント:
  - 互換優先（旧 `sales.*` 維持）か、新設計優先（新キーを正）か。

### J-003（旧 G-010）

- 対象:
  - `functions/__tests__/tournament_createTournament/step5_enqueueAfterCreate.spec.ts`
- 現象:
  - テストは `logger.error` 文字列を要求、実装は `logOpsError` 使用。
- 判断が必要な理由:
  - ログ統一方針（直接 `logger.error` か、ラッパー `logOpsError` か）の決定が必要。
- 判断ポイント:
  - ログ実装を旧式へ戻すか、テストを `logOpsError` 方針に合わせるか。

### J-004（旧 G-012）

- 対象:
  - `test/widget_test.dart`
- 現象:
  - `[core/no-app] No Firebase App '[DEFAULT]' has been created`
- 判断が必要な理由:
  - widget smoke test を維持して Firebase 初期化モックを導入するか、テスト戦略を見直すかは方針判断。
- 判断ポイント:
  - Firebase 初期化をテスト環境で標準化するか、当該テストを置換/削除するか。

### J-005（旧 G-013）

- 対象:
  - `flutter analyze`（全体 `1024 issues`）
- 現象:
  - 既存負債と今回変更起因を分離せず一括で検出。
- 判断が必要な理由:
  - 今回フェーズでの対応範囲（新規警告ゼロのみ/全件対応）を仕様書から断定できない。
- 判断ポイント:
  - 受け入れ基準を「差分ゼロ警告」へ限定するか、既存負債削減を同時実施するか。

## 4. 現時点の結論

- **修正完了（エージェント単独で安全に対応）**: `S-001` 〜 `S-004`
- **ユーザー判断が必要（未修正）**: `J-001` 〜 `J-005`
- 次アクションは、`J-001`〜`J-005` の判断を受けて実装を確定する。
