# ツール/運用要件整理

_最終更新: 2025-11-10 (JST)_

## 0. 目的
- 夜間再計算、整合監視、TTL 設定など補助ツールの要件を整理し、Phase1 以降の実装準備を行う。
- 運用監視のメトリクス定義とアラート条件を明確化する。

## 1. 夜間再計算（Nightly Recalculation）

### 1.1 目的
- `analyticsMonthly.net.balanceDueIncl` を「その月の全 `bills` の `paymentsSummary.balanceDueIncl` 合算」で再計算し、上書きする。
- Settlement/Event の逐次集計では更新せず、nightly 再計算の結果を"正"とする。

### 1.2 実行タイミング
- **スケジュール**: `STORE_CLOSE_HOUR:00 JST`（営業終了後、閉店バッチ実行後）
  - `STORE_CLOSE_HOUR` は `lib/globalConstant.dart` の `STORE_CLOSE_HOUR` と一致させる
  - 例: `STORE_CLOSE_HOUR=27` の場合 → 3:00 JST（27 % 24 = 3）
  - 例: `STORE_CLOSE_HOUR=9` の場合 → 9:00 JST
- **実装**: `functions/src/scripts/nightlyRecalculateBalanceDue.ts`（新規作成）
- **トリガ**: Cloud Scheduler（`onSchedule`）
- **設定**: `functions/src/config/ops.ts` の `getNightlyCronTriplet()` で動的に生成

### 1.3 処理フロー
1. 対象月を決定（前月の最終日時点で実行）
2. 対象月の全 `bills` を `businessDate` でフィルタして取得
3. `status == 'settled'` の `bills` のみを対象
4. 各 `bill` の `paymentsSummary.balanceDueIncl` を合算
5. `analyticsMonthly/{monthKey}.net.balanceDueIncl` を上書き
6. 各日次の `analyticsMonthly/{monthKey}/days/{businessDate}.net.balanceDueIncl` も同様に再計算

### 1.4 エラーハンドリング
- 処理失敗時は Cloud Tasks でリトライ（最大3回、指数バックオフ）
- 失敗ログを Cloud Logging に記録し、アラート通知

### 1.5 メトリクス
- 処理件数、処理時間、失敗件数
- 再計算前後の `balanceDueIncl` 差分（監査ログ）

## 2. 整合監視（Reconciliation Monitoring）

### 2.1 デュアルライト差分チェック
- **目的**: Phase1 期間中、`todaysBills` と `bills` の差分を検出する。
- **実行タイミング**: `STORE_CLOSE_HOUR:30 JST`（nightly 再計算後、+30分）
  - 例: `STORE_CLOSE_HOUR=27` の場合 → 3:30 JST
  - 例: `STORE_CLOSE_HOUR=9` の場合 → 9:30 JST
- **実装**: `functions/src/scripts/nightlyReconciliationCheck.ts`（新規作成）
- **設定**: `functions/src/config/ops.ts` の `getNightlyCronTriplet()` で動的に生成

#### 2.1.1 比較対象
- キー: `billId`（必要に応じて `userId + businessDate`）
- 比較フィールド:
  - `grandTotalRounded`（`todaysBills.totalPrice` vs `bills.amounts.grandTotalRounded`）
  - `categoryBreakdown`（`todaysBills` の各カテゴリ合計 vs `bills.categoryBreakdown`）
  - `paymentTotals`（`todaysBills.paymentMethodsByAmount` vs `bills.paymentTotals`）

#### 2.1.2 差分検出時の対応
1. 差分を Cloud Logging に記録（警告レベル）
2. 差分レポートを `reconciliationReports/{YYYY-MM-DD}` に保存
3. 手動補正が必要な場合は管理者に通知
4. 自動補正可能な場合は `bills` を正として `todaysBills` を更新（オプション）

### 2.2 親ドキュメントサイズ監視
- **目的**: `bills` 親ドキュメントのサイズが 1MB を超えないよう監視する。
- **実行タイミング**: 会計確定トリガ実行時（リアルタイム）
- **実装**: Settlement Trigger 内で実装（`trigger_plan.md` 参照）

#### 2.2.1 監視対象
- `itemsSnapshot` のサイズ（700KB 超で Top50 圧縮を発動）
- 親ドキュメント全体のサイズ（1MB 超で警告）

#### 2.2.2 アラート条件
- `itemsSnapshot` が 700KB を超えた場合: 警告ログ
- 親ドキュメントが 1MB を超えた場合: エラーログ + アラート通知

