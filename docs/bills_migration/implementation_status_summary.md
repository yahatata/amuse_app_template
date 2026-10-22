# 実装状況サマリー

_最終更新: 2025-12-20 (JST)_

## 概要

`docs/bills_migration` 内のドキュメントと実装コードを確認し、まだ実装が終わっていないもの、実装の必要のあるもの、修正が必要なものについてまとめました。

---

## フェーズ1（並走・段階移行）の未実装項目

### P1-11: 監視

**状態**: 未着手（スケルトン実装のみ）

**必要な実装**:

1. **`nightlyReconciliationCheck.ts`** (`functions/src/scripts/nightlyReconciliationCheck.ts`)
   - **現状**: スケルトン実装のみ（TODO部分が残っている）
   - **必要な実装**:
     - 前営業日の `businessDate` を計算
     - 対象日の全 `bills` を取得（`businessDate` でフィルタ、`status == 'settled'` のみ）
     - 各 `billId` について `todaysBills` と比較（`grandTotalRounded`, `categoryBreakdown`, `paymentTotals`）
     - 差分を検出し、Cloud Logging に警告ログを出力
     - 差分レポートを `reconciliationReports/{YYYY-MM-DD}` に保存
   - **参照ドキュメント**: `P1-11_P1-12_detailed_plan.md` §1.2.1

2. **`nightlyIntegrityCheck.ts`** (`functions/src/scripts/nightlyIntegrityCheck.ts`)
   - **現状**: スケルトン実装のみ（TODO部分が残っている）
   - **必要な実装**:
     - bills 整合性チェック（`zero_grand_total`, `negative_net_sales`, `negative_balance_due`, `invariant_violation`）
     - activeStays 整合性チェック（孤立 `activeStays`, 欠損 `activeStays`）
     - analyticsMonthly 整合性チェック（`gross_mismatch`, `net_sales_mismatch`, `balance_due_mismatch`）
     - 整合性レポートを `integrityReports/{YYYY-MM-DD}` に保存
     - 自動修復（可能な場合）
   - **参照ドキュメント**: `P1-11_P1-12_detailed_plan.md` §1.2.2

3. **`bills.businessDateLock.ts`** (`functions/src/triggers/bills.businessDateLock.ts`)
   - **現状**: ファイルが存在しない（新規作成が必要）
   - **必要な実装**:
     - Firestore onUpdate トリガ（`/bills/{billId}` 親ドキュメント）
     - `before.businessDate !== after.businessDate` を検出
     - `businessDate` を `before.businessDate` に巻き戻し（`tx.update`）
     - 監視レポートを `businessDateLockReports/{YYYY-MM-DD}` に保存
     - Cloud Monitoring にアラートを送信（オプション）
   - **参照ドキュメント**: `P1-11_P1-12_detailed_plan.md` §1.2.3

4. **テストファイル**
   - `functions/__tests__/scripts/nightlyReconciliationCheck.spec.ts`（新規作成）
   - `functions/__tests__/scripts/nightlyIntegrityCheck.spec.ts`（新規作成）
   - `functions/__tests__/triggers/bills.businessDateLock.spec.ts`（新規作成）

**参照ドキュメント**: `P1-11_P1-12_detailed_plan.md`

---

### P1-12: 親ドキュメントサイズ監視と救済策

**状態**: 未着手

**必要な実装**:

1. **`bills.onSettle.ts`** (`functions/src/triggers/bills.onSettle.ts`)
   - **現状**: `itemsSnapshot` の700KB超過チェックとTop50圧縮は実装済み
   - **必要な追加実装**:
     - 親ドキュメント全体のサイズ計算（`Buffer.byteLength(JSON.stringify(updateData), 'utf8')`）
     - 1MB超過チェック
     - 1MB超過時の救済策実行:
       - `itemsSnapshot` の追加圧縮（Top30, Top20）
       - `tournamentsSnapshot` の圧縮（Top10）
     - サイズ監視レポートを `documentSizeReports/{YYYY-MM-DD}` に保存
   - **参照ドキュメント**: `P1-11_P1-12_detailed_plan.md` §2.2.1

