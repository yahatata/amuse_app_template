# 4.1-F 実機確認・UI 変更ログ

**目的**: 実機確認に伴う UI 変更・関数修正の結果を履歴として記録する。  
**詳細な詰め・やり取り**: チャット上で行う。

---

## 変更履歴

| 日付 | 対象 | 変更内容 |
|------|------|----------|
| 2026-03-04 | endBreak Callable | breakId をオプションに変更。未指定時はサーバー側で endedAt==null の break を検索して終了する。これによりクライアントからの Firestore 読み取りを廃止し、permission-denied を解消。 |
| 2026-03-04 | attendanceService | endBreakForAttendance を Firestore 読み取りなしに変更。endBreak(attendanceId, adjustmentOffsetMinutes) のみ呼ぶ。cloud_firestore 依存を削除。 |

