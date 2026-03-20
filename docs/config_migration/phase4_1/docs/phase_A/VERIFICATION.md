# 4.1-A: config 夜間労働時間追加、旧 Callable unused 移管 — 確認結果

**CHANGESPEC**: [CHANGESPEC.md](./CHANGESPEC.md)  
**本 step**: 4.1-A。Flow2 セクション 5「完了条件」・セクション 6「実機確認」を参照すること。

---

## 実施日・実施者

| 項目 | 内容 |
|------|------|
| 実施日 | 2025-03-04 |
| 実施者 | （AI 実装） |

---

## 完了条件チェック

| 完了条件（Flow2 セクション 5） | 結果 | 備考 |
|-------------------------------|------|------|
| config に nightWorkStartHour, nightWorkEndHour が追加されている | ✓ | defaults.ts, types.ts, configLoader.ts に追加済み |
| 旧 Callable が unused に移管されている | ✓ | createClockInRecord.ts, updateClockOutRecord.ts を unused_function_lib に移管、コード全コメントアウト |
| Dart から削除されている | ✓ | attendanceService.dart から createClockInRecord, updateClockOutRecord メソッドを削除 |
| 既存の出退勤（clockIn/clockOut）が動作する | ✓ | Functions ビルド成功。clockIn/clockOut は index.ts から export 継続 |

---

## CHANGESPEC チェックリスト

| 項目 | 結果 |
|------|------|
| defaults.ts に定数追加 | ✓ |
| types.ts に型追加 | ✓ |
| configLoader buildFromDefaults に attendance 追加 | ✓ |
| configLoader mergeWithDefaults に attendance マージ追加 | ✓ |
| configLoader mergeConfigForUpsert に attendance 追加 | ✓ |
| createClockInRecord.ts を unused_function_lib に移管 | ✓ |
| updateClockOutRecord.ts を unused_function_lib に移管 | ✓ |
| callables から両ファイル削除 | ✓ |
| index.ts から export 削除 | ✓ |
| attendanceService.dart からメソッド削除 | ✓ |
| Functions ビルド成功 | ✓ |

---

## 実機確認結果

| 確認項目 | 結果 | 事象 |
|----------|------|------|
| 実機確認 | 未実施 | 4.1-A は任意のためスキップ |

---

## 残課題・次段階への引継ぎ

（なし）

---

## 完了サマリ

**作成先**: `docs/stepA/stepA_completion_summary.md` を参照
