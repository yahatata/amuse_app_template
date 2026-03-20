# 4.1-D: 退勤系 Callable の休憩対応 — 変更仕様書（changeSpec）

**対象**: [Flow2_IMPLEMENTATION_PHASES.md](../../Flow2_IMPLEMENTATION_PHASES.md) に基づく実装  
**本 step**: 4.1-D。Flow2 セクション 7「4.1-D」・セクション 4.2・セクション 5 を参照すること。

**最終更新**: 2025-03-04

---

## 1. 概要・目的

- 退勤系 3 Callable（clockOut, updateManualClockOutRecord, updateUnclockedAttendanceWithAuth）に休憩中退勤時の処理を追加する
- 休憩中（endedAt: null の break が存在）に退勤した場合: 休憩自動終了 → breaks 反映 → 親再集計ヘルパーで親を更新 → actualWorkMinutes, nightWorkMinutes 確定
- attendanceLogs は 4.1-B で追加済み。actionType は変更なし（clock_out, update_manual_clock_out, password_clock_out）

**完了条件（Flow2 セクション 5 より）**: 休憩中に退勤した場合、休憩が自動終了し、breaks に反映した上で親再集計し、actualWorkMinutes, nightWorkMinutes が正しく算出される

---

## 2. 依存先の確認

| 依存先 | 確認すべき修正内容 |
|--------|-------------------|
| 4.1-B | clockOut, updateManualClockOutRecord, updateUnclockedAttendanceWithAuth の B による変更内容。stepB_completion_summary.md を確認 |
| 4.1-C | 親再集計ヘルパー（recalculateAttendanceFromBreaks）、breaks サブコレ、clockOut の挿入箇所。**stepC_completion_summary.md を確認** |

---

## 3. 対象ファイル一覧

### Functions（TypeScript）

| ファイル | 変更内容 |
|----------|----------|
| `functions/src/domains/attendance/helpers/recalculateAttendanceFromBreaks.ts` | endActiveBreaksForClockOut ヘルパーを追加 |
| `functions/src/domains/attendance/callables/clockOut.ts` | 挿入箇所に休憩自動終了・親再集計ロジックを実装 |
| `functions/src/domains/attendance/callables/updateManualClockOutRecord.ts` | 同上 |
| `functions/src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts` | 同上 |

### Dart（Flutter）

| ファイル | 変更内容 |
|----------|----------|
| （なし） | 4.1-F で UI 改修。退勤処理の呼び出しは既存のまま |

---

## 4. 処理フロー（Flow1 セクション 7.2）

休憩中退勤時の処理順序:

1. **adjustedClockOut / resolvedClockOut を算出**（既存ロジック）
2. **休憩自動終了**: endedAt: null の break を検索し、endedAt に退勤時刻を設定。親の isOnBreak: false, currentBreakStartedAt: null を更新
3. **退勤時刻を attendance に反映**: clockOut を設定
4. **親再集計**: recalculateAttendanceFromBreaks を呼び、breakMinutes, actualWorkMinutes, nightWorkMinutes を算出して親を更新
5. **lastActionType 等を更新**: lastActionType: 'clock_out', lastActionAt, lastActionByDeviceId
6. **attendanceLogs 書き込み**（既存）

休憩なしの場合は 2, 4 はスキップ（または break が空なら recalculate は breakMinutes: 0, actualWorkMinutes: totalMinutes を返す）。

---

## 5. 新規ヘルパー: endActiveBreaksForClockOut

| 項目 | 内容 |
|------|------|
| 配置 | recalculateAttendanceFromBreaks.ts に追加 |
| シグネチャ | `endActiveBreaksForClockOut(attendanceRef, endTimestamp): Promise<boolean>` |
| 処理 | endedAt: null の break を検索 → 各 break に endedAt, updatedAt を設定 → 親に isOnBreak: false, currentBreakStartedAt: null を設定 |
| 戻り値 | 終了した break が存在した場合 true |

---

## 6. 実装順序

```
Phase 1: endActiveBreaksForClockOut ヘルパーを recalculateAttendanceFromBreaks.ts に追加
Phase 2: clockOut に休憩自動終了・親再集計ロジックを実装
Phase 3: updateManualClockOutRecord に同上
Phase 4: updateUnclockedAttendanceWithAuth に同上
Phase 5: テスト作成・エミュレータ実行で確認
```

---

## 7. 検証ポイント（テスト + エミュレータ）

**確認方針**: 実機確認は 4.1-F に集約。本 step はテストファイル + Firestore エミュレータで確認。

| # | 観点 | 方法 |
|---|------|------|
| 1 | 休憩中に clockOut すると break が自動終了し、actualWorkMinutes が正しく算出される | テスト: startBreak → clockOut → break の endedAt, 親の breakMinutes, actualWorkMinutes を確認 |
| 2 | 休憩なしで clockOut すると従来通り動作する | 既存 clockOut.spec.ts が通る |
| 3 | updateManualClockOutRecord, updateUnclockedAttendanceWithAuth も同様に休憩中退勤に対応 | テストで検証 |

---

## 8. チェックリスト

### 実装時

- [x] endActiveBreaksForClockOut ヘルパー追加
- [x] clockOut に休憩自動終了・親再集計ロジック実装
- [x] updateManualClockOutRecord に同上
- [x] updateUnclockedAttendanceWithAuth に同上

### 確認時

- [x] Functions ビルド成功
- [ ] テストファイル作成・エミュレータ実行で確認
