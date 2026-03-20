# 4.1-A: config 夜間労働時間追加、旧 Callable unused 移管 — 変更仕様書（changeSpec）

**対象**: [Flow2_IMPLEMENTATION_PHASES.md](../../Flow2_IMPLEMENTATION_PHASES.md) に基づく実装  
**本 step**: 4.1-A。Flow2 セクション 7「4.1-A」・セクション 4.2・セクション 5 を参照すること。

**最終更新**: 2025-03-04

---

## 0. changeSpec 作成時の共通ルール（全 step で実施）

**目的**: 漏れなく changeSpec を作成するため、以下のタイミングで所定の確認を行う。

| タイミング | 何を | 何のために | 参照先 |
|------------|------|------------|--------|
| **作成開始前** | 依存先の修正内容を確認する | 前段階の変更を理解した上で実装範囲を決めるため | Flow2 セクション 4.2「依存関係一覧」の該当 step の行。**共通ルール: 必ず、依存先 step の完了サマリを確認し、必要に応じて実コードも確認する** |
| **作成開始前** | 本 step の参照ファイル一覧を把握する | 変更対象・AS-IS 確認対象を漏れなく特定するため | Flow2 セクション 7「段階別参照ファイル」の該当 step（4.1-A 〜 4.1-F, 4.1-E2） |
| **作成開始前** | 参照ファイルをすべて開き、AS-IS の実装を把握する | grep 結果だけでなく実コードの文脈を確認するため | 上記で把握したファイルの実コード |
| **作成中** | 本 step の To-Be 仕様を確認する | 変更内容が仕様と整合するため | Flow1_DETAILED_SPEC.md の該当セクション（config / breaks / attendances / Callable 等） |
| **作成中** | 本 step の完了条件を確認する | 検証ポイント・チェックリストを完了条件と対応付けるため | Flow2 セクション 5「完了条件」の該当 step の行 |
| **作成中** | 影響範囲・移行方針を確認する（該当する場合） | 削除・変更時の対応方針を踏まえるため | Flow0_IMPACT_ANALYSIS.md |
| **作成完了前** | changeSpec のレビューを行う | 自己確認または他者確認で漏れを防ぐため | 本 changeSpec |

**※ step ごとの違い**: 参照ファイル一覧・依存先・完了条件・Flow1 の該当セクションは step により異なる。**Flow2 セクション 7 で本 step の行を必ず確認し、一覧に挙がったファイルを漏れなく開くこと。**

---

## 1. 概要・目的

- config に夜間労働時間（nightWorkStartHour, nightWorkEndHour）を追加する
- 旧 Callable（createClockInRecord, updateClockOutRecord）を unused_function_lib に移管し、export を削除する
- Dart の attendanceService から createClockInRecord, updateClockOutRecord メソッドを削除する
- 既存の出退勤（clockIn/clockOut）が引き続き動作することを確認する

**完了条件（Flow2 セクション 5 より）**: config に夜間労働時間（nightWorkStartHour, nightWorkEndHour）が追加され、旧 Callable（createClockInRecord, updateClockOutRecord）が unused に移管され、Dart から削除されている。既存の出退勤（clockIn/clockOut）が動作する

---

## 2. 依存先の確認

| 依存先 | 確認すべき修正内容 |
|--------|-------------------|
| なし | 4.1-A は依存なし |

---

## 3. 対象ファイル一覧

### Functions（TypeScript）