2. **`snapshots.ts`** (`functions/src/helpers/billsApi/snapshots.ts`)
   - **必要な追加関数**:
     - `calculateDocumentSize()`: 親ドキュメントサイズを計算
     - `compressItemsSnapshotIfNeeded()`: itemsSnapshot を段階的に圧縮（Stage2: Top30, Stage3: Top20）
     - `compressTournamentsSnapshotIfNeeded()`: tournamentsSnapshot を圧縮（Top10）
   - **必要な定数**:
     - `PARENT_DOCUMENT_SIZE_THRESHOLD = 1024 * 1024` (1MB)
     - `ITEMS_SNAPSHOT_SIZE_THRESHOLD_STAGE2 = 500 * 1024` (500KB)
     - `ITEMS_SNAPSHOT_SIZE_THRESHOLD_STAGE3 = 300 * 1024` (300KB)
     - `ITEMS_SNAPSHOT_TOP_N_STAGE2 = 30`
     - `ITEMS_SNAPSHOT_TOP_N_STAGE3 = 20`
     - `TOURNAMENTS_SNAPSHOT_TOP_N = 10`
   - **参照ドキュメント**: `P1-11_P1-12_detailed_plan.md` §2.2.1（実装詳細コード例あり）

3. **テストファイル**
   - `functions/__tests__/helpers/billsApi/snapshots.compress.spec.ts`（新規作成、または既存テスト拡張）
   - `functions/__tests__/triggers/bills.onSettle.size.spec.ts`（新規作成、または既存テスト拡張）

**参照ドキュメント**: `P1-11_P1-12_detailed_plan.md` §2

---

### P1-14: レスポンス確認

**状態**: 未着手（確認作業のみ、実装不要）

**必要な確認作業**:

1. **P1-08で実装したFunctionsのレスポンス形式確認**
   - `getUserOrderHistory.ts`: レスポンス形式とクライアント側の使用状況
   - `verifyPaymentSplit.ts`: レスポンス形式とクライアント側の使用状況
   - `getOpenBills.ts`: レスポンス形式変更（`todaysBillsId` → `billId`）に対するクライアント側の対応状況

2. **P1-01〜P1-08で実装したすべてのFunctionsについて、実際の使用箇所とレスポンス形式の整合性を確認**

**参照ドキュメント**: `modification_plan.md` P1-14

---

## フェーズ2（撤去・クリーンアップ）の未実装項目

### P2-01〜P2-07: 撤去・クリーンアップ

**状態**: 全て未着手

**P2-01: 書き込み停止**
- `todaysBills` への write をルールで拒否
- 監視用途で read は暫定許可
- **成果物**: `firestore.rules`
- **前提条件**: デュアルライト停止

**P2-02: 読み取り停止**
- 7 日連続でアクセスゼロを確認後、読取も完全停止
- **成果物**: Flutter/Functions 更新
- **前提条件**: 監視レポート

**P2-03: 退避**
- 旧コレクションをエクスポート／バックアップ
- **成果物**: GCS / BigQuery エクスポート
- **前提条件**: P2-02

**P2-04: 削除**
- `todaysBills`, `settledBills`, `accountingHistory` を削除
- **成果物**: 管理者オペレーション記録
- **前提条件**: バックアップ完了

**P2-05: 終了報告**
- Analytics 確認・最終報告書・ドキュメント整理
- **成果物**: レポート、フォルダ整理
- **前提条件**: P2-04

**P2-06: Analytics 再計算**
- 直近 30 日分の再計算ジョブを実行し、数値整合を検収
- **成果物**: 再計算スクリプト、レポート
- **前提条件**: P2-05

**P2-07: ルール最終化**
- 旧コレクションへの read/write を完全 deny
- 最終ルールをデプロイ
- **成果物**: `firestore.rules`
- **前提条件**: P2-02

**参照ドキュメント**: `modification_plan.md` §フェーズ2

---

## 修正が必要な項目

### bills.onSettle の発火条件について（P1-10）

**問題点**:
- `bills.onSettle` トリガは `before.status !== 'settled' && after.status === 'settled'` で発火
- つまり、`open` / `in_progress` / `settling` のどれからでも `settled` に遷移すれば発火する
- 当初の観点（骨組み）では「`settling -> settled` 遷移で発火」を想定していた
- 現在の実装では `open -> settled` でも発火するため、会計開始フロー（`startAccounting`）をすっ飛ばしてスナップショット確定できてしまう可能性がある

**現在の実装**:
```typescript
// functions/src/triggers/bills.onSettle.ts (line 46-49)
// 発火条件: before.status !== 'settled' && after.status === 'settled'
if (beforeStatus === 'settled' || afterStatus !== 'settled') {
  return;
}
```

**必要な判断**:
1. **正しい仕様が「`settling` 経由のみ」の場合**:
   - 現在の実装は誤り
   - `open -> settled` を許すべきではない
   - 発火条件を `beforeStatus === 'settling' && afterStatus === 'settled'` に変更する必要がある

2. **正しい仕様が「何からでも `settled` に行ったら確定すべき」の場合**:
   - 現在の実装は正しい
   - ただし、設計上の重要な決定なので ChangeSpec/trigger_plan.md 等に明文化が必要

