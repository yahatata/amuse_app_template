# Task 3 サマリ — ID ごとの verification ファイル作成結果

作成日: 2026-03-06  
目的: Task 4 で各 ID の実装を確認するためのファイル群の構成・記載内容・形式をまとめる

---

## 1. ファイル一覧

`per_id/` フォルダ内に 18 ファイルを作成した。

| # | バッチ | 対象 ID | ファイル名 | 対象層 |
|---|--------|---------|------------|--------|
| 1 | B | D-05 | `D05_settlementAggregator.md` | Functions のみ |
| 2 | B | D-07 | `D07_dualWrite.md` | Functions のみ |
| 3 | B | D-08 | `D08_enqueueScheduler.md` | Functions のみ |
| 4 | B | D-09 | `D09_templateBusinessDateCheck.md` | Functions のみ |
| 5 | B | B-06 | `B06_tableDeviceRegistration.md` | スキーマ定義のみ |
| 6 | A1 | CALC_BUFFER | `CALC_BUFFER.md` | Functions + Dart |
| 7 | A1 | D-10 | `D10_autoOpenClose.md` | Functions + Dart |
| 8 | A1+A2 | R-10 | `R10_businessHoursStyles.md` | Functions + Flutter |
| 9 | A1+A2+A3 | D-04 | `D04_linePlan.md` | Functions + Flutter + Web |
| 10 | A1+A2 | R-09 | `R09_requiredStaffByTimeSlot.md` | Functions + Flutter |
| 11 | A1+A2 | R-11/R-12 | `R11_R12_billing.md` | Functions + Flutter |
| 12 | A2 | R-06 | `R06_entranceFee.md` | Flutter（+ defaults/types 定義） |
| 13 | A2 | R-07 | `R07_payroll.md` | Flutter（+ defaults/types 定義） |
| 14 | A2 | R-08 | `R08_shiftFlow.md` | Flutter（+ defaults/types 定義） |
| 15 | A3 | A-4 | `A3_configJs.md` | Web |
| 16 | A3 | A-5 | `A3_globalConstantCleanup.md` | Flutter |
| 17 | C/D | 状態記録 | `CD_stateRecording.md` | ドキュメントのみ |
| 18 | 横断 | Z | `Z_crossCutting.md` | Functions + Flutter + ドキュメント |

### 統合判断

Functions と Flutter で同じ ID を扱う場合は **1 ファイルに統合** した（#8 R-10, #9 D-04, #10 R-09, #11 R-11/R-12）。各ファイル内で Functions 側 / Flutter 側 / Web 側をセクション分けし、要件を MECE に記載している。

---

## 2. 各ファイルの共通フォーマット

全ファイルは以下の共通構造に従う。

```
# [ID]: [名称] — Phase2 検証ファイル

バッチ: [X] | 対象 ID: [ID] | 対象層: [Functions / Flutter / Web / ドキュメント]

---

## 1. 要件（PHASE2_ID_REQUIREMENTS_CHECKLIST より）
   - 表形式：# / 区分（実装 / 手続き / 確認）/ 必須作業 / Task 4 確認結果
   - 複数レイヤーがある場合は「Functions 側」「Flutter 側」「Web 側」「共通」に分割

## 2. 実装漏れ・要調査事項（REQUIREMENTS_GAP_CHECK より）
   ### 確定した漏れ
   - 表形式：# / 内容 / 影響度
   ### 要調査事項
   - 表形式：# / GAP ID / 内容 / 影響度
   - 「該当なし」の場合はその旨を明記

## 3. 関連テスト失敗（VERIFICATION_TASK_ORDER より）
   - テストファイル名とエラー内容の表
   - 確認観点（Task 4 でどの観点から検証するか）
   - 該当なしの場合はその旨を明記

## 4. Task 4 実施記録
   ### 実装確認結果     （Task 4 で記入）
   ### 取得失敗時の挙動設計 （Task 4 で記入）※該当する場合
   ### 切り戻し手順       （Task 4 で記入）※該当する場合
   ### テスト実行結果     （Task 4 で記入）
   ### 実機テスト結果     （Task 4 で記入）※該当する場合
```

