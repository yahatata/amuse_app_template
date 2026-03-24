# Step 05: 分散実行 — VERIFICATION_LOG

**実装日**: 2026-03-22
**ステータス**: 完了

---

## 1. テスト結果

### 新規テスト

| テストスイート | テスト数 | 結果 |
|---------------|---------|------|
| payrollRunHelpers.spec.ts | 12 | 全 PASS |
| generateAnomalyFlags.spec.ts | 2 | 全 PASS |
| **合計** | **14** | **全 PASS** |

### リグレッションテスト（全 payroll 関連テスト）

| テストスイート | テスト数 | 結果 |
|---------------|---------|------|
| payrollRunHelpers.spec.ts | 12 | PASS |
| generateAnomalyFlags.spec.ts | 2 | PASS |
| payrollCalcEngine.spec.ts | 32 | PASS |
| payrollPeriodUtils.spec.ts | 19 | PASS |
| payrollErrors.spec.ts | 3 | PASS |
| getPayrollCandidates.spec.ts | 26 | PASS |
| attendanceOnWrite.spec.ts | 13 | PASS |
| payrollConfigLoader.spec.ts | 10 | PASS |
| **合計** | **117** | **全 PASS** |

### テストカバレッジ（payrollRunHelpers）

| テスト ID | テスト内容 | 対象関数 |
|-----------|-----------|---------|
| CL-1 | normal/carryOver 分類 | classifyAttendancesForRun |
| CL-2 | 空配列の場合 | classifyAttendancesForRun |
| GR-1 | staffId グルーピング（normal/CO 分離） | groupByStaffId |
| GR-2 | carryOver のみの staff | groupByStaffId |
| BS-1 | PayrollConfig → snapshot 構築 | buildRunSnapshot |
| CC-1 | snapshot + 時給 → CalcConfigInput | buildCalcConfigFromSnapshot |
| AG-1 | staffResults 集計（completed + failed） | aggregateStaffResults |
| AG-2 | warning ステータスカウント | aggregateStaffResults |
| AG-3 | 空配列 | aggregateStaffResults |
| IC-1 | 全員完了判定 | isRunComplete |
| IC-2 | 未完了判定 | isRunComplete |
| IC-3 | target=0 エッジケース | isRunComplete |
| AF-1 | 空オブジェクト返却 | generateAnomalyFlags |
| AF-2 | 返り値の型チェック | generateAnomalyFlags |

---

## 2. ファイル変更一覧

### 新規作成

| ファイル | 説明 |
|---------|------|
| `functions/src/domains/attendance/helpers/generateAnomalyFlags.ts` | 異常値チェックスタブ |
| `functions/src/domains/attendance/helpers/payrollRunHelpers.ts` | テスタブルヘルパー群 |
| `functions/src/domains/attendance/callables/executeMonthlyPayroll.ts` | run 作成 + Cloud Tasks 投入 |
| `functions/src/domains/attendance/tasks/processStaffPayroll.ts` | 1 staff 計算（onTaskDispatched） |
| `functions/src/domains/attendance/tasks/finalizePayrollRun.ts` | サマリ集計（onTaskDispatched） |
| `functions/__tests__/attendance/payrollRunHelpers.spec.ts` | ヘルパー群のユニットテスト |
| `functions/__tests__/attendance/generateAnomalyFlags.spec.ts` | スタブのユニットテスト |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `functions/src/domains/attendance/index.ts` | executeMonthlyPayroll, processStaffPayroll, finalizePayrollRun のエクスポート追加 |

---

## 3. 仕様カバレッジ

| 仕様 | セクション | 内容 | 状態 |
|------|-----------|------|------|
| 02_CONFIG_SPEC | §8 | snapshot 実書込 | ✅ |
| 03_DATA_MODEL_SPEC | §2-1 | monthlyPayroll ルート作成 | ✅ |
| 03_DATA_MODEL_SPEC | §2-2 | payrollRuns サブコレクション | ✅ |
| 03_DATA_MODEL_SPEC | §2-3 | staffResults サブコレクション（計算結果） | ✅ |
| 03_DATA_MODEL_SPEC | §2-4 | attendanceItems サブコレクション | ✅ |
| 04_CALLABLE_API_SPEC | §3 | executeMonthlyPayroll | ✅ |
| 04_CALLABLE_API_SPEC | §4 | processStaffPayroll | ✅ |
| 04_CALLABLE_API_SPEC | §5 | finalizePayrollRun（手順 1〜7） | ✅ |
| 04_CALLABLE_API_SPEC | §5-1 | generateAnomalyFlags（スタブ） | ✅ |
| 05_PROCESS_FLOW_SPEC | §1 | payrollRuns.status ライフサイクル | ✅ |
| 05_PROCESS_FLOW_SPEC | §1 | monthlyPayroll.status: draft | ✅ |
| 05_PROCESS_FLOW_SPEC | §2 | executeMonthlyPayroll 処理フロー | ✅ |
| 05_PROCESS_FLOW_SPEC | §3 | processStaffPayroll 処理フロー | ✅ |
| 05_PROCESS_FLOW_SPEC | §4 | finalizePayrollRun 処理フロー（手順 1〜7） | ✅ |
| DISTRIBUTED_EXECUTION_DESIGN | §3-5 | onTaskDispatched 採用 | ✅ |

### Step 10 で対応する項目

- 04_CALLABLE_API_SPEC §3: executeMonthlyPayroll 致命的エラー時の failed 通知
- 04_CALLABLE_API_SPEC §5: finalizePayrollRun 手順 8（通知作成）
- 05_PROCESS_FLOW_SPEC §4: finalizePayrollRun 手順 8（通知）

---

## 4. 手動確認事項

| 項目 | 状況 |
|------|------|
| TypeScript コンパイル（`tsc --noEmit`） | ✅ エラーなし |
| リグレッションテスト | ✅ 117 テスト全 PASS |
| Emulator E2E テスト | 🔲 別途手動確認（Cloud Tasks + Firestore Emulator） |
| デプロイ確認 | 🔲 ステージング環境で確認予定 |

---

## 5. 既知の制約・注意事項

1. **Cloud Tasks キュー**: `processStaffPayroll` / `finalizePayrollRun` のキューはデプロイ時に Firebase Functions v2 によって自動作成される
2. **generateAnomalyFlags**: 現時点ではスタブ。運用データを基に閾値を設定した後にロジック追加予定
3. **attendance 一括取得**: `executeMonthlyPayroll` では `attendanceIds` を個別に `doc().get()` しているため、件数が極端に多い場合（1000 件超）はバッチ化の検討が必要
4. **recalculateNightBreaks.spec.ts**: Step 02 から継続する既知の不具合（7 テスト失敗）。本ステップとは無関係

---

## 6. 追記: processStaffPayroll トランザクション修正（2026-03-22）

| 項目 | 内容 |
|------|------|
| **問題** | `processStaffPayroll` 内トランザクションで `trx.update` の後に `trx.get(runRef)` しており、Firestore の「read は write より前」制約に違反。本番で Cloud Tasks が 500 となり計算が進まない事象があった。 |
| **修正** | `runRef` をトランザクション先頭で `get`。更新後の件数は **increment 前の読み取り値**から +1 して返却（成功時は完了数、失敗時は失敗数）。成功・失敗の **2 トランザクション**を同様に修正。 |
| **ドキュメント** | 詳細は本ステップの `changeSpec.md`「追記: processStaffPayroll トランザクション修正」を参照。 |