| ファイル | 変更内容 |
|----------|----------|
| `functions/src/shared/config/defaults.ts` | DEFAULT_NIGHT_WORK_START_HOUR, DEFAULT_NIGHT_WORK_END_HOUR を追加 |
| `functions/src/shared/config/types.ts` | StoreConfig に attendance?: { nightWorkStartHour?: number; nightWorkEndHour?: number } を追加 |
| `functions/src/shared/config/configLoader.ts` | buildFromDefaults に attendance のマッピングを追加。mergeWithDefaults に attendance のマージを追加。mergeConfigForUpsert に attendance を追加 |
| `functions/src/domains/attendance/callables/createClockInRecord.ts` | unused_function_lib に移動（ファイル削除） |
| `functions/src/domains/attendance/callables/updateClockOutRecord.ts` | unused_function_lib に移動（ファイル削除） |
| `functions/src/unused_function_lib/createClockInRecord.ts` | 新規作成（コード全コメントアウト） |
| `functions/src/unused_function_lib/updateClockOutRecord.ts` | 新規作成（コード全コメントアウト） |
| `functions/src/domains/attendance/index.ts` | createClockInRecord, updateClockOutRecord の export を削除 |

### Dart（Flutter）

| ファイル | 変更内容 |
|----------|----------|
| `lib/AttendanceManagement/attendanceService.dart` | createClockInRecord メソッド、updateClockOutRecord メソッドを削除 |

### その他

| ファイル | 変更内容 |
|----------|----------|
| なし |  |

---

## 4. 現状（As-Is）

### 4.1 defaults.ts

- 夜間労働時間のデフォルト値は未定義
- attendanceTimeAdjustment, payroll 等のデフォルトは他のセクションで定義済み

### 4.2 types.ts

- StoreConfig に attendance の型定義はなし
- payroll, shift 等の型定義は存在

### 4.3 configLoader.ts

- buildFromDefaults(): attendance のマッピングなし
- mergeWithDefaults(): raw.attendance のマージなし
- mergeConfigForUpsert(): attendance の補完なし

### 4.4 createClockInRecord.ts / updateClockOutRecord.ts

- `functions/src/domains/attendance/callables/` に存在
- index.ts から export されている
- 呼び出し元: attendanceService.dart にメソッド定義あり。**呼び出し元は存在しない**（dead code）

### 4.5 attendanceService.dart

- createClockInRecord(String staffId, String staffName) メソッド（108-149 行付近）
- updateClockOutRecord(String docId) メソッド（152-186 行付近）
- どちらも httpsCallable で呼び出し。実際の呼び出し元はなし

---

## 5. 変更後（To-Be）

### 5.1 defaults.ts

| 変更 | 内容 |
|------|------|
| 追加 | `DEFAULT_NIGHT_WORK_START_HOUR = 22`, `DEFAULT_NIGHT_WORK_END_HOUR = 5` を追加（payroll セクション付近に attendance セクションを新設） |

**Flow1 参照**: セクション 4（config 夜間労働時間）

### 5.2 types.ts

| 変更 | 内容 |
|------|------|
| 追加 | StoreConfig に `attendance?: { nightWorkStartHour?: number; nightWorkEndHour?: number }` を追加 |

**Flow1 参照**: セクション 4

### 5.3 configLoader.ts

| 変更 | 内容 |
|------|------|
| buildFromDefaults | `attendance: { nightWorkStartHour: DEFAULT_NIGHT_WORK_START_HOUR, nightWorkEndHour: DEFAULT_NIGHT_WORK_END_HOUR }` を追加 |
| mergeWithDefaults | raw.attendance のマージ処理を追加（nightWorkStartHour, nightWorkEndHour） |
| mergeConfigForUpsert | attendance の補完を追加 |

**Flow1 参照**: セクション 4

### 5.4 createClockInRecord / updateClockOutRecord の unused 移管

| 変更 | 内容 |
|------|------|
| 移管 | callables から削除し、unused_function_lib に移管 |
| 形式 | ファイル先頭に `[UNUSED - Phase4.1]` コメント。復元手順の記載。実装コードは `// ========== UNUSED_BLOCK_START ==========` ～ `// ========== UNUSED_BLOCK_END ==========` でコメントアウト |

**Flow0 参照**: セクション 9.2, 9.3

### 5.5 attendance/index.ts

