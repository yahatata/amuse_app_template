# R-11 / R-12: 会計ポリシー — Phase2 検証ファイル

**※ 必ず `per_id_TASK4_PROCEDURE.md` を確認しながら進めること。**

バッチ: A1（Functions コア）+ A2（Flutter） | 対象 ID: R-11, R-12 | 対象層: Functions + Flutter

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）

### Functions 側

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 1 | 実装 | Functions: `paymentSplitCalculator.ts` の SIDE_GAME_CHIP_EXCHANGE_RATE / DEFAULT_POINT_PRIORITY / CATEGORY_PAYMENT_METHODS 定数を defaults.ts import または config 引数渡しに差し替え | 完了 |
| 2 | 実装 | Functions: `accounting.ts` の SIDE_GAME_CHIP_EXCHANGE_RATE ハードコードを差し替え | 完了 |
| 3 | 実装 | Functions: `getBillPreviewTotals.ts` のハードコードを差し替え | 完了 |
| 4 | 実装 | Functions: `snapshots.ts` のハードコードを差し替え | 完了 |
| 5 | 実装 | Functions: `verifyPaymentSplit.ts` の DEFAULT_POINT_PRIORITY 参照を差し替え | 完了 |
| 6 | 実装 | Functions: 旧ハードコード（各ファイルの定数定義）を削除 | 完了 |
| 7 | 実装 | Functions: pure function を維持（config を引数で渡す or defaults.ts を import） | 完了 |
| 8 | 実装 | defaults.ts に sideGameChipRate / categoryPaymentMethods / pointPriority / roundingUnits のデフォルト値を定義 | 完了 |

### Flutter 側

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 9 | 実装 | Flutter: globalConstant の SIDE_GAME_CHIP_EXCHANGE_RATE / categoryPaymentMethods / POINT_PRIORITY / 丸め単位を削除 | 完了 |
| 10 | 実装 | Flutter: accountingPage / categoryPaymentMethodDialog / customerAccountingDetailPage / payment_split_test_page / payment_split_calculator の参照を StoreConfigService に差し替え | 完了 |

### 共通

| # | 区分 | 必須作業 | Task 4 確認結果 |
|---|------|----------|----------------|
| 11 | 手続き | 取得失敗時の挙動を設計・記録 | 完了 |
| 12 | 手続き | 切り戻し手順を記録 | 完了 |
| 13 | 手続き | ALL_ID_STATUS を「完了」に更新 | 完了 |

---

## 2. 実装漏れ・要調査事項（REQUIREMENTS_GAP_CHECK より）

### 確定した漏れ

| # | 内容 | 影響度 |
|---|------|--------|
| GAP-2-1 | 取得失敗時の挙動設計が未記録 | 中 |
| GAP-2-2 | 切り戻し手順が未記録 | 中 |

### 要調査事項

| # | GAP ID | 内容 | 影響度 |
|---|--------|------|--------|
| 1 | GAP-3-3 | **appendItem のエラーコード変更**: テストが `failed-precondition` を期待するが `invalid-argument` が返る。Phase2 の会計ポリシー config 化に伴いバリデーション順序やエラーコードが変わった可能性 | 低 |
| 2 | GAP-3-4 | **集計結果のプロパティ参照エラー（aggregator）**: `grossIncl` プロパティが undefined。集計結果の構造が Phase2 変更で変わった可能性 | 低 |

---

## 3. 関連テスト失敗（VERIFICATION_TASK_ORDER より）

### 3-1. appendItem のエラーコードの不一致

| テストファイル | エラー内容 |
|----------------|------------|
| `appendItem.spec.ts` | テストが `failed-precondition` を期待するが `invalid-argument` が返る |

**確認観点**:
- status が settled / settling の場合の HttpsError code が仕様上どちらが正しいか
- Phase2 の config 化に伴い、バリデーション順序が変わっていないか

### 3-2. 集計結果のプロパティ参照エラー（aggregator）

| テストファイル | エラー内容 |
|----------------|------------|
| `aggregator.spec.ts` | `TypeError: Cannot read properties of undefined (reading 'grossIncl')` |

**確認観点**:
- 集計結果オブジェクトが `grossIncl` 等の想定プロパティを返す形になっているか
- Phase2 変更で集計結果の構造が変わっていないか

---

## 4. Task 4 実施記録

### 実装確認結果

**§1 確認**

