# Step 8 実装サマリ：スキップ

## 概要

Step 8（既存データ・オンライン移行）は**実装を行わない**。

## スキップ理由

| 項目 | 内容 |
|------|------|
| アプリ状況 | リリース前 |
| 既存データ | 運用側で scheduledTournament を削除する |
| 結論 | オンライン移行ロジックが不要 |

## 実施内容

- **コード変更**：なし
- **enqueueTournamentTasksCore**：現状の `doc.schedulePlanVersion ?? 0` を維持（防御的コーディング）
- **controlHook**：現状の `schedulePlanVersion ?? 0` を維持

## 次のステップ

Step 9（Firestore ルール・インデックス）へ進む。
