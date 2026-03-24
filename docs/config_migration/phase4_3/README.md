# Phase4.3: 給与計算システム改修（残業・休日労働対応）

**作成日**: 2026-03-21

---

## 1. 概要

Phase4.2 の給与計算改修設計を発展させ、**法定時間外労働（残業）・法定休日労働・月60時間超・月跨ぎ週対応**を含めた給与計算システムの再設計。

Phase4.2 は実装未着手のため破棄し、本 phase で統合的に再設計する。Phase4.2 の UI・支払い管理・通知等の設計は再利用する。

---

## 2. Phase4.2 からの主な変更点

- 給与計算に残業割増（25%）、月60時間超割増（追加25%）、法定休日割増（35%）、深夜割増（25%）を追加
- attendance に給与帰属管理フィールド（paymentPeriodKey, payrollStatus 等）を追加
- 月跨ぎ週の残業判定に対応
- staffResults をサブコレクション化、attendanceItems（監査明細）を新設
- 設定に weekStartDay, weeklyLegalLimitMinutes, legalHolidayRule 等を追加

---

## 3. ドキュメント構成

```
phase4_3/
├── README.md（本ファイル）
├── FIRESTORE_RULES_RECOMMENDATION.md … Firestore ルール追加・インデックス・運用修正提案
├── OUTSTANDING_GAPS_RECHECK.md       … 差分再点検結果と未反映項目の推奨案
├── SPEC_IMPLEMENTATION_DIFF.md       … 仕様 ↔ 実装の差分（トレーサビリティ・ギャップ一覧）
├── DISTRIBUTED_EXECUTION_DESIGN.md   … 分散実行アーキテクチャ設計
├── IMPLEMENTATION_PLAN.md            … 実装計画（10ステップ + 仕様追跡マトリクス）
├── specs/
│   ├── 01_CALC_SPEC.md               … 計算仕様（コアアルゴリズム）
│   ├── 02_CONFIG_SPEC.md             … 設定仕様（設定値の定義・格納場所）
│   ├── 03_DATA_MODEL_SPEC.md         … データモデル仕様（Firestore 構造）
│   ├── 04_CALLABLE_API_SPEC.md       … Callable API 仕様（Cloud Functions インターフェース）
│   ├── 05_PROCESS_FLOW_SPEC.md       … 処理フロー仕様（内部処理順序・トランザクション）
│   ├── 06_UI_SPEC.md                 … UI 仕様（Flutter 画面設計）
│   └── 07_NOTIFICATION_SCHEDULER_SPEC.md … 通知・スケジューラー仕様
└── per_step/                          … ステップごとの changeSpec + 検証ログ
    ├── step01_foundation/
    ├── step02_attendance_trigger/
    ├── step03_candidates/
    ├── step04_calc_engine/
    ├── step05_distributed_execution/
    ├── step06_confirm_retry_cancel/
    ├── step07_payment_management/
    ├── step08_calc_tab_ui/
    ├── step09_result_tab_ui/
    └── step10_notification_scheduler/
```

---

## 4. 進め方

1. ~~**仕様書作成**: カテゴリごとに仕様書を作成~~ ✅
2. ~~**仕様最終化**: 各仕様書の未確定事項をユーザーと確定~~ ✅
3. ~~**実装計画の作成**: 仕様全体を鑑みて適切なステップに分割~~ ✅ → [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)
4. **各ステップの実装**（現在のフェーズ）: [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) に記載されたステップの粒度・順序に従い、下記ワークフローを各ステップで繰り返す

### Step N ワークフロー

```
1. 仕様確認 + コードベース調査（As-Is / To-Be の把握）
   a. IMPLEMENTATION_PLAN.md の当該ステップを確認し、「カバーする仕様」の一覧を把握する
   b. specs/ 内の該当仕様セクションを丁寧に読み、To-Be の詳細を理解する
   c. Step 2 以降の場合: 前ステップまでの実装内容（作成・変更したファイル、型定義、
      エクスポート等）を確認し、当該ステップとの整合性を確認する
   d. 上記を踏まえ、対象範囲のコードベースを調査し As-Is を把握する

2. changeSpec 作成
   - 実装内容（As-Is / To-Be / 実装順序）
   - テスト計画（テスト観点・テストケースを網羅的に定義）
   - 実機確認が必要な項目（自動テストでカバーできない操作・確認観点を明記）

3. changeSpec のサマリ出力 + 仕様カバレッジ確認 → 【⏸ ユーザー承認】
   - changeSpec の要約をchatに出力する
   - 仕様カバレッジ確認: IMPLEMENTATION_PLAN.md の当該ステップ「カバーする仕様」
     の全セクションについて、specs/ の実際の仕様内容が changeSpec に漏れなく
     反映されているかを確認し、その結果をサマリの一部として出力する
   - 懸念点・改善推奨があればこの時点で共有する
   - ユーザーの承認を得てから次に進む（承認なしに Step 4 に進まない）

4. 実装 + テストコード作成

5. 自動テスト実行（単体テスト / エミュレータテスト 等、ステップに適した形式）
   → テスト結果サマリを出力

6. 実装サマリ + 実機確認依頼 → 【⏸ ユーザー承認】
   - 実装内容のサマリをchatに出力する
   - 実機確認が必要な場合: 操作手順・期待値を提示する
   - 懸念点があれば共有する
   - ユーザーの承認を得てから次に進む（承認なしに Step 7 に進まない）

7. VERIFICATION_LOG.md 作成
   ※ 実装中に仕様の不備・修正が必要な場合は specs/ も更新する

8. OPERATIONS_GUIDE.md へ追記（運用に必要な情報をドラフト追記）

9. IMPLEMENTATION_PLAN.md のマトリクス更新（🔲 → ✅）
→ Step N+1 へ
```

> **【⏸ ユーザー承認】** = ユーザーに主導権を渡し、明示的な承認を得るまで待機するポイント

---

## 5. 参照

- [Phase4.2 設計（参照用）](../phase4_2/)
- [Phase4.2 レビュー](../phase4_2/OVERTIME_PROPOSAL_REVIEW.md)
- [Phase4.2 確定版計算仕様](../phase4_2/CALC_SPEC_FINAL.md)
