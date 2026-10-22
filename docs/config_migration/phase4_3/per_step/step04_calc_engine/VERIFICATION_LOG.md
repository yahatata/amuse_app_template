# Step 04: コア計算エンジン — VERIFICATION_LOG

**実施日**: 2026-03-22

---

## 1. テスト結果

### 単体テスト (`payrollCalcEngine.spec.ts`)

| # | テストケース | 結果 |
|---|---|---|
| R1 | payrollRound: ceil precision=0 | ✅ |
| R2 | payrollRound: floor precision=0 | ✅ |
| R3 | payrollRound: round precision=0 (123.456→123) | ✅ |
| R4 | payrollRound: round precision=0 (123.5→124) | ✅ |
| R5 | payrollRound: floor precision=-1 (1234→1230) | ✅ |
| R6 | payrollRound: ceil precision=-1 (1234→1240) | ✅ |
| U1 | isLegalHoliday: weekday==legalHolidayWeekday → true | ✅ |
| U2 | isLegalHoliday: legalHolidayWeekday=null → false | ✅ |
| U2b | isLegalHoliday: weekday!=legalHolidayWeekday → false | ✅ |
| U3 | processAttendanceDay: 法定休日 → 残業計算除外 | ✅ |
| U4 | processAttendanceDay: 通常 9h → dailyOver=60 | ✅ |
| U5 | processAttendanceDay: weeklyRegularRunning 更新 | ✅ |
| U10 | processAttendanceDay: isNonLegalHoliday 常に false | ✅ |
| U6 | calcOver60: 累計3600超の寄与分 | ✅ |
| U7 | calcOver60: 法定休日スキップ | ✅ |
| U6b | calcOver60: 累計3600以下→0 | ✅ |
| U8 | calcAmount: 各金額項目 | ✅ |
| U9 | calcAmount: ceil/floor/round | ✅ |
| U11 | calculateStaffPayroll: 空→全0 | ✅ |
| V1 | 検証1: 月〜金各9h (週45h) → legalOvertime=300 | ✅ |
| V2 | 検証2: 月〜金各7h+土10h → legalOvertime=300 | ✅ |
| V3 | 検証3: 月10h+火〜金8h+土6h → legalOvertime=480 | ✅ |
| V4 | 検証4: 月〜土各7h (週42h) → legalOvertime=120 | ✅ |
| V5 | 検証5: 法定休日含む → legalOvertime=0, holiday=600 | ✅ |
| V6 | 検証6: 月跨ぎ週 → legalOvertime=60 | ✅ |
| — | V1 金額統合テスト | ✅ |
| — | 法定休日あり金額テスト | ✅ |
| — | 深夜労働金額テスト | ✅ |
| C1 | キャリーオーバー: 元期間コンテキスト計算 | ✅ |
| C2 | キャリーオーバー: grossPay 算出 | ✅ |
| C3 | キャリーオーバー: 当月と独立計算 | ✅ |
| — | 月60h超 統合テスト | ✅ |

**合計**: 32 passed, 0 failed

### コンパイル・Lint

| チェック | 結果 |
|----------|------|
| TypeScript コンパイル (`tsc --noEmit`) | ✅ |
| Lint | ✅ |
| 回帰テスト（既存 attendance テスト） | ✅ 61/61 passed |

---

## 2. 変更ファイル一覧

| ファイル | 変更種別 | 概要 |
|----------|---------|------|
| `functions/src/domains/attendance/types/payrollCalcTypes.ts` | 変更 | 型追加 (CalcAttendanceInput, CalcConfigInput, AttendanceItemResult, StaffCalcResult, MONTHLY_OVER60_THRESHOLD_MINUTES) |
| `functions/src/domains/attendance/helpers/payrollRoundingUtils.ts` | 新規 | payrollRound 関数 |
| `functions/src/domains/attendance/helpers/payrollCalcEngine.ts` | 新規 | コア計算エンジン 7 公開関数 |
| `functions/__tests__/attendance/payrollCalcEngine.spec.ts` | 新規 | 単体テスト 32 件 |

---

## 3. 仕様カバレッジ

| 仕様書 | セクション | 実装 | テスト |
|--------|----------|------|--------|
| 01_CALC_SPEC | 2. 計算の全体フロー | ✅ | ✅ V1-V6 |
| 01_CALC_SPEC | 3. 法定休日の判定 | ✅ | ✅ U1-U2b |
| 01_CALC_SPEC | 4. 法定休日の attendance | ✅ | ✅ U3, V5 |
| 01_CALC_SPEC | 5. コアアルゴリズム | ✅ | ✅ U4-U5, V1-V4 |
| 01_CALC_SPEC | 6. 法定外休日 (false固定) | ✅ | ✅ U10 |
| 01_CALC_SPEC | 7. 月跨ぎ週 | ✅ | ✅ V6 |
| 01_CALC_SPEC | 8. 月60h超 | ✅ | ✅ U6-U7, 統合 |
| 01_CALC_SPEC | 9. 深夜労働 | ✅ | ✅ 金額統合 |
| 01_CALC_SPEC | 10. 金額計算式 | ✅ | ✅ U8-U9 |
| 01_CALC_SPEC | 11. 重複計上防止 | ✅ | ✅ V5, U3 |
| 01_CALC_SPEC | 12. staff単位集計 | ✅ | ✅ V1-V6 |
| 01_CALC_SPEC | 13. attendanceItems | ✅ | ✅ V1-V6 |
| 01_CALC_SPEC | 13-1. キャリーオーバー | ✅ | ✅ C1-C3 |
| 01_CALC_SPEC | 14. 適用範囲 | ✅ | — |
| 01_CALC_SPEC | 検証テーブル1〜6 | ✅ | ✅ V1-V6 |
