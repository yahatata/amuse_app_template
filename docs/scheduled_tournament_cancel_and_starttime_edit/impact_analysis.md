# 影響範囲分析

## 1. データモデルへの影響
- 既存 `scheduledTournaments` の既存フィールドを利用するため、新規コレクション追加なし。
- 更新対象フィールド:
  - `status`
  - `startAt`
  - `regEndAt`
  - `businessDate`
  - `schedulePlanVersion`
  - `schedulePlanUpdatedAt`
  - `taskSyncNeeded`
  - `taskSyncReason`

## 2. バックエンド影響
- 定期生成ロジックの重複判定強化により、同一営業日の二重生成を抑止。
- `getScheduledTournamentsForEdit` 拡張に伴い、定期編集画面・テンプレ編集画面の取得結果に追加情報が含まれる。

## 3. フロント影響
- カレンダー画面は「作成専用」から「作成+編集」へ責務拡張。
- 定期編集画面での選択可能条件が増える（cancelledは表示のみ、時刻修正済みは選択可）。
- 既存一覧画面ではキャンセル済みを非表示化。

## 4. リスク
- `cancelled` / `canceled` の混在が残ると表示・判定漏れの原因になる。
- `excludeBeforeBusinessDate` を使う画面は `businessDate` の正確性に依存する。
- 重複判定強化は意図せぬ生成抑止を起こしうるため、同日複数開催要件の有無を継続確認する必要がある。

## 5. 推奨対応
- status判定は移行期間のみ `cancelled` と `canceled` を併読し、書き込みは `cancelled` のみに統一。
- 将来的に同日複数開催が必要になった場合は、例外コレクション（A方針）へ段階移行する。
