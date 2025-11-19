# Bills Migration プロジェクト

## サマリー
- 目的: `todaysBills` / `settledBills` を廃止し、単一の `bills` 親ドキュメント＋サブコレクション、滞在管理用 `activeStays` へ統合する。
- 基本原則:
  - 営業中の変更はサブコレクションのみを更新し、親ドキュメントは軽微な状態更新に限定する。
  - 会計確定時のスナップショット（`amounts` や `categoryBreakdown` 等）は **Cloud Functions のみが書き込む**。
  - 返金・追加徴収などの事後処理は `/events` に追記し、親サマリと Analytics を差分更新する。
  - 閉店バッチは親ドキュメントのスナップショットのみを参照し、1 伝票あたり 1 リードに抑える。

```
/bills/{billId}
  ├─ items/{itemId}
  ├─ extras/{extraId}
  ├─ payments/{paymentId}
  ├─ sideGameChips/{chipId}
  ├─ tournaments/{tplId}
  └─ events/{eventId}
/activeStays/{uid}
```

## 目的
- `todaysBills` と `settledBills` を統合し、`bills` コレクション＋サブコレクション構成へ移行する。
- 滞在管理データを `activeStays` で分離し、営業中の読み取りコストを削減する。**`activeStays` は最小スキーマ**（`uid`, `billId`, `pokerName?`, `isActive`, `startedAt` のみ）。**TTL は使用しない**（会計確定トリガで即時削除＋閉店時 callable でクリーンアップ）。
- 会計スナップショット・事後イベント・分析処理を Cloud Functions に集約し、責務を明確化する。
- **集計/ダッシュボードは Nightly Recalculation の結果を正（SSoT）とする**。リアルタイム `balanceDueIncl` は暫定値。

## 対象範囲
- Firestore データモデル（`bills` 親ドキュメント、各サブコレクション、`activeStays`）の設計とルール・インデックス整備。
- Cloud Functions（書き込みアダプタ、会計確定トリガ、イベント差分、Analytics 更新）の改修。
- Flutter クライアントの読み取り／書き込みロジック刷新。
- デュアルライト期間の制御、閉店バッチ・再計算バッチの移行。

## 進捗状況
- **P1-01（入店フロー）**: 完了。`createBillWithActiveStay` ヘルパAPI実装、`manualCheckIn.ts`/`processVisitByQR.ts` を新スキーマ対応、デュアルライト制御導入。テスト完了（単体テスト9件、統合テスト10件、合計19件全て成功）。
- **P1-02（注文フロー）**: 完了。`getActiveBillByUser`, `appendItem`, `resolveMenuItem` ヘルパAPI実装、`placeOrder.ts`/`placeOrderByUser.ts` を新スキーマ対応、強い冪等（時間窓なし、expiresAt廃止）、サーバ側メニュー情報正規化、`orders/_TodaysOrders` スキーマ確定（Chips除外、1種類=1doc）。テスト完了（単体テスト4件、統合テスト41件、合計45件全て成功）。詳細は `p1_02_test_results_summary.md` を参照。
- **P1-02.1（注文フロー仕上げ）**: 完了。ordersキー=businessDate統一（SSoT原則）、DualWrite失敗耐性テスト、並行競合テスト、appendのrequestHash不一致テスト、並行リプレイテスト、境界日付テスト、DualWrite三分岐ログの厳密一致検証テストを追加。businessDate不変化テストは一時スキップ（P1-06/P1-11へ移管）。詳細は `p1_02_test_results_summary.md` を参照。
- **P1-03（サイドゲームフロー）**: 完了。`appendSideGameChip` ヘルパAPI実装、`withdrawTip.ts`/`depositTip.ts`/`placeOrder.ts`（Chip購入）を新スキーマ対応、サイドゲームのすべての出入り（purchase/deposit/withdraw）を `/bills/{billId}/sideGameChips` に集約、deterministic idempotencyKey、idempotent replay時のログ重複防止。テスト完了（`appendSideGameChip.spec.ts`: 20テスト、`placeOrder.spec.ts`: 11テスト、`withdrawTip.spec.ts`: 2テスト、`depositTip.spec.ts`: 2テスト、合計35テスト全て成功、dualWrite ON/OFF両方で正常動作確認）。詳細は `changespecs/P1-03_change_spec.md` を参照。

## 実行再現方法（P1-02.1）

以下の環境変数を切り替えることで、DualWriteのON/OFFを再現できます。

```bash
# DualWrite ON
WRITE_TODAYS_BILLS_IN_PARALLEL=true npm test -- --runInBand

# DualWrite OFF
WRITE_TODAYS_BILLS_IN_PARALLEL=false npm test -- --runInBand
```

Firestore Emulatorを使用する場合は以下を追加してください。

```bash
FIRESTORE_EMULATOR_HOST=localhost:8080
```

代表テスト:
- `__tests__/helpers/billsApi/appendItem.dualwrite-failure.spec.ts`
- `__tests__/helpers/billsApi/appendItem.concurrent.spec.ts`
- `__tests__/itemOrder/placeOrder.boundary-dates.spec.ts`

## 運用ガイドライン
- 計画・テスト・決定事項は本ディレクトリ内で管理し、更新のたびに内容を追記する。
- 履歴を残すため、既存記述は極力保持し、追記／更新した旨を `changelog.md` に記録する。
- 新しい要件が判明したら `modification_plan.md` に反映し、テストが増えた場合は `test_plan.md` を更新する。
- 重要な判断や仕様確定は `decision_log.md` に日付付きで残す。
- リスクと対応策は `risk_and_mitigation.md` に整理し、状況が変わったら更新する。
- **SSoT（Single Source of Truth）**: 集計/ダッシュボードは **Nightly Recalculation** の結果を正とする。リアルタイム値は暫定。
- **`activeStays` 最小化**: 最小スキーマ（`uid`, `billId`, `pokerName?`, `isActive`, `startedAt` のみ）。**TTL 不使用**（会計確定トリガで即時削除＋閉店時 callable でクリーンアップ）。

## フォルダ構成
- `todaysBills_operations_summary.md`: 現行実装の参照用サマリ（**旧仕様の参照専用**）
- `modification_plan.md`: フェーズ別の改修タスクと進捗管理
- `test_plan.md`: フェーズ／領域ごとの検証計画
- `decision_log.md`: 意思決定の記録
- `risk_and_mitigation.md`: リスクと対策の一覧
- `changelog.md`: ドキュメント更新履歴
- `schema_plan.md`: データモデル設計
- `helper_api_plan.md`: ヘルパAPI仕様
- `api_contract.md`: Bills API 契約書（メソッド一覧・型定義・エラーコード・冪等性）
- `trigger_plan.md`: トリガ設計
- `analytics_plan.md`: Analytics集計設計
- `ui_compatibility_plan.md`: UI互換アダプタ層設計
- `active_stays_plan.md`: Active Stays 詳細設計
- `tools_and_operations_plan.md`: ツール/運用要件整理
- `backup_runbook.md`: バックアップ手順書（移行前エクスポート手順）

## 記載ルール
- 時刻は基本的に日本時間（JST, UTC+9）で統一。
- ファイルやモジュールを参照する際はプロジェクト内の絶対パスを用いる。
- 箇条書きで簡潔に整理しつつ、必要十分な背景を明記する。
