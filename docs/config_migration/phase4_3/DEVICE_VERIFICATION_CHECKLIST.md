# Phase 4.3 — 実機・手動確認チェックリスト

`per_step` 各ステップの `VERIFICATION_LOG.md` / `changeSpec.md` に記載された確認項目を、ステップ順に集約したものです。  
確認したら `- [ ]` を `- [x]` に更新してください。

---

## Step 01 — 基盤・設定整備

### Callable / Firestore

- [x] `initializeStoreConfigCallable` をエミュレータで呼び出し、`storeMeta/payrollConfig` が全16フィールド + `updatedAt` で作成される
- [x] 本番相当: Firebase コンソール経由の初期化フローで `storeMeta/payrollConfig` が意図どおり作成される（changeSpec の「コンソールでの初期化フロー」）

### Flutter

- [x] アプリ起動後、Firestore Console で `payrollConfig` を変更 → `PayrollConfigService` の `stream` にリアルタイム反映される

---

## Step 02 — attendance フィールド & onWrite トリガー

- [x] `clockIn` 実行 → `weekday`, `weekStartDate`, `paymentPeriodKey`, `payrollStatus=unreflected` が付与される
- [ ] 深夜帯に休憩を含む退勤 → `nightWorkMinutes` が休憩控除後の値になる
- [ ] `reflected` の attendance を編集 → `payrollStatus=corrected_after_reflection` に遷移する

---

## Step 03 — getPayrollCandidates

（ドキュメント上は「手動確認」。実機という語は未使用）

- [ ] `firebase deploy --only functions:getPayrollCandidates` で Callable がデプロイ可能
- [ ] Flutter から `getPayrollCandidates` を呼び出せる（計算タブ UI 経由で可）

---

## Step 04 — コア計算エンジン

（実機・手動確認の専用項目なし — 単体テストでカバー）

- [ ] 追加の実機確認は不要（必要なら計算結果のスポット確認のみ）

---

## Step 05 — 分散実行（Cloud Tasks 等）

- [ ] Emulator E2E: Cloud Tasks + Firestore Emulator で `executeMonthlyPayroll` → `processStaffPayroll` → `finalizePayrollRun` の流れを手動確認
- [ ] ステージング環境へのデプロイ後、想定どおり動作する

---

## Step 06 — 確定・再実行・中止

### changeSpec「実機確認が必要な項目」

- [ ] `retryFailedStaffTasks` 後に Cloud Tasks 経由で `processStaffPayroll` が正しく再実行される
- [ ] キャリーオーバー: 元期間の confirmed `staffResults` に `deferredAttendances` が追記される
- [ ] `attendanceLogs` に `payroll_confirmed` / `carry_over_deferred` が正しく書き込まれる

### Emulator 手動（VERIFICATION_LOG）

- [ ] `confirmPayrollRun` E2E
- [ ] `retryFailedStaffTasks` E2E
- [ ] `cancelPayrollRun` E2E
- [ ] `attendanceLogs` 書き込み（上記と重複する場合はまとめて可）

---

## Step 07 — 支払い管理（registerPaymentStatus）

### 実機確認事項（changeSpec）

- [ ] Emulator で Flutter から `registerPaymentStatus` を呼び出し、各 `staff` の `paymentStatus` が正しく更新される
- [ ] 全 staff `paid` → `monthlyPayroll.status` が `"paid"` になる
- [ ] 一部 `hold` → `monthlyPayroll.status` が `"hold"` になる
- [ ] Firestore コンソールで `payment_registered` / `payment_hold` の `attendanceLogs` が正しい
- [ ] 冪等性: 同一 staff に同一 status を再送 → `paid` は reject、`hold` は skip など仕様どおり

### VERIFICATION_LOG（Emulator）

- [ ] 上記を Emulator 手動で一通り（重複チェック可）

---

## Step 08 — 計算タブ UI

- [ ] **M-1** adminHome → 給与計算画面へ遷移
- [ ] **M-2** 「対象データの抽出を開始する」等・抽出ボタン表示
- [ ] **M-3** 属性別セクション表示
- [ ] **M-4** 属性1チェック外し時に確認ダイアログ
- [ ] **M-5** 集計プレビュー（件数・時間・expectedRange 外警告）
- [ ] **M-6** 計算実行 → 進捗表示・進捗バー更新
- [ ] **M-7** `completed` → 結果タブへ自動遷移
- [ ] **M-8** `completed_with_errors` → エラー表示・失敗 staff・再実行導線
- [ ] **M-9** 中止ボタン → `cancelPayrollRun` → 中止メッセージ
- [ ] **M-10** 確定済み期間は計算不可メッセージ
- [ ] **M-11** 再実行ボタン → `retryFailedStaffTasks` → 進捗に戻る（changeSpec）
- [ ] **M-12** 期間外 → 「計算可能期間ではありません」（changeSpec）

---

## Step 09 — 結果タブ & 支払い管理 UI

- [ ] **M-1** 計算完了 → 結果タブ自動遷移 + サマリ表示
- [ ] **M-2** staff カード一覧（`grossPay == 0` は非表示）
- [ ] **M-3** 割増アイコン（残業 / 法定休日 / 60h超）
- [ ] **M-4** キャリーオーバー表示（CO > 0 のみ）
- [ ] **M-5** staff カード → 詳細画面
- [ ] **M-6** 詳細: 集計・金額内訳・attendance 明細
- [ ] **M-7** 確定ボタン: `completed` のみ有効
- [ ] **M-8** 確定ボタン: `completed_with_errors` は無効 + メッセージ
- [ ] **M-9** 確定時の確認ダイアログ
- [ ] **M-10** `anomalyFlags` 警告（空なら非表示）
- [ ] **M-11** CSV エクスポート（15列 + ステータスヘッダー）
- [ ] **M-12** 過去結果セレクタ（月切り替え）
- [ ] **M-13** 支払い管理: staff ごと paid / hold
- [ ] **M-14** 一括支払い（`bulkPaymentRegistrationEnabled`）
- [ ] **M-15** `monthlyPayroll.status` の表示が自動遷移と一致
- [ ] **M-16** 支払日翌日以降の警告
- [ ] **M-17** 保留 staff 表示 + 支払い済み操作

---

## Step 10 — 通知・スケジューラー

- [ ] **M-1** adminHome に通知ベル + 未読バッジ
- [ ] **M-2** 通知一覧: `createdAt` 降順
- [ ] **M-3** 通知タップ → 既読（`isRead = true`）
- [ ] **M-4** 通知長押し → フラグ on/off（`isFlagged`）
- [ ] **M-5** 種別アイコン/色（report=青, warning=橙, strong_warning=深橙, error=赤）
- [ ] **M-6** フィルター（すべて / 未読のみ / フラグ付き）
- [ ] **M-7** `finalizePayrollRun` 完了時に通知が作成される
- [ ] **M-8** attendance `corrected_after_reflection` 時に通知が作成される
- [ ] **M-9** スケジューラー → Cloud Task → 通知判定フロー

---

## メモ

- Step 01・02 はエミュレータでも実機でもよい項目が混在。本番前は実機またはステージングでの一通りを推奨。
- チェック完了後、`per_step/**/VERIFICATION_LOG.md` の表を更新する運用と併用してもよい。
