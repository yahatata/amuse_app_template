# Scheduler 有効化手順

enqueue Scheduler（`enqueueTournamentTasksByScheduler`）を有効にするための手順を固定する。

---

## 1. 環境変数

| 変数名 | 値 | 意味 |
|--------|-----|------|
| ENQUEUE_SCHEDULER_ENABLED | true | enqueue バッチを実行する。false または未設定時は即 return する |

---

## 2. 有効化のタイミング

| 項目 | 内容 |
|------|------|
| **いつ** | controlHook の疎通確認**後** |
| **推奨** | デプロイ直後に即 ON にしない。controlHook の疎通確認を完了してから ON にする |
| **理由** | 早期 ON でタスクが大量投入され、controlHook が未対応または障害時にタスクが大量失敗することを防ぐ |

---

## 3. 推奨手順

1. **Step 6 デプロイ**：controlHook が新 payload に対応していることを確認
2. **controlHook 疎通確認**：
   - テスト用 payload で controlHook を直接叩き、200 が返ることを確認
   - または、Callable から enqueue を 1 回手動実行し、Cloud Tasks が controlHook を正常に呼び出せることを確認
3. **ENQUEUE_SCHEDULER_ENABLED=true を設定**：対象環境（本番 or ステージング）の Firebase 環境変数に設定
4. **監視**：初回 Scheduler 実行後、Cloud Logging 等でエラーが発生していないか確認

---

## 4. 担当者・環境

| 項目 | 内容 |
|------|------|
| **誰が** | 運用担当者（デプロイ権限を持つ者） |
| **どの環境** | 本番。ステージングで検証してから本番に反映することを推奨 |
| **設定方法** | Firebase Console > Functions > 環境変数、または `firebase functions:config:set` |

---

## 5. 注意事項

- **早期 ON 禁止**：Step 6（controlHook 新 payload 対応）デプロイ前に ON にすると、投入されたタスクが controlHook で処理できず失敗する
- **無効化**：ENQUEUE_SCHEDULER_ENABLED を false または未設定にすると、Scheduler は即 return する（タスク投入を行わない）
