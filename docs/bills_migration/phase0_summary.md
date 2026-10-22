# フェーズ0（準備・追加実装）完了サマリ

_最終更新: 2025-11-10 (JST)_

## 概要
フェーズ0では、`todaysBills` / `settledBills` から `bills`＋サブコレクション＋`activeStays` への移行に必要な設計・ドキュメント整備を完了しました。全9タスク（P0-01 〜 P0-09）を完了し、フェーズ1（並走・段階移行）の実装準備が整いました。

## 完了タスク一覧

### P0-01: データモデル設計
**完了日**: 2025-11-10  
**成果物**:
- `schema_plan.md`: `bills` 親ドキュメントとサブコレクション（`items`, `extras`, `payments`, `events`, `sideGameChips`, `tournaments`）のスキーマ定義
- `activeStays` コレクションのスキーマ定義（最小スキーマ）
- `firestore.rules`: セキュリティルール草案（`bills`, `activeStays` の read/write 権限）
- `firestore.indexes.json`: 複合インデックス定義（`bills`, `activeStays`, `events`）

**主な決定事項**:
- `businessDate` は Functions が `calcBusinessDate` で確定（クライアントは提案値のみ）
- `updatedAt` は Functions のみ更新、冪等リプレイ時は変更しない
- 営業中の変更はサブコレクションのみ更新、親ドキュメントは軽微な状態更新に限定
- 会計確定時のスナップショット（`amounts.*`, `categoryBreakdown` 等）は Cloud Functions のみが書き込む
- `itemsSnapshot` が 700KB を超える場合は売上額 Top50 に圧縮

### P0-02: ヘルパAPI設計
**完了日**: 2025-11-10  
**成果物**:
- `helper_api_plan.md`: 抽象API層の詳細仕様
  - 13個のAPIメソッド定義（`createBillWithActiveStay`, `getActiveBillByUser`, `appendItem`, `appendSideGameChip`, `recordTournamentAction`, `updatePlace`, `startAccounting`, `completeAccounting`, `recordPayment`, `postEventRefund`, `postEventAdjustment`, `postEventCancel`, `postEventReopen`, `awardTournamentResult`）
  - 冪等性キー生成規則と保存先（`/idempotency/*` または docID埋め込み）
  - デュアルライト複写範囲（`WRITE_TODAYS_BILLS_IN_PARALLEL` フラグ制御）
  - エラー分類（`invalid-argument`, `permission-denied`, `not-found`, `failed-precondition`, `unavailable`, `aborted`, `internal`）
  - ライフサイクル遷移表
  - テスト観点（正常系、並行操作、リトライ、夜間跨ぎ、デュアルライト ON/OFF）

**主な決定事項**:
- すべての書き込み系APIは `idempotencyKey` を必須とする
- `recordPayment` は `providerTxnId` があるときは `idempotencyKey` も同一値を要求
- `postEventCancel` は `status` が `open`, `in_progress`, `settling` のみ許可
- `updatePlace` は LWW（Last Write Wins）方式、`activeStays` は更新しない
- デュアルライトは最小限・ベストエフォート、再試行なし

### P0-03: トリガ設計
**完了日**: 2025-11-10  
**成果物**:
- `trigger_plan.md`: Settlement Trigger と Event Differential Trigger の設計
  - Settlement Trigger: `status: 'settling'` → `'settled'` 時にサブコレクションを再読み込みしてスナップショットを焼き込む
  - Event Differential Trigger: `/events/{eventId}` 作成時に親ドキュメントの `postEvents.*`, `paymentsSummary` を差分更新
  - 冪等性: `meta.contentHash` による重複検出、`aggregationMarkers` による Analytics 重複防止
  - エラーハンドリング: 再試行バックオフ（0.5s → 1s → 2s → 4s → 8s、最大5回）

**主な決定事項**:
- Settlement Trigger は単一トランザクションでサブコレクション再読み込み→再計算→書込
- Event Differential Trigger は `originBusinessDate` 基準で Analytics に差分反映
- `activeStays/{uid}` は Settlement Trigger 完了後に即時削除

### P0-04: Analytics設計
**完了日**: 2025-11-10  
**成果物**:
- `analytics_plan.md`: Analytics集計設計
  - `analyticsMonthly` の4層構造（`sales`, `events`, `cashflow`, `net`）
  - Settlement Aggregation: 確定時に `sales.*`, `cashflow.*`, `net.*` を increment
  - Event Differential Aggregation: 返金・調整時に `events.*`, `net.*` を差分更新
  - `originBusinessDate` を基準キーとして集計（当日・後日イベントを区別）
  - `aggregationMarkers` による冪等制御（`billId`, `eventId` をマーカーに使用）
  - UI互換アダプタ層設計（`ui_compatibility_plan.md`）