**現状の追加ガード**:
```typescript
// functions/src/triggers/bills.onSettle.ts (line 51-56)
// 追加ガード: ops.accountingStartedAt または ops.accountingCompletedAt が存在することを確認
const ops = afterData.ops || {};
if (!ops.accountingStartedAt && !ops.accountingCompletedAt) {
  logger.warn('billsOnSettle: ops.accountingStartedAt and ops.accountingCompletedAt are both missing', { billId });
  return;
}
```
- 現在の実装では、`ops.accountingStartedAt` または `ops.accountingCompletedAt` が存在することを確認しているが、これは `startAccounting` をすっ飛ばした場合でも `completeAccountingV2` で `ops.accountingCompletedAt` が設定されるため、完全な保護にはなっていない

**対応**:
- 仕様を確定し、必要に応じて実装を修正するか、ドキュメントに明文化する
- この判断は明確な指示があった場合にのみ実施する（現時点では未確定）

**参照ドキュメント**: `README.md` §危険点（要判断・要修正候補）

---

## 実装済み項目（参考）

### P1-01〜P1-10: 完了

- **P1-01**: 入店フロー ✅
- **P1-02**: 注文フロー ✅
- **P1-02.1**: 注文（仕上げ） ✅
- **P1-03**: サイドゲームフロー ✅
- **P1-04**: 座席管理 ✅
- **P1-05**: トーナメント管理 ✅
- **P1-06**: 会計開始・会計前編集 ✅
- **P1-07**: 事後イベント & 会計後調整 ✅
- **P1-08**: 読み取り（Functions） ✅
- **P1-09**: 読み取り（Flutter） ✅
- **P1-10**: 閉店バッチ ✅

**P1-13**: Flutter リスナー - P1-09に統合済み ✅

**詳細**: `modification_plan.md` を参照

---

## メトリクス・アラート定義（未実装）

### P1-11 関連
- `reconciliation_check.diff_count` - デュアルライト差分件数（日次）
- `reconciliation_check.bills_checked` - チェック対象伝票数（日次）
- `integrity_check.bills_issues` - bills整合性問題件数（日次）
- `integrity_check.active_stays_issues` - activeStays整合性問題件数（日次）
- `integrity_check.analytics_issues` - analyticsMonthly整合性問題件数（日次）
- `business_date_lock.reverted_count` - businessDate巻き戻し件数（日次）

### P1-12 関連
- `document_size_check.exceeded_count` - 1MB超過件数（日次）
- `document_size_check.compressed_count` - 圧縮実行件数（日次）
- `document_size_check.avg_size` - 平均ドキュメントサイズ（日次）
- `document_size_check.max_size` - 最大ドキュメントサイズ（日次）

### アラート条件（未設定）
- デュアルライト差分件数 > 10件/日 → 警告
- bills整合性問題 > 5件/日 → 警告
- activeStays整合性問題 > 10件/日 → 警告
- analyticsMonthly整合性問題 > 3件/日 → 警告
- businessDate巻き戻し > 1件/日 → エラー（即座に通知）
- 1MB超過件数 > 1件/日 → エラー（即座に通知）
- 平均ドキュメントサイズ > 800KB → 警告
- 最大ドキュメントサイズ > 1.2MB → エラー（即座に通知）

**参照ドキュメント**: `P1-11_P1-12_detailed_plan.md` §メトリクス・アラート定義

---

## 実装順序の推奨

1. **P1-12（親ドキュメントサイズ監視）**を先に実装
   - Settlement Trigger への追加が比較的独立しているため
   - 既存の `itemsSnapshot` 圧縮ロジックを拡張

2. **P1-11（監視）**を実装
   - `nightlyReconciliationCheck.ts` の実装
   - `nightlyIntegrityCheck.ts` の実装
   - `bills.businessDateLock.ts` の実装

3. **P1-14（レスポンス確認）**を実施
   - 確認作業のみ（実装不要）

4. **フェーズ2（撤去・クリーンアップ）**は、フェーズ1が完全に完了してから着手

**参照ドキュメント**: `P1-11_P1-12_detailed_plan.md` §実装順序

---

## 参照ドキュメント

- `modification_plan.md`: フェーズ別の改修タスクと進捗管理
- `P1-11_P1-12_detailed_plan.md`: P1-11/P1-12の詳細実装計画
- `README.md`: プロジェクト概要・進捗状況・危険点
- `trigger_plan.md`: トリガ設計（bills.onSettleの発火条件に関する記載あり）
- `api_contract.md`: Bills API 契約書
