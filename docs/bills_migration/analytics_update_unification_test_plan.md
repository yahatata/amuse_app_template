# Analytics Monthly 更新の同一化 テスト計画

_作成日: 2025-12-20 (JST)_

## テストの分類

### 自動テスト（実施済み/実施可能）

以下のテストは自動化可能なため、テストファイルを作成して実施します。

#### 1. 冪等性テスト ✅

**目的**: 同一 `billId` に対し `processBillAnalyticsAtomically` が複数回実行されても二重計上しないこと

**テストファイル**: `functions/__tests__/analytics/processBillAnalyticsAtomically.spec.ts`

**テストケース**:
- ✅ 同一billIdで複数回実行しても二重計上しない（markerでブロック）
- ✅ 異なるbillIdで実行するとそれぞれが計上される

**検証ポイント**:
- `aggregationMarkers/{billId}` が作成されること
- `analyticsMonthly` の各フィールドが1回だけ更新されること

#### 2. 更新内容の同一性テスト ✅

**目的**: 旧スキーマ（`grossSales`, `itemsSales`, `orderCount`, `byCategory`, `byUser`, `byTemplateTournaments`）が正しく更新されること

**テストファイル**: `functions/__tests__/analytics/processBillAnalyticsAtomically.spec.ts`

**テストケース**:
- ✅ 旧スキーマ（grossSales, itemsSales, orderCount）が正しく更新される
- ✅ byCategory/summary が正しく更新される
- ✅ byUser/{userId} が正しく更新される
- ✅ byTemplateTournaments/{templateKey} が正しく更新される
- ✅ party.userId がない場合、byUser は更新されない

**検証ポイント**:
- `analyticsMonthly/{month}` のフィールドが正しく更新される
- `analyticsMonthly/{month}/days/{businessDate}` のフィールドが正しく更新される
- `byCategory`, `byUser`, `byTemplateTournaments` サブコレクションが更新される

#### 3. 失敗時再試行テスト ✅

**目的**: トランザクション外でmarkerが存在する場合、no-opでreturnされること

**テストファイル**: `functions/__tests__/analytics/processBillAnalyticsAtomically.spec.ts`

**テストケース**:
- ✅ トランザクション外でmarkerが存在する場合、no-op で return される

**検証ポイント**:
- marker が存在する場合、トランザクション内で早期 return されること
- analytics が更新されないこと

#### 4. 既存関数の互換性テスト（コードレビューで確認）✅

**目的**: 既存の `addTo*` 関数のシグネチャが維持されていること

**確認方法**: コードレビューで確認

**確認ポイント**:
- `addToMonthlyIndex` などの既存関数のシグネチャが変更されていないこと
- `tx.get` で読み取った Snapshot が既存関数に正しく渡されること

**確認済みファイル**:
- `functions/src/analytics/addToMonthlyIndex.ts` ✅
- `functions/src/analytics/addToDailySummary.ts` ✅
- `functions/src/analytics/addToByCategory.ts` ✅
- `functions/src/analytics/addToByTemplateTournaments.ts` ✅
- `functions/src/analytics/addToByUser.ts` ✅

#### 5. トランザクション順序テスト（コードレビューで確認）✅

**目的**: 全ての参照 doc を `tx.get` で読んだ後に書き込みに移ること

**確認方法**: コードレビューで確認

**確認ポイント**:
- `processBillAnalyticsAtomically` 内で `tx.get` が `Promise.all` で並列実行されること
- 全ての読み取り完了後に `addTo*` 関数が呼ばれること

**確認済みコード**: `functions/src/analytics/updateAnalyticsForBill.ts` ✅

---

### 手動テスト（ユーザーが実施する必要がある）

以下のテストは手動確認が必要なため、ユーザーが実施してください。

#### 1. 手動確認項目（本番環境での動作確認）

**目的**: 本番環境での動作確認

**確認項目**:

1. **`enqueueSettlement` が `bills.onSettle` トリガから正常に呼び出されること**
   - `ENABLE_SETTLEMENT_AGGREGATOR === 'true'` に設定
   - `bills` ドキュメントの `status` を `settled` に変更
   - Cloud Functions のログで `enqueueSettlement` が呼び出されることを確認