**実装ファイル**:
- `functions/src/analytics/aggregator/index.ts`: エントリポイント
- `functions/src/analytics/aggregator/delta.ts`: 差分計算
- `functions/src/analytics/aggregator/writer.ts`: 月/日 doc への書き込み
- `functions/src/analytics/aggregator/markers.ts`: aggregationMarkers 管理
- `functions/__tests__/analytics/aggregator.spec.ts`: 最小テストケース（Settlement/Event）

**主な決定事項**:
- `net.balanceDueIncl` は nightly 再計算の結果を"正"とし、逐次更新しない
- 返金・追徴イベントはカテゴリ指定を初期段階では受け付けない（`unattributed` に加算）
- `ALLOW_EVENT_ATTRIBUTION` フラグで attribution フィールドを許可/拒否
- 既存UIは互換アダプタ層で旧フィールド名を新スキーマから合成して返す

### P0-05: Active Stays 詳細設計
**完了日**: 2025-11-10  
**成果物**:
- `active_stays_plan.md`: Active Stays 詳細設計
  - スキーマ定義（最小スキーマ: `uid`, `billId`, `pokerName`, `isActive`, `startedAt`）
  - ライフサイクル（作成: 入店時、削除: 会計確定時、閉店クリーンアップ）
  - セキュリティルール（Functions のみ書込、クライアントは読み取り専用）
  - インデックス定義（`isActive`, `startedAt` 複合インデックス）

**実装ファイル**:
- `functions/src/close_process/cleanupActiveStaysOnClose.ts`: 閉店時クリーンアップ callable（新規作成予定）
- `functions/src/triggers/settlement.ts`: `activeStays/{uid}` 即時削除ロジック（既存維持）

**主な決定事項**:
- TTL は使用しない（Settlement 即時削除＋閉店時 callable で担保）
- 座席情報（`table`, `seat`）は `bills.place.*` に保持、`activeStays` には保持しない
- Flutter は単一長寿命リスナーで購読（張り直し ≤ 5回/日）

### P0-06: ツール/運用要件整理
**完了日**: 2025-11-10  
**成果物**:
- `tools_and_operations_plan.md`: ツール/運用要件整理
  - 夜間再計算（Nightly Recalculation）: `analyticsMonthly.net.balanceDueIncl` を再計算
  - デュアルライト差分チェック（Nightly Reconciliation Check）: `todaysBills` と `bills` の差分検出
  - 夜間整合確認（Nightly Integrity Check）: データ整合性確認
  - TTL 設定: `idempotency` サブコレクションのみ TTL を使用（48h）
  - 監視メトリクス定義（Settlement Trigger 成功率、`activeStays` ドキュメント数等）

**実装ファイル**:
- `functions/src/config/ops.ts`: STORE_CLOSE_HOUR 取得と cron 生成ユーティリティ（新規作成）
- `functions/src/scripts/nightlyRecalculateBalanceDue.ts`: 夜間再計算（新規作成予定）
- `functions/src/scripts/nightlyReconciliationCheck.ts`: デュアルライト差分チェック（新規作成予定）
- `functions/src/scripts/nightlyIntegrityCheck.ts`: 夜間整合確認（新規作成予定）

**主な決定事項**:
- Nightly ジョブの実行時刻を `STORE_CLOSE_HOUR` 準拠に変更（固定 03:00 JST から動的生成へ）
  - `nightlyRecalculateBalanceDue`: `STORE_CLOSE_HOUR:00 JST`
  - `nightlyReconciliationCheck`: `STORE_CLOSE_HOUR:30 JST`（+30分）
  - `nightlyIntegrityCheck`: `(STORE_CLOSE_HOUR + 1):00 JST`（+60分）
- `STORE_CLOSE_HOUR` の解釈:
  - 0-23: 「当日の何時まで」を指定
  - 24-48: 「翌日の何時まで」を指定（`normalizeStoreCloseHour()` で正規化）
- Frontend と Backend で同じ値に揃える（将来は Remote Config 経由の一元管理を検討）

### P0-07: Active Stays 詳細設計（スキーマ確定）
**完了日**: 2025-11-10  
**成果物**:
- `active_stays_plan.md`: 最小スキーマ化（`table`, `seat`, `updatedAt` 削除）
- `helper_api_plan.md`: `updatePlace` で `bills.place.*` のみ更新、`activeStays` は更新しない
- `firestore_rules_notes.md`: `activeStays` は最小スキーマ、座席情報は `bills.place.*` に保持
- `test_plan.md`: 座席移動・注文時のテスト観点追加
- `firestore.rules`: `activeStays` の read/write ルール追加
- `firestore.indexes.json`: `activeStays` の複合インデックス追加