### 2.3 activeStays 監視
- **目的**: `activeStays` ドキュメント数とクリーンアップ実行状況を追跡する。
- **実行タイミング**: リアルタイム（Cloud Functions 実行時） + 日次サマリ（3:00 JST）

#### 2.3.1 監視メトリクス
- `activeStays` ドキュメント数（`isActive == true`）
- 閉店クリーンアップ実行回数・削除件数・失敗件数
- 会計未確定で残存していた `billId` 数（監査ログ）

#### 2.3.2 アラート条件
- `activeStays` ドキュメント数が異常に多い場合（例: 100件超）
- 閉店クリーンアップの失敗件数が閾値を超えた場合（例: 5件超）

### 2.4 会計確定トリガ監視
- **目的**: Settlement Trigger の成功率・処理時間・リトライ発生を追跡する。
- **実行タイミング**: リアルタイム（Cloud Functions 実行時）

#### 2.4.1 監視メトリクス
- トリガ実行回数・成功率・失敗率
- 平均処理時間・最大処理時間
- リトライ発生回数・リトライ成功率
- `itemsSnapshot` 圧縮発動回数

#### 2.4.2 アラート条件
- 成功率が 99.9% を下回った場合
- 平均処理時間が 10秒を超えた場合
- リトライ発生率が 5% を超えた場合

## 3. TTL 設定

### 3.1 idempotency サブコレクション
- **目的**: `/bills/{billId}/idempotency/{key}` の TTL を設定し、48時間後に自動削除する。
- **設定方法**: Firestore Console で TTL ポリシーを有効化
- **フィールド**: `expiresAt`（`serverTimestamp() + 48h`）

#### 3.1.1 設定手順
1. Firestore Console → データベース → TTL ポリシー
2. コレクション: `bills/{billId}/idempotency`
3. TTL フィールド: `expiresAt`
4. 有効化

#### 3.1.2 注意事項
- TTL ポリシーは Firestore のデフォルトで 24時間ごとに実行される
- 削除は非同期で実行されるため、即座に削除されない場合がある

### 3.2 activeStays
- **方針**: TTL は使用しない（P0-05 で確定）
- **クリーンアップ**: Settlement 即時削除 + 閉店時 callable

## 4. 夜間整合確認（Nightly Integrity Check）

### 4.1 目的
- データ整合性を確認し、異常を検出する。
- 実行タイミング: `(STORE_CLOSE_HOUR + 1):00 JST`（nightly 再計算・差分チェック後、+60分）
  - 例: `STORE_CLOSE_HOUR=27` の場合 → 4:00 JST（27 + 1 = 28, 28 % 24 = 4）
  - 例: `STORE_CLOSE_HOUR=9` の場合 → 10:00 JST
- **設定**: `functions/src/config/ops.ts` の `getNightlyCronTriplet()` で動的に生成

### 4.2 確認項目
1. **bills 整合性**:
   - `status == 'settled'` だが `amounts.grandTotalRounded` が 0 のケース
   - `postEvents.netSalesIncl < 0` のケース
   - `paymentsSummary.balanceDueIncl < 0` のケース

2. **activeStays 整合性**:
   - `activeStays` が存在するが、対応する `bills` が `status == 'settled'` のケース
   - `bills.status != 'settled'` だが `activeStays` が存在しないケース（想定外）

3. **analyticsMonthly 整合性**:
   - `sales.grossIncl` と `categoryBreakdown` の合計が一致しないケース
   - `net.netSalesIncl` が `sales.grossIncl - events.totalRefundedIncl + events.totalAdjustmentsIncl` と一致しないケース

### 4.3 実装
- **ファイル**: `functions/src/scripts/nightlyIntegrityCheck.ts`（新規作成）
- **出力**: 整合性レポートを `integrityReports/{YYYY-MM-DD}` に保存

## 5. メトリクス・アラート定義

### 5.1 Cloud Logging メトリクス
- `bills_settlement_trigger_success_rate`
- `bills_settlement_trigger_duration`
- `bills_settlement_trigger_retry_count`
- `active_stays_count`
- `active_stays_cleanup_deleted_count`
- `active_stays_cleanup_failed_count`
- `nightly_recalculation_duration`
- `nightly_reconciliation_diff_count`