### フォーマットの例外

| ファイル | 例外内容 | 理由 |
|----------|----------|------|
| `B06_tableDeviceRegistration.md` | §4 に「取得失敗時の挙動設計」「切り戻し手順」セクションなし | スキーマ定義のみで実コード参照なし |
| `A3_configJs.md` | §4 に「取得失敗時の挙動設計」「切り戻し手順」セクションなし | Web JS ファイル単独の差し替えのため |
| `A3_globalConstantCleanup.md` | §4 に「取得失敗時の挙動設計」「切り戻し手順」セクションなし | 削除確認のみのため |
| `CD_stateRecording.md` | §4 のテスト・実機テストが N/A | コード変更を伴わないため |
| `Z_crossCutting.md` | §1 が Z-1〜Z-7 のサブセクション構成 | 横断要件を網羅するため構造が異なる |

---

## 3. 情報の分配（ソースドキュメント → per_id ファイル）

### PHASE2_ID_REQUIREMENTS_CHECKLIST.md → §1

各 ID の「# / 区分 / 必須作業」テーブルをそのまま転記し、「Task 4 確認結果」列を追加。横断要件（Z-1〜Z-7）は `Z_crossCutting.md` に集約。

### REQUIREMENTS_GAP_CHECK.md → §2

| GAP ID | 分配先 |
|--------|--------|
| GAP-2-1（取得失敗時の挙動設計が未記録） | 全 ID（D-05〜R-08）の §2 + Z_crossCutting の §2 |
| GAP-2-2（切り戻し手順が未記録） | 全 ID（D-05〜R-08）の §2 + Z_crossCutting の §2 |
| GAP-2-3（tobe_config_architecture 不整合） | Z_crossCutting の §2 のみ |
| GAP-3-1（Firestore undefined 書き込み） | CALC_BUFFER の §2 |
| GAP-3-2（applyCloseSnapshot 結果空） | CALC_BUFFER の §2 |
| GAP-3-3（appendItem エラーコード変更） | R11_R12_billing の §2 |
| GAP-3-4（aggregator プロパティ参照エラー） | R11_R12_billing の §2 |
| GAP-3-5（config.js loadLinePlanFromFirestore 呼び出し有無） | D04_linePlan の §2 + A3_configJs の §2 |

### VERIFICATION_TASK_ORDER テスト失敗 → §3

| テスト失敗カテゴリ | 分配先 |
|--------------------|--------|
| §1: Firestore undefined（eventBusinessDate / businessDate） | CALC_BUFFER の §3 |
| §2: applyCloseSnapshot 結果空 | CALC_BUFFER の §3 |
| §3: appendItem エラーコード不一致 | R11_R12_billing の §3 |
| §4: aggregator プロパティ参照エラー | R11_R12_billing の §3 |

**テスト失敗が記載されているファイル**: CALC_BUFFER.md（2 件）、R11_R12_billing.md（2 件）  
**テスト失敗が記載されていないファイル**: 残りの 16 ファイル（「該当するテスト失敗事象なし」と明記）

---

## 4. Task 4 での使い方

1. `per_id/` 内のファイルを 1 つずつ開く
2. §1 の要件テーブルに沿って実コードを確認し、「Task 4 確認結果」列を埋める
3. §2 に「要調査事項」がある場合は、実コードを深堀りして調査する
4. §3 に「関連テスト失敗」がある場合は、テスト失敗が実装に原因があるかを確認する
5. §4 に結果を記録する
6. ユーザーレビューを実施する
7. 必要に応じて修正・テスト実行・実機テストを行い、運用時資料を更新する
8. 次のファイルに進む
