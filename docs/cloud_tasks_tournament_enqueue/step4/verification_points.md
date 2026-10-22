# Step 4 確認観点

changeSpec 14.2 に準拠した確認観点。

## 観点一覧

| # | 観点 | 期待結果 |
|---|------|----------|
| 1 | regEndAt 再計算 | blindTemplate あり → totalDurationSec から正しく算出 |
| 2 | regEndAt フォールバック | blindTemplate なし → closeRegistration タスクを作らない（スキップ） |
| 3 | planHash | 同一入力で同一ハッシュ、異なる入力で異なるハッシュ |
| 4 | taskIndex なし | pending で新規作成、Cloud Tasks 投入（30 日以内の場合） |
| 5 | taskIndex planHash 一致 | 投入スキップ（enqueued のまま） |
| 6 | taskIndex planHash 不一致 | pending に戻し、再投入 |
| 7 | 30 日超 | Cloud Tasks 投入しない |
| 8 | taskSyncNeeded 解除 | 投入完了後に false に更新。**例外**：closeRegistration が blindTemplate 欠落でスキップ(null) の場合は false に落とさない（再試行対象として残す） |
| 9 | クエリ | status=scheduled, startAt 範囲で取得。isArchived=true はアプリ側でスキップ |
| 10 | taskSyncNeeded | false はスキップ。true/未設定のみ処理 |
