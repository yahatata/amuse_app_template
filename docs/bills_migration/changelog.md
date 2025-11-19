# ドキュメント更新履歴

| 日付 | 内容 | 対象ファイル |
| --- | --- | --- |
| 2025-11-10 | `docs/bills_migration` ディレクトリを作成し、`todaysBills_operations_summary.md` を移動。 | `README.md` (初版), `modification_plan.md` (初版), `test_plan.md` (初版), `decision_log.md` (初版), `risk_and_mitigation.md` (初版), `changelog.md` (初版) |
| 2025-11-10 | 方針追記（用語統一、デュアルライト条件、テスト要件、決定事項、リスク）。 | `README.md`, `modification_plan.md`, `test_plan.md`, `decision_log.md`, `risk_and_mitigation.md`, `changelog.md` |
| 2025-11-10 | スキーマドラフトを作成し、createdAt=Functions書込、activeStays TTL=48h を明記。 | `schema_plan.md` |
| 2025-11-10 | ヘルパAPI計画を追加し、冪等性・デュアルライト・エラー規約・テスト観点を整理。 | `helper_api_plan.md`, `modification_plan.md` |
| 2025-11-10 | ヘルパAPI計画に API 定義一覧とモジュール構成案を追記し、P0-02 を完了。 | `helper_api_plan.md`, `modification_plan.md` |
| 2025-11-10 | フェーズ1テスト観点を更新（byMethod検証・updatedAt冪等性）。 | `test_plan.md` |
| 2025-11-10 | スキーマ/ヘルパを更新（businessDate・updatedAt責務、イベントID規約、itemsSnapshot圧縮、payments一意性）。 | `schema_plan.md`, `helper_api_plan.md`, `decision_log.md` |
| 2025-11-10 | Firestore ルール整備メモを追加。 | `firestore_rules_notes.md` |
| 2025-11-10 | トリガ設計計画を追加し、P0-03 を完了。 | `trigger_plan.md`, `modification_plan.md`, `decision_log.md`, `test_plan.md` |
| 2025-11-10 | トリガ計画を調整（settling→settled限定、cancel条件、reopenガード等）。 | `trigger_plan.md` |
| 2025-11-10 | Analytics 設計計画を作成（sales/events/cashflow/net 4層、originBusinessDate 基準）。 | `analytics_plan.md` |
| 2025-11-10 | Analytics関連の決定・テスト観点を更新。 | `modification_plan.md`, `decision_log.md`, `test_plan.md` |
| 2025-11-10 | Analytics aggregator スケルトンコード作成（index/delta/writer/markers/types）。 | `functions/src/analytics/aggregator/**` |
| 2025-11-10 | Analytics aggregator テスト追加（Settlement/Event の最小ケース）。 | `functions/__tests__/analytics/aggregator.spec.ts` |
| 2025-11-10 | UI互換アダプタ層設計を追加。既存参照箇所調査と互換変換案を記載。 | `ui_compatibility_plan.md`, `modification_plan.md` |
| 2025-11-10 | Active Stays 詳細設計を追加し、P0-05 を完了。 | `active_stays_plan.md`, `modification_plan.md`, `decision_log.md`, `test_plan.md` |
| 2025-11-10 | P0-05: activeStays TTL撤廃、閉店クリーンアップ callable 実装、UI連携追加。 | `active_stays_plan.md`, `cleanupActiveStaysOnClose.ts`, `systemSettingsPage.dart`, `decision_log.md` |
| 2025-11-10 | activeStays TTL撤廃の整合性修正（schema_plan, helper_api_plan, test_plan）。 | `schema_plan.md`, `helper_api_plan.md`, `test_plan.md` |
| 2025-11-10 | P0-06: ツール/運用要件整理を完了。夜間再計算・整合監視・TTL設定の要件を整理。 | `tools_and_operations_plan.md`, `modification_plan.md` |
| 2025-11-10 | P0-06修正: Nightly ジョブの実行時刻を STORE_CLOSE_HOUR 準拠に変更。ops.ts 追加、3つの nightly スクリプト作成。 | `tools_and_operations_plan.md`, `functions/src/config/ops.ts`, `functions/src/scripts/nightly*.ts` |
| 2025-11-10 | P0-06修正: 既存コードの STORE_CLOSE_HOUR 対応。ハードコード削除、正規化関数追加、Dart/TS ファイルを修正。 | `getAccountingHistory.ts`, `determineAttendanceMode.ts`, `helpers.ts`, `accountingPage.dart`, `accountingEditDialog.dart`, `accountingHistoryPage.dart`, `globalConstant.dart` |
| 2025-11-10 | P0-07: activeStays 最小スキーマ化（table/seat/updatedAt削除）、bills.place.* に座席情報保持、firestore.rules/indexes.json 追加。 | `active_stays_plan.md`, `helper_api_plan.md`, `firestore_rules_notes.md`, `test_plan.md`, `firestore.rules`, `firestore.indexes.json`, `modification_plan.md` |
| 2025-11-10 | P0-08: API契約書を作成。メソッド一覧、Request/Response型定義、エラーコード一覧、冪等性契約、ライフサイクル遷移表を明記。 | `api_contract.md`, `modification_plan.md` |
| 2025-11-10 | P0-08修正: API契約書の用語統一と実装曖昧さを修正（Nightly Recalculation統一、recordPayment一意ルール、postEventCancel許可ステータス、businessDate再開時扱い、AllowedPaymentMethods拡張ガイド）。 | `api_contract.md` |
| 2025-11-10 | P0-09: バックアップ手順書を作成。移行開始前のエクスポート手順、検証方法、復旧手順を整備。 | `backup_runbook.md`, `modification_plan.md`, `README.md` |
| 2025-11-10 | フェーズ1実装ポリシー追加: ChangeSpec必須化、技術原則、実装境界、ロギング/メトリクス、インデックス/ルール先行適用、ドキュメント更新、テスト規約、フィーチャーフラグ/ロールバック、親ドキュメントサイズ救済、PR/コミット規約、Done定義を明文化。フェーズ1のステップに進む際は必ず確認すること。 | `modification_plan.md` |
| 2025-11-10 | スキーマ最終確定: activeStays最小スキーマ化（table/seat/updatedAt/expiresAt削除）、bills親の責務修正（businessDate/updatedAt/place.*のLWW）、冪等性規約明記（payments/eventsのdocID=冪等キー）、支払方法キー表記統一（小文字スネークケース）、SSoT明記（Nightly Recalculationが正）、tournaments/{tplId}からprizeAmountIncl削除。 | `schema_plan.md`, `api_contract.md`, `firestore.rules`, `firestore.indexes.json`, `README.md`, `test_plan.md` |
| 2025-11-10 | P1-01: 入店フローを新スキーマ対応。`createBillWithActiveStay` ヘルパAPI実装、`manualCheckIn.ts`/`processVisitByQR.ts` を更新。デュアルライト制御導入。 | `functions/src/helpers/billsApi/**`, `functions/src/userLogin/manualCheckIn.ts`, `processVisitByQR.ts`, `modification_plan.md`, `changelog.md`, `test_plan.md` |
| 2025-11-15 | P1-01: テスト完了。単体テスト9件、統合テスト10件、合計19件全て成功。テスト実行ガイド、テストサマリーを追加。 | `functions/__tests__/helpers/billsApi/**`, `functions/jest.config.js`, `docs/bills_migration/test_setup_guide.md`, `docs/bills_migration/p1_01_test_summary.md`, `modification_plan.md`, `test_plan.md` |
| 2025-11-15 | P1-02: 注文を /bills/items へ。強い冪等・orders スキーマ確定（Chips 除外）。`getActiveBillByUser`, `appendItem`, `resolveMenuItem` ヘルパAPI実装、`placeOrder`/`placeOrderByUser` を新スキーマ対応、`orders/_TodaysOrders` スキーマ確定（1種類=1doc、Chips除外）。テスト完了（単体テスト4件、統合テスト41件、合計45件全て成功）。 | `functions/src/helpers/billsApi/**`, `functions/src/itemOrder/placeOrder.ts`, `placeOrderByUser.ts`, `firestore.rules`, `firestore.indexes.json`, `modification_plan.md`, `changelog.md`, `test_plan.md`, `p1_02_test_results_summary.md` |
| 2025-11-18 | P1-02.1: 注文（仕上げ）完了。ordersキー=businessDate統一（placeOrder.ts/placeOrderByUser.tsでbill.businessDateをSSoTとして使用）、DualWrite失敗耐性テスト、並行競合テスト、appendのrequestHash不一致テスト、並行リプレイテスト、境界日付テスト、DualWrite三分岐ログの厳密一致検証テストを追加。businessDate不変化テストは一時スキップ（P1-06/P1-11へ移管）。 | `functions/src/itemOrder/placeOrder.ts`, `placeOrderByUser.ts`, `functions/src/helpers/billsApi/appendItem.ts`, `dualWrite.ts`, `functions/__tests__/**`, `docs/bills_migration/p1_02_test_results_summary.md`, `modification_plan.md`, `test_plan.md`, `README.md` |
| | コミットハッシュ: `<最新のコミットIDをここに挿入>`<br>代表コミット:<br>- appendItem.dualwrite-failure.spec.ts （三分岐ログ厳密一致テスト追加）<br>- placeOrder.boundary-dates.spec.ts （境界日付テスト追加）<br>- appendItem.parallel-replay.spec.ts （並行リプレイテスト追加） | |
| 2025-11-19 | P1-03: サイドゲームフロー完了。`appendSideGameChip` ヘルパAPI実装、サイドゲームのすべての出入り（purchase/deposit/withdraw）を `/bills/{billId}/sideGameChips` に集約、`placeOrder.ts` でChipカテゴリのみ `/sideGameChips` へ記録（Chip以外は従来通り `/items` と `orders/_TodaysOrders`）、`withdrawTip.ts`/`depositTip.ts` でdeterministic idempotencyKey（`${billId}:${op}:${clientNonce}`）導入、idempotent replay時のログ重複防止（`appendResult.diagnostics?.reused === true` のときは `sideGameChipLogs` へのログ追加をスキップ）、DualWriteはトランザクション外でベストエフォート実行。テスト完了（`appendSideGameChip.spec.ts` 20テスト、`placeOrder.spec.ts` 11テスト、`withdrawTip.spec.ts` 2テスト、`depositTip.spec.ts` 2テスト、合計35テスト全て成功、dualWrite ON/OFF両方で正常動作確認）。 | `functions/src/helpers/billsApi/appendSideGameChip.ts`, `functions/src/itemOrder/placeOrder.ts`, `functions/src/sideGame/withdrawTip.ts`, `depositTip.ts`, `registerForSideGame.ts`, `leaveSeat.ts`, `functions/src/helpers/billsApi/dualWrite.ts`, `functions/__tests__/helpers/billsApi/appendSideGameChip.spec.ts`, `functions/__tests__/itemOrder/placeOrder.spec.ts`, `functions/__tests__/sideGame/withdrawTip.spec.ts`, `depositTip.spec.ts`, `docs/bills_migration/changespecs/P1-03_change_spec.md`, `modification_plan.md`, `changelog.md`, `test_plan.md`, `README.md` |