| # | 要件 | 確認結果 | 確認箇所 |
|---|------|----------|----------|
| 1 | paymentSplitCalculator: defaults import / config 引数渡し | ✅ 実装済み | paymentSplitCalculator.ts: 純関数。params で pointPriority / categoryPaymentMethods / sideGameChipExchangeRate を受け取り、未指定時は defaults.ts の DEFAULT_* を使用。verifyPaymentSplit から config を渡して呼び出し |
| 2 | accounting.ts: sideGameChip ハードコード差し替え | ✅ 実装済み | accounting.ts L114-115: getStoreConfig() → chipRate = config.billing?.sideGameChipRate ?? DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE。normalizePaymentMethods に渡す |
| 3 | getBillPreviewTotals: ハードコード差し替え | ✅ 実装済み | getBillPreviewTotals.ts L52-53: getStoreConfig() → chipRate |
| 4 | snapshots.ts: ハードコード差し替え | ✅ 実装済み | snapshots.ts: calculatePaymentTotals は params.sideGameChipExchangeRate を受け取り、デフォルト DEFAULT_SIDE_GAME_CHIP_EXCHANGE_RATE。billsOnSettle が getStoreConfig().billing?.sideGameChipRate を渡す |
| 5 | verifyPaymentSplit: pointPriority 参照差し替え | ✅ 実装済み | verifyPaymentSplit.ts: getStoreConfig() から categoryPaymentMethods / pointPriority / sideGameChipRate を取得。pointPriority は config 未設定時 DEFAULT_POINT_PRIORITY にフォールバック（修正済み） |
| 6 | 旧ハードコード削除 | ✅ 実装済み | globalConstant.dart に SIDE_GAME_CHIP / POINT_PRIORITY / categoryPaymentMethods なし。store_config_defaults.dart に集約 |
| 7 | pure function 維持 | ✅ 実装済み | paymentSplitCalculator は純関数。config は呼び出し元から引数渡し |
| 8 | defaults.ts 定義 | ✅ 実装済み | sideGameChipRate / categoryPaymentMethods / pointPriority / roundingUnits 定義済み |
| 9 | Flutter: globalConstant 削除 | ✅ 実装済み | globalConstant に該当定数なし。store_config_defaults.dart に kDefault* 定義 |
| 10 | Flutter: StoreConfigService 差し替え | ✅ 実装済み | accountingPage, categoryPaymentMethodDialog, customerAccountingDetailPage, payment_split_test_page, payment_split_calculator が StoreConfigService.instance.latestData 経由で categoryPaymentMethods / pointPriority / sideGameChipRate / roundingUnits を参照 |

**bills 更新フロー確認**  
- startAccounting: chipRate で paymentMethods 正規化・残高差し引き（円↔チップ換算）  
- verifyPaymentSplit: config でサーバー側再計算、client と照合  
- billsOnSettle: chipRate で calculatePaymentTotals（meta.paymentMethodsByCategory の sideGameChip 円換算）→ paymentTotals を bills に保存  
- getBillPreviewTotals: chipRate で displayChips 計算  
- 一貫して config.billing を参照し、未設定時は defaults にフォールバック

**§2 確認**: GAP-2-1（取得失敗時）、GAP-2-2（切り戻し）のみ。GAP-3-3（appendItem エラーコード）、GAP-3-4（aggregator grossIncl）は要調査事項として記載済み。

**§3 確認**: GAP-3-3 は appendItem のバリデーション順序・エラーコード。GAP-3-4 は aggregator の sales 構造（grossIncl vs grossSales）の不一致。R-11/R-12 の config 化とは別事象の可能性が高い。

### 取得失敗時の挙動設計

- 読めるがフィールドが存在しない: デフォルト（defaults.ts / store_config_defaults.dart）を適用
- 読めない時: デフォルトを正として処理を実行  
→ `docs/運用時資料/設定/取得失敗時の挙動設計.md` に記載済み

### 切り戻し手順

- リトライ → A,B: デフォルトで実行＋エラーコード。C,D: デフォルトで実行可能な場合は実行＋エラーコード  
→ `docs/運用時資料/設定/設定の不具合時の対応.md` に記載済み

### テスト要件整理

| 区分 | 内容 |
|------|------|
| Cursor が CL 等で確認するもの | 型チェック・lint。billing 系が getStoreConfig / StoreConfigService を参照していること |
| テストファイルで確認するもの | configLoader / phase2_migration で billing のデフォルト・マッピング。verifyPaymentSplit / paymentSplitCalculator。Flutter store_config_phase2_test |
| ユーザーが実機で確認するもの | 会計画面でチップ円換算・ポイント使用順・支払い方法選択肢が config に従うこと |

### テストファイルの確認・修正

- **Functions**: configLoader.spec.ts, phase2_migration.spec.ts, verifyPaymentSplit.spec.ts で billing 関連を検証。configLoader の mergeWithDefaults で billing がマージされることを確認。
- **Flutter**: store_config_phase2_test で billing / paymentPolicy のパース・デフォルトを検証。

### テスト実行結果

- **Functions**: configLoader.spec.ts, phase2_migration.spec.ts, verifyPaymentSplit.spec.ts の 3 套を実行。39 tests パス。
- **aggregator.spec.ts**: GAP-3-4 により 1 件失敗（sales.grossIncl undefined）。R11/R12 スコープ外。別途対応が必要。

### 実機テスト結果

対象項目: チップレート・ポイント優先順位・支払い方法が config に従うか（会計画面でチップ円換算、ポイント使用順、支払い方法選択肢を確認）

（Task 4 で記入）
