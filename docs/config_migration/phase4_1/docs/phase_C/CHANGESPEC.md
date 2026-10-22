# 4.1-C: breaks サブコレ、startBreak / endBreak — 変更仕様書（changeSpec）

**対象**: [Flow2_IMPLEMENTATION_PHASES.md](../../Flow2_IMPLEMENTATION_PHASES.md) に基づく実装  
**本 step**: 4.1-C。Flow2 セクション 7「4.1-C」・セクション 4.2・セクション 5 を参照すること。

**最終更新**: 2025-03-04

---

## 1. 概要・目的

- breaks サブコレ（`attendances/{attendanceId}/breaks/{breakId}`）の作成
- startBreak, endBreak の新規 Callable 作成
- 親再集計ヘルパー（recalculateAttendanceFromBreaks）の作成
- clockOut に退勤時の休憩自動終了の挿入箇所を用意
- startBreak, endBreak に attendanceLogs 書き込みを追加
- Firestore インデックス: breaks の `orderBy('startedAt')` は単一フィールドのため自動インデックスで対応（明示的追加不要）

**完了条件（Flow2 セクション 5 より）**: startBreak, endBreak が動作し、breaks サブコレに doc が作成される。breaks の論理削除フィールド（isDeleted, deletedAt）を保持。親再集計ヘルパーが動作する

---

## 2. 依存先の確認

| 依存先 | 確認すべき修正内容 |
|--------|-------------------|
| 4.1-A | config の nightWorkStartHour, nightWorkEndHour。stepA_completion_summary.md を確認 |
| 4.1-B | attendances の休憩系フィールド（breakMinutes, isOnBreak 等）、clockOut 等の構造。stepB_completion_summary.md を確認 |

---

## 3. 対象ファイル一覧

### Functions（TypeScript）

| ファイル | 変更内容 |
|----------|----------|
| `functions/src/domains/attendance/helpers/recalculateAttendanceFromBreaks.ts` | 新規。breaks から親を再集計 |
| `functions/src/domains/attendance/callables/startBreak.ts` | 新規。休憩開始 Callable |
| `functions/src/domains/attendance/callables/endBreak.ts` | 新規。休憩終了 Callable |
| `functions/src/domains/attendance/callables/clockOut.ts` | 休憩自動終了の挿入箇所（コメント） |
| `functions/src/domains/attendance/index.ts` | startBreak, endBreak を export |

### Dart（Flutter）

| ファイル | 変更内容 |
|----------|----------|
| （なし） | 4.1-F で UI 改修 |

---

## 4. breaks スキーマ（Flow1 セクション 2）

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| startedAt | Timestamp | ○ | 休憩開始時刻 |
| endedAt | Timestamp \| null | - | 休憩終了時刻（休憩中は null） |
| isDeleted | boolean | ○ | 論理削除フラグ。デフォルト: false |
| deletedAt | Timestamp \| null | - | 論理削除日時。デフォルト: null |
| createdAt | Timestamp | ○ | 作成日時 |
| updatedAt | Timestamp | ○ | 更新日時 |

---

## 5. 新規 Callable I/O（Flow1 セクション 6）

### 5.1 startBreak

| 項目 | 内容 |
|------|------|
| 引数 | `{ attendanceId: string }` |
| 成功時 | `{ success: true, breakId: string, message: string }` |
| エラー | already-exists（休憩中）, not-found, permission-denied 等 |

### 5.2 endBreak

| 項目 | 内容 |
|------|------|
| 引数 | `{ attendanceId: string, breakId: string }` |
| 成功時 | `{ success: true, message: string }` |
| エラー | not-found, failed-precondition（既に終了済み）等 |

---

## 6. 実装順序

```
Phase 1: 親再集計ヘルパー（recalculateAttendanceFromBreaks）作成
Phase 2: startBreak Callable 作成
Phase 3: endBreak Callable 作成
Phase 4: clockOut に挿入箇所コメント追加
Phase 5: index.ts に startBreak, endBreak export
```

---

## 7. 検証ポイント（テスト + エミュレータ）

**確認方針**: 実機確認は 4.1-F に集約。本 step はテストファイル + Firestore エミュレータで確認。

| # | 観点 | 方法 |
|---|------|------|
| 1 | startBreak で breaks に doc が作成される | `__tests__/config_migration/phase4_1C/startBreak.spec.ts` |
| 2 | endBreak で break が終了し、親の breakMinutes が更新される | `__tests__/config_migration/phase4_1C/endBreak.spec.ts` |
| 3 | 親再集計ヘルパーが正しく breakMinutes を算出する | endBreak.spec.ts で検証 |
| 4 | attendanceLogs に start_break, end_break が書き込まれる | 各 spec で検証 |
| 5 | エラーケース（already-exists, not-found, failed-precondition） | 各 spec で検証 |

**テスト実行コマンド**:
```bash
firebase emulators:exec --only firestore 'cd functions && npm test -- __tests__/config_migration/phase4_1C --runInBand'
```

---

## 8. チェックリスト

### 実装時

- [x] recalculateAttendanceFromBreaks ヘルパー作成
- [x] startBreak Callable 作成
- [x] endBreak Callable 作成
- [x] clockOut に挿入箇所コメント追加
- [x] index.ts に startBreak, endBreak export

### 確認時

- [x] Functions ビルド成功
- [x] テストファイル作成（startBreak.spec.ts, endBreak.spec.ts）
- [x] エミュレータ起動・テスト実行で確認