### 5.2 アラート条件
- Settlement Trigger 成功率 < 99.9%
- Settlement Trigger 平均処理時間 > 10秒
- `activeStays` ドキュメント数 > 100
- デュアルライト差分件数 > 10件/日
- 親ドキュメントサイズ > 1MB

## 6. 実装ファイル一覧

### 6.1 新規作成
- `functions/src/config/ops.ts`: STORE_CLOSE_HOUR 取得と cron 生成ユーティリティ
- `functions/src/scripts/nightlyRecalculateBalanceDue.ts`: 夜間再計算
- `functions/src/scripts/nightlyReconciliationCheck.ts`: デュアルライト差分チェック
- `functions/src/scripts/nightlyIntegrityCheck.ts`: 夜間整合確認

### 6.2 既存ファイルの拡張
- Settlement Trigger: 親ドキュメントサイズ監視を追加
- `cleanupActiveStaysOnClose.ts`: メトリクス出力を追加

## 7. スケジュール設定

### 7.1 STORE_CLOSE_HOUR について
- **定義**: `lib/globalConstant.dart` の `STORE_CLOSE_HOUR` と一致させる
- **値の範囲**: 0-48 の整数
- **意味**: 
  - **0-23**: 「当日の何時まで」を指定（例: 9 → 当日の9:00まで）
  - **24-48**: 「翌日の何時まで」を指定（例: 25 → 翌日の1:00まで、27 → 翌日の3:00まで）
  - 24以上を指定した場合、`normalizeStoreCloseHour()` で正規化して使用
- **例**: 
  - `STORE_CLOSE_HOUR=9` → 当日の 9:00 まで（9:00以降は当日の営業日）
  - `STORE_CLOSE_HOUR=25` → 翌日の 1:00 まで（当日の1:00以降は当日の営業日）
  - `STORE_CLOSE_HOUR=27` → 翌日の 3:00 まで（当日の3:00以降は当日の営業日）
- **Backend 設定**: 
  - 環境変数 `STORE_CLOSE_HOUR` を優先
  - 次に `functions:config().ops.store_close_hour`
  - デフォルト: 27（翌日の3:00 JST）
- **注意**: Frontend と Backend で同じ値に揃えること（将来は Remote Config 経由の一元管理を検討）
- **使用時**: 24以上の値を指定する場合は、必ず `normalizeStoreCloseHour()` で正規化してから使用すること

### 7.2 Cloud Scheduler 設定（動的生成）
| 関数名 | スケジュール | タイムゾーン | 説明 |
| --- | --- | --- | --- |
| `nightlyRecalculateBalanceDue` | `STORE_CLOSE_HOUR:00` | `Asia/Tokyo` | 例: STORE_CLOSE_HOUR=27 → 3:00 JST |
| `nightlyReconciliationCheck` | `STORE_CLOSE_HOUR:30` | `Asia/Tokyo` | 例: STORE_CLOSE_HOUR=27 → 3:30 JST（+30分） |
| `nightlyIntegrityCheck` | `(STORE_CLOSE_HOUR + 1):00` | `Asia/Tokyo` | 例: STORE_CLOSE_HOUR=27 → 4:00 JST（+60分） |

**実装**: `functions/src/config/ops.ts` の `getNightlyCronTriplet()` で動的に生成
- `cronFromHourAndMinuteJst()` で `hour % 24` に丸めて cron 文字列を生成
- `timeZone: 'Asia/Tokyo'` を必ず指定

### 7.3 実行順序
1. 閉店バッチ（既存）
2. 夜間再計算（`STORE_CLOSE_HOUR:00 JST`）
3. デュアルライト差分チェック（`STORE_CLOSE_HOUR:30 JST`、+30分）
4. 夜間整合確認（`(STORE_CLOSE_HOUR + 1):00 JST`、+60分）

## 8. TODO
- [x] STORE_CLOSE_HOUR 準拠のスケジュール設定（P0-06 完了）
- [ ] 夜間再計算スクリプトの実装（P1-10 以降）
- [ ] デュアルライト差分チェックスクリプトの実装（P1-11）
- [ ] 夜間整合確認スクリプトの実装（P1-11）
- [ ] Cloud Scheduler の設定（Phase1 で実施）
- [ ] メトリクス・アラートの設定（Phase1 で実施）
- [ ] TTL ポリシーの Firestore Console 設定手順を Runbook に追加
- [ ] Frontend と Backend の STORE_CLOSE_HOUR 同期の自動化（将来: Remote Config 経由）

