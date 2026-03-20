# 4.1-C: breaks サブコレ、startBreak / endBreak — 確認結果

**CHANGESPEC**: [CHANGESPEC.md](./CHANGESPEC.md)

---

## 実施日・実施者

| 項目 | 内容 |
|------|------|
| 実施日 | 2025-03-04 |
| 実施者 | （AI 実装） |

---

## 完了条件チェック

| 完了条件 | 結果 | 備考 |
|----------|------|------|
| startBreak, endBreak が動作する | ✓ | 新規 Callable として実装 |
| breaks サブコレに doc が作成される | ✓ | startBreak で attendances/{id}/breaks/{breakId} に作成 |
| breaks の論理削除フィールド（isDeleted, deletedAt）を保持 | ✓ | 作成時に isDeleted: false, deletedAt: null を設定 |
| 親再集計ヘルパーが動作する | ✓ | recalculateAttendanceFromBreaks。endBreak で呼び出し |
| breaks の orderBy が動作する | ✓ | 単一フィールドのため自動インデックスで対応 |

---

## テスト・エミュレータ確認結果

| 確認項目 | 結果 | 事象 |
|----------|------|------|
| テストファイル | ✓ | startBreak.spec.ts, endBreak.spec.ts 作成 |
| エミュレータ実行 | ✓ | `firebase emulators:exec --only firestore 'cd functions && npm test -- __tests__/config_migration/phase4_1C'` で全テスト成功 |
| 実機確認 | 4.1-F に集約 | 休憩 UI は 4.1-F で一括確認 |
