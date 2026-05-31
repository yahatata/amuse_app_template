# 実機確認: settle / resettle の reporting entry 作成

## 前提

- `storeMeta/config.features.reportingAggregatorEnabled = true` が設定されていること
- `storeMeta/taxReportingBehavior` が設定されていること（未設定の場合は defaults が使われる）

---

## 確認 1: 初回 settle（entryType = 'settle'）✅ 確認済み

> 確認日: 2026-05-29  
> 使用 bill: `d17343e1-9fa7-4d21-90dd-38457820b488`  
> 内容: メロンソーダ、トーナメント参加・リエントリー・アドオン、sideGameChip購入、現金14,600円で会計

### 手順

1. 新しい bill を作成する（open 状態）
2. items / extras / sideGameChips / tournaments を追加
3. 支払い情報を入力する
4. 会計（settle）を実行する

### 確認項目

- [x] `reportingEntries/{billId}_settle_1` ドキュメントが作成されていること
- [x] `entryType` が `'settle'` であること
- [x] `billId` が正しいこと
- [x] `cycleNo` が `1` であること
- [x] `reportingMonth` が正しい月（yyyyMM 形式）であること
  - dateRule.settle = 'businessDate' → bill の businessDate から算出
  - dateRule.settle = 'settledAt' → settle 実行時刻から算出
- [x] `eventAt` が settle 実行時刻の Timestamp であること
- [x] `originBusinessDate` が bill の businessDate と一致すること
- [x] `categoryBreakdown` の各カテゴリの amountIncl が bill の categoryBreakdown と一致すること
  - `sideGameChips` → `sideGameChip` にキー変換されていること
- [x] `paymentBreakdown` が bill の paymentTotals と一致すること
- [ ] `categoryPaymentMatrix` が paymentMethodsByCategory に基づいて正しく生成されていること
  - ⚠️ bills に `paymentMethodsByCategory` データなし（null）のため空。アプリ側データの別タスク。
- [x] `reportingMonthly/{yyyyMM}` ドキュメントが作成または更新されていること
- [x] `reportingMonthly/{yyyyMM}/aggregationMarkers/entries_{billId}_settle_1` マーカーが作成されていること

### 冪等性確認

- [x] `aggregationMarkers` パターンにより二重書き込み防止が機能していることを確認（ラウンド1〜2全体を通じて確認済み）
- [x] `reportingMonthly` の集計値が 2 倍にならないこと（マーカーでスキップされること）

---

## 確認 2: resettle（reopen 後の再会計、entryType = 'resettle'）✅ 確認済み

> 確認日: 2026-05-29  
> 使用 bill: `d17343e1-9fa7-4d21-90dd-38457820b488`（cycle 2, 3 まで確認）  
> 内容: 2回 reopen して再会計。cycle2: ビール追加、cycle3: ピザ追加

### 手順

1. 確認 1 で settle した bill を reopen する
2. 必要に応じて修正を加える
3. 再度会計（settle）を実行する

### 確認項目

- [x] `reportingEntries/{billId}_resettle_{cycleNo}` ドキュメントが作成されていること（cycle2, 3 両方確認）
- [x] `entryType` が `'resettle'` であること
- [x] `cycleNo` が正しいこと（2, 3）
- [x] `reportingMonth` が dateRule.resettle に基づいて算出されていること
- [x] `categoryBreakdown` / `paymentBreakdown` が再会計後の値を反映していること
- [x] `reportingMonthly` が正しく更新されていること
- [x] `reopen_rollback` entry が自動作成されていること（`reopenAccountedBill` の reporting rollback 機能）
- [x] `reportingMonthly.totalAmountIncl` の数値整合（全 entry の category 合計 = monthly 値）が一致すること

### 備考

- 初回テスト時（cycle 2 reopen）に `reopen_rollback` エントリが未作成となる不具合を検出・修正済み（`reopenAccountedBill` 再デプロイで解決）
- `totalAmountIncl` / `createdAt` フィールドが初期実装に欠けていたため `entryBuilder.ts` / `types.ts` を修正・再デプロイ済み
- cycle 1, 2 の旧エントリ（`settle_1`, `resettle_2`）は修正前に作成されたため `totalAmountIncl` / `createdAt` なし（monthly 集計には影響なし）

---

## 確認 3: feature flag OFF 時の動作 ✅ 確認済み

> 確認日: 2026-05-29  
> 使用 bill: `011964eb-f0af-43e4-be4b-ec3d9536b562`（flag OFF 状態で会計）

### 手順

1. `storeMeta/config.features.reportingAggregatorEnabled` を `false` に設定（または削除）
2. 新しい bill を settle する

### 確認項目

- [x] `reportingEntries` にドキュメントが作成されないこと
- [x] `reportingMonthly` に影響がないこと（30,400 のまま変化なし）
- [x] settle 自体は正常に完了すること
- [x] analytics（`analyticsMonthly`）も正常に動作すること（marker 存在確認済み）

---

## 確認 4: エラー耐性 ✅ 確認済み

> 確認日: 2026-05-29  
> 使用 bill: `b0a84a7b-1305-4dca-935a-b2d920d99672`  
> 方法: `entryWriter.ts` に意図的 throw を追加してデプロイ（Admin SDK はルールをバイパスするため）

### 手順

1. `entryWriter.writeReportingEntry` が意図的にエラーを throw するよう一時変更してデプロイ
2. bill を settle する
3. 動作確認後、`entryWriter.ts` を元に戻して再デプロイ

### 確認項目

- [x] settle 自体は正常に完了すること
- [x] Cloud Functions のログに `billsOnSettle reporting write failed` が記録されていること
- [x] analytics enqueue は正常に実行されていること（`analyticsMonthly` marker 存在確認）
- [x] `reportingMonthly` に変化がないこと（エラーによりスキップ）