| 変更 | 内容 |
|------|------|
| 削除 | `export { createClockInRecord } from "./callables/createClockInRecord";` |
| 削除 | `export { updateClockOutRecord } from "./callables/updateClockOutRecord";` |

### 5.6 attendanceService.dart

| 変更 | 内容 |
|------|------|
| 削除 | createClockInRecord メソッド全体 |
| 削除 | updateClockOutRecord メソッド全体 |

**Flow0 参照**: セクション 9.2

---

## 6. 実装順序

```
Phase 0: 準備
  - 本 changeSpec の確認
  ↓ 【検証: 】
Phase 1: config 夜間労働時間の追加
  - defaults.ts に定数追加
  - types.ts に型追加
  - configLoader.ts に buildFromDefaults、mergeWithDefaults、mergeConfigForUpsert の attendance 追加
  ↓ 【検証: 既存 config 読み取りが正常に動作する】
Phase 2: 旧 Callable の unused 移管
  - createClockInRecord.ts を unused_function_lib にコピーし、コードをコメントアウト
  - updateClockOutRecord.ts を同上
  - callables から両ファイルを削除
  - index.ts から export を削除
  ↓ 【検証: ビルドが通る。clockIn/clockOut が export されている】
Phase 3: Dart メソッド削除
  - attendanceService.dart から createClockInRecord, updateClockOutRecord を削除
  ↓ 【検証: ビルドが通る。clockIn/clockOut の呼び出しが残っている】
```

---

## 7. 検証ポイント

| # | 観点 | 方法 |
|---|------|------|
| 1 | config に nightWorkStartHour, nightWorkEndHour が追加されている | 単体テストまたは手動確認。getStoreConfig で attendance が返ることを確認 |
| 2 | createClockInRecord, updateClockOutRecord が index.ts から export されていない | grep で確認 |
| 3 | unused_function_lib に両ファイルが存在し、コードがコメントアウトされている | ファイル確認 |
| 4 | attendanceService に createClockInRecord, updateClockOutRecord が存在しない | grep で確認 |
| 5 | clockIn/clockOut が動作する | 実機確認（任意）または既存テストの実行 |

---

## 8. チェックリスト

### 実装時

- [ ] defaults.ts に DEFAULT_NIGHT_WORK_START_HOUR, DEFAULT_NIGHT_WORK_END_HOUR を追加
- [ ] types.ts に attendance 型を追加
- [ ] configLoader buildFromDefaults に attendance を追加
- [ ] configLoader mergeWithDefaults に attendance のマージを追加
- [ ] configLoader mergeConfigForUpsert に attendance を追加
- [ ] createClockInRecord.ts を unused_function_lib に移管（コード全コメントアウト）
- [ ] updateClockOutRecord.ts を unused_function_lib に移管（コード全コメントアウト）
- [ ] callables から createClockInRecord.ts, updateClockOutRecord.ts を削除
- [ ] index.ts から createClockInRecord, updateClockOutRecord の export を削除
- [ ] attendanceService.dart から createClockInRecord, updateClockOutRecord メソッドを削除

### 確認時

- [ ] Functions ビルドが通る（`npm run build`）
- [ ] Flutter ビルドが通る（`flutter build` または `flutter analyze`）
- [ ] clockIn/clockOut の既存テストが通る（存在する場合）

---

## 9. ロールバック手順

- **config 追加**: defaults.ts, types.ts, configLoader.ts の変更を revert する
- **unused 移管**: unused_function_lib のファイルを削除し、callables に元のファイルを復元。index.ts に export を復活させる
- **Dart**: attendanceService に createClockInRecord, updateClockOutRecord メソッドを復元する

---

## 10. リスク・注意事項

- createClockInRecord, updateClockOutRecord の呼び出し元はなし（dead code）。削除による影響はない
- config の attendance は未設定時は defaults にフォールバック。既存 storeMeta/config に attendance がなくても動作する
- 4.1-B 以降で config.attendance を参照する。本段階では config に追加するのみで、使用箇所はない