**主な決定事項**:
- `activeStays` は最小スキーマ（ローカルで常に保持し更新のたびに読み取る仕様のため）
- 座席情報は `bills.place.table`, `bills.place.seat` に保持
- 座席移動は `updatePlace` ヘルパAPIで `bills.place.*` のみ更新
- 注文時は `orders/{YYYYMMDD}/_TodaysOrders/{orderId}` に `bills.place.table`, `bills.place.seat` を同梱

### P0-08: API契約書作成
**完了日**: 2025-11-10  
**成果物**:
- `api_contract.md`: Bills API 契約書（906行）
  - 共通仕様（認証・権限、エラーハンドリング、タイムゾーン、デュアルライト）
  - API メソッド一覧（13個のメソッドの Request/Response 型定義）
  - エラーコード一覧（7種類のエラーコードとクライアント対応）
  - 冪等性契約の詳細（キー生成規則、保存先と TTL、チェックフロー、リプレイ時の動作）
  - ライフサイクル遷移表
  - 型定義（TypeScript）
  - 実装ファイル構成
  - テスト要件

**修正内容**（P0-08修正）:
- 用語統一: "Nightly Reconciliation" → "Nightly Recalculation"
- `recordPayment` の一意ルール: `providerTxnId` があるときは `idempotencyKey` も同一値を要求
- `postEventCancel` の許可ステータス: `open`, `in_progress`, `settling` のみ許可
- `businessDate` の再開時扱い: `postEventReopen` 後も原則固定
- `AllowedPaymentMethods` 拡張ガイド: ワイヤー値は小文字スネークケース、UI表示名は別マップ
- `updatePlace` の LWW ルール: 競合時は `serverTimestamp()` を優先
- `recordPayment` / `postEvent*` は「docID＝冪等キー」方式、`/idempotency/*` は使用しない

### P0-09: バックアップ手順書整備
**完了日**: 2025-11-10  
**成果物**:
- `backup_runbook.md`: バックアップ手順書
  - エクスポート対象コレクション（`todaysBills`, `settledBills`, `accountingHistory`）
  - エクスポート方法（Firestore Export API、BigQuery へのエクスポート）
  - 保存先と命名規則（GCS バケット構成）
  - 実行タイミング（移行開始前、定期バックアップ、最終バックアップ）
  - 検証方法（エクスポート完了確認、データ整合性確認）
  - 復旧手順（インポート方法、注意事項）
  - 自動化（Cloud Scheduler での定期実行例）
  - トラブルシューティング

**主な決定事項**:
- 移行開始前（Phase1開始直前）に必須エクスポートを実行
- 保存期間: 移行完了後30日間保持（最低限）、推奨90日間（P2-06 Analytics再計算検証完了まで）

## 作成・更新したドキュメント一覧

### 新規作成
1. `README.md`: プロジェクト概要とフォルダ構成
2. `modification_plan.md`: フェーズ別の改修タスクと進捗管理
3. `schema_plan.md`: データモデル設計
4. `helper_api_plan.md`: ヘルパAPI仕様
5. `api_contract.md`: Bills API 契約書
6. `trigger_plan.md`: トリガ設計
7. `analytics_plan.md`: Analytics集計設計
8. `active_stays_plan.md`: Active Stays 詳細設計
9. `tools_and_operations_plan.md`: ツール/運用要件整理
10. `backup_runbook.md`: バックアップ手順書
11. `test_plan.md`: テスト計画
12. `decision_log.md`: 意思決定の記録
13. `risk_and_mitigation.md`: リスクと対策の一覧
14. `firestore_rules_notes.md`: Firestore ルール整備メモ
15. `ui_compatibility_plan.md`: UI互換アダプタ層設計
16. `changelog.md`: ドキュメント更新履歴
17. `phase0_summary.md`: 本サマリ（このファイル）

### 更新
1. `firestore.rules`: `bills`, `activeStays` の read/write ルール追加
2. `firestore.indexes.json`: `bills`, `activeStays`, `events` の複合インデックス追加

## 実装ファイル（作成済み）

### Functions (TypeScript)
1. `functions/src/analytics/aggregator/index.ts`: Analytics集計エントリポイント
2. `functions/src/analytics/aggregator/delta.ts`: 差分計算
3. `functions/src/analytics/aggregator/writer.ts`: 月/日 doc への書き込み
4. `functions/src/analytics/aggregator/markers.ts`: aggregationMarkers 管理
5. `functions/src/analytics/aggregator/types.ts`: 型定義
6. `functions/src/config/ops.ts`: STORE_CLOSE_HOUR 取得と cron 生成ユーティリティ
7. `functions/src/scripts/nightlyRecalculateBalanceDue.ts`: 夜間再計算（スケルトン）
8. `functions/src/scripts/nightlyReconciliationCheck.ts`: デュアルライト差分チェック（スケルトン）
9. `functions/src/scripts/nightlyIntegrityCheck.ts`: 夜間整合確認（スケルトン）

