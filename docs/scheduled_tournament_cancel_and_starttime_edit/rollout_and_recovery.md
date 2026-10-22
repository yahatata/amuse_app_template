# ロールアウト/リカバリ手順

## 1. ロールアウト
1. Functions をデプロイ
   - `updateScheduledTournamentStatus`
   - `updateScheduledTournamentStartAt`
   - `getScheduledTournamentsForEdit` 拡張
   - 生成ロジック重複判定更新
2. Flutter アプリをデプロイ
   - カレンダー画面の編集導線
   - 定期編集画面の表示ルール更新
   - 一覧画面のキャンセル非表示
3. エミュレータ/ステージングで確認
   - キャンセル/復旧
   - 開始時刻編集
   - 定期再生成の抑止

## 2. 監視ポイント
- キャンセル後に該当営業日が再生成されないこと
- startAt編集後に旧Taskが誤実行されないこと（no-op含む）
- 定期編集画面におけるキャンセル済み表示・非選択制御

## 3. 問題発生時のリカバリ
- UI不具合のみ:
  - アプリを直前版へロールバック
- Functions不具合:
  - 追加callableの切り戻し
  - 生成重複判定部分を旧実装へ戻す
- データ不整合:
  - `scheduledTournaments` の対象ドキュメントを運用手順で手動補正
  - 必要なら `taskSyncNeeded=true` で再同期対象化
