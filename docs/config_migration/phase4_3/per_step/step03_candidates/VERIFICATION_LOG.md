# Step 03: 対象データ抽出（getPayrollCandidates）— VERIFICATION_LOG

**実施日**: 2026-03-22

---

## 1. テスト結果

### 単体テスト (`getPayrollCandidates.spec.ts`)

| # | テストケース | 結果 |
|---|---|---|
| 1 | 期間内 + 退勤済 + 非削除 + unreflected → group1 | ✅ |
| 2 | 期間内 + 退勤済 + corrected_after_reflection → group1 | ✅ |
| 3 | 期間内 + 退勤済 + reflected → 対象外 | ✅ |
| 4 | 期間外 + 退勤済 + 非削除 + unreflected → group2 | ✅ |
| 5 | 期間内 + 未退勤 → group3 | ✅ |
| 6 | 期間内 + 論理削除 → group3 | ✅ |
| 7 | 期間外 + 論理削除 → 返却対象外 | ✅ |
| 8 | date > periodEnd の attendance は group2 に入らない | ✅ |
| 9 | 期間外 + 未退勤 → 返却対象外 | ✅ |
| 10 | 重複 doc は group1 に分類される | ✅ |
| 11 | buildEntry: 全フィールドマッピング | ✅ |
| 12 | buildEntry: clockOut null 対応 | ✅ |
| 13 | buildEntry: 欠落フィールドのデフォルト値 | ✅ |
| 14 | applyMaxCountLimit: 制限内なら切り詰めなし | ✅ |
| 15 | applyMaxCountLimit: group3 から削除 | ✅ |
| 16 | applyMaxCountLimit: group3→group2 から削除 | ✅ |
| 17 | applyMaxCountLimit: group3→group2→group1 から削除 | ✅ |
| 18 | applyMaxCountLimit: maxCount=0 で全空 | ✅ |
| 19 | classifyCandidates + maxCount 統合: group3 優先削除 | ✅ |
| 20-26 | paymentPeriodKey バリデーション（7パターン） | ✅ |

**合計**: 26 passed, 0 failed

### コンパイル・Lint

| チェック | 結果 |
|----------|------|
| TypeScript コンパイル (`tsc --noEmit`) | ✅ エラーなし |
| Lint | ✅ エラーなし |

---

## 2. 変更ファイル一覧

| ファイル | 変更種別 | 概要 |
|----------|---------|------|
| `functions/src/domains/attendance/callables/getPayrollCandidates.ts` | 新規 | Callable + 分類ロジック |
| `functions/src/domains/attendance/index.ts` | 変更 | export 追加 |
| `functions/__tests__/attendance/getPayrollCandidates.spec.ts` | 新規 | 単体テスト 26 件 |

---

## 3. 仕様カバレッジ

| 仕様書 | セクション | Step03 対応 |
|--------|----------|------------|
| 04_CALLABLE_API_SPEC | 2. getPayrollCandidates | ✅ |

### 仕様項目の詳細カバレッジ

| 仕様項目 | 実装 | テスト |
|----------|------|--------|
| admin 権限チェック | ✅ | ※統合テスト |
| paymentPeriodKey バリデーション | ✅ | ✅ |
| payroll-config-not-found エラー | ✅ | ※統合テスト |
| group1 分類（期間内 + 退勤済 + 非削除 + unreflected/corrected） | ✅ | ✅ |
| group2 分類（期間外キャリーオーバー） | ✅ | ✅ |
| group3 分類（未退勤 or 論理削除） | ✅ | ✅ |
| reflected を返却しない | ✅ | ✅ |
| date > periodEnd の除外 | ✅ | ✅ |
| 期間外 + 論理削除の除外 | ✅ | ✅ |
| CandidateEntry 全フィールドマッピング | ✅ | ✅ |
| maxCandidatesCount 件数制限 | ✅ | ✅ |
| 削除優先順序: group3 → group2 → group1 | ✅ | ✅ |

---

## 4. 手動確認項目

| # | 確認項目 | 方法 | 結果 |
|---|---------|------|------|
| 1 | Callable がデプロイ可能 | `firebase deploy --only functions:getPayrollCandidates` | 未実施（ローカル検証のみ） |
| 2 | Flutter から呼び出し可能 | Step06（UI実装）で確認 | 未実施 |
| 3 | 既存 attendance との互換性 | Step02 の attendanceOnWrite で paymentPeriodKey が設定されている前提 | ✅ 設計上問題なし |