### Tests
1. `functions/__tests__/analytics/aggregator.spec.ts`: Analytics集計の最小テストケース

## 実装ファイル（作成予定・Phase1で実装）

### Functions (TypeScript)
1. `functions/src/helpers/billsApi/index.ts`: 外部公開API
2. `functions/src/helpers/billsApi/dualWrite.ts`: デュアルライトロジック
3. `functions/src/helpers/billsApi/idempotency.ts`: 冪等性管理
4. `functions/src/helpers/billsApi/snapshots.ts`: スナップショット再計算
5. `functions/src/helpers/billsApi/events.ts`: イベント作成・差分適用
6. `functions/src/helpers/billsApi/payments.ts`: 支払い管理
7. `functions/src/helpers/billsApi/tournaments.ts`: トーナメント管理
8. `functions/src/helpers/billsApi/date.ts`: `calcBusinessDate` ユーティリティ
9. `functions/src/types/bills.ts`: 型定義
10. `functions/src/triggers/settlement.ts`: Settlement Trigger
11. `functions/src/triggers/eventDifferential.ts`: Event Differential Trigger
12. `functions/src/close_process/cleanupActiveStaysOnClose.ts`: 閉店時クリーンアップ callable

## 主要な設計決定事項

### データモデル
- `bills` を会計記録の唯一の正とする（`settledBills` / `accountingHistory` は廃止予定）
- 営業中の変更はサブコレクションのみ更新、親ドキュメントは軽微な状態更新に限定
- 会計確定時のスナップショットは Cloud Functions のみが書き込む
- `activeStays` は最小スキーマ（座席情報は `bills.place.*` に保持）

### 冪等性
- 入店/会計系（create/start/complete）: `/bills/{billId}/idempotency/{key}` に TTL:48h で保存
- 支払い（recordPayment）: `/bills/{billId}/payments/{paymentId}` の docID に `providerTxnId` を埋め込み
- イベント（postEvent*）: `/bills/{billId}/events/{eventId}` の docID に `idempotencyKey` を埋め込み

### デュアルライト
- フラグ: `WRITE_TODAYS_BILLS_IN_PARALLEL`
- 原則: `bills` を正とし、`todaysBills` への複写は最小限・ベストエフォート
- 再試行なし、失敗は Cloud Logging のみ記録
- 整合性検証・修正は Nightly Recalculation ジョブで実施

### Analytics
- 4層構造（`sales`, `events`, `cashflow`, `net`）を維持
- `originBusinessDate` を基準キーとして集計
- `aggregationMarkers` による冪等制御
- `net.balanceDueIncl` は nightly 再計算の結果を"正"とする

### 運用
- Nightly ジョブの実行時刻を `STORE_CLOSE_HOUR` 準拠に変更（動的生成）
- `activeStays` は TTL 不使用（Settlement 即時削除＋閉店時 callable）
- `idempotency` サブコレクションのみ TTL を使用（48h）

## 次のステップ（フェーズ1）

フェーズ0の準備が完了したため、次はフェーズ1（並走・段階移行）に進みます。

### フェーズ1の主要タスク
1. **P1-01**: 入店フロー（`manualCheckIn.ts`, `processVisitByQR.ts`）を新スキーマに対応
2. **P1-02**: 注文（`placeOrder.ts`, `placeOrderByUser.ts`）を `/items` 書き込みに変更
3. **P1-03**: サイドゲーム（`withdrawTip.ts`, `depositTip.ts`）を `/sideGameChips` 書き込みに変更
4. **P1-04**: 座席管理（`reseatAllPlayers.ts`, `assignSeatToPlayer.ts`, `bustAndExit.ts`）を `activeStays` 起点に再設計
5. **P1-05**: トーナメント（参加・リバイ・アドオン系 callables）を `/tournaments/{tplId}` upsert へ変更
6. **P1-06**: 会計開始（`accounting.ts`, `updateAccounting.ts`, `updateActiveBill.ts`）をステータス／ops 更新に限定
7. **P1-07**: 事後イベント（`cancelAccounting.ts`, `refundProcessing.ts`）を `/events` 追加のみに変更
8. **P1-08**: 読み取り（Functions）を `bills` クエリへ移行
9. **P1-09**: 読み取り（Flutter）を `bills`＋サブコレ対応へ
10. **P1-10**: 閉店バッチを `bills` スナップショット前提へ差し替え
11. **P1-11**: 監視（デュアルライト差分チェック、夜間整合確認）を導入
12. **P1-12**: 親 doc サイズ監視と救済策を設計
13. **P1-13**: Flutter リスナー（`activeStays` を単一長寿命リスナーで購読）を導入

詳細は `modification_plan.md` を参照してください。

