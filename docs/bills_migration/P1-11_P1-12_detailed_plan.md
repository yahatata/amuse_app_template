# P1-11 / P1-12 詳細実装計画

_最終更新: 2025-12-20 (JST)_

## 目次
1. [P1-11: 監視](#p1-11-監視)
2. [P1-12: 親ドキュメントサイズ監視と救済策](#p1-12-親ドキュメントサイズ監視と救済策)
3. [実装ファイル一覧](#実装ファイル一覧)
4. [テスト計画](#テスト計画)
5. [メトリクス・アラート定義](#メトリクスアラート定義)

---

## P1-11: 監視

### 1.1 目的
Phase1期間中、デュアルライト（`todaysBills` と `bills` の並行書き込み）の差分を検出し、データ整合性を監視する。また、`businessDate` の不変性をトリガレベルで保証する（パターンB）。

### 1.2 実装項目

#### 1.2.1 デュアルライト差分チェック（`nightlyReconciliationCheck.ts`）

**目的**: Phase1期間中、`todaysBills` と `bills` の差分を検出する。

**実行タイミング**: `STORE_CLOSE_HOUR:30 JST`（nightly再計算後、+30分）
- 例: `STORE_CLOSE_HOUR=27` の場合 → 3:30 JST
- 例: `STORE_CLOSE_HOUR=9` の場合 → 9:30 JST

**実装ファイル**: `functions/src/scripts/nightlyReconciliationCheck.ts`（スケルトン実装済み）

**処理フロー**:
1. `WRITE_TODAYS_BILLS_IN_PARALLEL` フラグをチェック（無効の場合はスキップ）
2. 前営業日の `businessDate` を計算（`calcBusinessDate` を使用）
3. 対象日の全 `bills` を取得（`businessDate` でフィルタ、`status == 'settled'` のみ）
4. 各 `billId` について `todaysBills` と比較:
   - **キー**: `billId`（必要に応じて `userId + businessDate`）
   - **比較フィールド**:
     - `grandTotalRounded`: `todaysBills.totalPrice` vs `bills.amounts.grandTotalRounded`
     - `categoryBreakdown`: `todaysBills` の各カテゴリ合計 vs `bills.categoryBreakdown`
       - `items`: `todaysBills.items` の合計 vs `bills.categoryBreakdown.items`
       - `extraCost`: `todaysBills.extraCost` の合計 vs `bills.categoryBreakdown.extraCost`
       - `sideGameChips`: `todaysBills.sideGameChip` の合計 vs `bills.categoryBreakdown.sideGameChips`
       - `tournaments`: `todaysBills.tournaments` の合計 vs `bills.categoryBreakdown.tournaments`
     - `paymentTotals`: `todaysBills.paymentMethodsByAmount` vs `bills.paymentTotals`
5. 差分を検出:
   - 差分がある場合は警告ログを出力（構造化ログ）
   - 差分レポートを `reconciliationReports/{YYYY-MM-DD}` に保存
     - フィールド: `billId`, `userId`, `businessDate`, `differences: { grandTotalRounded?, categoryBreakdown?, paymentTotals? }`, `timestamp`
6. 自動補正（オプション）:
   - `bills` を正として `todaysBills` を更新（手動補正が必要な場合は管理者に通知）

**差分レポートスキーマ**:
```typescript
interface ReconciliationReport {
  businessDate: string; // YYYY-MM-DD
  reportDate: string; // YYYY-MM-DD（レポート作成日）
  timestamp: admin.firestore.Timestamp;
  totalBills: number;
  billsWithDifferences: number;
  differences: Array<{
    billId: string;
    userId: string;
    differences: {
      grandTotalRounded?: {
        todaysBills: number | null;
        bills: number;
        diff: number;
      };
      categoryBreakdown?: {
        items?: { todaysBills: number | null; bills: number; diff: number };
        extraCost?: { todaysBills: number | null; bills: number; diff: number };
        sideGameChips?: { todaysBills: number | null; bills: number; diff: number };
        tournaments?: { todaysBills: number | null; bills: number; diff: number };
      };
      paymentTotals?: {
        [method: string]: {
          todaysBills: number | null;
          bills: number;
          diff: number;
        };
      };
    };
  }>;
}
```

**ログ出力**:
- 構造化ログ（Cloud Logging）:
  - `op: 'reconciliation_check'`
  - `businessDate: string`
  - `totalBills: number`
  - `billsWithDifferences: number`
  - `diffCount: number`
  - `result: 'ok' | 'warning' | 'error'`

#### 1.2.2 夜間整合確認（`nightlyIntegrityCheck.ts`）

**目的**: データ整合性を確認し、異常を検出する。

**実行タイミング**: `(STORE_CLOSE_HOUR + 1):00 JST`（nightly再計算・差分チェック後、+60分）
- 例: `STORE_CLOSE_HOUR=27` の場合 → 4:00 JST（27 + 1 = 28, 28 % 24 = 4）
- 例: `STORE_CLOSE_HOUR=9` の場合 → 10:00 JST

**実装ファイル**: `functions/src/scripts/nightlyIntegrityCheck.ts`（スケルトン実装済み）

**確認項目**:

1. **bills 整合性**:
   - `status == 'settled'` だが `amounts.grandTotalRounded == 0` のケース
   - `postEvents.netSalesIncl < 0` のケース
   - `paymentsSummary.balanceDueIncl < 0` のケース
   - `postEvents.netSalesIncl != amounts.grandTotalRounded - postEvents.totalRefundedIncl + postEvents.totalAdjustmentsIncl` のケース（不変条件違反）

2. **activeStays 整合性**:
   - `activeStays` が存在するが、対応する `bills.status == 'settled'` のケース（会計確定後も残存）
   - `bills.status != 'settled'` だが `activeStays` が存在しないケース（想定外、通常は存在すべき）

3. **analyticsMonthly 整合性**:
   - `sales.grossIncl` と `categoryBreakdown` の合計が一致しないケース
     - `sales.grossIncl != categoryBreakdown.items + categoryBreakdown.extraCost + categoryBreakdown.sideGameChips + categoryBreakdown.tournaments`
   - `net.netSalesIncl` が `sales.grossIncl - events.totalRefundedIncl + events.totalAdjustmentsIncl` と一致しないケース
   - `net.balanceDueIncl` が nightly再計算の結果と一致しないケース（監査ログのみ、エラーにはしない）

**処理フロー**:
1. 前営業日の `businessDate` を計算
2. 対象日の全 `bills` を取得（`businessDate` でフィルタ）
3. 各整合性チェックを実行:
   - bills整合性: 全 `bills` を走査し、異常を検出
   - activeStays整合性: `activeStays` を全件取得し、対応する `bills` と照合
   - analyticsMonthly整合性: `analyticsMonthly/{YYYY-MM}` と `analyticsMonthly/{YYYY-MM}/days/{businessDate}` を取得し、整合性を確認
4. 異常を検出した場合:
   - 警告ログを出力（構造化ログ）
   - 整合性レポートを `integrityReports/{YYYY-MM-DD}` に保存
5. 自動修復（可能な場合）:
   - `activeStays` の孤立ドキュメントを削除（対応する `bills.status == 'settled'` の場合）
   - その他の異常は手動対応が必要（レポートに記載）

**整合性レポートスキーマ**:
```typescript
interface IntegrityReport {
  businessDate: string; // YYYY-MM-DD
  reportDate: string; // YYYY-MM-DD（レポート作成日）
  timestamp: admin.firestore.Timestamp;
  billsIntegrity: {
    totalChecked: number;
    issues: Array<{
      billId: string;
      issueType: 'zero_grand_total' | 'negative_net_sales' | 'negative_balance_due' | 'invariant_violation';
      details: any;
    }>;
  };
  activeStaysIntegrity: {
    totalChecked: number;
    orphanedActiveStays: Array<{
      userId: string;
      billId: string;
      billsStatus: string;
    }>;
    missingActiveStays: Array<{
      billId: string;
      billsStatus: string;
    }>;
  };
  analyticsMonthlyIntegrity: {
    monthKey: string;
    issues: Array<{
      issueType: 'gross_mismatch' | 'net_sales_mismatch' | 'balance_due_mismatch';
      details: any;
    }>;
  };
}
```

**ログ出力**:
- 構造化ログ（Cloud Logging）:
  - `op: 'integrity_check'`
  - `businessDate: string`
  - `billsIssues: number`
  - `activeStaysIssues: number`
  - `analyticsIssues: number`
  - `result: 'ok' | 'warning' | 'error'`

#### 1.2.3 businessDate 巻き戻し＆監視（`bills.businessDateLock.ts`）

**目的**: `businessDate` の不変性をトリガレベルで保証する（パターンB）。

**実装ファイル**: `functions/src/triggers/bills.businessDateLock.ts`（新規作成）

**発火条件**:
- トリガ種別: Firestore onUpdate
- 対象: `/bills/{billId}` 親ドキュメント
- 条件: `before.businessDate !== after.businessDate`（`businessDate` が変更された場合）

**処理フロー**:
1. `before.businessDate` と `after.businessDate` を比較
2. 変更が検出された場合:
   - エラーログを出力（構造化ログ）
   - `businessDate` を `before.businessDate` に巻き戻し（`tx.update`）
   - 監視レポートを `businessDateLockReports/{YYYY-MM-DD}` に保存
3. アラート通知（オプション）:
   - Cloud Monitoring にアラートを送信
   - 管理者に通知（メール/Slack等）

**監視レポートスキーマ**:
```typescript
interface BusinessDateLockReport {
  billId: string;
  timestamp: admin.firestore.Timestamp;
  beforeBusinessDate: string;
  attemptedBusinessDate: string;
  reverted: boolean;
  userId?: string; // bills.party.userId
}
```

**ログ出力**:
- 構造化ログ（Cloud Logging）:
  - `op: 'business_date_lock'`
  - `billId: string`
  - `beforeBusinessDate: string`
  - `attemptedBusinessDate: string`
  - `reverted: boolean`
  - `result: 'ok' | 'error'`

**テストファイル**: `functions/__tests__/triggers/bills.businessDateLock.spec.ts`（新規作成予定）

**テスト観点**:
- `businessDate` 変更試行 → 巻き戻し成功
- `businessDate` 不変 → トリガ発火なし
- 複数回変更試行 → 毎回巻き戻し
- トランザクション競合時の挙動

---

## P1-12: 親ドキュメントサイズ監視と救済策

### 2.1 目的
`bills` 親ドキュメントのサイズが 1MB を超えないよう監視し、超過時は自動的に救済策を適用する。

### 2.2 実装項目

#### 2.2.1 親ドキュメントサイズ監視（Settlement Trigger 内）

**目的**: 会計確定時に親ドキュメントのサイズを監視し、閾値超過時は警告・救済を実行する。

**実装場所**: `functions/src/triggers/bills.onSettle.ts`（既存実装に追加）

**監視対象**:
- `itemsSnapshot` のサイズ（700KB 超で Top50 圧縮を発動）: **既に実装済み**
- 親ドキュメント全体のサイズ（1MB 超で警告）

**処理フロー**（Settlement Trigger 内）:
1. スナップショット生成後、親ドキュメント全体のサイズを計算:
   ```typescript
   const documentSize = Buffer.byteLength(JSON.stringify(updateData), 'utf8');
   ```
2. サイズチェック:
   - `itemsSnapshot` が 700KB を超えた場合: 警告ログ（既に実装済み、Top50圧縮も実行済み）
   - 親ドキュメントが 1MB を超えた場合:
     - エラーログを出力（構造化ログ）
     - アラート通知（Cloud Monitoring）
     - 救済策を実行（後述）

**救済策**（親ドキュメントが 1MB を超えた場合）:

1. **`itemsSnapshot` の追加圧縮**:
   - Top50 に既に圧縮済みの場合: Top30 に再圧縮
   - Top30 でも 1MB を超える場合: Top20 に再圧縮
   - 閾値: `ITEMS_SNAPSHOT_SIZE_THRESHOLD` を段階的に下げる（700KB → 500KB → 300KB）

2. **`tournamentsSnapshot` の圧縮**:
   - テンプレート別スナップショットを売上額の降順で Top10 に圧縮
   - 残りを `_others` に合算

3. **`sideGameChipsSummary` の簡略化**:
   - 既に最小限の構造だが、必要に応じて詳細を削減

4. **`categoryBreakdown` の保持**:
   - 必須フィールドのため、圧縮対象外

**実装詳細**:

```typescript
// functions/src/helpers/billsApi/snapshots.ts に追加
export const PARENT_DOCUMENT_SIZE_THRESHOLD = 1024 * 1024; // 1MB
export const ITEMS_SNAPSHOT_SIZE_THRESHOLD_STAGE2 = 500 * 1024; // 500KB
export const ITEMS_SNAPSHOT_SIZE_THRESHOLD_STAGE3 = 300 * 1024; // 300KB
export const ITEMS_SNAPSHOT_TOP_N_STAGE2 = 30;
export const ITEMS_SNAPSHOT_TOP_N_STAGE3 = 20;
export const TOURNAMENTS_SNAPSHOT_TOP_N = 10;

/**
 * 親ドキュメントサイズを計算
 */
export function calculateDocumentSize(data: Record<string, any>): number {
  return Buffer.byteLength(JSON.stringify(data), 'utf8');
}

/**
 * itemsSnapshot を段階的に圧縮（1MB超過時の救済策）
 */
export function compressItemsSnapshotIfNeeded(
  snapshot: ItemsSnapshot,
  currentDocumentSize: number,
  threshold: number
): { snapshot: ItemsSnapshot; compressed: boolean; stage: number } {
  if (currentDocumentSize <= threshold) {
    return { snapshot, compressed: false, stage: 0 };
  }

  // Stage 2: Top30
  const stage2Snapshot = compressToTopN(snapshot, ITEMS_SNAPSHOT_TOP_N_STAGE2);
  const stage2Size = Buffer.byteLength(JSON.stringify(stage2Snapshot), 'utf8');
  
  if (currentDocumentSize - stage2Size <= threshold) {
    return { snapshot: stage2Snapshot, compressed: true, stage: 2 };
  }

  // Stage 3: Top20
  const stage3Snapshot = compressToTopN(snapshot, ITEMS_SNAPSHOT_TOP_N_STAGE3);
  return { snapshot: stage3Snapshot, compressed: true, stage: 3 };
}

/**
 * tournamentsSnapshot を圧縮（1MB超過時の救済策）
 */
export function compressTournamentsSnapshotIfNeeded(
  snapshot: TournamentsSnapshot,
  currentDocumentSize: number,
  threshold: number
): { snapshot: TournamentsSnapshot; compressed: boolean } {
  if (currentDocumentSize <= threshold) {
    return { snapshot, compressed: false };
  }

  // 売上額の降順で Top10 を選定
  const sorted = Object.entries(snapshot)
    .sort(([, a], [, b]) => b.totalTournamentSalesIncl - a.totalTournamentSalesIncl)
    .slice(0, TOURNAMENTS_SNAPSHOT_TOP_N);

  const compressed: TournamentsSnapshot = {};
  let othersEntryCount = 0;
  let othersReentryCount = 0;
  let othersAddonCount = 0;
  let othersEntrySalesIncl = 0;
  let othersReentrySalesIncl = 0;
  let othersAddonSalesIncl = 0;
  let othersTotalSalesIncl = 0;
  let othersPointsAwardedTotal = 0;
  let othersPrizeAmountTotalIncl = 0;

  for (const [templateId, data] of sorted) {
    compressed[templateId] = data;
  }

  for (const [templateId, data] of Object.entries(snapshot)) {
    if (!compressed[templateId]) {
      othersEntryCount += data.entryCount || 0;
      othersReentryCount += data.reentryCount || 0;
      othersAddonCount += data.addonCount || 0;
      othersEntrySalesIncl += data.entrySalesIncl || 0;
      othersReentrySalesIncl += data.reentrySalesIncl || 0;
      othersAddonSalesIncl += data.addonSalesIncl || 0;
      othersTotalSalesIncl += data.totalTournamentSalesIncl || 0;
      othersPointsAwardedTotal += data.pointsAwardedTotal || 0;
      othersPrizeAmountTotalIncl += data.prizeAmountTotalIncl || 0;
    }
  }

  if (othersTotalSalesIncl > 0 || othersEntryCount > 0) {
    compressed._others = {
      templateName: 'その他',
      entryCount: othersEntryCount,
      entrySalesIncl: othersEntrySalesIncl,
      reentryCount: othersReentryCount,
      reentrySalesIncl: othersReentrySalesIncl,
      addonCount: othersAddonCount,
      addonSalesIncl: othersAddonSalesIncl,
      totalTournamentSalesIncl: othersTotalSalesIncl,
      pointsAwardedTotal: othersPointsAwardedTotal,
      prizeAmountTotalIncl: othersPrizeAmountTotalIncl,
    };
  }

  return { snapshot: compressed, compressed: true };
}
```

**ログ出力**:
- 構造化ログ（Cloud Logging）:
  - `op: 'document_size_check'`
  - `billId: string`
  - `documentSize: number` (bytes)
  - `itemsSnapshotSize: number` (bytes)
  - `compressed: boolean`
  - `compressionStage: number` (0, 2, 3)
  - `result: 'ok' | 'warning' | 'error'`

#### 2.2.2 サイズ監視レポート

**目的**: 親ドキュメントサイズの監視結果を記録し、傾向を分析する。

**実装場所**: Settlement Trigger 内で、サイズ超過時にレポートを保存

**レポートスキーマ**:
```typescript
interface DocumentSizeReport {
  billId: string;
  businessDate: string;
  timestamp: admin.firestore.Timestamp;
  documentSize: number; // bytes
  itemsSnapshotSize: number; // bytes
  tournamentsSnapshotSize: number; // bytes
  sideGameChipsSummarySize: number; // bytes
  categoryBreakdownSize: number; // bytes
  otherFieldsSize: number; // bytes
  compressed: boolean;
  compressionStage: number; // 0, 2, 3
  exceededThreshold: boolean; // 1MB超過
}
```

**保存先**: `documentSizeReports/{YYYY-MM-DD}`（日次サマリ）

---

## 実装ファイル一覧

### 新規作成
1. `functions/src/triggers/bills.businessDateLock.ts` - businessDate 巻き戻しトリガ
2. `functions/__tests__/triggers/bills.businessDateLock.spec.ts` - businessDate 巻き戻しテスト

### 実装追加・拡張
1. `functions/src/scripts/nightlyReconciliationCheck.ts` - デュアルライト差分チェック実装（TODO部分）
2. `functions/src/scripts/nightlyIntegrityCheck.ts` - 夜間整合確認実装（TODO部分）
3. `functions/src/triggers/bills.onSettle.ts` - 親ドキュメントサイズ監視追加
4. `functions/src/helpers/billsApi/snapshots.ts` - 救済策関数追加

### 既存ファイル（参照・影響あり）
1. `functions/src/config/ops.ts` - スケジュール設定（既存）
2. `functions/src/helpers/billsApi/calcBusinessDate.ts` - businessDate 計算（既存）
3. `functions/src/analytics/aggregator/index.ts` - Analytics集計（整合性チェック対象）

---

## テスト計画

### P1-11 テスト

#### 1. `nightlyReconciliationCheck.spec.ts`（新規作成）
- **テストケース**:
  - 正常ケース: 差分なし
  - 差分検出: `grandTotalRounded` 不一致
  - 差分検出: `categoryBreakdown` 不一致
  - 差分検出: `paymentTotals` 不一致
  - 複数差分検出
  - `WRITE_TODAYS_BILLS_IN_PARALLEL` フラグ無効時はスキップ
  - レポート保存確認

#### 2. `nightlyIntegrityCheck.spec.ts`（新規作成）
- **テストケース**:
  - bills整合性: `zero_grand_total` 検出
  - bills整合性: `negative_net_sales` 検出
  - bills整合性: `negative_balance_due` 検出
  - bills整合性: `invariant_violation` 検出
  - activeStays整合性: 孤立 `activeStays` 検出
  - activeStays整合性: 欠損 `activeStays` 検出
  - analyticsMonthly整合性: `gross_mismatch` 検出
  - analyticsMonthly整合性: `net_sales_mismatch` 検出
  - レポート保存確認

#### 3. `bills.businessDateLock.spec.ts`（新規作成）
- **テストケース**:
  - `businessDate` 変更試行 → 巻き戻し成功
  - `businessDate` 不変 → トリガ発火なし
  - 複数回変更試行 → 毎回巻き戻し
  - トランザクション競合時の挙動
  - レポート保存確認

### P1-12 テスト

#### 1. `snapshots.compress.spec.ts`（新規作成、または既存テスト拡張）
- **テストケース**:
  - `itemsSnapshot` Stage2圧縮（Top30）
  - `itemsSnapshot` Stage3圧縮（Top20）
  - `tournamentsSnapshot` 圧縮（Top10）
  - 親ドキュメントサイズ計算
  - 圧縮後のサイズ確認
  - 圧縮後のデータ整合性確認

#### 2. `bills.onSettle.size.spec.ts`（新規作成、または既存テスト拡張）
- **テストケース**:
  - 1MB超過時の警告ログ
  - 1MB超過時の救済策実行
  - 救済策実行後のサイズ確認
  - レポート保存確認

---

## メトリクス・アラート定義

### Cloud Logging メトリクス

#### P1-11 関連
- `reconciliation_check.diff_count` - デュアルライト差分件数（日次）
- `reconciliation_check.bills_checked` - チェック対象伝票数（日次）
- `integrity_check.bills_issues` - bills整合性問題件数（日次）
- `integrity_check.active_stays_issues` - activeStays整合性問題件数（日次）
- `integrity_check.analytics_issues` - analyticsMonthly整合性問題件数（日次）
- `business_date_lock.reverted_count` - businessDate巻き戻し件数（日次）

#### P1-12 関連
- `document_size_check.exceeded_count` - 1MB超過件数（日次）
- `document_size_check.compressed_count` - 圧縮実行件数（日次）
- `document_size_check.avg_size` - 平均ドキュメントサイズ（日次）
- `document_size_check.max_size` - 最大ドキュメントサイズ（日次）

### アラート条件

#### P1-11 関連
- デュアルライト差分件数 > 10件/日 → 警告
- bills整合性問題 > 5件/日 → 警告
- activeStays整合性問題 > 10件/日 → 警告
- analyticsMonthly整合性問題 > 3件/日 → 警告
- businessDate巻き戻し > 1件/日 → エラー（即座に通知）

#### P1-12 関連
- 1MB超過件数 > 1件/日 → エラー（即座に通知）
- 平均ドキュメントサイズ > 800KB → 警告
- 最大ドキュメントサイズ > 1.2MB → エラー（即座に通知）

---

## 実装順序

1. **P1-12（親ドキュメントサイズ監視）**を先に実装
   - Settlement Trigger への追加が比較的独立しているため
   - 既存の `itemsSnapshot` 圧縮ロジックを拡張

2. **P1-11（監視）**を実装
   - `nightlyReconciliationCheck.ts` の実装
   - `nightlyIntegrityCheck.ts` の実装
   - `bills.businessDateLock.ts` の実装

3. **テスト実装**
   - 各テストファイルを作成
   - 統合テストを実行

4. **メトリクス・アラート設定**
   - Cloud Logging メトリクス定義
   - Cloud Monitoring アラート設定

---

## 注意事項

1. **デュアルライト差分チェック**は Phase1 期間中のみ有効（`WRITE_TODAYS_BILLS_IN_PARALLEL` フラグが無効になったらスキップ）
2. **businessDate 巻き戻し**は即座に実行し、監視レポートに記録（アラート通知も必須）
3. **親ドキュメントサイズ監視**は会計確定時（Settlement Trigger）のみ実行（リアルタイム監視）
4. **救済策**は段階的に適用し、可能な限りデータを保持（Top50 → Top30 → Top20）
5. **整合性チェック**で検出された問題は、可能な限り自動修復を試みるが、手動対応が必要な場合はレポートに明記

---

## 参照ドキュメント

- `docs/bills_migration/tools_and_operations_plan.md` - 監視要件の詳細
- `docs/bills_migration/trigger_plan.md` - トリガ設計
- `docs/bills_migration/schema_plan.md` - スキーマ定義（700KB閾値、Top50等）
- `docs/bills_migration/analytics_plan.md` - Analytics整合性チェックの根拠
- `docs/bills_migration/modification_plan.md` - P1-11/P1-12の概要

