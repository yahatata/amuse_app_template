# phaseG 要修正事項一覧（step3 + J-001〜J-005 対応後）

作成日: 2026-04-02  
更新日: 2026-04-03  
方針: 仕様書から機械的に正誤判定できるもののみ先行修正し、設計判断が必要なものは明示的に分離する。

## 1. 最新集計（再検証後）

- Functions テスト（Firestore Emulator付き再実行）
  - 実行: `firebase emulators:exec --only firestore "cd functions && npm test -- --runInBand --json --outputFile=/tmp/functions-jest-results-after-j001-j002.json"`
  - 結果: `1 failed / 105 passed / 1 skipped (suite)`、`1 failed / 975 passed / 3 skipped (test)`
  - 根拠: `/tmp/functions-jest-results-after-j001-j002.json`
- Flutter
  - `flutter test`: 成功（`test/widget_test.dart` 削除後）
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

### S-005（旧 G-003 / J-001）

- 概要:
  - `updateTournamentRecurrence` の template 変更時に `schedulePlanVersion` が `+1` される実装とテスト期待が不整合だった問題を解消。
- 修正内容:
  - `step3_taskSyncNeeded.spec.ts` を実装準拠へ更新。
  - `schedulePlanVersion` 期待値を `5 -> 6` に修正。
  - `schedulePlanUpdatedAt` 期待を「固定値維持」から「更新済み検証」へ変更。
- 修正ファイル:
  - `functions/__tests__/tournament_createTournament/step3_taskSyncNeeded.spec.ts`
- 検証:
  - `step3_taskSyncNeeded.spec.ts` は PASS（Firestore Emulator付き）。

### S-006（旧 G-007 / J-002）

- 概要:
  - analytics の旧スキーマ（`sales.grossIncl`）前提コード・テストを、新スキーマ（`grossSales` など）へ統一。
- 修正内容:
  - `aggregator` の型/差分/書き込みを新スキーマキーへ変更。
  - `aggregator.spec.ts` の期待値を新スキーマへ変更。
- 修正ファイル:
  - `functions/src/domains/analytics/services/aggregator/types.ts`
  - `functions/src/domains/analytics/services/aggregator/delta.ts`
  - `functions/src/domains/analytics/services/aggregator/writer.ts`
  - `functions/__tests__/analytics/aggregator.spec.ts`
- 検証:
  - `analytics/aggregator.spec.ts` は PASS（Firestore Emulator付き）。

## 3. ユーザー判断によりクローズした項目

### J-003（旧 G-010）

- 判定:
  - **phaseG スコープ外としてクローズ**（ユーザー明示）。
- 理由:
  - エラーログ方針の改修は別ブランチで並行対応中のため、phaseG では追わない。
- 備考:
  - Functions 全体テストの残件 `1 failed` は当該項目に由来。

### J-004（旧 G-012）

- 判定:
  - **不要テストとして削除しクローズ**（ユーザー明示）。
- 実施:
  - `test/widget_test.dart` を削除。
- 検証:
  - `flutter test` 成功。

### J-005（旧 G-013）

- 判定:
  - **phaseG スコープ外としてクローズ**（ユーザー明示）。
- 理由:
  - 既存負債（`1024 issues`）の包括対応は別トラックで扱う前提。
- 事実確認:
  - 2026-04-03 再実行でも `1024 issues found` を確認。

## 4. 現時点の結論

- **修正完了（エージェント単独で安全に対応）**: `S-001` 〜 `S-006`
- **ユーザー判断でクローズ**: `J-003` 〜 `J-005`
- phaseG スコープ内の要修正項目は完了。
