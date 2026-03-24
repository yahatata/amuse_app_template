# Step 02: attendance フィールド追加 & onWrite トリガー — VERIFICATION_LOG

**実施日**: 2026-03-22

---

## 1. テスト結果サマリ

| テストスイート | テスト数 | 結果 |
|---|---|---|
| `attendanceOnWrite.spec.ts` | 13 | **PASS** |
| `recalculateNightBreaks.spec.ts` | 7 | **PASS** |
| Step01 リグレッション（3 suites） | 32 | **PASS** |
| **合計** | **52** | **ALL PASSED** |

- TypeScript ビルド (`tsc --noEmit`): エラーなし
- テスト実行時環境: `TZ=UTC`（`calculateNightWorkMinutes` が `getHours()` を使用するため）

---

## 2. 作成・変更ファイル一覧

### 新規作成

| ファイル | 役割 |
|---|---|
| `functions/src/domains/attendance/triggers/attendanceOnWrite.ts` | attendance onWrite トリガー（帰属情報自動付与 + payrollStatus 遷移管理） |

### 変更

| ファイル | 変更内容 |
|---|---|
| `functions/src/domains/attendance/helpers/recalculateAttendanceFromBreaks.ts` | `nightWorkMinutes` から深夜帯の休憩分を控除 |
| `functions/src/domains/attendance/callables/clockIn.ts` | `payrollStatus`, `reflectedPayrollRunId`, `reflectedAt` 初期値追加 |
| `functions/src/domains/attendance/callables/createAttendance.ts` | 同上 |
| `functions/src/domains/attendance/callables/createManualClockInRecord.ts` | 同上 |
| `functions/src/domains/attendance/callables/seedAttendancesDemo.ts` | 同上（3箇所） |
| `functions/src/domains/attendance/index.ts` | `attendanceOnWrite` の export 追加 |

### テストファイル

| ファイル | テスト数 |
|---|---|
| `functions/__tests__/attendance/attendanceOnWrite.spec.ts` | 13 |
| `functions/__tests__/attendance/recalculateNightBreaks.spec.ts` | 7 |

---

## 3. 仕様カバレッジ確認

| 仕様書 | セクション | カバー状況 |
|---|---|---|
| 03_DATA_MODEL_SPEC | 1-1. 既存フィールド（確認） | ✅ 変更なし（既存構造確認済み） |
| 03_DATA_MODEL_SPEC | 1-2. 追加フィールド（新規） | ✅ onWrite トリガー + Callable 初期値で全6フィールド対応 |
| 03_DATA_MODEL_SPEC | 1-3. 廃止フィールド | ✅ payrollReflectedAt フォールバック実装済み |
| 03_DATA_MODEL_SPEC | 1-4. attendance に持たせないもの | ✅ 動的計算値は保存しない |
| 04_CALLABLE_API_SPEC | 1. 帰属情報付与（手順 1〜6） | ✅ onWrite トリガーで全手順実装 |
| 01_CALC_SPEC | nightWorkMinutes 休憩控除 | ✅ recalculateAttendanceFromBreaks 修正済み |

---

## 4. 完了条件の確認

| 条件 | 結果 |
|---|---|
| attendance 作成時に weekday / weekStartDate / paymentPeriodKey / payrollStatus が自動設定される | ✅ onWrite トリガーで設定 |
| reflected → corrected_after_reflection の遷移が正しく動作する | ✅ テストで検証 |
| nightWorkMinutes が深夜帯の休憩を控除した値になる | ✅ テストで検証（7ケース） |

---

## 5. 実機確認が必要な項目

| 項目 | 確認手順 | 期待値 |
|---|---|---|
| clockIn → 帰属情報付与 | エミュレータで clockIn 実行 | weekday, weekStartDate, paymentPeriodKey, payrollStatus=unreflected が設定される |
| 深夜帯休憩の nightWorkMinutes | 深夜帯に休憩を含む退勤 | nightWorkMinutes が休憩控除後の値になる |
| reflected → corrected 遷移 | reflected attendance を編集 | payrollStatus=corrected_after_reflection に遷移 |

---

## 6. 特記事項

- onWrite トリガーの無限ループ防止はフィールド値比較で実現（変更がなければ書き込みスキップ）
- 既存 attendance への遡及的なフィールド追加は行わない。更新があった時点でトリガーが帰属情報を付与する
- `payrollReflectedAt` は互換性のため初期値 null で維持。新フィールド `payrollStatus` が正規のステータス管理に使用される