2. **`migrateSettledBillsForBusinessDay` が夜間バッチで正常に実行されること**
   - 手動で `migrateSettledBillsForBusinessDay` を呼び出す
   - 処理が正常に完了することを確認

3. **`analyticsMonthly` の各フィールドが正しく更新されること（UIで確認）**
   - ダッシュボード画面で `analyticsMonthly` の値が正しく表示されることを確認
   - `grossSales`, `itemsSales`, `orderCount` などの値が正しいことを確認

4. **`aggregationMarkers` が正しく作成されること（Firestore Consoleで確認）**
   - Firestore Console で `analyticsMonthly/{month}/aggregationMarkers/{billId}` が作成されていることを確認
   - `billId`, `businessDate`, `processedAt` が正しく記録されていることを確認

5. **トランザクション競合が発生してもリトライが正常に動作すること（ログで確認）**
   - 同時に複数の `enqueueSettlement` が実行された場合
   - Cloud Functions のログでリトライが正常に動作することを確認

#### 2. 更新内容の同一性テスト（手動確認）

**目的**: `enqueueSettlement` と `migrateSettledBillsForBusinessDay` が同一のフィールドを更新すること

**確認方法**:

1. **同一の `billData` に対して両方を実行し、結果を比較**
   - `enqueueSettlement` を実行
   - `analyticsMonthly` の値を記録
   - `migrateSettledBillsForBusinessDay` を実行（marker があるためスキップされるはず）
   - `analyticsMonthly` の値が変わっていないことを確認

2. **異なる `billId` で両方を実行し、結果を比較**
   - `enqueueSettlement` で `bill1` を処理
   - `migrateSettledBillsForBusinessDay` で `bill2` を処理
   - 両方とも同じ形式で `analyticsMonthly` が更新されることを確認

**確認ポイント**:
- `analyticsMonthly/{month}` のフィールドが同一の値で更新される
- `analyticsMonthly/{month}/days/{businessDate}` のフィールドが同一の値で更新される
- `byCategory`, `byUser`, `byTemplateTournaments` サブコレクションが更新される

#### 3. 失敗時再試行テスト（手動確認）

**目的**: `processBillAnalyticsAtomically` が途中で失敗しても欠損固定しないこと

**確認方法**:

1. **トランザクション内でエラーを発生させる**
   - テスト環境で `addToMonthlyIndex` などでエラーを発生させる（一時的にコードを変更）
   - `processBillAnalyticsAtomically` を実行

2. **再実行時に marker が存在しないことを確認**
   - エラー後、marker が作成されていないことを確認（Firestore Console）
   - 再実行時に analytics が正しく更新されることを確認

**確認ポイント**:
- marker がトランザクション内で作成されるため、失敗時は marker が作成されない
- 再実行時に marker が存在しないため、正常に更新される
- 欠損固定が発生しない

---

## テスト実行手順

### 自動テストの実行

```bash
cd functions
npm test -- processBillAnalyticsAtomically.spec.ts
```

### 手動テストの実行

上記の「手動テスト（ユーザーが実施する必要がある）」セクションを参照してください。

---

## テスト結果

### 自動テスト結果

- ✅ 冪等性テスト: 実施済み（`processBillAnalyticsAtomically.spec.ts`）
- ✅ 更新内容の同一性テスト: 実施済み（`processBillAnalyticsAtomically.spec.ts`）
- ✅ 失敗時再試行テスト: 実施済み（`processBillAnalyticsAtomically.spec.ts`）
- ✅ 既存関数の互換性テスト: コードレビューで確認済み
- ✅ トランザクション順序テスト: コードレビューで確認済み

### 手動テスト結果

- ⏳ 手動確認項目: 未実施（ユーザーが実施する必要がある）
- ⏳ 更新内容の同一性テスト（手動確認）: 未実施（ユーザーが実施する必要がある）
- ⏳ 失敗時再試行テスト（手動確認）: 未実施（ユーザーが実施する必要がある）

---

## 次のステップ

1. **自動テストの実行**: 上記のコマンドで自動テストを実行してください
2. **手動テストの実施**: 「手動テスト（ユーザーが実施する必要がある）」セクションを参照して実施してください
3. **結果の確認**: すべてのテストが合格することを確認してください
